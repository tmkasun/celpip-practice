import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { loadSessions, type Session } from "./practiceStorage";
import type { PromptSnapshot, TaskFeedback } from "./writingAi";

const mockUser = { uid: "writing-user", email: "writer@example.com", getIdToken: jest.fn() };
const mockAuth = { currentUser: null as typeof mockUser | null };
let mockAuthListener: ((user: typeof mockAuth.currentUser) => void) | undefined;
const mockSignInWithPopup = jest.fn();

jest.mock("use-sound", () => ({ __esModule: true, default: () => [jest.fn()] }));
jest.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
jest.mock("firebase/auth", () => ({
  getAuth: () => mockAuth,
  onAuthStateChanged: (_auth: unknown, listener: typeof mockAuthListener) => {
    mockAuthListener = listener;
    listener?.(mockAuth.currentUser);
    return () => { mockAuthListener = undefined; };
  },
  GoogleAuthProvider: class {},
  signInWithPopup: () => mockSignInWithPopup(),
  signOut: async () => {
    mockAuth.currentUser = null;
    mockAuthListener?.(null);
  },
}));

const prompts: PromptSnapshot[] = [
  { task: 1, prompt: {
    context: "The ferry service stopped accepting bicycles during the morning commute.",
    instruction: "Write an email to the ferry manager in about 150–200 words.",
    points: ["Describe your commute.", "Explain the impact.", "Suggest a workable change."],
  } },
  { task: 2, prompt: {
    context: "Your community garden committee is planning a new shared space.",
    instruction: "Choose the option you prefer and explain your reasons in about 150–200 words.",
    points: ["Option A — Add raised beds.", "Option B — Build a covered seating area."],
  } },
];
const criterion = { observation: "The purpose is clear.", revision: "Add one concrete detail.", excerpt: null };
function taskFeedback(task: 1 | 2): TaskFeedback {
  return {
    task,
    level: 9,
    criteria: { contentCoherence: criterion, vocabulary: criterion, readability: criterion, taskFulfillment: criterion },
  };
}

function json(payload: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => payload } as Response;
}

function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function open(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>
  );
}

function enableApi(operations: (path: string, options?: RequestInit) => Promise<Response>) {
  return jest.spyOn(globalThis, "fetch").mockImplementation(async (request, options) => {
    const path = String(request);
    if (path === "/api/writing/config") {
      return json({ firebase: {
        apiKey: "public-firebase-key", projectId: "practice", authDomain: "practice.firebaseapp.com", appId: "web",
      } });
    }
    return operations(path, options);
  });
}

async function chooseGenerated() {
  fireEvent.click(screen.getByRole("button", { name: "AI-generated" }));
  await signIn();
}

async function signIn() {
  const button = await screen.findByRole("button", { name: "Sign in with Google" });
  await act(async () => { fireEvent.click(button); });
  fireEvent.click(await screen.findByRole("checkbox", { name: /I’m 18 or older/ }));
}

beforeEach(() => {
  localStorage.clear();
  mockAuth.currentUser = null;
  mockSignInWithPopup.mockReset().mockImplementation(async () => {
    mockAuth.currentUser = mockUser;
    mockAuthListener?.(mockUser);
  });
  mockUser.getIdToken.mockReset().mockResolvedValue("valid-token");
});
afterEach(() => jest.restoreAllMocks());

