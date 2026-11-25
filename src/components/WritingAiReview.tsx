import { useRef, useState } from "react";
import { getSessionPrompt, type Session } from "../practiceStorage";
import { writingCriteria, WritingAiError, type WritingFeedback, type WritingSubmission } from "../writingAi";
import { useWritingAi, WritingAiControls } from "./WritingAiAccess";

export default function WritingAiReview({ session, selected, save }: {
  session: Session;
  selected: number;
  save: (feedback: WritingFeedback) => void;
}) {
  const ai = useWritingAi();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const requesting = useRef(false);
  const feedback = session.writingFeedback;

  if (feedback) {
    const task = feedback.tasks.find((item) => item.task === selected);
    return (
      <section className="card ai-review" aria-labelledby="ai-review">
        <h2 id="ai-review">AI practice estimates</h2>
        {feedback.overallLevel !== undefined && <p className="ai-level">Overall Writing estimate · Level {feedback.overallLevel}</p>}
        {task ? (
          <>
            <p className="ai-level">Task {task.task} estimate · Level {task.level}</p>
            <dl className="ai-criteria">
              {(Object.keys(writingCriteria) as Array<keyof typeof writingCriteria>).map((key) => {
                const criterion = task.criteria[key];
                return (
                  <div key={key}>
                    <dt>{writingCriteria[key]}</dt>
                    <dd>
                      <p>{criterion.observation}</p>
                      {criterion.excerpt && <blockquote>{criterion.excerpt}</blockquote>}
                      <p><strong>Try this</strong> {criterion.revision}</p>
                    </dd>
                  </div>
                );
              })}
            </dl>
          </>
        ) : <p className="muted">This task had no finished response to grade.</p>}
      </section>
    );
  }

  const answers = session.responses.flatMap(({ task, finished, text }): WritingSubmission[] => {
    if (!finished || !text?.trim() || (task !== 1 && task !== 2)) return [];
    const prompt = getSessionPrompt(session, task);
    if (!prompt?.points) return [];
    return [{ task, text, prompt: { context: prompt.context, instruction: prompt.instruction, points: prompt.points } }];
  });
  if (!ai.available || !answers.length) return null;

  async function requestFeedback() {
    if (requesting.current) return;
    requesting.current = true;
    setPending(true);
    setError("");
    try {
      save(await ai.grade(answers));
    } catch (cause) {
      setError(cause instanceof WritingAiError ? cause.message : "Couldn’t get AI feedback. Try again.");
    } finally {
      requesting.current = false;
      setPending(false);
    }
  }

  const taskList = answers.map(({ task }) => task).join(" and ");
  return (
    <section className="card ai-review" aria-labelledby="ai-review">
      <h2 id="ai-review">AI Writing feedback</h2>
      <p className="muted">
        {answers.length > 1 ? "Tasks " : "Task "}{taskList} will be sent to Google with the prompts when you request feedback. Cloudflare may process the same answers if Gemini reaches its quota.
      </p>
      <WritingAiControls disabled={pending} />
      <button type="button" className="button primary" onClick={requestFeedback} disabled={pending || !ai.user}>
        {pending ? "Getting AI feedback…" : "Get AI feedback"}
      </button>
      {pending && <p className="muted" role="status">AI is reviewing your Writing response{answers.length > 1 ? "s" : ""}.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </section>
  );
}
