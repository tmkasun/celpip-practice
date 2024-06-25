import React, { useEffect, useMemo, useReducer } from "react";
import logo from "./logo.svg";
import "./App.css";
import useInterval from "./hooks/useInterval";
import useSound from "use-sound";
import NumberInput from "./components/NumberInput";
import Stepper from "./components/Stepper";
import Timer from "./components/Timer";
import ding from "./sounds/ding.mp3";
import end from "./sounds/end.mp3";
import startNow from "./sounds/startNow.mp3";
import useMic from "./hooks/useMic";

const TasksToTime: {
  [index: number]: { preparationTime: number; speakingTime: number };
} = {
  1: {
    preparationTime: 30,
    speakingTime: 90,
  },
  2: {
    preparationTime: 30,
    speakingTime: 60,
  },
  3: {
    preparationTime: 30,
    speakingTime: 60,
  },
  4: {
    preparationTime: 30,
    speakingTime: 60,
  },
  5: {
    preparationTime: 60,
    speakingTime: 60,
  },
  6: {
    preparationTime: 60,
    speakingTime: 60,
  },
  7: {
    preparationTime: 60,
    speakingTime: 90,
  },
  8: {
    preparationTime: 30,
    speakingTime: 60,
  },
};

function App() {
  const [, forceRerender] = useReducer((x) => x + 1, 0);
  const [preparationTime, setPreparationCount] = React.useState<number>(60);
  const [speakingTime, setSpeakingTime] = React.useState<number>(60);
  const [hasStarted, setHasStarted] = React.useState<boolean>(false);
  const [timeElapsed, setTimeElapsed] = React.useState<number>(0);
  const [currentTask, setCurrentTask] = React.useState<number>(0);
  const [delay, setDelay] = React.useState<number | null>(
    hasStarted ? 1000 : null
  );
  const previousRecording = useMemo(() => {
    const previousRecording = window.localStorage.getItem(
      `task-${currentTask}`
    );
    return previousRecording;
  }, [currentTask]);
  const [dingSound] = useSound(ding);
  const [endSound] = useSound(end);
  const {
    mediaURL,
    isRecording,
    startRecording,
    stopRecording,
    resetRecording,
    isComplete,
  } = useMic();

  useEffect(() => {
    if (isComplete && mediaURL) {
      window.localStorage.setItem(`task-${currentTask}`, mediaURL);
    }
  }, [isComplete, currentTask, mediaURL]);

  const [startNowSound] = useSound(startNow);
  useInterval(() => {
    setTimeElapsed(timeElapsed + 1);
  }, delay);
  const remainingPreparationTime = preparationTime - timeElapsed;
  let remainingSpeakingTime = speakingTime;
  if (remainingPreparationTime <= 0) {
    remainingSpeakingTime = speakingTime + preparationTime - timeElapsed;
  }
  useEffect(() => {
    if (remainingPreparationTime === 0) {
      dingSound();
      startNowSound();
    }
    if (remainingSpeakingTime === 0) {
      endSound();
      setDelay(null);
      setHasStarted(false);
      setTimeElapsed(0);
    }
  }, [remainingPreparationTime, remainingSpeakingTime]);
  const handleStartStop = () => {
    if (hasStarted) {
      setDelay(null);
      stopRecording();
    } else {
      setDelay(1000);
    }
    setHasStarted(!hasStarted);
  };

  useEffect(() => {
    if (remainingPreparationTime === 1) {
      startRecording();
    }
    if (remainingSpeakingTime === 0) {
      stopRecording();
    }
  }, [currentTask, remainingPreparationTime, remainingSpeakingTime]);
  const resetTask = () => {
    setPreparationCount(TasksToTime[currentTask + 1].preparationTime);
    setSpeakingTime(TasksToTime[currentTask + 1].speakingTime);
    setTimeElapsed(0);
    setHasStarted(false);
    setDelay(null);
    resetRecording();
  };
  useEffect(resetTask, [currentTask]);
  const audioRecording = mediaURL || previousRecording;
  return (
    <div className="App flex justify-center">
      <div className="w-10/12">
        <h2 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100">
          CELPIP Practice
        </h2>
        <h3 className="text-lg font-medium text-center text-gray-500 dark:text-gray-400">
          Speaking
        </h3>
        <h4 className="mb-4 text-lg font-medium leading-none text-gray-900 dark:slate-500">
          Task {currentTask + 1}
        </h4>
        <div>
          <Stepper
            numberOfTasks={Object.keys(TasksToTime).length}
            currentTask={currentTask}
            onClick={(taskId: number) => {
              setCurrentTask(taskId);
              setPreparationCount(TasksToTime[taskId + 1].preparationTime);
              setSpeakingTime(TasksToTime[taskId + 1].speakingTime);
              setTimeElapsed(0);
              setHasStarted(false);
            }}
          >
            <Timer
              name="Preparation"
              value={
                remainingPreparationTime >= 0 ? remainingPreparationTime : 0
              }
            >
              <NumberInput
                type="number"
                onChange={(e) => {
                  setPreparationCount(e.currentTarget.valueAsNumber);
                  setTimeElapsed(0);
                }}
                value={preparationTime}
                onAdd={() => setPreparationCount(preparationTime + 1)}
                onDeduct={() => setPreparationCount(preparationTime - 1)}
              />
            </Timer>
            <Timer
              isRecording={isRecording}
              name="Speaking"
              value={remainingSpeakingTime}
            >
              <NumberInput
                type="number"
                onChange={(e) => {
                  setSpeakingTime(e.currentTarget.valueAsNumber);
                  setTimeElapsed(0);
                }}
                onAdd={() => setSpeakingTime(speakingTime + 1)}
                onDeduct={() => setSpeakingTime(speakingTime - 1)}
                value={speakingTime}
              />
              {audioRecording && (
                <div className="flex justify-center items-center gap-1">
                  <audio className="grow" controls src={audioRecording} />
                  <button
                    onClick={() => {
                      window.localStorage.removeItem(`task-${currentTask}`);
                      forceRerender();
                    }}
                    type="button"
                    className="text-red-600 bg-white rounded-full hover:bg-slate-100 p-2  focus:outline-none h-fit    font-normal text-xs"
                  >
                    <svg
                      className="w-5 h-5 text-red-600 dark:text-white"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 20 16"
                    >
                      <path
                        stroke="currentColor"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M8 8v1h4V8m4 7H4a1 1 0 0 1-1-1V5h14v9a1 1 0 0 1-1 1ZM2 1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Z"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </Timer>
          </Stepper>
          {hasStarted ? (
            <button
              onClick={handleStartStop}
              type="button"
              className="focus:outline-none text-white bg-red-700 hover:bg-red-800 focus:ring-4 focus:ring-red-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-red-600 dark:hover:bg-red-700 dark:focus:ring-red-900"
            >
              Stop
            </button>
          ) : (
            <button
              onClick={handleStartStop}
              type="button"
              className="focus:outline-none text-white bg-green-700 hover:bg-green-800 focus:ring-4 focus:ring-green-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:bg-green-600 dark:hover:bg-green-700 dark:focus:ring-green-800"
            >
              Start
            </button>
          )}
          <button
            type="button"
            className="focus:outline-none text-white bg-yellow-400 hover:bg-yellow-500 focus:ring-4 focus:ring-yellow-300 font-medium rounded-lg text-sm px-5 py-2.5 me-2 mb-2 dark:focus:ring-yellow-900"
            onClick={resetTask}
          >
            Reset
          </button>
          <button
            type="submit"
            className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            onClick={() => {
              setCurrentTask(
                (currentTask + 1) % Object.keys(TasksToTime).length
              );
            }}
          >
            Next Task
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
