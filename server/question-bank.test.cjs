const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { once } = require("node:events");
const { test } = require("node:test");
const { createApp } = require("./index.cjs");
const { createQuestionBank } = require("./question-bank.cjs");
const { createQuota } = require("./quota.cjs");
const { createGemini, WritingError } = require("./writing.cjs");
const { memoryFirestore } = require("./test-support/firestore.cjs");

function prompt(task, version = 1) {
  return {
    task,
    prompt: {
      context: "Scenario " + version + " for task " + task + ".",
      instruction: task === 1 ? "Write an email to the manager." : "Choose an option and explain your reasons.",
      points: task === 1 ? ["Describe the problem.", "Explain the impact.", "Suggest a solution."] : ["Option A — Add beds.", "Option B — Add seating."],
    },
  };
}

function generator(db) {
  const calls = [];
  const generate = async (tasks) => {
    assert.equal(db.inTransaction, false, "Gemini must run outside transactions");
    calls.push([...tasks]);
    return { prompts: tasks.map((task) => prompt(task, calls.length)) };
  };
  return { generate, calls };
}

const noGeneration = async () => assert.fail("A cache hit must not call Gemini or reserve quota");
const questions = (db) => [...db.data.entries()].filter(([path]) => path.includes("/prompts/"));
const account = (db, uid) => db.data.get("writingAiSeen/" + createHash("sha256").update(uid).digest("hex"));

test("persists both generated tasks and shares them across accounts without exposing storage fields", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db, () => 1234);
  const { generate, calls } = generator(db);
  const result = await bank.getPrompts("first-account", [1, 2], generate);
  assert.deepEqual(result, { prompts: [prompt(1), prompt(2)], cacheHits: 0 });
  assert.deepEqual(calls, [[1, 2]]);
  assert.equal(questions(db).length, 2);
  for (const [, stored] of questions(db)) {
    assert.equal(stored.sequence, 1);
    assert.deepEqual(stored.createdAt, new Date(1234));
  }
  assert.deepEqual(account(db, "first-account"), { task1: 1, task2: 1 });
  assert.ok([...db.data.keys()].every((path) => !path.includes("first-account")));

  // A fresh service instance uses the same durable bank and history.
  assert.deepEqual(await createQuestionBank(db).getPrompts("other-account", [1, 2], noGeneration), {
    prompts: result.prompts, cacheHits: 2,
  });
});

test("issues each task oldest first and generates only after that account exhausts the task", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  const { generate, calls } = generator(db);
  await bank.getPrompts("seed", [1, 2], generate);
  await bank.getPrompts("seed", [1, 2], generate);
  await bank.getPrompts("seed", [1, 2], generate);
  for (let version = 1; version <= 3; version++) {
    assert.deepEqual((await bank.getPrompts("reader", [1], noGeneration)).prompts, [prompt(1, version)]);
  }
  assert.deepEqual((await bank.getPrompts("reader", [1], generate)).prompts, [prompt(1, 4)]);
  assert.deepEqual(calls, [[1, 2], [1, 2], [1, 2], [1]]);
  assert.deepEqual((await bank.getPrompts("reader", [2], noGeneration)).prompts, [prompt(2)]);
  assert.deepEqual(account(db, "reader"), { task1: 4, task2: 1 });
});

test("a mock generates only the missing task and claims the cached and generated questions together", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  const { generate, calls } = generator(db);
  await bank.getPrompts("reader", [1, 2], generate);
  await bank.getPrompts("seed", [1, 2], noGeneration);
  await bank.getPrompts("seed", [1], generate);
  assert.deepEqual(await bank.getPrompts("reader", [1, 2], generate), {
    prompts: [prompt(1, 2), prompt(2, 3)], cacheHits: 1,
  });
  assert.deepEqual(calls, [[1, 2], [1], [2]]);
  assert.deepEqual(account(db, "reader"), { task1: 2, task2: 2 });
});

test("failed generation or quota reservation leaves both mock cursors unchanged", async () => {
  for (const error of [new WritingError(503, "unavailable"), new WritingError(429, "account_limit")]) {
    const db = memoryFirestore();
    const bank = createQuestionBank(db);
    const { generate } = generator(db);
    await bank.getPrompts("seed", [1], generate);
    await assert.rejects(bank.getPrompts("reader", [1, 2], async (tasks) => {
      assert.deepEqual(tasks, [2]);
      throw error;
    }), error);
    assert.equal(account(db, "reader"), undefined);
    assert.deepEqual((await bank.getPrompts("reader", [1], noGeneration)).prompts, [prompt(1)]);
  }
});

