const assert = require("node:assert/strict");
const { once } = require("node:events");
const { test } = require("node:test");
const { createApp } = require("./index.cjs");
const { createQuota } = require("./quota.cjs");
const { createQuestionBank } = require("./question-bank.cjs");
const { memoryFirestore } = require("./test-support/firestore.cjs");
const { createGemini, parseRequest, WritingError } = require("./writing.cjs");

const email = {
  context: "Your apartment building is changing how residents sort recycling.",
  recipient: "the building manager",
  sampleAnswer: "Our building needs clear recycling instructions for each household. ".repeat(18).trim(),
  points: ["Describe the problem.", "Explain how it affects your household.", "Suggest a practical solution."],
};
const survey = {
  context: "Your community garden committee has funding for one upgrade.",
  options: ["Add raised garden beds.", "Build a covered seating area."],
  sampleAnswer: "Raised garden beds would help more neighbours grow their own vegetables. ".repeat(15).trim(),
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

function gemini(fetcher, gradingFallbackModel) {
  return createGemini({
    apiKey: "test-server-only-key",
    generationModel: "gemini-3.5-flash-lite",
    gradingModel: "gemini-3.8-flash",
    gradingFallbackModel,
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
  const { prompts } = await run("prompts", parseRequest("prompts", { tasks: [2, 1] }));
  assert.equal(calls, 1);
  assert.deepEqual(prompts.map(row => row.sampleAnswer), [email.sampleAnswer, survey.sampleAnswer]);
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
  const result = await run("feedback", parseRequest("feedback", { answers }));
  assert.deepEqual(result.tasks.map(({ task, level }) => ({ task, level })), [{ task: 1, level: 7 }, { task: 2, level: 8 }]);
  assert.equal(result.overallLevel, 8);
  assert.equal(result.tasks[0].criteria.contentCoherence.excerpt, criterion.excerpt);
  assert.equal(result.tasks[0].criteria.vocabulary.excerpt, null);
  assert.equal(result.tasks[0].criteria.readability.excerpt, null);
});

test("rejects invalid input and classifies quota, depleted prepaid billing and invalid provider output", async () => {
  assert.throws(() => parseRequest("prompts", { tasks: [2, 2] }), { code: "invalid_input" });
  assert.throws(() => parseRequest("feedback", { answers: [{ ...answer, text: "   " }] }), { code: "invalid_input" });

  const input = { tasks: [1] };
  const cases = [
    [Response.json({ error: { message: "Prepayment credits are depleted" } }, { status: 429 }), 503, "provider_billing"],
    [Response.json({}, { status: 429 }), 429, "busy"],
    [providerResponse({ task1: { ...email, sampleAnswer: "Too short." } }), 502, "provider_result"],
    [providerResponse({ task1: email }, "MAX_TOKENS"), 502, "provider_result"],
    [providerResponse({ task1: { ...email, points: ["Only one point"] } }), 502, "provider_result"],
  ];
  for (const [response, status, code] of cases) {
    await assert.rejects(gemini(async () => response)("prompts", input), { status, code });
  }
  await assert.rejects(gemini(async () => { throw new TypeError("Network error"); })("prompts", input), { status: 503, code: "unavailable" });
});

test("sends the same grading request to the fallback after an unavailable response or timeout", async () => {
  const failures = [
    () => Response.json({ error: { status: "UNAVAILABLE" } }, { status: 503 }),
    () => { throw new DOMException("Gemini timed out", "TimeoutError"); },
  ];
  for (const failPrimary of failures) {
    const requests = [];
    const run = gemini(async (url, { body }) => {
      requests.push({ model: new URL(url).pathname.split("/").pop().split(":")[0], body });
      if (requests.length === 1) return failPrimary();
      return providerResponse({ task1: taskFeedback });
    }, "gemini-3.5-flash");

    const result = await run("feedback", { tasks: [1], answers: [answer] });
    assert.equal(result.tasks[0].level, taskFeedback.level);
    assert.deepEqual(requests.map(({ model }) => model), ["gemini-3.8-flash", "gemini-3.5-flash"]);
    assert.equal(requests[0].body, requests[1].body);
  }
});

test("keeps generation, quota and billing errors on their original request path", async () => {
  const cases = [
    ["prompts", Response.json({}, { status: 503 }), "unavailable"],
    ["feedback", Response.json({ error: { message: "Prepayment credits are depleted" } }, { status: 503 }), "provider_billing"],
    ["feedback", Response.json({}, { status: 429 }), "busy"],
  ];
  for (const [operation, response, code] of cases) {
    let calls = 0;
    const run = gemini(async () => {
      calls++;
      return response;
    }, "gemini-3.5-flash");
    await assert.rejects(run(operation, { tasks: [1], answers: [answer] }), { code });
    assert.equal(calls, 1);
  }
});

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

test("verifies Google sign-in and reserves quota before sending writing to Gemini", async (t) => {
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
  async function post(token) {
    const response = await fetch(url + "/api/writing/feedback", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [answer] }),
    });
    return [response.status, await response.json()];
  }
  assert.deepEqual(await post("expired"), [401, { error: "sign_in" }]);
  assert.deepEqual(await post("not-google"), [401, { error: "sign_in" }]);
  assert.deepEqual(calls, []);
  assert.deepEqual(await post("valid"), [200, { tasks: [{ task: 1, ...taskFeedback }] }]);
  assert.deepEqual(calls, ["quota", "gemini"]);
});

test("quota errors fail closed and send a retry interval", async (t) => {
  const app = createApp({
    questionBank: createQuestionBank(memoryFirestore()),
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
    body: JSON.stringify({ tasks: [1, 2] }),
  });
  const response = await request("test");
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "23");
  assert.deepEqual(await response.json(), { error: "busy" });
  const unavailable = await request("unavailable");
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { error: "quota_unavailable" });
});
