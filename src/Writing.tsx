import React, { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import "./App.css";
import useInterval from "./hooks/useInterval";
import useSound from "use-sound";
import Stepper from "./components/Stepper";

import end from "./sounds/end.mp3";
import NoisePlayer from "./components/NoisePlayer";
import Questions from "./components/Questions";
import WordCount from "./components/WordCount";
import Navigate from "./components/Navigate";
import Timer from "./components/Timer";

const TasksToTime: {
  [index: number]: { taskTime: number };
} = {
  1: {
    taskTime: 1620,
  },
  2: {
    taskTime: 1560,
  },
};

function Writing() {
  let { taskId = "1" } = useParams();
  const [taskTime, setTaskTime] = React.useState<number>(
    TasksToTime[parseInt(taskId)].taskTime
  );
  const [hasStarted, setHasStarted] = React.useState<boolean>(false);
  const [timeElapsed, setTimeElapsed] = React.useState<number>(0);
  const [currentTask, setCurrentTask] = React.useState<number>(
    parseInt(taskId)
  );
  const [text, setText] = React.useState<string>("");

  useEffect(() => {
    setCurrentTask(parseInt(taskId));
  }, [taskId]);
  const [delay, setDelay] = React.useState<number | null>(
    hasStarted ? 1000 : null
  );
  const [endSound] = useSound(end);

  useInterval(() => {
    setTimeElapsed(timeElapsed + 1);
  }, delay);
  const remainingTaskTime = taskTime - timeElapsed;

  useEffect(() => {
    if (remainingTaskTime === 0) {
      endSound();
    }
  }, [currentTask, remainingTaskTime]);
  const resetTask = () => {
    setTaskTime(TasksToTime[currentTask].taskTime);
    setTimeElapsed(0);
    setHasStarted(false);
    setDelay(null);
    setText("");
  };
  const handleStartStop = () => {
    if (hasStarted) {
      setDelay(null);
    } else {
      setDelay(1000);
    }
    setHasStarted(!hasStarted);
  };

  useEffect(resetTask, [currentTask]);
  return (
    <div className="App flex justify-center ">
      <div className="w-10/12 gap-4 flex flex-col">
        <Navigate />
        <div className="flex-col mt-8 flex justify-center gap-6 items-center ">
          <Stepper
            numberOfTasks={Object.keys(TasksToTime).length}
            currentTask={currentTask}
          >
            <div className="flex flex-col w-full justify-center items-center">
              <Timer
                remaining={Math.floor(remainingTaskTime / 60)}
                elapsed={timeElapsed}
                unit="Min"
              />
              <Questions
                onRefresh={resetTask}
                onReveal={handleStartStop}
                currentTask={currentTask}
              />
              <div className="flex flex-col justify-center items-normal grow w-full gap-1">
                <textarea
                  id="message"
                  rows={18}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="resize-none block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
                  placeholder="Write your answer here..."
                ></textarea>
                <div className="w-fit self-end">
                  <WordCount text={text} />
                </div>
              </div>
            </div>
          </Stepper>
          <div className=" flex-col gap-2 gap-x-2 w-1/2 justify-center items-center">
            <div className="gap-2 flex justify-between items-center">
              <Link
                type="submit"
                to={currentTask === 1 ? "#" : `/writing/${currentTask - 1}`}
                className={`${
                  currentTask === 1
                    ? "bg-slate-500 hover:bg-slate-500 touch-none cursor-default"
                    : ""
                } text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800`}
              >
                Back
              </Link>
              <Link
                type="submit"
                className="text-white bg-blue-700 hover:bg-blue-800 focus:ring-4 focus:outline-none focus:ring-blue-300 font-medium rounded-lg text-sm px-5 py-2.5 text-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                to={
                  currentTask < Object.keys(TasksToTime).length
                    ? `/writing/${currentTask + 1}`
                    : "/writing/1"
                }
              >
                Next
              </Link>
            </div>
          </div>
        </div>
        <NoisePlayer />
      </div>
    </div>
  );
}

export default Writing;
