import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { loadSessions, type Session } from "./practiceStorage";
import { getPrompt } from "./questions/pool";
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

test("opens Writing practice from home and keeps built-in sets usable when AI is unavailable", async () => {
  jest.spyOn(globalThis, "fetch").mockResolvedValue(json({ firebase: null }));
  open("/");
  fireEvent.click(screen.getByRole("link", { name: "Start Writing mock" }));
  fireEvent.click(screen.getByRole("button", { name: "AI-generated" }));

  expect(screen.getByRole("button", { name: "AI-generated" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByText(/AI-generated prompts are unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Show prompt and start" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Set 2" }));
  expect(screen.getByRole("button", { name: "Set 2" })).toHaveAttribute("aria-pressed", "true");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show prompt and start" })); });
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
  expect(screen.getByRole("heading", { name: "Writing Task 1: Writing an Email" })).toHaveFocus();
  expect(screen.getByRole("status")).toHaveTextContent("Generating prompts…");
  expect(screen.getByRole("button", { name: "Next task" })).toBeDisabled();
  expect(screen.queryByRole("heading", { name: "Set up your mock" })).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByRole("timer")).not.toBeInTheDocument();
  expect(loadSessions()).toEqual([]);
  await act(async () => generation.resolve(json({ prompts })));
  expect(screen.getByText(prompts[0].prompt.context)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: prompts[0].prompt.instruction })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Your response" })).toHaveFocus();
  expect(screen.getByRole("timer")).toHaveTextContent("27:00");
  const generationCalls = calls.mock.calls.filter(([path]) => path === "/api/writing/prompts");
  expect(generationCalls).toHaveLength(1);
  expect(JSON.parse(String(generationCalls[0][1]?.body))).toEqual({ tasks: [1, 2] });
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
  expect(JSON.parse(String(options?.body))).toEqual({
    answers: [
      { ...prompts[0], text: "Please restore bicycle access." },
      { ...prompts[1], text: "Raised beds would welcome more gardeners." },
    ],
  });
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

test("can return to setup during generation and ignore a cancelled request during retry", async () => {
  const cancelled = deferred();
  const retry = deferred();
  const calls = enableApi(jest.fn().mockReturnValueOnce(cancelled.promise).mockReturnValueOnce(retry.promise));
  open("/mock/writing");
  await chooseGenerated();
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  await waitFor(() => expect(calls).toHaveBeenCalledWith("/api/writing/prompts", expect.any(Object)));
  const signal = calls.mock.calls.find(([path]) => path === "/api/writing/prompts")![1]?.signal;

  fireEvent.click(screen.getByRole("button", { name: "Back to setup" }));
  expect(signal?.aborted).toBe(true);
  expect(screen.getByRole("heading", { name: "Set up your mock" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  await act(async () => cancelled.resolve(json({ prompts })));
  expect(screen.getByRole("status")).toHaveTextContent("Generating prompts…");
  expect(loadSessions()).toEqual([]);

  await act(async () => retry.resolve(json({ prompts })));
  expect(screen.getByRole("timer")).toHaveTextContent("27:00");
  expect(loadSessions()).toHaveLength(1);
});

test("grades a built-in mock from review and restores the saved feedback", async () => {
  const feedback = { tasks: [taskFeedback(1), { ...taskFeedback(2), level: 8 }], overallLevel: 9 };
  const calls = enableApi(async () => json(feedback));
  const page = open("/mock/writing?set=2");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Start mock" })); });

  const answers = ["My parcel was left on a different floor.", "I support extending the main library’s hours."];
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: answers[0] } });
  fireEvent.click(screen.getByRole("button", { name: /Next task/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: answers[1] } });
  fireEvent.click(screen.getByRole("button", { name: /Finish section/ }));

  expect(screen.getByRole("heading", { name: "Writing mock review" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Get AI feedback" })).toBeDisabled();
  await signIn();
  fireEvent.click(screen.getByRole("button", { name: "Get AI feedback" }));
  expect(await screen.findByText("Overall Writing estimate · Level 9")).toBeInTheDocument();
  const [attempt] = loadSessions();
  expect(attempt.writingFeedback).toEqual(feedback);

  page.unmount();
  await act(async () => { open("/review/" + attempt.id); });
  fireEvent.click(screen.getByRole("button", { name: "Task 2" }));
  expect(screen.getByText("Task 2 estimate · Level 8")).toBeInTheDocument();

  const operations = calls.mock.calls.filter(([path]) =>
    String(path).startsWith("/api/writing/") && path !== "/api/writing/config"
  );
  expect(operations.map(([path]) => path)).toEqual(["/api/writing/feedback"]);
  const [, options] = operations[0];
  expect(JSON.parse(String(options?.body)).answers).toEqual(answers.map((text, index) => ({
    task: index + 1,
    text,
    prompt: getPrompt("writing", 2, index + 1),
  })));
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

test("restores Speaking feedback and continues a prediction drill with the recorded scene", async () => {
  const speakingPrompts = [3, 4].map(task => ({task, prompt: {
    ...getPrompt("speaking", 1, task),
    image: {file: "ai/" + "a".repeat(64), alt: "Two people at a crossing."}
  }}));
  const session: Session = {
    id: "scene-attempt", skill: "speaking", status: "completed", mode: "drill", set: 1,
    createdAt: 0, responses: [{task: 3, finished: true}], speakingPrompts,
    speakingFeedback: {tasks: [{task: 3, level: 8, criteria: {
      Listenability: {observation: "Clear pace.", revision: "Pause between ideas."}
    }}]}
  };
  localStorage.setItem("celpip-session-" + session.id, JSON.stringify(session));
  const calls = jest.spyOn(globalThis, "fetch").mockResolvedValue(json({
    speakingEnabled: true, firebase: {apiKey: "public", projectId: "project", authDomain: "localhost", appId: "app"}
  }));
  open("/review/" + session.id);
  expect(screen.getByText("Task 3 practice estimate · Level 8")).toBeInTheDocument();
  expect(screen.getByText("Clear pace.")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute("src", "/api/speaking/images/" + "a".repeat(64));
  const next = screen.getByRole("link", {name: "Practice Task 4 with this picture"});
  fireEvent.click(next);
  expect(await screen.findByRole("button", {name:"AI-generated"})).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("heading", {name:"Making Predictions"})).toBeInTheDocument();
  expect(calls.mock.calls.every(([url]) => url === "/api/writing/config")).toBe(true);
});

test("keeps transcript feedback on retry and saves a successful full Speaking grade", async () => {
  const storage = require("./practiceStorage") as typeof import("./practiceStorage");
  const recording = new Blob(["recording"], {type:"audio/webm"});
  jest.spyOn(storage, "loadAudio").mockResolvedValue(recording);
  const oldCreate = URL.createObjectURL;
  const oldRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => "blob:recording");
  URL.revokeObjectURL = jest.fn();
  const session: Session = {
    id:"partial-attempt", skill:"speaking", status:"completed", mode:"drill", set:1, createdAt:1,
    responses:[{task:1,finished:true,hasAudio:true}],
    speakingFeedback:{kind:"transcript",tasks:[{task:1,level:null,criteria:{
      Vocabulary:{observation:"Precise wording.",revision:"Vary the verbs."}
    }}]}
  };
  localStorage.setItem("celpip-session-" + session.id, JSON.stringify(session));
  let retries = 0;
  jest.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (url === "/api/writing/config") return json({speakingEnabled:true, firebase:{
      apiKey:"key",projectId:"project",authDomain:"localhost",appId:"app"
    }});
    expect(url).toBe("/api/speaking/feedback?fullOnly=true");
    expect((options?.body as FormData).get("1")).toBeInstanceOf(Blob);
    if (++retries === 1) return { ...json({error:"provider_limit"},429), headers:new Headers({"Retry-After":"12"}) };
    return json({tasks:[{task:1,level:8,criteria:{}}]});
  });
  const { unmount } = open("/review/" + session.id);
  try {
    expect(screen.getByText("Transcript-based feedback")).toBeInTheDocument();
    await signIn();
    fireEvent.click(screen.getByRole("button",{name:"Get full Speaking grade"}));
    expect(await screen.findByRole("alert")).toHaveTextContent("12 seconds");
    expect(loadSessions()[0].speakingFeedback).toEqual(session.speakingFeedback);
    fireEvent.click(screen.getByRole("button",{name:"Get full Speaking grade"}));
    expect(await screen.findByText("Task 1 practice estimate · Level 8")).toBeInTheDocument();
    expect(loadSessions()[0].speakingFeedback?.kind).toBeUndefined();
  } finally {
    unmount();
    URL.createObjectURL = oldCreate;
    URL.revokeObjectURL = oldRevoke;
  }
});
