import SpeakingAiReview from "./components/SpeakingAiReview";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PromptView, { promptText } from "./components/PromptView";
import WordCount from "./components/WordCount";
import WritingAiReview from "./components/WritingAiReview";
import { audioKey, downloadResponse, getSessionPrompt, loadAudio, loadLegacyAudio, promptSetLabel, writingDraftUrl, type Response, type Session } from "./practiceStorage";
import { taskTitles, type Skill } from "./questions/pool";

const criteria = {
  writing: [
    ["Task fulfillment", "I answered every instruction and used a tone that fits the reader."],
    ["Content and coherence", "My main ideas have specific support and follow a clear order."],
    ["Vocabulary", "I used precise words and phrases that fit the situation."],
    ["Readability", "Paragraphs connect, and I checked clarity, grammar and punctuation."],
  ],
  speaking: [
    ["Task fulfillment", "I answered the whole prompt in a tone that fits the listener."],
    ["Content and coherence", "I organized my answer and supported my points with details."],
    ["Vocabulary", "I used specific language to describe, explain or compare."],
    ["Listenability", "My pace was natural, my words were clear, and I completed my last thought."],
  ],
};

const scoreChart = "https://www.celpip.ca/score-comparison-chart/";

function recordingExtension(type: string) {
  if (type.startsWith("audio/mp4")) return "m4a";
  if (type.startsWith("audio/ogg")) return "ogg";
  if (type.startsWith("audio/wav")) return "wav";
  return "webm";
}

function Recording({ recordingKey, getMemoryAudio, fileName }: {
  recordingKey: string;
  getMemoryAudio: (key: string) => Blob | undefined;
  fileName: string;
}) {
  const [recording, setRecording] = useState<{ blob: Blob; url: string } | null>();
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    const show = (blob: Blob | undefined) => {
      if (!active) return;
      if (blob) {
        url = URL.createObjectURL(blob);
        setRecording({ blob, url });
      } else {
        setRecording(null);
      }
    };
    const cached = getMemoryAudio(recordingKey);
    if (cached) show(cached);
    else loadAudio(recordingKey).then(show, () => show(undefined));
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [getMemoryAudio, recordingKey]);

  if (recording === undefined) return <p role="status">Loading recording…</p>;
  if (!recording) return <p role="status">This recording is unavailable in this browser.</p>;
  return (
    <>
      <audio aria-label="Your recording" controls src={recording.url} />
      <button type="button" className="button secondary" onClick={() =>
        downloadResponse(recording.blob, fileName + "." + recordingExtension(recording.blob.type))
      }>Download recording</button>
    </>
  );
}

function CheckList({ skill, response, save }: {
  skill: Skill;
  response: Response;
  save: (changes: Partial<Response>) => void;
}) {
  const checks = response.checks ?? [];
  return (
    <section className="card review-checklist">
      <h2>Self-review checklist</h2>
      <p className="muted">Use these criteria to review your practice response.</p>
      {criteria[skill].map(([label, description], index) => (
        <label key={label} className="check">
          <input type="checkbox" checked={checks.includes(index)} onChange={(event) =>
            save({ checks: event.target.checked ? [...checks, index] : checks.filter((check) => check !== index) })
          } />
          <span><strong>{label}</strong>{description}</span>
        </label>
      ))}
      <label className="review-note">One change for next time
        <textarea rows={2} value={response.note ?? ""} onChange={(event) => save({ note: event.target.value })} />
      </label>
      <a className="text-link" href={scoreChart} target="_blank" rel="noreferrer">Compare official Level 9 and 10 examples ↗</a>
    </section>
  );
}

function ReviewResponse({ session, response, getMemoryAudio }: {
  session: Session;
  response: Response;
  getMemoryAudio: (key: string) => Blob | undefined;
}) {
  const { skill, set } = session;
  const { task, text } = response;
  const prompt = getSessionPrompt(session, task);
  const title = taskTitles[skill][task - 1];
  const fileName = "celpip-" + skill + "-task-" + task + (session.writingPrompts || session.speakingPrompts ? "-ai" : "-set-" + set);
  const [copyStatus, setCopyStatus] = useState("");
  const shareText = ["CELPIP practice · " + title, prompt ? promptText(prompt) : "Saved prompt unavailable", "My response\n" + text].join("\n\n");

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyStatus("Prompt and response copied.");
    } catch {
      setCopyStatus("Clipboard unavailable. Use Download text to save your response.");
    }
  }

  return (
    <div className="review-grid">
      <section className="card">
        <h2>{title}</h2>
        {prompt ? <PromptView prompt={prompt} choice={response.choice} selecting={Boolean(prompt.comparison && response.choice === undefined)} />
          : <p className="muted">The saved prompt is unavailable.</p>}
      </section>
      <section className="card review-answer">
        <h2>{response.finished ? "Your response" : "Unfinished response"}</h2>
        {skill === "writing" && text && (
          <>
            <p className="written-answer">{text}</p>
            <WordCount text={text} />
            <div className="actions">
              <button type="button" className="button primary" onClick={copy}>Copy prompt and response</button>
              <button type="button" className="button secondary" onClick={() =>
                downloadResponse(new Blob([shareText], { type: "text/plain" }), fileName + ".txt")
              }>Download text</button>
            </div>
            <p className="copy-status" role="status">{copyStatus}</p>
          </>
        )}
        {skill === "speaking" && response.hasAudio && <Recording
          recordingKey={audioKey(session.id, task)} getMemoryAudio={getMemoryAudio} fileName={fileName}
        />}
        {skill === "writing" && !text && <p className="muted">This task has no saved text.</p>}
        {skill === "speaking" && !response.hasAudio && <p className="muted">This task has no saved recording.</p>}
      </section>
    </div>
  );
}

