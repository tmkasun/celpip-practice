const { createHash } = require("node:crypto");
const { validWritingSample, WritingError } = require("./writing.cjs");

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function questionId({ task, prompt }) {
  const normalize = (value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
  return hash(JSON.stringify([task, prompt.context, prompt.instruction, ...prompt.points].map((value) =>
    typeof value === "string" ? normalize(value) : value)));
}

function createQuestionBank(db, clock = Date.now, prefix = "writingAi", identify = questionId, validSample = validWritingSample) {
  const bank = db.collection(prefix + "Questions");
  const seen = db.collection(prefix + "Seen");
  // Older pools and their per-account cursors contain prompts without samples.
  const poolKey = (task) => "v2_task" + task;
  const pool = (task) => bank.doc(poolKey(task));

  function requireSample(item) {
    if (!item || !validSample(item)) throw new WritingError(502, "provider_result");
  }

  async function claim(uid, tasks) {
    return db.runTransaction(async (transaction) => {
      const accountRef = seen.doc(hash(uid));
      const account = (await transaction.get(accountRef)).data() ?? {};
      const questions = await Promise.all(tasks.map((task) => transaction.get(
        pool(task).collection("prompts")
          .where("sequence", ">", account[poolKey(task)] ?? 0)
          .orderBy("sequence").limit(1)
      )));
      const missing = tasks.filter((_task, index) => questions[index].empty);
      // A mock claims both tasks together, so a failed generation never consumes its cached task.
      if (missing.length) return { missing };

      const selected = questions.map((snapshot) => snapshot.docs[0]);
      selected.forEach((snapshot) => requireSample(snapshot.data().item));
      transaction.set(accountRef, Object.fromEntries(selected.map((snapshot, index) => [
        poolKey(tasks[index]), snapshot.data().sequence,
      ])), { merge: true });
      return { selected };
    });
  }

  async function add(prompts) {
    prompts.forEach(requireSample);
    const refs = prompts.map((item) => pool(item.task).collection("prompts").doc(identify(item)));
    const poolRefs = prompts.map(({ task }) => pool(task));
    const createdAt = new Date(clock());
    return db.runTransaction(async (transaction) => {
      // Read everything before writing; Gemini is deliberately outside this retryable callback.
      const snapshots = await transaction.getAll(...refs, ...poolRefs);
      const inserted = [];
      prompts.forEach((item, index) => {
        if (snapshots[index].exists) return;
        const sequence = (snapshots[prompts.length + index].data()?.lastSequence ?? 0) + 1;
        transaction.create(refs[index], { item, sequence, createdAt });
        transaction.set(poolRefs[index], { lastSequence: sequence });
        inserted.push(refs[index].id);
      });
      return inserted;
    });
  }

  return {
    async getPrompts(uid, tasks, generate) {
      const generatedIds = new Set();
      for (let attempt = 0; attempt <= 3; attempt++) {
        const result = await claim(uid, tasks);
        if (result.selected) {
          return {
            prompts: result.selected.map((snapshot) => snapshot.data().item),
            cacheHits: result.selected.filter((snapshot) => !generatedIds.has(snapshot.id)).length,
          };
        }
        if (attempt === 3) break;
        // The generator validates all output before any of it enters the shared bank.
        const { prompts } = await generate(result.missing);
        for (const id of await add(prompts)) generatedIds.add(id);
      }
      throw new WritingError(502, "provider_result");
    },
  };
}

module.exports = { createQuestionBank };
