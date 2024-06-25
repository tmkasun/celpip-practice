import { useState, useRef, useEffect } from "react";

// https://github.dev/mdn/dom-examples/blob/main/media/web-dictaphone/scripts/app.js
// https://github.dev/hackingbeauty/react-mic
// https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API

// const userMediaAPI =
//   navigator.mediaDevices.getUserMedia ||
//   navigator.webkitGetUserMedia ||
//   navigator.mozGetUserMedia ||
//   navigator.msGetUserMedia;

export const useMic = (
  onRecordComplete?: (rawAudioData: Blob[], urlObj: string) => void
) => {
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioDataRef = useRef<Blob[]>([]);
  const [mediaURL, setMediaURL] = useState<string>("");
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isComplete, setIsComplete] = useState<boolean>(false);
  useEffect(() => {
    let _stream: MediaStream | null = null;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      const constraints = { audio: true, video: false };
      const onSuccuss = (stream: MediaStream) => {
        _stream = stream;
        setAudioStream(stream);
        mediaRecorderRef.current = new MediaRecorder(stream);
        mediaRecorderRef.current.onstop = () => {
          const audioBlob = new Blob(audioDataRef.current, {
            type: mediaRecorderRef.current?.mimeType,
          });
          const urlObject = URL.createObjectURL(audioBlob);
          setMediaURL(urlObject);
          if (onRecordComplete) {
            onRecordComplete(audioDataRef.current, urlObject);
          }
          setIsComplete(true);
        };
        mediaRecorderRef.current.ondataavailable = function (e) {
          audioDataRef.current.push(e.data);
        };
      };
      const onError = (err: Error) => {
        console.error("getUserMedia not supported", err);
      };
      // This is the line that will ask for permission
      navigator.mediaDevices.getUserMedia(constraints).then(onSuccuss, onError);
    } else {
      console.error("getUserMedia not supported");
    }
    return () => {
      if (_stream) {
        _stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []);

  const startRecording = () => {
    if (audioStream) {
      setIsRecording(true);
      mediaRecorderRef.current?.start();
      setIsComplete(false);
    }
  };
  const resetRecording = () => {
    if (audioStream) {
      setIsRecording(false);
      setIsComplete(false);
      setMediaURL("");
      audioDataRef.current = [];
    }
  };
  const stopRecording = () => {
    if (audioStream) {
      setIsRecording(false);
      mediaRecorderRef.current?.stop();
    }
  };
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
      setIsComplete(true);
    } else {
      startRecording();
    }
  };

  return {
    audioStream,
    startRecording,
    stopRecording,
    toggleRecording,
    isComplete,
    mediaURL,
    isRecording,
    setIsRecording,
    resetRecording,
    audioDataRef,
  };
};

export default useMic;
