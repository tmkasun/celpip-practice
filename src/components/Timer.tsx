interface ITimer {
  name?: string;
  children?: React.ReactNode;
  unit?: string;
  value: number;
  isRecording?: boolean;
}
export default function Timer(props: ITimer) {
  const { name, children, value, isRecording, unit = "Sec" } = props;
  return (
    <div className="flex relative flex-col items-center justify-start gap-4 w-full max-w-sm p-4 bg-white border border-gray-200 rounded-lg shadow sm:p-8 dark:bg-gray-800 dark:border-gray-700">
      {name && (
        <h5 className="mb-4 text-xl font-medium text-gray-500 dark:text-gray-400">
          {name}
        </h5>
      )}
      <div
        className={`flex items-baseline ${
          value < 10 ? "text-red-700" : "text-gray-900"
        } dark:text-white`}
      >
        <span className="text-5xl font-extrabold tracking-tight">{value}</span>
        <span className="ms-1 text-xl font-normal text-gray-500 dark:text-gray-400">
          / {unit}
        </span>
      </div>
      {children && (
        <div className="flex flex-col justify-center items-center gap-4">
          {children}
        </div>
      )}
      {isRecording && (
        <div className="absolute top-0 right-1 flex justify-center items-center gap-2">
          <span className="text-xs text-gray-400">Recording</span>
          <span className="animate-ping inline-flex h-[0.5rem] w-[0.5rem] rounded-full bg-red-800 opacity-95"></span>
        </div>
      )}
      {isRecording === false && (
        <div className="absolute top-0 right-1 flex justify-center items-center gap-2">
          <span className="text-xs text-gray-400">Auto Record</span>
          <span className="inline-flex h-[0.5rem] w-[0.5rem] rounded-full bg-red-800 opacity-15"></span>
        </div>
      )}
    </div>
  );
}
