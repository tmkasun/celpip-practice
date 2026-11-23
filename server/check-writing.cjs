const { readFile } = require("node:fs/promises");
const { createGemini, parseRequest } = require("./writing.cjs");

async function main() {
  if (!process.env.GEMINI_API_KEY || !process.argv[2]) {
    throw new Error("Set GEMINI_API_KEY server-side and pass a local file containing three CELPIP reference attempts.");
  }
  const references = JSON.parse(await readFile(process.argv[2], "utf8"));
  if (!Array.isArray(references) || references.length !== 3 ||
      references.some(({ expectedLevel }, index) => !Number.isInteger(expectedLevel) || expectedLevel < 0 ||
        expectedLevel > 12 || (index > 0 && expectedLevel <= references[index - 1].expectedLevel))) {
    throw new Error("Provide three reference attempts in ascending official level order.");
  }
  const inputs = references.map(({ answers }) => parseRequest("feedback", { answers }));
  if (inputs.some(({ tasks }) => tasks.length !== 2)) throw new Error("Each reference attempt must contain both tasks.");

  const run = createGemini({
    apiKey: process.env.GEMINI_API_KEY,
    generationModel: process.env.GEMINI_GENERATION_MODEL ?? "gemini-3.5-flash-lite",
    gradingModel: process.env.GEMINI_GRADING_MODEL ?? "gemini-3.8-flash",
    gradingFallbackModel: process.env.GEMINI_GRADING_FALLBACK_MODEL?.trim(),
  });
  console.log(JSON.stringify(await run("prompts", { tasks: [1, 2] }), null, 2));
  const estimates = [];
  for (const { tasks, answers } of inputs) {
    const feedback = await run("feedback", { tasks, answers });
    estimates.push(feedback.overallLevel);
  }
  console.table(references.map(({ expectedLevel }, index) => ({ expectedLevel, estimatedLevel: estimates[index] })));
  if (estimates.some((estimate, index) => Math.abs(estimate - references[index].expectedLevel) > 2 ||
      (index > 0 && estimate <= estimates[index - 1]))) {
    throw new Error("Grading estimates failed the reference ordering or deviated by more than two levels.");
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
