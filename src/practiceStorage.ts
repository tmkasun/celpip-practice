import { getPrompt, type Prompt, type SetId, type Skill } from "./questions/pool";
import type { PromptSnapshot, WritingFeedback } from "./writingAi";

export interface Response {
  task: number;
  text?: string;
  choice?: number;
  hasAudio?: boolean;
  finished?: boolean;
  checks?: number[];
  note?: string;
}

export interface Session {
  id: string;
  skill: Skill;
  set: SetId;
  mode: "drill" | "mock";
  status: "active" | "completed" | "interrupted";
  createdAt: number;
  deadline?: number;
  responses: Response[];
  writingPrompts?: PromptSnapshot[];
  writingFeedback?: WritingFeedback;
}

const sessionPrefix = "celpip-session-";

export function getSessionPrompt(session: Session, task: number): Prompt | undefined {
  return session.writingPrompts
    ? session.writingPrompts.find((item) => item.task === task)?.prompt
    : getPrompt(session.skill, session.set, task);
}

export function promptSetLabel(session: Session) {
  return session.writingPrompts ? "AI-generated" : "Set " + session.set;
}

export function writingDraftUrl(session: Session) {
  return "/writing/" + session.responses[0]?.task + "?draft=" + encodeURIComponent(session.id);
}

export function loadSessions(): Session[] {
  try {
    const sessions: Session[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(sessionPrefix)) continue;
      try {
        const session: Session = JSON.parse(localStorage.getItem(key) ?? "null");
        if (!session || !Array.isArray(session.responses)) continue;
        if (session.status === "active" && (session.mode === "mock" || session.skill === "speaking")) {
          session.status = "interrupted";
        }
        sessions.push(session);
      } catch {
        // A damaged entry should not prevent loading other attempts.
      }
    }
    return sessions.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(sessionPrefix + session.id, JSON.stringify(session));
}

export function audioKey(sessionId: string, task: number) {
  return sessionId + "/" + task;
}

function openAudioDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("celpip-practice-audio", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("recordings");
    let blocked = false;
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Could not open the recordings database"));
    };
    request.onsuccess = () => {
      if (blocked) request.result.close();
      else resolve(request.result);
    };
    request.onerror = () => reject(request.error);
  });
}

async function withAudioStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const database = await openAudioDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction("recordings", mode);
      const request = operation(transaction.objectStore("recordings"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? request.error);
    });
  } finally {
    database.close();
  }
}

export function saveAudio(key: string, blob: Blob) {
  return withAudioStore("readwrite", (store) => store.put(blob, key));
}

export function loadAudio(key: string): Promise<Blob | undefined> {
  return withAudioStore("readonly", (store) => store.get(key));
}

export function loadLegacyAudio(task: number): string | null {
  try {
    const audio = localStorage.getItem("task-" + task);
    return audio?.startsWith("data:audio/") ? audio : null;
  } catch {
    return null;
  }
}

export function downloadResponse(contents: Blob, file: string) {
  const url = URL.createObjectURL(contents);
  const link = document.createElement("a");
  link.href = url;
  link.download = file;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