function sessionName(session: Session) {
  const skill = session.skill === "writing" ? "Writing" : "Speaking";
  return session.mode === "mock" ? skill + " mock" : skill + " Task " + session.responses[0]?.task;
}

function sessionDate(session: Session) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(session.createdAt);
}

export function History({ sessions }: { sessions: Session[] }) {
  const legacy = taskTitles.speaking.flatMap((title, index) => {
    const source = loadLegacyAudio(index + 1);
    return source ? [{ title, task: index + 1, source }] : [];
  });
  return (
    <main className="page" id="main">
      <Link className="back-link" to="/">← Practice home</Link>
      <h1>Review attempts</h1>
      <p className="lede">Read your responses, replay your recordings and track what to work on next.</p>
      <section className="card history">
        <h2>Practice history</h2>
        {!sessions.length && <p className="muted">Your attempts will appear here after you start a practice task.</p>}
        {sessions.map((session) => (
          <Link
            className="history-row"
            key={session.id}
            to={session.status === "active" ? writingDraftUrl(session) : "/review/" + session.id}
          >
            <div><strong>{sessionName(session)}</strong><span>{sessionDate(session)} · {promptSetLabel(session)}</span></div>
            <span className={"history-status " + session.status}>{session.status === "active" ? "Resume draft" : session.status === "interrupted" ? "Interrupted" : "Review"} <span aria-hidden="true">→</span></span>
          </Link>
        ))}
      </section>
      {legacy.length > 0 && (
        <section className="card history">
          <h2>Earlier recordings</h2>
          {legacy.map(({ title, task, source }) => (
            <div className="legacy-row" key={task}>
              <strong>Task {task} · {title}</strong>
              <audio aria-label={"Earlier recording for Task " + task} controls preload="none" src={source} />
              <a className="text-link" href={source} download={"celpip-earlier-task-" + task + "." + recordingExtension(source.split(";")[0].slice(5))}>Download recording</a>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}

export default function Review({ session, update, getMemoryAudio }: {
  session: Session;
  update: (change: (current: Session) => Session) => void;
  getMemoryAudio: (key: string) => Blob | undefined;
}) {
  const [selected, setSelected] = useState(session.responses[0]?.task);
  const response = session.responses.find((item) => item.task === selected);
  const { skill, set, writingPrompts } = session;
  const taskUrl = "/" + skill + "/" + selected;
  return (
    <main className="page" id="main">
      <Link className="back-link" to="/review">← All attempts</Link>
      <h1>{sessionName(session)} review</h1>
      <p className="lede">{promptSetLabel(session)} · {sessionDate(session)}{session.status === "interrupted" ? " · Interrupted" : ""}</p>
      {session.responses.length > 1 && (
        <div className="task-nav" role="group" aria-label="Responses">
          {session.responses.map(({ task }) => (
            <button type="button" key={task} aria-pressed={selected === task} onClick={() => setSelected(task)}>Task {task}</button>
          ))}
        </div>
      )}
      {response && (
        <>
          <ReviewResponse key={response.task} session={session} response={response} getMemoryAudio={getMemoryAudio} />
          {skill === "writing" && (
            <WritingAiReview session={session} selected={response.task} save={(feedback) => update((current) =>
              current.writingFeedback ? current : { ...current, writingFeedback: feedback }
            )} />
          )}
          {skill === "speaking" && <SpeakingAiReview session={session} selected={selected} getMemoryAudio={getMemoryAudio} save={speakingFeedback => update(current => ({...current, speakingFeedback}))}/>}
          {skill === "speaking" && selected === 3 && <Link className="button secondary" to={"/speaking/4?" + (session.speakingPrompts ? "source=ai&scene=" + encodeURIComponent(session.id) : "set=" + set)}>Practice Task 4 with this picture</Link>}
          <CheckList skill={skill} response={response} save={(changes) => update((current) => ({
            ...current,
            responses: current.responses.map((item) => item.task === response.task ? { ...item, ...changes } : item),
          }))} />
          <div className="actions">
            <Link className="button secondary" to={taskUrl + "?set=" + set}>Practice this task</Link>
            <Link className="button secondary" to={taskUrl + (writingPrompts || session.speakingPrompts ? "?source=ai" : "?set=" + (set === 1 ? 2 : 1))}>
              {writingPrompts || session.speakingPrompts ? "Generate another prompt" : "Try the other prompt"}
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
