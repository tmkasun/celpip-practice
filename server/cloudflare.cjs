const { WritingError } = require("./writing.cjs");

function retrySeconds(response, delay) {
  const header = response.headers.get("Retry-After");
  const seconds =
    header && !/^\d+$/.test(header)
      ? (Date.parse(header) - Date.now()) / 1000
      : Number(header) || Number(/^(\d+(?:\.\d+)?)s$/.exec(delay)?.[1]);
  return seconds > 0 && Number.isFinite(seconds) ? Math.ceil(seconds) : undefined;
}

function createCloudflare({ accountId, token, fetcher = fetch }) {
  async function run(operation, model, input) {
    if (!accountId || !token) throw new WritingError(503, "cloudflare_config");
    console.info(
      JSON.stringify({
        provider: "cloudflare",
        operation,
        reason: operation === "illustration" ? "primary" : "gemini_quota",
      }),
    );
    const response = await fetcher(
      "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(accountId) + "/ai/run/" + model,
      {
        method: "POST",
        signal: AbortSignal.timeout(90000),
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      if (
        response.status === 429 ||
        payload?.errors?.some((e) => /daily free allocation|daily neuron limit/i.test(e.message))
      ) {
        throw new WritingError(429, "cloudflare_limit", retrySeconds(response));
      }
      if ([401, 403].includes(response.status)) throw new WritingError(503, "cloudflare_config");
      throw new WritingError(503, "cloudflare_unavailable");
    }
    if (!payload?.result) throw new WritingError(502, "provider_result");
    return payload.result;
  }
  return {
    async image(prompt) {
      const { image } = await run("illustration", "@cf/black-forest-labs/flux-1-schnell", {
        prompt: prompt.slice(0, 2048),
        steps: 4,
      });
      if (typeof image !== "string" || !image.length) throw new WritingError(502, "provider_result");
      return Buffer.from(image, "base64");
    },
    async json(operation, system, data, schema) {
      const result = await run(operation, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", {
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(data) },
        ],
        response_format: schema ? { type: "json_schema", json_schema: schema } : { type: "json_object" },
        max_tokens: 8192,
      });
      if (result.response && typeof result.response === "object") return result.response;
      try {
        return JSON.parse(result.response);
      } catch {
        throw new WritingError(502, "provider_result");
      }
    },
    async transcript(buffer) {
      const result = await run("transcription", "@cf/openai/whisper-large-v3-turbo", {
        audio: buffer.toString("base64"),
        language: "en",
        vad_filter: true,
      });
      if (typeof result.text !== "string") throw new WritingError(502, "provider_result");
      return result.text.trim();
    },
    async describe(buffer) {
      const result = await run("scene_description", "@cf/meta/llama-3.2-11b-vision-instruct", {
        image: Array.from(buffer),
        prompt: "Describe visible people, objects, positions and actions in this practice illustration.",
        max_tokens: 400,
      });
      if (typeof result.response !== "string") throw new WritingError(502, "provider_result");
      return result.response.trim();
    },
  };
}
module.exports = { createCloudflare, retrySeconds };
