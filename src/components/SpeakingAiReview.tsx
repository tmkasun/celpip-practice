import { useState } from "react";
import { audioKey, getSessionPrompt, loadAudio, type Session } from "../practiceStorage";
import { speakingRequest, type SpeakingFeedback } from "../speakingAi";
import { useWritingAi, WritingAiControls } from "./WritingAiAccess";

export default function SpeakingAiReview({
  session,
  selected,
  getMemoryAudio,
  save,
}: {
  session: Session;
  selected: number;
  getMemoryAudio: (key: string) => Blob | undefined;
  save: (feedback: SpeakingFeedback) => void;
}) {
  const ai = useWritingAi();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const feedback = session.speakingFeedback;
  const partial = feedback?.kind === "transcript";
  const row = feedback?.tasks.find((r) => r.task === selected);
  async function grade() {
    if (!ai.user || pending) return;
    setPending(true);
    setError("");
    try {
      const body = new FormData();
      const answers = [];
      for (const { task, finished, hasAudio, choice } of session.responses) {
        if (!finished || !hasAudio) continue;
        const key = audioKey(session.id, task);
        const audio = getMemoryAudio(key) ?? (await loadAudio(key).catch(() => undefined));
        const prompt = getSessionPrompt(session, task);
        if (!audio?.size || !prompt) continue;
        body.append(String(task), audio, "recording");
        answers.push({ task, prompt, choice });
      }
      if (!answers.length) throw new Error("No saved recordings are available for feedback.");
      body.append("answers", JSON.stringify(answers));
      save(
        await speakingRequest<SpeakingFeedback>(
          ai.user,
          partial ? "feedback?fullOnly=true" : "feedback",
          body,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get feedback.");
    } finally {
      setPending(false);
    }
  }
  if (!feedback && (!ai.speakingAvailable || !session.responses.some((r) => r.hasAudio))) return null;
  return (
    <section className="card ai-review">
      <h2>AI Speaking feedback</h2>
      {feedback ? (
        <>
          {partial && (
            <p>
              <strong>Transcript-based feedback</strong> · Request a full grade for listenability and practice
              levels.
            </p>
          )}
          {feedback.overallLevel !== undefined && (
            <p className="ai-level">Overall Speaking practice estimate · Level {feedback.overallLevel}</p>
          )}
          {row && (row.level != null || (partial && row.criteria)) ? (
            <>
              {row.level != null && (
                <p className="ai-level">
                  Task {selected} practice estimate · Level {row.level}
                </p>
              )}
              <dl className="ai-criteria">
                {Object.entries(row.criteria ?? {}).map(([label, detail]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>
                      {detail.observation}
                      <p>
                        <strong>Try this</strong> {detail.revision}
                      </p>
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : (
            <p>
              {row
                ? "There was too little clear speech to estimate a level."
                : "No recording was available for this task."}
            </p>
          )}
        </>
      ) : null}
      {(!feedback || (partial && ai.speakingAvailable)) && (
        <>
          <WritingAiControls disabled={pending} />
          <button className="button primary" disabled={!ai.user || pending} onClick={grade}>
            {pending ? "Grading recordings…" : partial ? "Get full Speaking grade" : "Get AI feedback"}
          </button>
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
