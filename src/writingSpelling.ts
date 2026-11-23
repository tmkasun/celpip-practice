import nspell from "nspell";

export interface Misspelling {
  start: number;
  word: string;
}

const tokens = new RegExp(
  "(?:https?://|www\\.)\\S+|[\\p{L}\\p{N}._%+-]+@[\\p{L}\\p{N}.-]+|[\\p{N}][\\p{L}\\p{N}]*|(\\p{L}[\\p{L}\\p{M}]*(?:['’][\\p{L}\\p{M}]+)*)",
  "gu"
);
function normalize(word: string) {
  return word.normalize("NFC").replace(/’/g, "'");
}

async function loadDictionaryFile(file: string) {
  const response = await fetch(`${process.env.PUBLIC_URL}/spelling/${file}`);
  if (!response.ok) throw new Error("Could not load the spelling dictionary");
  return response.text();
}

async function createChecker() {
  const [aff, dic] = await Promise.all([loadDictionaryFile("index.aff"), loadDictionaryFile("index.dic")]);
  const dictionary = nspell(aff, dic);
  return {
    find(text: string) {
      const misspellings: Misspelling[] = [];
      for (const match of Array.from(text.matchAll(tokens))) {
        const word = match[1];
        if (word && match.index !== undefined && !dictionary.correct(normalize(word))) {
          misspellings.push({ start: match.index, word });
        }
      }
      return misspellings;
    },
    suggest(word: string) {
      if (word.length > 40) return [];
      const suggestions = dictionary.suggest(normalize(word)).slice(0, 5);
      return word.includes("’") ? suggestions.map((suggestion) => suggestion.replace(/'/g, "’")) : suggestions;
    },
  };
}

export type SpellingChecker = Awaited<ReturnType<typeof createChecker>>;

let checker: Promise<SpellingChecker> | undefined;

export function loadSpellingChecker() {
  checker ??= createChecker().catch((error: unknown) => {
    checker = undefined;
    throw error;
  });
  return checker;
}
