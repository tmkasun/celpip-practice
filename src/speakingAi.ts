import type { Prompt } from "./questions/pool";
import type { User } from "firebase/auth";

export type SpeakingSnapshot = { task: number; prompt: Prompt };
export interface SpeakingFeedback {
  overallLevel?: number;
  tasks: {
    task: number;
    level: number | null;
    criteria?: Record<string, { observation: string; revision: string }>;
  }[];
}
export async function speakingRequest<T>(
  user: User,
  operation: string,
  body: FormData | string,
  signal?: AbortSignal,
): Promise<T> {
  const send = async (refresh: boolean) =>
    fetch("/api/speaking/" + operation, {
      method: "POST",
      signal,
      body,
      headers: {
        Authorization: "Bearer " + (await user.getIdToken(refresh)),
        ...(typeof body === "string" && { "Content-Type": "application/json" }),
      },
    });
  let response = await send(false);
  if (response.status === 401) response = await send(true);
  if (!response.ok) {
    const code = (await response.json().catch(() => ({}))).error;
    throw new Error(
      code === "account_limit" || code === "daily_limit"
        ? "Daily AI limit reached. Try again after midnight Pacific time."
        : response.status === 429
          ? "AI is busy. Try again in a minute."
          : response.status === 413
            ? "The recordings are too large to send."
            : response.status === 401
              ? "Sign in again to use AI Speaking."
              : "AI Speaking could not finish this request. Try again.",
    );
  }
  return response.json();
}

export function imageSource(file: string) {
  return file.startsWith("ai/")
    ? "/api/speaking/images/" + file.slice(3)
    : process.env.PUBLIC_URL + "/practice/" + file;
}

export async function preparePictures(prompts: SpeakingSnapshot[]) {
  const files = new Set<string>();
  for (const { prompt } of prompts) {
    if (prompt.image) files.add(prompt.image.file);
    if (prompt.comparison)
      for (const option of [...prompt.comparison.choices, prompt.comparison.alternative])
        files.add(option.image.file);
  }
  await Promise.all(
    Array.from(
      files,
      (file) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve();
          image.onerror = () => reject(new Error("The practice picture could not load. Try again."));
          image.src = imageSource(file);
        }),
    ),
  );
}
