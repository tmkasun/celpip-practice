import type { Prompt } from "./questions/pool";
import type { User } from "firebase/auth";

export type SpeakingSnapshot = { task: number; prompt: Prompt };
export interface SpeakingFeedback {
  kind?: "transcript";
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
    if (code === "image_bucket")
      throw new Error("The server could not access the Speaking image bucket. Check bucket access or select Firestore image storage.");
    if (code === "image_database")
      throw new Error("The server could not save the Speaking picture in Firestore. Check its database access.");
    if (code === "cloudflare_config")
      throw new Error("Cloudflare Workers AI credentials need to be configured on the server.");
    if (code === "provider_result")
      throw new Error("The AI provider returned an unusable response. Try again.");
    if (code === "cloudflare_unavailable")
      throw new Error("Cloudflare Workers AI is unavailable. Try again later.");
    if (response.status === 429 && code !== "account_limit" && code !== "daily_limit") {
      const seconds = Number(response.headers.get("Retry-After"));
      const source =
        code === "busy"
          ? "The app’s request limit was reached."
          : code === "cloudflare_limit"
            ? "Cloudflare’s usage limit was reached."
            : "Gemini’s request limit was reached.";
      throw new Error(
        source + (seconds > 0 ? " Try again in " + seconds + " seconds." : " Try again later."),
      );
    }
    throw new Error(
      code === "account_limit" || code === "daily_limit"
        ? "Daily AI limit reached. Try again after midnight Pacific time."
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
