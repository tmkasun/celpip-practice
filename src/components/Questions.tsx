import { useEffect, useMemo, useState } from "react";
import _questionsPool from "../questions/pool.json";
import { getRandomInt } from "../utils";

const questionsPool = _questionsPool as Record<string, string[]>;

interface IQuestions {
  currentTask: number;
  onReveal: () => void;
  onRefresh: () => void;
}
export default function Questions(props: IQuestions) {
  const { currentTask, onReveal, onRefresh } = props;
  const [isRevealed, setIsRevealed] = useState(false);
  const questionsSet = questionsPool[`${currentTask}`];

  const [randomIndex, setRandomIndex] = useState(
    getRandomInt(0, questionsSet ? questionsSet.length - 1 : -1)
  );

  const randomQuestion = useMemo(() => {
    if (!questionsSet) {
      return null;
    }
    return questionsSet[randomIndex];
  }, [currentTask, randomIndex]);

  useEffect(() => {
    if (!randomQuestion) {
      setIsRevealed(true);
    } else {
      setIsRevealed(false);
    }
  }, [currentTask, randomQuestion]);
  return (
    <div className="min-h-32 flex justify-center items-center gap-2">
      {!isRevealed && (
        <button
          className="py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
          onClick={() => {
            setIsRevealed(true);
            onReveal();
          }}
        >
          Show Question & Start
        </button>
      )}
      {isRevealed && (
        <>
          <blockquote className="p-4 my-4 border-s-4 border-gray-300 bg-gray-50 dark:border-gray-500 dark:bg-gray-800">
            <p className="text-left text-xl italic font-medium leading-relaxed text-gray-900 dark:text-white">
              {randomQuestion || "No question found"}
            </p>
          </blockquote>
          {randomQuestion && (
            <button
              className="py-2.5 h-fit px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
              onClick={() => {
                onRefresh();
                setRandomIndex(getRandomInt(0, questionsSet.length - 1));
              }}
            >
              <svg
                className="w-6 h-6 text-gray-800 dark:text-white"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17.651 7.65a7.131 7.131 0 0 0-12.68 3.15M18.001 4v4h-4m-7.652 8.35a7.13 7.13 0 0 0 12.68-3.15M6 20v-4h4"
                />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}
