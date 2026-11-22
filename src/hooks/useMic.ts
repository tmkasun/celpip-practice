import { useCallback, useEffect, useRef } from "react";

export default function useMic() {
  const stream = useRef<MediaStream>();
  const recorder = useRef<MediaRecorder>();
  const result = useRef<Promise<Blob | null>>();
  const generation = useRef(0);

  const release = useCallback(() => {
    generation.current += 1;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
    recorder.current = undefined;
    stream.current = undefined;
    result.current = undefined;
  }, []);

  useEffect(() => release, [release]);

  async function connect() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      throw new Error("Recording requires microphone support and HTTPS or localhost.");
    }
    const request = ++generation.current;
    const media = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation.current !== request) {
      media.getTracks().forEach((track) => track.stop());
      return false;
    }
    stream.current = media;
    return true;
  }

  function start() {
    if (!stream.current?.active) return false;
    try {
      const recording = new MediaRecorder(stream.current);
      const chunks: Blob[] = [];
      const finished = new Promise<Blob | null>((resolve) => {
        recording.ondataavailable = (event) => {
          if (event.data.size) chunks.push(event.data);
        };
        recording.onstop = () => {
          resolve(chunks.length ? new Blob(chunks, { type: recording.mimeType }) : null);
        };
        recording.onerror = () => resolve(null);
      });
      recording.start();
      recorder.current = recording;
      result.current = finished;
      return true;
    } catch {
      return false;
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    return result.current ?? Promise.resolve(null);
  }

  return { connect, start, stop, release };
}
