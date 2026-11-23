const assert = require("node:assert/strict");
const { once } = require("node:events");
const { test } = require("node:test");
const { createApp } = require("./index.cjs");
const { createQuota } = require("./quota.cjs");
const { createGemini, parseRequest, WritingError } = require("./writing.cjs");

const email = {
  context: "Your apartment building is changing how residents sort recycling.",
  recipient: "the building manager",
  points: ["Describe the problem.", "Explain how it affects your household.", "Suggest a practical solution."],
};
const survey = {
  context: "Your community garden committee has funding for one upgrade.",
  options: ["Add raised garden beds.", "Build a covered seating area."],
};
const answerText = "Residents need clear labels so everyone can sort waste correctly.";
const answer = {
  task: 1,
  prompt: { context: email.context, instruction: "Write to the building manager.", points: email.points },
  text: answerText,
};
const criterion = {
  observation: "You give one reason for the proposed changes.",
  revision: "Explain what happened the last time residents tried the current system.",
  excerpt: "Residents need clear labels",
};
const taskFeedback = {
  level: 7,
  criteria: {
    contentCoherence: criterion,
    vocabulary: { ...criterion, excerpt: "This is an invented quotation" },
    readability: { ...criterion, excerpt: null },
    taskFulfillment: criterion,
  },
};

function providerResponse(result, finishReason = "STOP") {
  return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(result) }] } }] });
}

function gemini(fetcher) {
  return createGemini({
    apiKey: "test-server-only-key",
    generationModel: "gemini-3.5-flash-lite",
    gradingModel: "gemini-3.8-flash",
    fetcher,
  });
}

test("generates both tasks in one structured, authenticated Google request", async () => {
  let calls = 0;
  const run = gemini(async (url, options) => {
    calls++;
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
    assert.equal(options.headers["x-goog-api-key"], "test-server-only-key");
    const request = JSON.parse(options.body);
    assert.deepEqual(request.generationConfig.responseJsonSchema.required, ["task1", "task2"]);
    return providerResponse({ task1: email, task2: survey });
  });
  const { prompts } = await run("prompts", parseRequest("prompts", { eligible: true, tasks: [2, 1] }));
  assert.equal(calls, 1);
  assert.equal(prompts[0].prompt.instruction, "Write an email to the building manager in about 150–200 words.");
  assert.deepEqual(prompts[1].prompt.points, ["Option A — Add raised garden beds.", "Option B — Build a covered seating area."]);
});

test("uses the exact submissions, counts words and keeps only authentic excerpts", async () => {
  const answers = [answer, { ...answer, task: 2, prompt: { ...answer.prompt, points: survey.options } }];
  const run = gemini(async (url, options) => {
    assert.match(url, /gemini-3\.8-flash:generateContent$/);
    const request = JSON.parse(options.body);
    const { answers: submitted } = JSON.parse(request.contents[0].parts[0].text);
    assert.deepEqual(submitted, answers.map((item) => ({ ...item, wordCount: 10 })));
    return providerResponse({ task1: taskFeedback, task2: { ...taskFeedback, level: 8 }, overallLevel: 8 });
  });
  const result = await run("feedback", parseRequest("feedback", { eligible: true, answers }));
  assert.deepEqual(result.tasks.map(({ task, level }) => ({ task, level })), [{ task: 1, level: 7 }, { task: 2, level: 8 }]);
  assert.equal(result.overallLevel, 8);
  assert.equal(result.tasks[0].criteria.contentCoherence.excerpt, criterion.excerpt);
  assert.equal(result.tasks[0].criteria.vocabulary.excerpt, null);
  assert.equal(result.tasks[0].criteria.readability.excerpt, null);
});

test("rejects invalid input and classifies quota, depleted prepaid billing and invalid provider output", async () => {
  assert.throws(() => parseRequest("prompts", { eligible: true, tasks: [2, 2] }), { code: "invalid_input" });
  assert.throws(() => parseRequest("feedback", { eligible: true, answers: [{ ...answer, text: "   " }] }), { code: "invalid_input" });
  assert.throws(() => parseRequest("feedback", { eligible: false, answers: [answer] }), { code: "ineligible" });

  const input = { tasks: [1] };
  const cases = [
    [Response.json({ error: { message: "Prepayment credits are depleted" } }, { status: 429 }), 503, "provider_billing"],
    [Response.json({}, { status: 429 }), 429, "busy"],
    [providerResponse({ task1: email }, "MAX_TOKENS"), 502, "provider_result"],
    [providerResponse({ task1: { ...email, points: ["Only one point"] } }), 502, "provider_result"],
  ];
  for (const [response, status, code] of cases) {
    await assert.rejects(gemini(async () => response)("prompts", input), { status, code });
  }
  await assert.rejects(gemini(async () => { throw new TypeError("Network error"); })("prompts", input), { status: 503, code: "unavailable" });
});

