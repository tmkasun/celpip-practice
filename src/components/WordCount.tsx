import { useMemo } from "react";

interface IWordCountProps {
  text: string;
  maxWords?: number;
  minWords?: number;
  threshold?: number;
}
export default function WordCount(props: IWordCountProps) {
  const { text, maxWords = 200, minWords = 150 } = props;
  const wordCount = useMemo(() => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  }, [text]);
  const isWithinThreshold = wordCount >= minWords && wordCount <= maxWords;
  const isOverThreshold = wordCount > maxWords;
  const isUnderThreshold = wordCount < minWords;
  let color = "text-gray-500 dark:text-gray-300 bg-gray-50 dark:bg-gray-800";
  if (isOverThreshold) {
    color = "text-red-500 dark:text-red-300 bg-red-50 dark:bg-red-800";
  } else if (isUnderThreshold) {
    color =
      "text-yellow-500 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-800";
  } else if (isWithinThreshold) {
    color = "text-green-500 dark:text-green-300 bg-green-50 dark:bg-green-800";
  }
  return (
    <div className={`p-4 text-sm rounded-lg ${color}`}>
      Word Count <span className="font-medium text-lg">{wordCount}</span>
    </div>
  );
}
