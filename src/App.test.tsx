import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "fs";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import { loadSessions } from "./practiceStorage";
import { speakingTimes, writingSeconds } from "./questions/pool";

jest.mock("use-sound", () => ({ __esModule: true, default: () => [jest.fn()] }));

function open(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </MemoryRouter>
  );
}

async function advance(seconds: number) {
  await act(async () => {
    jest.advanceTimersByTime(seconds * 1000);
  });
}

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(globalThis, "fetch").mockImplementation(async (request) => ({
    ok: true,
    text: async () => readFileSync("public" + String(request), "utf8"),
  }) as Response);
});
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test("opens the practice home and connects all four skills to practice", () => {
  open();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Practice for test day");
  expect(screen.getByRole("link", { name: "Start Writing mock" })).toHaveAttribute("href", "/mock/writing");
  expect(screen.getByRole("link", { name: "Start Speaking mock" })).toHaveAttribute("href", "/mock/speaking");
  for (const skill of ["Listening", "Reading"]) {
    expect(screen.getByRole("link", { name: "Official " + skill + " practice" }))
      .toHaveAttribute("href", "https://www.celpip.ca/free-practice-tests/");
  }
});

test("expires each Writing mock task once and keeps the responses attached to their prompts", async () => {
  jest.useFakeTimers();
  open("/mock/writing");
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  const toolbar = screen.getByRole("group", { name: "Mock test controls" });
  expect(within(toolbar).getByRole("timer")).toHaveTextContent("27:00");
  expect(within(toolbar).getByRole("button", { name: "Next task" })).toBeEnabled();
  expect(screen.queryByRole("navigation", { name: "Main navigation" })).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "My first response." } });

  await advance(writingSeconds[0]);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Responding to Survey Questions");
  expect(screen.getByRole("timer")).toHaveTextContent("26:00");
  expect(within(toolbar).getByRole("button", { name: "Finish section" })).toBeEnabled();
  expect(screen.getByRole("textbox", { name: "Your response" })).toHaveValue("");
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "My second response." } });

  await advance(writingSeconds[1]);
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Writing mock review");
  expect(screen.getByText("My first response.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Task 2" }));
  expect(screen.getByText("My second response.")).toBeInTheDocument();
  expect(loadSessions()[0].status).toBe("completed");
});

test("recovers a Writing draft with the same prompt and archives an interrupted mock", () => {
  jest.useFakeTimers();
  const draft = open("/writing/2?set=2");
  fireEvent.click(screen.getByRole("button", { name: "Show prompt and start" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "Draft for set two." } });
  draft.unmount();

  const recovered = open("/writing/2");
  expect(screen.getByRole("textbox", { name: "Your response" })).toHaveValue("Draft for set two.");
  expect(screen.getByText(/funding for one new community service/)).toBeInTheDocument();
  recovered.unmount();

  const mock = open("/mock/writing");
  fireEvent.click(screen.getByRole("button", { name: "Start mock" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your response" }), { target: { value: "Unfinished mock." } });
  mock.unmount();

  open("/review");
  const mockHistory = screen.getByRole("link", { name: /Writing mock/ });
  expect(within(mockHistory).getByText(/Interrupted/)).toBeInTheDocument();
  fireEvent.click(mockHistory);
  expect(screen.getByText("Unfinished mock.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Copy prompt and response" })).toBeInTheDocument();
});

test("flags misspellings, accepts regional variants and saves a chosen correction", async () => {
  const { container } = open("/writing/1");
  fireEvent.click(screen.getByRole("button", { name: "Show prompt and start" }));
  const editor = screen.getByRole("textbox", { name: "Your response" });
  fireEvent.change(editor, { target: { value: "I hope to recieve the color and organise the programme." } });
  fireEvent.click(screen.getByRole("button", { name: "Spell check" }));

  const suggestion = await screen.findByRole("button", { name: "receive" });
  expect(Array.from(container.querySelectorAll(".writing-underlines mark"), (mark) => mark.textContent)).toEqual(["recieve"]);
  fireEvent.click(suggestion);

  const corrected = "I hope to receive the color and organise the programme.";
  expect(editor).toHaveValue(corrected);
  expect(editor).toHaveFocus();
  expect(loadSessions()[0].responses[0].text).toBe(corrected);
  expect(container.querySelector(".writing-underlines mark")).not.toBeInTheDocument();
});

test("runs all eight Speaking mock tasks with a shared scene and two-stage comparison", async () => {
  jest.useFakeTimers();
  const stopTrack = jest.fn();
  const requestAudio = jest.fn().mockResolvedValue({ active: true, getTracks: () => [{ stop: stopTrack }] });
  const originalMedia = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: requestAudio } });
  const recordingStarts = jest.fn();
  const recordingStops = jest.fn();

  class FakeRecorder {
    state = "inactive";
    mimeType = "audio/webm";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    start() {
      recordingStarts();
      this.state = "recording";
    }
    stop() {
      recordingStops();
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["audio"]) });
      this.onstop?.();
    }
  }
  const originalRecorder = window.MediaRecorder;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  window.MediaRecorder = FakeRecorder as unknown as typeof MediaRecorder;
  URL.createObjectURL = jest.fn(() => "blob:practice");
  URL.revokeObjectURL = jest.fn();
  try {
    open("/mock/speaking");
    requestAudio.mockRejectedValueOnce(new DOMException("", "NotAllowedError"));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start mock" })));
    expect(screen.getByRole("alert")).toHaveTextContent("Microphone access was denied");
    expect(screen.queryByRole("timer")).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Start mock" })));

    let scene: string | null = null;
    for (let index = 0; index < speakingTimes.length; index++) {
      const times = speakingTimes[index];
      const task = index + 1;
      expect(screen.getByText("Task " + task + " of 8")).toBeInTheDocument();
      if (task === 3) scene = screen.getByRole("img").getAttribute("src");
      if (task === 4) expect(screen.getByRole("img")).toHaveAttribute("src", scene);
      if (times.selection) {
        expect(screen.getByRole("timer")).toHaveTextContent("01:00");
        expect(within(screen.getByRole("group", { name: "Mock test controls" })).getByRole("button", { name: "Next" })).toBeEnabled();
        expect(recordingStarts).toHaveBeenCalledTimes(4);
        fireEvent.click(screen.getByRole("radio", { name: /Cabin tent/ }));
        await advance(times.selection);
        expect(screen.getByText("Your option")).toBeInTheDocument();
        expect(screen.getByText("Cabin tent")).toBeInTheDocument();
        expect(screen.getByText("Rain tarp")).toBeInTheDocument();
      }

      await advance(times.preparation);
      expect(screen.getByRole("status")).toHaveTextContent("Recording");
      expect(within(screen.getByRole("region", { name: "Task timing" })).getByText("Recording").closest("li")).toHaveAttribute("aria-current", "step");
      if (task === 7) expect(screen.getByRole("timer")).toHaveTextContent("01:30");
      await advance(times.response);
    }

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Speaking mock review");
    expect(screen.getByRole("button", { name: "Download recording" })).toBeInTheDocument();
    expect(recordingStarts).toHaveBeenCalledTimes(8);
    expect(recordingStops).toHaveBeenCalledTimes(8);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(loadSessions()[0].responses).toHaveLength(8);
  } finally {
    cleanup();
    window.MediaRecorder = originalRecorder;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    if (originalMedia) Object.defineProperty(navigator, "mediaDevices", originalMedia);
    else Reflect.deleteProperty(navigator, "mediaDevices");
  }
});
