import { imageSource } from "../speakingAi";
import type { Illustration, Option, Prompt } from "../questions/pool";

function PromptImage({ image }: { image: Illustration }) {
  return <img src={imageSource(image.file)} alt={image.alt} />;
}

function OptionDetails({ option }: { option: Option }) {
  return (
    <>
      <PromptImage image={option.image} />
      <strong>{option.title}</strong>
      <ul>{option.details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
    </>
  );
}

export default function PromptView({
  prompt, choice, selecting = false, onChoose,
}: {
  prompt: Prompt;
  choice?: number;
  selecting?: boolean;
  onChoose?: (choice: number) => void;
}) {
  const comparison = prompt.comparison;
  return (
    <div className="prompt-body">
      <p>{prompt.context}</p>
      <p className="prompt-instruction">
        {comparison && !selecting ? comparison.instruction : prompt.instruction}
      </p>
      {prompt.points && <ul>{prompt.points.map((point) => <li key={point}>{point}</li>)}</ul>}
      {prompt.image && <figure className="prompt-image"><PromptImage image={prompt.image} /></figure>}
      {comparison && selecting && onChoose && (
        <fieldset className="option-grid">
          <legend className="sr-only">Choose a comparison option</legend>
          {comparison.choices.map((option, index) => (
            <label key={option.title} className="option-card">
              <input
                type="radio"
                name="comparison-choice"
                checked={choice === index}
                onChange={() => onChoose(index)}
              />
              <OptionDetails option={option} />
            </label>
          ))}
        </fieldset>
      )}
      {comparison && selecting && !onChoose && (
        <div className="option-grid">
          {comparison.choices.map((option) => (
            <div key={option.title} className="option-card"><OptionDetails option={option} /></div>
          ))}
        </div>
      )}
      {comparison && !selecting && (
        <div className="option-grid">
          <div className="option-card"><span className="meta">Your option</span><OptionDetails option={comparison.choices[choice ?? 0]} /></div>
          <div className="option-card"><span className="meta">New option</span><OptionDetails option={comparison.alternative} /></div>
        </div>
      )}
    </div>
  );
}

export function promptText(prompt: Prompt) {
  return [prompt.context, prompt.instruction, ...(prompt.points ?? [])].join("\n");
}
