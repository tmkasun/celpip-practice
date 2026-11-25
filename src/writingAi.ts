import type { Prompt } from "./questions/pool";

export type WritingTask = 1 | 2;

export type WritingPrompt = Pick<Prompt, "context" | "instruction"> & { points: string[] };

export interface PromptSnapshot {
  task: WritingTask;
  prompt: WritingPrompt;
}

export interface WritingSubmission extends PromptSnapshot {
  text: string;
}

export const writingCriteria = {
  contentCoherence: "Content and coherence",
  vocabulary: "Vocabulary",
  readability: "Readability",
  taskFulfillment: "Task fulfillment",
};

export interface CriterionFeedback {
  observation: string;
  revision: string;
  excerpt: string | null;
}

export interface TaskFeedback {
  task: WritingTask;
  level: number;
  criteria: Record<keyof typeof writingCriteria, CriterionFeedback>;
}

export interface WritingFeedback {
  tasks: TaskFeedback[];
  overallLevel?: number;
}

export interface WritingAiConfig {
  speakingEnabled?: boolean;
  writingEnabled?: boolean;
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

const messages: Record<string, string> = {
  sign_in: "Your Google session expired. Sign in again to use AI Writing.",
  account_limit: "You’ve reached your daily AI Writing limit. Try again after midnight Pacific time.",
  daily_limit: "AI Writing has reached its daily limit. Try again after midnight Pacific time.",
  busy: "AI Writing is busy. Wait a minute and try again.",
  quota_unavailable: "AI Writing couldn’t check your usage limit. Try again later.",
  unavailable: "AI Writing is temporarily unavailable. Try again later.",
  provider_billing: "AI Writing is paused because the Gemini project’s billing is unavailable.",
  cloudflare_limit: "Cloudflare’s usage limit was reached.",
  cloudflare_config: "Cloudflare Workers AI credentials need to be configured on the server.",
  cloudflare_unavailable: "Cloudflare Workers AI is unavailable. Try again later.",
  provider_result: "The AI provider couldn’t produce a usable result. Try again.",
  invalid_input: "This attempt couldn’t be sent to Gemini. Check that your answer is no more than 12,000 characters.",
};

export class WritingAiError extends Error {
  constructor(public readonly status: number, code?: string, retrySeconds?: number) {
    super((messages[code ?? ""] ?? messages.unavailable) + (code === "cloudflare_limit" && retrySeconds && retrySeconds > 0 ? " Try again in " + retrySeconds + " seconds." : ""));
  }
}

export async function getWritingAiConfig(signal: AbortSignal): Promise<WritingAiConfig | undefined> {
  const response = await fetch("/api/writing/config", { signal, headers: { Accept: "application/json" } });
  if (!response.ok) return undefined;
  const { firebase, speakingEnabled, writingEnabled } = await response.json();
  if (firebase && ["apiKey", "authDomain", "projectId", "appId"].every((key) => typeof firebase[key] === "string" && firebase[key])) {
    return { ...firebase, speakingEnabled, writingEnabled };
  }
  return undefined;
}

export async function writingAiRequest<T>(
  operation: "prompts" | "feedback",
  body: { tasks: WritingTask[] } | { answers: WritingSubmission[] },
  token: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch("/api/writing/" + operation, {
    method: "POST",
    signal,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload) throw new WritingAiError(response.status, payload?.error, Number(response.headers?.get("Retry-After")));
  return payload;
}