function memoryFirestore() {
  const data = new Map();
  let priorTransaction = Promise.resolve();
  return {
    collection: (collection) => ({ doc: (id) => collection + "/" + id }),
    runTransaction(callback) {
      const next = priorTransaction.then(async () => {
        const writes = new Map();
        const result = await callback({
          getAll: async (...keys) => keys.map((key) => ({ data: () => data.get(key) })),
          set: (key, value) => writes.set(key, value),
        });
        for (const [key, value] of writes) data.set(key, value);
        return result;
      });
      priorTransaction = next.catch(() => undefined);
      return next;
    },
  };
}

test("reserves shared quota under concurrent requests and resets the day in Pacific time", async () => {
  let now = Date.parse("2026-11-23T07:59:30Z");
  const reserve = createQuota(memoryFirestore(), { accountDaily: 2, minute: 3, daily: 4 }, () => now);
  const concurrent = await Promise.allSettled([reserve("a"), reserve("a"), reserve("a"), reserve("b"), reserve("c")]);
  assert.deepEqual(concurrent.map((result) => result.status === "fulfilled" ? "ok" : result.reason.code),
    ["ok", "ok", "account_limit", "ok", "busy"]);
  now += 30000;
  await assert.rejects(reserve("a"), { code: "busy", retryAfter: 30 });
  now += 30000;
  await Promise.all([reserve("a"), reserve("a"), reserve("b")]);
  now += 60000;
  await reserve("b");
  await assert.rejects(reserve("c"), { code: "daily_limit" });
});

test("verifies Google sign-in and reserves quota before sending eligible work to Gemini", async (t) => {
  const firebase = { projectId: "test-project", apiKey: "public-firebase-api-key" };
  const calls = [];
  const app = createApp({
    firebase,
    verifyIdToken: async (token) => {
      if (token === "expired") throw new Error("Expired");
      return { uid: "account", email_verified: true, firebase: { sign_in_provider: token === "valid" ? "google.com" : "password" } };
    },
    reserve: async () => { calls.push("quota"); },
    runGemini: async (_operation, input) => {
      calls.push("gemini");
      assert.deepEqual(input.answers, [answer]);
      return { tasks: [{ task: 1, ...taskFeedback }] };
    },
    log: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const url = "http://127.0.0.1:" + server.address().port;
  const config = await fetch(url + "/api/writing/config");
  assert.deepEqual(await config.json(), { firebase });
  assert.equal(config.headers.get("cache-control"), "no-store");
  async function post(token, eligible = true) {
    const response = await fetch(url + "/api/writing/feedback", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ eligible, answers: [answer] }),
    });
    return [response.status, await response.json()];
  }
  assert.deepEqual(await post("expired"), [401, { error: "sign_in" }]);
  assert.deepEqual(await post("not-google"), [401, { error: "sign_in" }]);
  assert.deepEqual(await post("valid", false), [403, { error: "ineligible" }]);
  assert.deepEqual(calls, []);
  assert.deepEqual(await post("valid"), [200, { tasks: [{ task: 1, ...taskFeedback }] }]);
  assert.deepEqual(calls, ["quota", "gemini"]);
});

test("quota errors fail closed and send a retry interval", async (t) => {
  const app = createApp({
    firebase: { projectId: "test-project" },
    verifyIdToken: async (token) => ({ uid: token, email_verified: true, firebase: { sign_in_provider: "google.com" } }),
    reserve: async (uid) => {
      if (uid === "unavailable") throw new Error("Firestore is unreachable");
      throw new WritingError(429, "busy", 23);
    },
    runGemini: async () => assert.fail("Gemini must not be called"),
    log: () => {},
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const request = (token) => fetch("http://127.0.0.1:" + server.address().port + "/api/writing/prompts", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ eligible: true, tasks: [1, 2] }),
  });
  const response = await request("test");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "23");
  assert.deepEqual(await response.json(), { error: "busy" });
  const unavailable = await request("unavailable");
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "quota_unavailable" });
});