test("normalizes duplicate output without overwriting questions or advancing sequences, and bounds retries", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  await bank.getPrompts("reader", [1], async () => ({ prompts: [prompt(1)] }));
  const original = structuredClone(questions(db));
  let attempts = 0;
  await assert.rejects(bank.getPrompts("reader", [1], async () => {
    attempts++;
    const item = prompt(1);
    const spaced = (value) => "  " + value.toUpperCase().replaceAll(" ", " \n  ") + "  ";
    item.prompt = {
      context: spaced(item.prompt.context).replace("SCENARIO", "ＳＣＥＮＡＲＩＯ"),
      instruction: spaced(item.prompt.instruction),
      points: item.prompt.points.map(spaced),
    };
    return { prompts: [item] };
  }), { code: "provider_result" });
  assert.equal(attempts, 3);
  assert.deepEqual(questions(db), original);
  assert.deepEqual(db.data.get("writingAiQuestions/task1"), { lastSequence: 1 });
  assert.deepEqual(account(db, "reader"), { task1: 1 });
  assert.deepEqual((await bank.getPrompts("other", [1], noGeneration)).prompts, [prompt(1)]);
});

test("a new question following duplicate output is stored and issued", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  await bank.getPrompts("reader", [1], async () => ({ prompts: [prompt(1)] }));
  let attempts = 0;
  const result = await bank.getPrompts("reader", [1], async () => ({ prompts: [prompt(1, ++attempts)] }));
  assert.equal(attempts, 2);
  assert.deepEqual(result, { prompts: [prompt(1, 2)], cacheHits: 0 });
  assert.equal(questions(db).length, 2);
});

test("concurrent drills and mocks never issue the same task twice to an account", async () => {
  const db = memoryFirestore({ retryTransactions: true });
  const bank = createQuestionBank(db);
  const { generate, calls } = generator(db);
  for (let index = 0; index < 4; index++) await bank.getPrompts("seed", [1, 2], generate);
  const results = await Promise.all([
    bank.getPrompts("reader", [1], noGeneration),
    bank.getPrompts("reader", [1, 2], noGeneration),
    bank.getPrompts("reader", [2], noGeneration),
    bank.getPrompts("reader", [1, 2], noGeneration),
  ]);
  for (const task of [1, 2]) {
    const issued = results.flatMap(({ prompts }) => prompts.filter((item) => item.task === task));
    assert.equal(issued.length, 3);
    assert.equal(new Set(issued.map((item) => item.prompt.context)).size, 3);
  }
  assert.deepEqual(account(db, "reader"), { task1: 3, task2: 3 });
  assert.equal(calls.length, 4, "transaction retries must not repeat Gemini calls");
  assert.equal(questions(db).length, 8);
});

test("simultaneous exhaustion rechecks the bank and preserves generated questions for other accounts", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  const { generate } = generator(db);
  const results = await Promise.all([
    bank.getPrompts("reader", [1], generate),
    bank.getPrompts("reader", [1], generate),
  ]);
  assert.equal(new Set(results.map(({ prompts }) => prompts[0].prompt.context)).size, 2);
  assert.deepEqual(account(db, "reader"), { task1: 2 });
  assert.equal(questions(db).length, 2);
  assert.deepEqual((await bank.getPrompts("other", [1], noGeneration)).prompts, [prompt(1)]);
});

test("cache read and persistence failures never issue untracked questions", async () => {
  const db = memoryFirestore();
  const bank = createQuestionBank(db);
  const original = db.runTransaction.bind(db);
  db.runTransaction = async () => { throw new Error("read failed"); };
  await assert.rejects(bank.getPrompts("reader", [1], noGeneration), /read failed/);
  db.runTransaction = original;
  await assert.rejects(bank.getPrompts("reader", [1, 2], async () => {
    db.runTransaction = async () => { throw new Error("persistence failed"); };
    return { prompts: [prompt(1), prompt(2)] };
  }), /persistence failed/);
  assert.equal(questions(db).length, 0);
  assert.equal(account(db, "reader"), undefined);
});

