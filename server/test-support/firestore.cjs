const assert = require("node:assert/strict");

// Transactional Firestore substitute: staged writes roll back on failure, and reads
// after writes are rejected just as they are by the Admin SDK.
function memoryFirestore({ retryTransactions = false } = {}) {
  const data = new Map();
  let priorTransaction = Promise.resolve();
  const document = (path) => ({
    path,
    id: path.split("/").pop(),
    collection: (name) => collection(path + "/" + name),
  });
  function collection(path, filters = [], order, maximum = Infinity) {
    return {
      path, filters, order, maximum, query: true,
      doc: (id) => document(path + "/" + id),
      where: (field, operator, value) => collection(path, [...filters, { field, operator, value }], order, maximum),
      orderBy: (field) => collection(path, filters, field, maximum),
      limit: (count) => collection(path, filters, order, count),
    };
  }
  function snapshot(ref) {
    const value = structuredClone(data.get(ref.path));
    return { ref, id: ref.id, exists: value !== undefined, data: () => structuredClone(value) };
  }
  const db = {
    data,
    inTransaction: false,
    collection,
    runTransaction(callback) {
      const next = priorTransaction.then(async () => {
        for (let attempt = 0; attempt < (retryTransactions ? 2 : 1); attempt++) {
          const writes = new Map();
          const transaction = {
            async get(ref) {
              assert.equal(writes.size, 0, "Firestore transactions must read before writing");
              if (!ref.query) return snapshot(ref);
              const docs = [...data.keys()]
                .filter((path) => path.startsWith(ref.path + "/") && !path.slice(ref.path.length + 1).includes("/"))
                .map((path) => snapshot(document(path)))
                .filter((doc) => ref.filters.every(({ field, operator, value }) => {
                  assert.equal(operator, ">");
                  return doc.data()[field] > value;
                }))
                .sort((left, right) => left.data()[ref.order] - right.data()[ref.order])
                .slice(0, ref.maximum);
              return { docs, empty: docs.length === 0 };
            },
            getAll: (...refs) => Promise.all(refs.map((ref) => transaction.get(ref))),
            set(ref, value, options) {
              writes.set(ref.path, structuredClone(options?.merge ? { ...data.get(ref.path), ...value } : value));
            },
            create(ref, value) {
              assert.equal(data.has(ref.path), false, "create must not overwrite existing documents");
              writes.set(ref.path, structuredClone(value));
            },
          };
          db.inTransaction = true;
          let result;
          try {
            result = await callback(transaction);
          } finally {
            db.inTransaction = false;
          }
          if (retryTransactions && attempt === 0) continue;
          for (const [path, value] of writes) data.set(path, value);
          return result;
        }
      });
      priorTransaction = next.catch(() => undefined);
      return next;
    },
  };
  return db;
}

module.exports = { memoryFirestore };
