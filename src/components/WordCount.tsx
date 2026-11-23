export default function WordCount({ text, showTarget = true }: { text: string; showTarget?: boolean }) {
  const count = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <p className={count >= 150 && count <= 200 ? "word-count in-range" : "word-count"}>
      <strong>{count}</strong> {count === 1 ? "word" : "words"}{showTarget && <span> · Aim for 150–200</span>}
    </p>
  );
}
