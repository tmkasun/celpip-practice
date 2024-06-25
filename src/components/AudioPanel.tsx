import { useEffect, useRef, useState } from "react";
import useMic from "../hooks/useMic";

interface IAudioPanel {
  taskID: number;
  onRecordChange?: (isRecording: boolean) => void;
  controlled?: boolean;
}

/**
 * @deprecated use the hook directly
 * @param props
 * @returns
 */
export default function AudioPanel(props: IAudioPanel) {
  const { taskID, onRecordChange, controlled = false } = props;
  const { toggleRecording, mediaURL, isRecording } = useMic();
  useEffect(() => {
    if (onRecordChange) {
      onRecordChange(isRecording);
    }
  }, [isRecording, onRecordChange]);
  return (
    <div>
      {mediaURL && <audio controls src={mediaURL} />}
      {controlled && (
        <button onClick={toggleRecording}>
          {isRecording ? "Stop" : "Start"}
        </button>
      )}
    </div>
  );
}
