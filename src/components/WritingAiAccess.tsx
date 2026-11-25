import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Auth, User } from "firebase/auth";
import {
  getWritingAiConfig, writingAiRequest, WritingAiError,
  type PromptSnapshot, type WritingFeedback, type WritingSubmission, type WritingTask,
} from "../writingAi";

interface WritingAiAccess {
  available: boolean;
  speakingAvailable: boolean;
  checking: boolean;
  ready: boolean;
  user: User | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  generate: (tasks: WritingTask[], signal: AbortSignal) => Promise<PromptSnapshot[]>;
  grade: (answers: WritingSubmission[]) => Promise<WritingFeedback>;
}

const WritingAiContext = createContext<WritingAiAccess | undefined>(undefined);

const googleSignInErrors: Record<string, string> = {
  "auth/configuration-not-found": "Firebase Authentication hasn’t been set up for this project. Enable Google sign-in in the Firebase console.",
  "auth/operation-not-allowed": "Google sign-in is disabled for this Firebase project. Enable it in the Firebase console.",
  "auth/unauthorized-domain": "This site’s hostname must be added to Authorized domains in Firebase Authentication.",
  "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.",
  "auth/popup-closed-by-user": "The Google sign-in window closed. Try signing in again.",
  "auth/network-request-failed": "Couldn’t reach Google sign-in. Check your connection and try again.",
};

export function WritingAiProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<{ auth: Auth; sdk: typeof import("firebase/auth") } | null>();
  const [flags, setFlags] = useState({ writing: true, speaking: false });
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let unsubscribe: (() => void) | undefined;
    async function initialize() {
      const config = await getWritingAiConfig(controller.signal);
      if (controller.signal.aborted) return;
      if (!config) {
        setClient(null);
        return;
      }
      setFlags({ writing: config.writingEnabled !== false, speaking: Boolean(config.speakingEnabled) });
      const [appSdk, sdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
      if (controller.signal.aborted) return;
      const app = appSdk.getApps().find((item) => item.name === "celpip-writing-ai") ??
        appSdk.initializeApp(config, "celpip-writing-ai");
      const auth = sdk.getAuth(app);
      unsubscribe = sdk.onAuthStateChanged(auth, (account) => {
        if (controller.signal.aborted) return;
        setUser(account);
        setReady(true);
      });
      setClient({ auth, sdk });
    }
    void initialize().catch(() => {
      if (!controller.signal.aborted) setClient(null);
    });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, []);

  async function signIn() {
    if (!client) return;
    await client.sdk.signInWithPopup(client.auth, new client.sdk.GoogleAuthProvider());
  }

  async function signOut() {
    if (client) await client.sdk.signOut(client.auth);
  }

  async function request<T>(
    operation: "prompts" | "feedback",
    body: { tasks: WritingTask[] } | { answers: WritingSubmission[] },
    signal?: AbortSignal
  ) {
    if (!user) throw new WritingAiError(401, "sign_in");
    const account = user;
    async function send(forceRefresh = false) {
      const token = await account.getIdToken(forceRefresh);
      try {
        return await writingAiRequest<T>(operation, body, token, signal);
      } catch (error) {
        if (error instanceof WritingAiError || signal?.aborted) throw error;
        throw new WritingAiError(503);
      }
    }
    try {
      return await send();
    } catch (error) {
      if (error instanceof WritingAiError && error.status !== 401) throw error;
      if (signal?.aborted) throw error;
      // Authentication is checked before quota is reserved.
      if (error instanceof WritingAiError || (error as { code?: string })?.code?.startsWith("auth/")) {
        try {
          return await send(true);
        } catch (retryError) {
          if (retryError instanceof WritingAiError && retryError.status !== 401) throw retryError;
          if (signal?.aborted) throw retryError;
          if ((retryError as { code?: string })?.code === "auth/network-request-failed") {
            throw new WritingAiError(503);
          }
          if (client?.auth.currentUser?.uid === account.uid) await signOut().catch(() => undefined);
          throw new WritingAiError(401, "sign_in");
        }
      }
      throw new WritingAiError(503);
    }
  }

  return (
    <WritingAiContext.Provider value={{
      available: Boolean(client) && flags.writing, speakingAvailable: Boolean(client) && flags.speaking,
      checking: client === undefined,
      ready,
      user,
      signIn,
      signOut,
      generate: async (tasks, signal) => {
        const result = await request<{ prompts: PromptSnapshot[] }>("prompts", { tasks }, signal);
        if (!Array.isArray(result.prompts) || result.prompts.length !== tasks.length ||
          tasks.some((task) => !result.prompts.some((item) => item.task === task && item.prompt?.context &&
            item.prompt.instruction && item.prompt.points?.length === (task === 1 ? 3 : 2)))) {
          throw new WritingAiError(502, "provider_result");
        }
        return result.prompts;
      },
      grade: (answers) => request<WritingFeedback>("feedback", { answers }),
    }}>
      {children}
    </WritingAiContext.Provider>
  );
}

export function useWritingAi() {
  const access = useContext(WritingAiContext);
  if (!access) throw new Error("Writing AI requires its access provider");
  return access;
}

export function WritingAiControls({ disabled = false }: { disabled?: boolean }) {
  const { ready, user, signIn, signOut } = useWritingAi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function changeAccount() {
    setPending(true);
    setError("");
    try {
      await (user ? signOut() : signIn());
    } catch (failure) {
      const code = (failure as { code?: string } | null)?.code;
      setError(user ? "Couldn’t sign out. Try again." :
        googleSignInErrors[code ?? ""] ?? "Couldn’t sign in with Google. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (!ready) return <p className="muted" role="status">Checking Google sign-in…</p>;
  return (
    <div className="ai-access">
      <div className="actions">
        {user && <span className="muted">Signed in{user.email ? " as " + user.email : ""}</span>}
        <button type="button" className="button secondary" onClick={changeAccount} disabled={pending || disabled}>
          {pending ? "Connecting…" : user ? "Sign out" : "Sign in with Google"}
        </button>
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
    </div>
  );
}