async function api(t, overrides = {}) {
  const db = memoryFirestore();
  const logs = [];
  const { generate, calls } = generator(db);
  const app = createApp({
    firebase: { projectId: "test-project" },
    verifyIdToken: async (token) => {
      if (token === "expired") throw new Error("Expired");
      return { uid: token, email_verified: true, firebase: { sign_in_provider: "google.com" } };
    },
    questionBank: createQuestionBank(db),
    reserve: createQuota(db, { accountDaily: 1, minute: 10, daily: 10 }),
    runGemini: async (operation, input) => {
      assert.equal(operation, "prompts");
      return generate(input.tasks);
    },
    log: (entry) => logs.push(JSON.parse(entry)),
    ...overrides,
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const post = (token, body = { tasks: [1, 2] }, operation = "prompts") => fetch(
    "http://127.0.0.1:" + server.address().port + "/api/writing/" + operation, {
      method: "POST",
      headers: { ...(token ? { Authorization: "Bearer " + token } : {}), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  return { db, calls, logs, post };
}

test("prompt API bypasses quotas on hits, reserves on misses, and returns the original wire format", async (t) => {
  const { db, calls, logs, post } = await api(t);
  let response = await post("first");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { prompts: [prompt(1), prompt(2)] });
  const counters = () => [...db.data.entries()].filter(([path]) => /^writingAi(Quota|Daily)\//.test(path));
  const previousCounters = structuredClone(counters());

  response = await post("second");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { prompts: [prompt(1), prompt(2)] });
  assert.deepEqual(counters(), previousCounters);
  assert.deepEqual(calls, [[1, 2]]);
  assert.deepEqual(logs.map(({ cacheHits, generatedTasks }) => ({ cacheHits, generatedTasks })), [
    { cacheHits: 0, generatedTasks: 2 }, { cacheHits: 2, generatedTasks: 0 },
  ]);
  assert.ok(logs.every((entry) => !JSON.stringify(entry).includes("Scenario") && !JSON.stringify(entry).includes("first")));

  response = await post("first");
  assert.equal(response.status, 429);
  assert.deepEqual(await response.json(), { error: "account_limit" });
  // The second account can grow the bank, and the exhausted first account still uses cached questions.
  assert.equal((await post("second")).status, 200);
  assert.equal((await post("first")).status, 200);
  assert.deepEqual(calls, [[1, 2], [1, 2]]);
});

test("prompt cache stays available when global Gemini limits are exhausted", async (t) => {
  for (const code of ["daily_limit", "busy"]) {
    let exhausted = false;
    const { post } = await api(t, { reserve: async () => {
      if (exhausted) throw new WritingError(429, code, code === "busy" ? 23 : undefined);
    } });
    assert.equal((await post("seed")).status, 200);
    exhausted = true;
    assert.equal((await post("reader")).status, 200);
    const miss = await post("reader");
    assert.equal(miss.status, 429);
    assert.deepEqual(await miss.json(), { error: code });
    if (code === "busy") assert.equal(miss.headers.get("retry-after"), "23");
  }
});

test("unauthenticated and invalid requests cannot read or alter the prompt cache", async (t) => {
  let accessed = false;
  const { post } = await api(t, { questionBank: { getPrompts: async () => { accessed = true; } } });
  for (const token of [undefined, "expired"]) {
    const response = await post(token);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { error: "sign_in" });
  }
  const invalid = await post("reader", { tasks: [1, 1] });
  assert.equal(invalid.status, 400);
  assert.equal(accessed, false);
});

test("cache and provider failures retain their API error classification and do not advance history", async (t) => {
  const { db, logs, post } = await api(t);
  db.runTransaction = async () => { throw new Error("cache offline"); };
  const failed = await post("reader");
  assert.equal(failed.status, 503);
  assert.deepEqual(await failed.json(), { error: "unavailable" });
  assert.equal(logs[0].generatedTasks, 0);

  const provider = createGemini({
    apiKey: "test", generationModel: "test", gradingModel: "test",
    fetcher: async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{}" }] } }] }),
  });
  const invalidApi = await api(t, { runGemini: provider });
  const invalid = await invalidApi.post("reader");
  assert.equal(invalid.status, 502);
  assert.deepEqual(await invalid.json(), { error: "provider_result" });
  assert.equal(questions(invalidApi.db).length, 0);
  assert.equal(account(invalidApi.db, "reader"), undefined);
});
