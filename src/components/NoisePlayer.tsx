import { useRef, useState } from "react";
import noise from "../sounds/noise.mp3";

export default function NoisePlayer() {
  const noiseRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="flex flex-col-reverse sm:flex-row justify-center items-center mt-2 gap-2">
      <audio
        className={isPlaying ? "" : "hidden"}
        ref={noiseRef}
        controls
        src={noise}
      />
      <button
        className="py-2.5 px-5 me-2 mb-2 text-sm font-medium text-gray-900 focus:outline-none bg-white rounded-lg border border-gray-200 hover:bg-gray-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-gray-100 dark:focus:ring-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600 dark:hover:text-white dark:hover:bg-gray-700"
        onClick={() => {
          if (noiseRef.current) {
            if (!isPlaying) {
              noiseRef.current.play();
              noiseRef.current.loop = true;
              noiseRef.current.volume = 0.2;
              setIsPlaying(true);
            } else {
              noiseRef.current.pause();
              setIsPlaying(false);
            }
          }
        }}
      >
        {isPlaying ? "Stop" : "Simulate Noise"}
      </button>
    </div>
  );
}
