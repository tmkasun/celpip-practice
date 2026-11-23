import type { ComponentProps } from "react";
import type { Prompt } from "../questions/pool";
import WritingEditor from "./WritingEditor";

interface WritingWorkspaceProps extends ComponentProps<typeof WritingEditor> {
  prompt?: Prompt;
  loading: boolean;
}

export default function WritingWorkspace({ prompt, loading, ...editorProps }: WritingWorkspaceProps) {
  return (
    <div className="writing-task" aria-busy={loading}>
      <section className="writing-task-context" aria-labelledby="writing-task-context">
        <h2 className="writing-task-instruction" id="writing-task-context">
          Scenario
        </h2>
        {loading ? (
          <div className="mock-skeleton-lines" aria-hidden="true">
            <div className="mock-skeleton" />
            <div className="mock-skeleton" />
            <div className="mock-skeleton" />
          </div>
        ) : (
          <p>{prompt?.context ?? "The saved prompt is unavailable."}</p>
        )}
      </section>
      <div className="writing-task-answer">
        {loading ? (
          <div className="writing-task-loading" aria-hidden="true">
            <div className="mock-skeleton-lines">
              <div className="mock-skeleton" />
              <div className="mock-skeleton" />
              <div className="mock-skeleton" />
            </div>
            <div className="mock-skeleton mock-skeleton-editor" />
            <div className="mock-skeleton mock-skeleton-count" />
          </div>
        ) : (
          <>
            {prompt && (
              <section aria-labelledby="writing-task-instructions" className="writing-task-directions">
                <h2 className="writing-task-instruction" id="writing-task-instructions">
                  {prompt.instruction}
                </h2>
                {prompt.points && <ul>{prompt.points.map((point) => <li key={point}>{point}</li>)}</ul>}
              </section>
            )}
            <WritingEditor {...editorProps} />
          </>
        )}
      </div>
    </div>
  );
}
