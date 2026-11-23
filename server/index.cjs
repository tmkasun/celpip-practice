const path = require("node:path");
const express = require("express");
const { createGemini, parseRequest, WritingError } = require("./writing.cjs");
const { createQuota } = require("./quota.cjs");
const { createQuestionBank } = require("./question-bank.cjs");

function limit(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(name + " must be a positive integer.");
  return value;
}

function readConfig() {
  if (process.env.WRITING_AI_ENABLED !== "true") return undefined;
  const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(name + " is required when AI Writing is enabled.");
    return value;
  };
  const config = {
    firebase: {
      appId: required("FIREBASE_APP_ID"),
      apiKey: required("FIREBASE_WEB_API_KEY"),
      projectId: required("FIREBASE_PROJECT_ID"),
      authDomain: required("FIREBASE_AUTH_DOMAIN"),
    },
    apiKey: required("GEMINI_API_KEY"),
    generationModel: process.env.GEMINI_GENERATION_MODEL ?? "gemini-3.5-flash-lite",
    gradingModel: process.env.GEMINI_GRADING_MODEL ?? "gemini-3.8-flash",
    gradingFallbackModel: process.env.GEMINI_GRADING_FALLBACK_MODEL?.trim(),
    limits: {
      accountDaily: limit("WRITING_AI_ACCOUNT_DAILY", 6),
      minute: limit("WRITING_AI_GLOBAL_MINUTE", 10),
      daily: limit("WRITING_AI_GLOBAL_DAILY", 300),
    },
  };
  if (config.firebase.apiKey === config.apiKey) {
    throw new Error("FIREBASE_WEB_API_KEY must be the public key from Firebase web app settings.");
  }
  return config;
}

function createApp({ firebase, verifyIdToken, reserve, runGemini, questionBank, log = console.info } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", (_req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
  app.get("/api/writing/config", (_req, res) => res.json({ firebase: firebase ?? null }));

  const readJson = express.json({ limit: "180kb" });
  for (const operation of ["prompts", "feedback"]) {
    app.post("/api/writing/" + operation, readJson, async (req, res) => {
      const startedAt = Date.now();
      let reservingQuota = false;
      const metrics = operation === "prompts" ? { cacheHits: 0, generatedTasks: 0 } : {};
      const logResult = (result) => log(JSON.stringify({ operation, result, ...metrics, durationMs: Date.now() - startedAt }));
      try {
        if (!firebase) throw new WritingError(503, "unavailable");
        const token = req.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
        if (!token) throw new WritingError(401, "sign_in");
        const user = await verifyIdToken(token).catch(() => null);
        if (!user?.uid || user.firebase?.sign_in_provider !== "google.com" || !user.email_verified) {
          throw new WritingError(401, "sign_in");
        }
        const input = parseRequest(operation, req.body);
        const run = async (data) => {
          reservingQuota = true;
          await reserve(user.uid);
          reservingQuota = false;
          if (operation === "prompts") metrics.generatedTasks += data.tasks.length;
          return runGemini(operation, data);
        };
        let result;
        if (operation === "prompts") {
          const cached = await questionBank.getPrompts(user.uid, input.tasks, (tasks) => run({ tasks }));
          metrics.cacheHits = cached.cacheHits;
          result = { prompts: cached.prompts };
        } else {
          result = await run(input);
        }
        logResult("ok");
        res.json(result);
      } catch (error) {
        const result = error instanceof WritingError ? error :
          new WritingError(503, reservingQuota ? "quota_unavailable" : "unavailable");
        if (result.retryAfter) res.set("Retry-After", String(result.retryAfter));
        logResult(result.code);
        res.status(result.status).json({ error: result.code });
      }
    });
  }
  app.use("/api", (_req, res) => res.status(404).json({ error: "not_found" }));
  app.use((error, _req, res, _next) => {
    const invalid = error.status === 400 || error.status === 413 || error.status === 415;
    res.status(invalid ? error.status : 503).json({ error: invalid ? "invalid_input" : "unavailable" });
  });

  const build = path.join(__dirname, "../build");
  app.use(express.static(build));
  app.get("/{*path}", (req, res, next) => {
    if (path.extname(req.path) || !req.accepts("html")) return next();
    res.sendFile(path.join(build, "index.html"));
  });
  return app;
}

function start() {
  const config = readConfig();
  let services;
  if (config) {
    const { initializeApp } = require("firebase-admin/app");
    const { getAuth } = require("firebase-admin/auth");
    const { initializeFirestore } = require("firebase-admin/firestore");
    const firebaseApp = initializeApp({ projectId: config.firebase.projectId });
    const db = initializeFirestore(firebaseApp, { preferRest: true });
    services = {
      firebase: config.firebase,
      verifyIdToken: (token) => getAuth(firebaseApp).verifyIdToken(token),
      reserve: createQuota(db, config.limits),
      runGemini: createGemini(config),
      questionBank: createQuestionBank(db),
    };
  }
  const port = process.env.PORT ?? 8080;
  const server = createApp(services).listen(port);
  server.once("listening", () => {
    console.info("CELPIP Practice is listening on port " + port);
    process.send?.("listening");
  });
  server.once("error", (error) => {
    console.error("Could not start the Writing API on port " + port + ". " + error.message);
    process.exitCode = 1;
  });
}

if (require.main === module) start();

module.exports = { createApp };
