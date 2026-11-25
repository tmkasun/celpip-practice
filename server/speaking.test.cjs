const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const { service } = require("./speaking.cjs");
const { memoryFirestore } = require("./test-support/firestore.cjs");

test("issues the scene pair together, splits option images, and grades with the actual scene and audio", async () => {
  const objects = new Map();
  const storage = {
    bucket: () => ({
      file: (key) => ({
        save: async (bytes) => objects.set(key, bytes),
        download: async () => [objects.get(key)],
      }),
    }),
  };
  const image = await sharp({ create: { width: 90, height: 40, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  let sent;
  const fetcher = async (_url, options) => {
    const body = JSON.parse(options.body);
    let part;
    if (body.systemInstruction.parts[0].text.startsWith("Generate")) {
      const rows = JSON.parse(body.contents[0].parts[0].text).map(({ task }) => ({
        task,
        context: "At a market.",
        instruction: "Speak to your friend.",
        scene: "Apples spill from a stall.",
        sampleAnswer: "My answer to speaking task " + task,
        options: ["table", "basket", "cart"].map((title) => ({
          title,
          details: ["cheap", "light", "portable"],
        })),
        persuasion: "Compare the options.",
      }));
      part = { text: JSON.stringify(rows) };
    } else if (body.systemInstruction.parts[0].text.startsWith("Write natural")) {
      const [metadata, ...images] = body.contents[0].parts;
      assert.deepEqual(JSON.parse(metadata.text).map(row => row.task), [3, 5, 8]);
      for (let index = 0; index < images.length; index += 2) {
        assert.equal(images[index + 1].inlineData.data,
          objects.get("speaking/" + images[index].text.slice(3) + ".webp").toString("base64"));
      }
      assert.ok(images.length >= 2);
      part = { text: JSON.stringify({ samples: [
        { task: 8, sampleAnswer: "Look at this unusual object." },
        { task: 5, sampleAnswersByChoice: ["I'd choose the table.", "I'd choose the basket."] },
        { task: 3, sampleAnswer: "The apples are falling.", predictionSampleAnswer: "The vendor will pick them up." },
      ] }) };
    } else {
      sent = body.contents[0].parts;
      part = { text: JSON.stringify({ tasks: [{ task: 4, level: null }], overallLevel: 9 }) };
    }
    return Response.json({ candidates: [{ content: { parts: [part] } }] });
  };
  process.env.SPEAKING_IMAGE_BUCKET = "test";
  const api = service(
    memoryFirestore(),
    null,
    { fetcher, cloudflare: { image: async () => image }, generationModel: "text", gradingModel: "grader" },
    storage,
  );
  let calls = 0;
  const reserve = async () => {
    calls++;
  };
  const rows = await api.prompts("first", [1, 2, 3, 4, 5, 6, 7, 8], reserve);
  assert.equal(calls, 5);
  assert.deepEqual(
    rows.map((r) => r.task),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(rows[2].prompt.image, rows[3].prompt.image);
  assert.equal(rows[2].sampleAnswer, "The apples are falling.");
  assert.equal(rows[3].sampleAnswer, "The vendor will pick them up.");
  assert.deepEqual(rows[4].sampleAnswersByChoice, ["I'd choose the table.", "I'd choose the basket."]);
  assert.equal(rows[7].sampleAnswer, "Look at this unusual object.");
  const option = rows[4].prompt.comparison.alternative.image;
  const metadata = await sharp(objects.get("speaking/" + option.file.slice(3) + ".webp")).metadata();
  assert.equal(metadata.width, 30);
  const pair = await api.prompts("second", [4], reserve);
  assert.deepEqual(pair, rows.slice(2, 4));
  assert.equal(calls, 5);
  const feedback = await api.feedback(
    [{ task: 4, prompt: pair[1].prompt }],
    [{ fieldname: "4", mimetype: "audio/webm", buffer: Buffer.from("sample") }],
    reserve,
  );
  assert.deepEqual(feedback, { tasks: [{ task: 4, level: null }] });
  assert.deepEqual(
    sent.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType),
    ["image/webp", "audio/webm"],
  );
  assert.equal(calls, 6);
});

test("multipart grading authenticates before processing audio and binds recordings to task numbers", async (t) => {
  const { once } = require("node:events");
  const { createApp } = require("./index.cjs");
  let graded = 0;
  const app = createApp({
    speaking: {
      async feedback(answers, files, reserve) {
        assert.equal(files[0].fieldname, String(answers[0].task));
        await reserve();
        graded++;
        return { tasks: [{ task: 1, level: null }] };
      },
    },
    verifyIdToken: async () => ({
      uid: "account",
      email_verified: true,
      firebase: { sign_in_provider: "google.com" },
    }),
    reserve: async (uid) => assert.equal(uid, "account"),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const url = "http://127.0.0.1:" + server.address().port + "/api/speaking/feedback";
  const body = new FormData();
  body.append(
    "answers",
    JSON.stringify([{ task: 1, prompt: { context: "A friend needs help.", instruction: "Give advice." } }]),
  );
  body.append("1", new Blob(["audio"], { type: "audio/webm;codecs=opus" }), "recording");
  assert.equal((await fetch(url, { method: "POST", body })).status, 401);
  const send = () => fetch(url, { method: "POST", headers: { Authorization: "Bearer valid" }, body });
  assert.equal((await send()).status, 200);
  body.append("2", new Blob(["extra"], { type: "audio/webm" }), "recording");
  assert.equal((await send()).status, 400);
  assert.equal(graded, 1);
});

test("stops before image generation when the app quota rejects a prompt request", async () => {
  process.env.SPEAKING_IMAGE_BUCKET = "test";
  const unexpected = () => assert.fail("provider contacted");
  const api = service(
    memoryFirestore(),
    null,
    { fetcher: unexpected, cloudflare: { image: unexpected } },
    { bucket: () => ({}) },
  );
  await assert.rejects(
    api.prompts("learner", [3, 4], async () => {
      throw Error("account_limit");
    }),
    /account_limit/,
  );
});

test("transcript fallback shares one picture caption and retains silent tasks without grades", async () => {
  process.env.SPEAKING_IMAGE_BUCKET = "test";
  const image = { file: "farmers-market.webp", alt: "An outdoor market" };
  const answers = [3, 4, 8].map((task) => ({
    task,
    prompt: { context: "At the market", instruction: "Speak", image },
  }));
  const files = answers.map(({ task }) => ({
    fieldname: String(task),
    mimetype: "audio/webm",
    buffer: Buffer.from(String(task)),
  }));
  const criteria = Object.fromEntries(
    ["Content and coherence", "Vocabulary", "Task fulfillment"].map((name) => [
      name,
      { observation: "You gave a clear example.", revision: "Add one more detail." },
    ]),
  );
  let captions = 0;
  let reserves = 0;
  const api = service(
    memoryFirestore(),
    null,
    {
      fetcher: async () => Response.json({}, { status: 429, headers: { "Retry-After": "12" } }),
      cloudflare: {
        describe: async (bytes) => {
          assert.ok(bytes.length);
          captions++;
          return "Fruit on the ground.";
        },
        transcript: async (bytes) => (bytes.toString() === "8" ? "" : "The fruit fell."),
        json: async (operation, system, input) => {
          assert.equal(operation, "speaking_feedback");
          assert.deepEqual(input.captions, { "farmers-market.webp": "Fruit on the ground." });
          return {
            tasks: input.answers.map(({ task }) => ({ task, criteria, level: 10 })),
            overallLevel: 10,
          };
        },
      },
    },
    { bucket: () => ({}) },
  );
  const reserve = async () => {
    reserves++;
  };
  const result = await api.feedback(answers, files, reserve);
  assert.deepEqual(result, {
    kind: "transcript",
    tasks: [
      { task: 3, level: null, criteria },
      { task: 4, level: null, criteria },
      { task: 8, level: null },
    ],
  });
  assert.equal(captions, 1);
  assert.equal(reserves, 1);
  await assert.rejects(api.feedback(answers, files, reserve, true), {
    code: "provider_limit",
    retryAfter: 12,
  });
  assert.equal(captions, 1);
});

test("Firestore images can be reopened for the shared scene while old bucket references still resolve", async t => {
  const previous = process.env.SPEAKING_IMAGE_STORE;
  process.env.SPEAKING_IMAGE_STORE = "firestore";
  t.after(() => {
    if (previous === undefined) delete process.env.SPEAKING_IMAGE_STORE;
    else process.env.SPEAKING_IMAGE_STORE = previous;
  });
  const db = memoryFirestore();
  const images = new Map();
  const collection = db.collection;
  db.collection = name => {
    const ref = collection(name);
    if (name !== "speakingAiQuestions") return ref;
    return {...ref, doc: id => id !== "assets" ? ref.doc(id) : {
      collection: child => {
        assert.equal(child, "images");
        return {doc: hash => ({
          set: async ({bytes}) => images.set(hash, bytes),
          get: async () => ({exists: images.has(hash), get: () => images.get(hash)})
        })};
      }
    }};
  };
  const original = await sharp({create:{width:32,height:24,channels:3,background:"blue"}}).png().toBuffer();
  let includePrediction = false;
  const api = service(db, null, {
    fetcher: async () => Response.json({}, { status: 429 }),
    cloudflare: {
      image: async () => original,
      describe: async bytes => {
        assert.ok([...images.values()].some(stored => stored.equals(bytes)));
        return "Children are kicking a ball.";
      },
      json: async (operation, system, data) => {
        if (operation === "speaking_prompts") return { prompts: [
          {task:3,context:"At a park.",instruction:"Describe the scene.",scene:"Children playing."}
        ] };
        assert.equal(operation, "speaking_samples");
        assert.deepEqual(Object.values(data.captions), ["Children are kicking a ball."]);
        return { samples: [{task:3, sampleAnswer:"A child kicks the ball.", ...(includePrediction && {
          predictionSampleAnswer:"The other child will run for the ball."
        })}] };
      },
    },
  }, {bucket: () => ({file: () => ({download: async () => [original]})})});
  await assert.rejects(api.prompts("learner", [3,4], async () => {}), { code: "provider_result" });
  includePrediction = true;
  const [description, prediction] = await api.prompts("learner", [3,4], async () => {});
  assert.equal(prediction.sampleAnswer, "The other child will run for the ball.");
  const id = description.prompt.image.file.slice(3);
  assert.match(id, /^fs-[a-f0-9]{64}$/);
  assert.deepEqual(description.prompt.image, prediction.prompt.image);
  assert.equal(images.size, 1);
  assert.equal((await sharp(await api.loadImage(id)).metadata()).format, "webp");
  assert.deepEqual(await api.loadImage("a".repeat(64)), original);
});
