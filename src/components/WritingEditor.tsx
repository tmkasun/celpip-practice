import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from "react";
import type { SpellingChecker } from "../writingSpelling";
import WordCount from "./WordCount";

interface WritingEditorProps {
  editor: RefObject<HTMLTextAreaElement>;
  text: string;
  readOnly: boolean;
  exam?: boolean;
  onChange: (text: string) => void;
}

export default function WritingEditor({ editor, text, readOnly, onChange, exam = false }: WritingEditorProps) {
  const [checker, setChecker] = useState<SpellingChecker | null>();
  const [reviewStart, setReviewStart] = useState<number | null>(null);
  const underlines = useRef<HTMLDivElement>(null);
  const review = useRef<HTMLDivElement>(null);
  const focusReview = useRef(false);

  useEffect(() => {
    if (exam) return;
    let active = true;
    import("../writingSpelling").then(({ loadSpellingChecker }) => loadSpellingChecker()).then(
      (loaded) => { if (active) setChecker(loaded); },
      () => { if (active) setChecker(null); },
    );
    return () => { active = false; };
  }, [exam]);

  const issues = useMemo(() => (!exam && checker ? checker.find(text) : []), [checker, exam, text]);
  const reviewing = !exam && !readOnly && reviewStart !== null;
  const index = issues.findIndex(({ start }) => start >= (reviewStart ?? 0));
  const issueIndex = index === -1 ? issues.length - 1 : index;
  const issue = reviewing ? issues[issueIndex] : undefined;
  const suggestions = useMemo(() => issue && checker?.suggest(issue.word), [checker, issue]);

  function syncScroll() {
    if (underlines.current && editor.current) underlines.current.scrollTop = editor.current.scrollTop;
  }

  useLayoutEffect(() => {
    if (underlines.current && editor.current) underlines.current.scrollTop = editor.current.scrollTop;
  }, [editor, text, checker]);

  useLayoutEffect(() => {
    if (focusReview.current && review.current) {
      review.current.focus();
      focusReview.current = false;
    }
  }, [reviewStart]);

  function showSuggestions(event: MouseEvent<HTMLTextAreaElement>) {
    if (readOnly || !underlines.current) return;
    const marks = Array.from(underlines.current.querySelectorAll("mark"));
    const hit = marks.findIndex((mark) => Array.from(mark.getClientRects()).some((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom
    ));
    if (hit === -1) return;
    event.preventDefault();
    if (review.current) review.current.focus();
    else focusReview.current = true;
    setReviewStart(issues[hit].start);
  }

  function closeReview() {
    setReviewStart(null);
    editor.current?.focus();
  }

  function applySuggestion(suggestion: string) {
    const input = editor.current;
    if (readOnly || !issue || !input) return;
    const { start, word } = issue;
    const end = start + word.length;
    closeReview();
    input.setSelectionRange(start, end);
    // Inserting through the browser keeps the replacement in the textarea's undo history.
    if (!document.execCommand?.("insertText", false, suggestion)) {
      input.setRangeText(suggestion, start, end, "end");
      onChange(input.value);
    }
  }

  let previousEnd = 0;
  return (
    <section className="card response">
      <h2 className={exam ? "sr-only" : undefined}><label htmlFor="writing-response">Your response</label></h2>
      <div className="writing-editor">
        <textarea
          id="writing-response"
          ref={editor}
          lang="en-CA"
          spellCheck={!exam && !checker}
          autoCorrect="off"
          autoCapitalize="off"
          placeholder={exam ? "Enter your response here." : undefined}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          onContextMenu={exam ? undefined : showSuggestions}
          onScroll={exam ? undefined : syncScroll}
          readOnly={readOnly}
        />
        {!exam && (
          <div className="writing-underlines" ref={underlines} aria-hidden="true">
            {issues.map(({ start, word }) => {
              const prefix = text.slice(previousEnd, start);
              previousEnd = start + word.length;
              return <Fragment key={start}>{prefix}<mark>{word}</mark></Fragment>;
            })}
            {text.slice(previousEnd)}{"\n"}
          </div>
        )}
      </div>
      <div className="writing-footer">
        {!exam && (
          <button type="button" className="button secondary" disabled={readOnly} aria-expanded={reviewing} onClick={() => setReviewStart(reviewing ? null : 0)}>
            Spell check
          </button>
        )}
        <WordCount text={text} showTarget={!exam} />
      </div>
      {reviewing && (
        <div
          className="writing-spelling"
          aria-label="Spelling suggestions"
          role="region"
          ref={review}
          tabIndex={-1}
          onKeyDown={(event) => { if (event.key === "Escape") closeReview(); }}
        >
          {issue ? (
            <>
              <p role="status">Suggestions for <strong>{issue.word}</strong>{issues.length > 1 && ` (${issueIndex + 1} of ${issues.length})`}</p>
              <div className="writing-suggestions">
                {suggestions?.length ? suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="button secondary" onClick={() => applySuggestion(suggestion)}>{suggestion}</button>
                )) : <p>No suggestions found.</p>}
                {issues.length > 1 && (
                  <button type="button" className="button secondary" onClick={() => setReviewStart(issues[(issueIndex + 1) % issues.length].start)}>Next word</button>
                )}
              </div>
            </>
          ) : (
            <p role="status">{checker ? "No spelling issues found." : checker === null ? "The dictionary couldn’t load. Browser spell check is enabled." : "Loading the spelling dictionary…"}</p>
          )}
        </div>
      )}
    </section>
  );
}
