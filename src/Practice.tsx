import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useSound from "use-sound";
import NoisePlayer from "./components/NoisePlayer";
import PromptView from "./components/PromptView";
import { useWritingAi, WritingAiControls } from "./components/WritingAiAccess";
import WritingEditor from "./components/WritingEditor";
import useCountdown, { formatTime } from "./hooks/useCountdown";
import useMic from "./hooks/useMic";
import { audioKey, getSessionPrompt, type Response, type Session } from "./practiceStorage";
import { speakingTimes, taskTitles, writingSeconds, type SetId, type Skill } from "./questions/pool";
import { WritingAiError, type PromptSnapshot, type WritingTask } from "./writingAi";
import ding from "./sounds/ding.mp3";
import end from "./sounds/end.mp3";
import "./Mock.css";

type PhaseName = "ready" | "select" | "prepare" | "record" | "write" | "saving";

interface Phase {
  name: PhaseName;
  task: number;
  deadline?: number;
}

interface PracticeProps {
  skill: Skill;
  mode: Session["mode"];
  firstTask: number;
  initialSet: SetId;
  initialAi: boolean;
  draft?: Session;
  save: (session: Session) => void;
  keepAudio: (key: string, blob: Blob) => void;
}

const phaseLabels: Record<PhaseName, string> = {
  ready: "Ready",
  select: "Choose an option",
  prepare: "Prepare to speak",
  record: "Recording",
  write: "Time remaining",
  saving: "Finishing response",
};

function createId() {
  return window.crypto?.randomUUID?.() ?? Date.now() + "-" + Math.random().toString(36).slice(2);
}

function updateResponse(session: Session, task: number, changes: Partial<Response>): Session {
  return {
    ...session,
    responses: session.responses.map((response) =>
      response.task === task ? { ...response, ...changes } : response
    ),
  };
}

function getMicMessage(error: unknown) {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow microphone access in your browser, then try again.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No microphone was found. Connect a microphone and try again.";
  }
  return "The microphone could not be started. Check your microphone and use HTTPS or localhost, then try again.";
}

