import { Link, useLocation } from "react-router-dom";

const Stepper = (props: any) => {
  const { children, numberOfTasks, currentTask } = props;
  const { pathname } = useLocation();
  const taskPath = pathname.split("/");
  taskPath.pop();
  return (
    <>
      <ol className="flex items-center w-full">
        {new Array(numberOfTasks).fill(null).map((_, index) => {
          const isLast = index === numberOfTasks - 1;
          const isCurrent = index + 1 === currentTask;
          const button = (
            <Link
              to={`${taskPath.join("/")}/${index + 1}`}
              className={`flex items-center justify-center w-10 h-10 dark:text-gray-200 ${
                isCurrent
                  ? "bg-blue-100 dark:bg-blue-700 dark:text-green-200"
                  : "bg-gray-100"
              } rounded-full lg:h-12 lg:w-12 dark:bg-gray-700 shrink-0`}
            >
              {index + 1}
            </Link>
          );
          if (isLast) {
            return (
              <li
                key={index}
                className="flex flex-grow-0 flex-shrink basis-0 items-center w-full"
              >
                {button}
              </li>
            );
          } else if (isCurrent) {
            return (
              <li
                key={index}
                className="flex w-full items-center text-blue-600 dark:text-blue-500 after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-100 after:border-4 after:inline-block dark:after:border-gray-700 "
              >
                {button}
              </li>
            );
          } else {
            return (
              <li
                key={index}
                className="flex w-full items-center after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-100 after:border-4 after:inline-block dark:after:border-gray-700"
              >
                {button}
              </li>
            );
          }
        })}
      </ol>
      <div className="gap-4 flex w-full flex-col lg:flex-row  justify-center">
        {children}
      </div>
    </>
  );
};

export default Stepper;
export { Stepper };
