const test = require("node:test");
const assert = require("node:assert/strict");
const { createCloudflare } = require("./cloudflare.cjs");
const { createGemini } = require("./writing.cjs");

test("Cloudflare returns decoded FLUX bytes and distinguishes quota, credentials and malformed results", async () => {
  const expected = Buffer.from("picture");
  const responses = [
    Response.json({ result: { image: expected.toString("base64") } }),
    Response.json({}, { status: 429, headers: { "Retry-After": "33" } }),
    Response.json({}, { status: 401 }),
    Response.json({ result: {} }),
  ];
  const client = createCloudflare({
    accountId: "acct",
    token: "token",
    fetcher: async (url, options) => {
      assert.match(url, /accounts\/acct\/ai\/run\/@cf\/black-forest-labs\/flux-1-schnell$/);
      assert.equal(options.headers.Authorization, "Bearer token");
      return responses.shift();
    },
  });
  assert.deepEqual(await client.image("Park"), expected);
  for (const error of [
    { code: "cloudflare_limit", retryAfter: 33 },
    { code: "cloudflare_config" },
    { code: "provider_result" },
  ])
    await assert.rejects(client.image("Park"), error);
});

test("Writing validates Cloudflare results through the Gemini prompt schema", async () => {
  const results = [
    {
      task1: {
        context: "A music class.",
        recipient: "the teacher",
        sampleAnswer: "I would like to join your evening music class. ".repeat(18).trim(),
        points: ["Ask a question", "Explain your concern", "Suggest a solution"],
      },
    },
    {},
  ];
  const run = createGemini({
    generationModel: "text",
    fetcher: async () => Response.json({}, { status: 429 }),
    cloudflare: {
      json: async (operation, system, input, schema) => {
        assert.equal(operation, "writing_prompts");
        assert.ok(schema.properties.task1);
        return results.shift();
      },
    },
  });
  const input = { tasks: [1] };
  const expectedSample = results[0].task1.sampleAnswer;
  const [row] = (await run("prompts", input)).prompts;
  assert.equal(row.prompt.context, "A music class.");
  assert.equal(row.sampleAnswer, expectedSample);
  await assert.rejects(run("prompts", input), { code: "provider_result" });
});