function SpeakingSchedule({ task, phase }: { task: number; phase: PhaseName }) {
  const { selection, preparation, response } = speakingTimes[task - 1];
  const steps = [
    ...(selection ? [{ phase: "select", title: "Choose an option", duration: selection }] : []),
    { phase: "prepare", title: "Preparation", duration: preparation },
    { phase: "record", title: "Recording", duration: response },
  ];
  return (
    <section className="mock-schedule" aria-labelledby="speaking-schedule">
      <h2 id="speaking-schedule">Task timing</h2>
      <ol>
        {steps.map((step) => (
          <li key={step.phase} aria-current={step.phase === phase ? "step" : undefined}>
            <span>{step.title}</span><span>{formatTime(step.duration)}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default function Practice({ skill, mode, firstTask, initialSet, initialAi, draft, save, keepAudio }: PracticeProps) {
  const navigate = useNavigate();
  const ai = useWritingAi();
  const titles = taskTitles[skill];
  const [set, setSet] = useState<SetId>(draft?.set ?? initialSet);
  const [selectAi, setSelectAi] = useState(initialAi);
  const useAi = skill === "writing" && selectAi;
  const [session, setSession] = useState(draft);
  const [phase, showPhase] = useState<Phase>(
    draft ? { name: "write", task: firstTask, deadline: draft.deadline } : { name: "ready", task: firstTask }
  );
  const active = useRef(session);
  const livePhase = useRef(phase);
  const mounted = useRef(false);
  const requestPending = useRef(false);
  const generation = useRef<AbortController>();
  const heading = useRef<HTMLHeadingElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const [pending, setPending] = useState(false);
  const [micMessage, setMicMessage] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [customPrep, setCustomPrep] = useState(speakingTimes[firstTask - 1]?.preparation ?? 30);
  const [customResponse, setCustomResponse] = useState(speakingTimes[firstTask - 1]?.response ?? 60);
  const mic = useMic();
  const [playDing] = useSound(ding);
  const [playEnd] = useSound(end);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current?.abort();
      const current = active.current;
      if (current?.status === "active" && (mode === "mock" || skill === "speaking")) {
        const interrupted: Session = { ...current, status: "interrupted", deadline: undefined };
        active.current = interrupted;
        save(interrupted);
      }
    };
  }, [mode, save, skill]);

  const focusTarget = phase.name === "write" ? "editor" : phase.name === "ready" || phase.name === "select" ? phase.name : "heading";
  useEffect(() => {
    if (mode === "mock" && window.scrollY > 0) window.scrollTo(0, 0);
  }, [mode, phase.task]);

  useEffect(() => {
    if (focusTarget === "editor") editor.current?.focus({ preventScroll: true });
    else heading.current?.focus();
  }, [phase.task, focusTarget]);

  const prompt = session && getSessionPrompt(session, phase.task);
  const response = session?.responses.find((item) => item.task === phase.task);

  function publish(next: Session) {
    active.current = next;
    if (mounted.current) setSession(next);
    save(next);
  }

  function switchPhase(next: Phase) {
    livePhase.current = next;
    showPhase(next);
  }

  function timedPhase(name: PhaseName, task: number, seconds: number) {
    return { name, task, deadline: Date.now() + seconds * 1000 };
  }

  function beginTask(task: number, current: Session) {
    const times = speakingTimes[task - 1];
    const next = skill === "writing"
      ? timedPhase("write", task, writingSeconds[task - 1])
      : times.selection
        ? timedPhase("select", task, times.selection)
        : timedPhase("prepare", task, mode === "mock" ? times.preparation : customPrep);
    const entry: Response = skill === "writing" ? { task, text: "" } : { task };
    publish({ ...current, deadline: next.deadline, responses: [...current.responses, entry] });
    switchPhase(next);
  }

  function choosePromptSet(choice: SetId | "ai") {
    setSelectAi(choice === "ai");
    if (choice !== "ai") setSet(choice);
    setAiMessage("");
  }

  async function startSession() {
    if (requestPending.current || livePhase.current.name !== "ready") return;
    let writingPrompts: PromptSnapshot[] | undefined;
    if (useAi) {
      if (!ai.available || !ai.eligible) return;
      const controller = new AbortController();
      generation.current = controller;
      requestPending.current = true;
      setPending(true);
      setAiMessage("");
      try {
        writingPrompts = await ai.generate(mode === "mock" ? [1, 2] : [firstTask as WritingTask], controller.signal);
        if (controller.signal.aborted) return;
      } catch (error) {
        if (mounted.current && !controller.signal.aborted) {
          setAiMessage(error instanceof WritingAiError ? error.message : "Couldn’t generate a prompt. Try again or choose a built-in set.");
        }
        return;
      } finally {
        generation.current = undefined;
        requestPending.current = false;
        if (mounted.current) setPending(false);
      }
    }
    if (skill === "speaking") {
      requestPending.current = true;
      setPending(true);
      setMicMessage("");
      try {
        if (!(await mic.connect()) || !mounted.current) return;
      } catch (error) {
        if (mounted.current) setMicMessage(getMicMessage(error));
        return;
      } finally {
        requestPending.current = false;
        if (mounted.current) setPending(false);
      }
    }
    beginTask(firstTask, {
      id: createId(),
      skill,
      set,
      mode,
      status: "active",
      createdAt: Date.now(),
      responses: [],
      writingPrompts,
    });
  }

  function chooseOption(choice: number) {
    const current = active.current;
    if (livePhase.current.name === "select" && current) {
      publish(updateResponse(current, phase.task, { choice }));
    }
  }

  function startPreparation() {
    const current = active.current;
    const { name, task } = livePhase.current;
    if (name !== "select" || !current) return;
    const selected = current.responses.find((item) => item.task === task)?.choice ?? 0;
    publish(updateResponse(current, task, { choice: selected }));
    const seconds = mode === "mock" ? speakingTimes[task - 1].preparation : customPrep;
    switchPhase(timedPhase("prepare", task, seconds));
  }

  function startRecording() {
    const { name, task } = livePhase.current;
    if (name !== "prepare") return;
    if (!mic.start()) {
      const current = active.current;
      if (!current) return;
      publish({ ...current, status: "interrupted", deadline: undefined });
      mic.release();
      navigate("/review/" + current.id);
      return;
    }
    playDing();
    const seconds = mode === "mock" ? speakingTimes[task - 1].response : customResponse;
    switchPhase(timedPhase("record", task, seconds));
  }

  async function finishTask() {
    const { name, task } = livePhase.current;
    const current = active.current;
    if (!current || (name !== "write" && name !== "record")) return;
    switchPhase({ name: "saving", task });
    const audio = name === "record" ? await mic.stop() : null;
    if (audio) keepAudio(audioKey(current.id, task), audio);
    const latest = active.current ?? current;
    const finished = updateResponse(latest, task, { finished: true, hasAudio: Boolean(audio) });
    if (!mounted.current) {
      publish(finished);
      return;
    }

    if (mode === "mock" && task < titles.length) {
      if (name === "record" && !audio) setMicMessage("The previous response could not be recorded. Check the microphone and continue.");
      beginTask(task + 1, finished);
    } else {
      mic.release();
      playEnd();
      publish({ ...finished, status: "completed", deadline: undefined });
      navigate("/review/" + current.id, { replace: true });
    }
  }

  const remaining = useCountdown(phase.deadline, () => {
    switch (livePhase.current.name) {
      case "select": startPreparation(); break;
      case "prepare": startRecording(); break;
      case "record":
      case "write": void finishTask(); break;
    }
  });

  function changeWriting(text: string) {
    const current = active.current;
    const { name, task, deadline } = livePhase.current;
    if (name === "write" && current && deadline !== undefined && Date.now() < deadline) {
      publish(updateResponse(current, task, { text }));
    }
  }

  function exitMock() {
    const current = active.current;
    if (!current || livePhase.current.name === "saving") return;
    publish({ ...current, status: "interrupted", deadline: undefined });
    mic.release();
    navigate("/review/" + current.id);
  }

  const ready = phase.name === "ready";
  const clock = phase.deadline !== undefined;
  const lastTask = phase.task === titles.length;
  const isMock = mode === "mock";
  const sectionName = skill === "writing" ? "Writing" : "Speaking";
  const generated = Boolean(session?.writingPrompts);
  const promptLabel = generated || (ready && useAi) ? "AI-generated prompts" : "Prompt set " + set;
  const title = isMock && ready ? sectionName + " mock" : titles[phase.task - 1];
  const taskProgress = "Task " + phase.task + " of " + titles.length;
  const timer = (
    <div className={(isMock ? "mock-clock" : "timer-bar") + (phase.name === "record" ? " recording" : "")}>
      <span role="status">{phaseLabels[phase.name]}</span>
      {clock && <time role="timer" aria-label="Time remaining">{formatTime(remaining)}</time>}
    </div>
  );
  const validTiming = [customPrep, customResponse].every(Number.isInteger) &&
    customPrep >= 1 && customPrep <= 300 && customResponse >= 1 && customResponse <= 300;

  return (
    <main className={isMock ? "mock-page" : "page practice-page"} id="main">
      {isMock ? (
        <header className="mock-toolbar" role="group" aria-label="Mock test controls">
          <div className="mock-width mock-toolbar-inner">
            <div className="mock-title">
              <p>
                {ready ? "CELPIP Practice" : sectionName + " mock"}
                {!ready && <><span aria-hidden="true">/</span><span>{taskProgress}</span></>}
              </p>
              <h1 ref={heading} tabIndex={-1}>{title}</h1>
            </div>
            {!ready && (
              <div className="mock-toolbar-controls">
                {timer}
                {phase.name === "select" && (
                  <button type="button" className="button mock-next" onClick={startPreparation}>Next <span aria-hidden="true">→</span></button>
                )}
                {phase.name === "write" && (
                  <button type="button" className="button mock-next" onClick={finishTask}>
                    {lastTask ? "Finish section" : "Next task"}<span aria-hidden="true"> →</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>
      ) : (
        <>
          <div className="page-top">
            <Link className="back-link" to="/">← Practice home</Link>
            <span className="eyebrow">{skill} / Task drill</span>
          </div>
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          <div className="practice-meta"><span>{taskProgress}</span><span>{promptLabel}</span></div>
          <nav className="task-nav" aria-label={skill + " tasks"}>
            {titles.map((taskTitle, index) => (
              <Link key={taskTitle} aria-label={"Task " + (index + 1) + " · " + taskTitle} aria-current={phase.task === index + 1 ? "page" : undefined} to={"/" + skill + "/" + (index + 1) + (generated || useAi ? "" : "?set=" + set)}>{index + 1}</Link>
            ))}
          </nav>
        </>
      )}

      <div className={isMock ? "mock-width mock-content" : undefined}>
        {isMock && ready && <Link className="back-link" to="/">← Practice home</Link>}
        {micMessage && <p className="notice" role="alert">{micMessage}</p>}
        {ready ? (
          <section className="card setup" aria-labelledby="practice-setup">
            <h2 id="practice-setup">{isMock ? "Set up your mock" : "Set up your practice"}</h2>
            {isMock && <p className="mock-duration">{skill === "writing" ? "2 tasks · 53 minutes" : "8 tasks · about 15 minutes"}</p>}
            <p>
              {isMock ? "Complete the tasks in order. Review opens at the end of the section." :
                "The prompt appears when you start the timer. Review your response when you finish."}
            </p>
            <div className="setup-fields">
              {skill === "writing" ? (
                <fieldset className="prompt-choices" disabled={pending}>
                  <legend>Prompt set</legend>
                  <div className="actions">
                    {([1, 2, "ai"] as const).map((choice) => {
                      const selected = choice === (useAi ? "ai" : set);
                      return (
                        <button key={choice} type="button" className={"button " + (selected ? "primary" : "secondary")}
                          aria-pressed={selected} onClick={() => choosePromptSet(choice)}>
                          {choice === "ai" ? "AI-generated" : "Set " + choice}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ) : (
                <label>Prompt set<select value={set} onChange={(event) => setSet(Number(event.target.value) as SetId)} disabled={pending}>
                  <option value={1}>Set 1</option><option value={2}>Set 2</option>
                </select></label>
              )}
              {skill === "speaking" && mode === "drill" && (
                <>
                  <label>Preparation (sec)<input type="number" value={Number.isNaN(customPrep) ? "" : customPrep} min={1} max={300} onChange={(event) => setCustomPrep(event.target.valueAsNumber)} disabled={pending} /></label>
                  <label>Speaking (sec)<input type="number" value={Number.isNaN(customResponse) ? "" : customResponse} min={1} max={300} onChange={(event) => setCustomResponse(event.target.valueAsNumber)} disabled={pending} /></label>
                </>
              )}
            </div>
            {useAi && (ai.available ? <WritingAiControls disabled={pending} /> : (
              <p className="muted" role="status">{ai.checking ? "Checking AI availability…" : "AI-generated prompts are unavailable here. Choose a built-in set to continue."}</p>
            ))}
            {aiMessage && <p className="notice" role="alert">{aiMessage} You can also choose a built-in set.</p>}
            {mode === "drill" && skill === "speaking" && firstTask === 5 && <p className="muted">The option selection has its own 60-second timer.</p>}
            {skill === "speaking" && <p className="muted">Have your microphone ready. The app checks access before starting the timer.</p>}
            <button type="button" className="button primary" onClick={startSession} disabled={pending || (useAi && (!ai.available || !ai.ready || !ai.eligible)) || (mode === "drill" && skill === "speaking" && !validTiming)}>
              {pending ? useAi ? "Generating prompts…" : "Checking microphone…" : mode === "mock" ? "Start mock" : "Show prompt and start"}
            </button>
          </section>
        ) : (
          <>
            {!isMock && timer}
            <div className={isMock ? "mock-workspace mock-" + skill : skill === "writing" ? "practice-grid" : undefined}>
              <section className="card prompt">
                <h2>{phase.name === "select" ? "Part 1 · Select an option" : phase.task === 5 ? "Part 2 · Make your case" : "Prompt"}</h2>
                {prompt ? <PromptView prompt={prompt} choice={response?.choice} selecting={phase.name === "select"} onChoose={chooseOption} />
                  : <p className="muted">The saved prompt is unavailable.</p>}
              </section>
              {skill === "writing" && (
                <WritingEditor key={phase.task} editor={editor} text={response?.text ?? ""} readOnly={phase.name !== "write"} onChange={changeWriting} />
              )}
              {isMock && skill === "speaking" && <SpeakingSchedule task={phase.task} phase={phase.name} />}
            </div>
            {isMock ? (
              <div className="mock-session-footer">
                <span>{promptLabel}</span>
                <button type="button" className="button secondary" onClick={exitMock} disabled={phase.name === "saving"}>End mock</button>
              </div>
            ) : (
              <div className="actions practice-actions">
                {phase.name === "select" && <button type="button" className="button primary" onClick={startPreparation}>Continue to comparison</button>}
                {phase.name === "write" && <button type="button" className="button primary" onClick={finishTask}>Finish writing</button>}
                {phase.name === "record" && <button type="button" className="button primary" onClick={finishTask}>Finish recording</button>}
              </div>
            )}
          </>
        )}
        {!isMock && <NoisePlayer />}
      </div>
    </main>
  );
}