test("explains missing Firebase Authentication configuration when Google sign-in fails", async () => {
  enableApi(async () => json({}));
  mockSignInWithPopup.mockRejectedValueOnce({ code: "auth/configuration-not-found" });
  open("/mock/writing?source=ai");

  fireEvent.click(await screen.findByRole("button", { name: "Sign in with Google" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Firebase Authentication hasn’t been set up");
  expect(screen.getByRole("button", { name: "Start mock" })).toBeDisabled();
});

test("opens the AI-generated mock setup from home and keeps built-in sets usable when AI is unavailable", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(json({ firebase: null }));
  open("/");
  fireEvent.click(screen.getByRole("link", { name: "AI-generated" }));

  expect(screen.getByRole("button", { name: "AI-generated" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByText(/AI-generated prompts are unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Start mock" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Set 2" }));
  expect(screen.getByRole("button", { name: "Set 2" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start mock" })); });
  expect(screen.getByRole("timer")).toHaveTextContent("27:00");
  const [session] = loadSessions();
  expect(session.set).toBe(2);
  expect(session.writingPrompts).toBeUndefined();
});

test("waits for both generated prompts, grades the completed mock once and restores the score", async () => {
  const generation = deferred();
  const grading = deferred();
  const calls = enableApi((path) => path.endsWith("/prompts") ? generation.promise : grading.promise);
  const page = open("/mock/writing");
  await chooseGenerated();
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  expect(screen.getByRole("button", { name: "Generating prompts…" })).toBeDisabled();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(loadSessions()).toEqual([]);
  await act(async () => generation.resolve(json({ prompts })));
  expect(screen.getByText(prompts[0].prompt.context)).toBeInTheDocument();
  expect(screen.getByRole("timer")).toHaveTextContent("27:00");
  expect(calls.mock.calls.filter(([path]) => path === "/api/writing/prompts")).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "Please restore bicycle access." } });
  fireEvent.click(screen.getByRole("button", { name: /Next task/ }));
  expect(screen.getByText(prompts[1].prompt.context)).toBeInTheDocument();
  expect(screen.getByRole("timer")).toHaveTextContent("26:00");
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "Raised beds would welcome more gardeners." } });
  fireEvent.click(screen.getByRole("button", { name: /Finish section/ }));
  expect(screen.getByText(/Tasks 1 and 2 will be sent to Google/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Get AI feedback" }));
  await waitFor(() => expect(calls).toHaveBeenCalledWith("/api/writing/feedback", expect.any(Object)));
  const [, options] = calls.mock.calls.find(([path]) => path === "/api/writing/feedback")!;
  expect(options?.headers).toMatchObject({ Authorization: "Bearer valid-token" });
  expect(JSON.parse(String(options?.body)).answers).toEqual([
    { ...prompts[0], text: "Please restore bicycle access." },
    { ...prompts[1], text: "Raised beds would welcome more gardeners." },
  ]);
  fireEvent.change(screen.getByRole("textbox", { name: "One change for next time" }), { target: { value: "Keep my own notes." } });
  await act(async () => grading.resolve(json({ tasks: [taskFeedback(1), taskFeedback(2)], overallLevel: 9 })));
  expect(screen.getByText("Overall Writing estimate · Level 9")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "One change for next time" })).toHaveValue("Keep my own notes.");
  fireEvent.click(screen.getByRole("button", { name: "Task 2" }));
  expect(screen.getByText("Task 2 estimate · Level 9")).toBeInTheDocument();
  page.unmount();
  await act(async () => { open("/review/" + loadSessions()[0].id); });
  expect(screen.getByText("Task 1 estimate · Level 9")).toBeInTheDocument();
  expect(calls.mock.calls.filter(([path]) => path === "/api/writing/feedback")).toHaveLength(1);
});

test("reopens a generated drill from history with its exact prompt and answer", async () => {
  const calls = enableApi(async () => json({ prompts: [prompts[1]] }));
  const page = open("/writing/2");
  await chooseGenerated();
  fireEvent.click(screen.getByRole("button", { name: "Show prompt and start" }));
  expect(await screen.findByText(prompts[1].prompt.context)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "My unfinished answer." } });
  page.unmount();
  open("/review");
  fireEvent.click(screen.getByRole("link", { name: /Resume draft/ }));
  expect(screen.getByText(prompts[1].prompt.context)).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Your response" })).toHaveValue("My unfinished answer.");
  expect(calls.mock.calls.filter(([path]) => path === "/api/writing/prompts")).toHaveLength(1);
});

test("recovers from expired Google sign-in and starts built-in practice after a Gemini billing error", async () => {
  let requests = 0;
  enableApi(async () => {
    requests++;
    return requests <= 2 ? json({ error: "sign_in" }, 401) : json({ error: "provider_billing" }, 503);
  });
  open("/mock/writing");
  await chooseGenerated();
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your Google session expired");
  expect(mockUser.getIdToken.mock.calls).toEqual([[false], [true]]);
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  await chooseGenerated();
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Gemini project’s billing is unavailable");
  expect(loadSessions()).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Set 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  expect(screen.getByRole("timer")).toHaveTextContent("27:00");
});

test("sends only finished nonblank writing from a previous interrupted attempt", async () => {
  const attempt: Session = {
    id: "earlier-attempt", skill: "writing", mode: "mock", set: 2, status: "interrupted", createdAt: Date.now(),
    responses: [{ task: 1, text: "I’m writing to request a refund.", finished: true }, { task: 2, text: "An unfinished survey." }],
  };
  localStorage.setItem("celpip-session-" + attempt.id, JSON.stringify(attempt));
  const requests = enableApi(async () => json({ tasks: [taskFeedback(1)] }));
  open("/review/" + attempt.id);
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: "Get AI feedback" }));
  expect(await screen.findByText("Task 1 estimate · Level 9")).toBeInTheDocument();
  expect(screen.queryByText(/Overall Writing estimate/)).not.toBeInTheDocument();
  const [, options] = requests.mock.calls.find(([path]) => path === "/api/writing/feedback")!;
  expect(JSON.parse(String(options?.body)).answers).toEqual([expect.objectContaining({ task: 1, text: attempt.responses[0].text })]);
  fireEvent.click(screen.getByRole("button", { name: "Task 2" }));
  expect(screen.getByText("This task had no finished response to grade.")).toBeInTheDocument();
});
