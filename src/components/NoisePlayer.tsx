import { useEffect, useRef, useState } from "react";
import noise from "../sounds/noise.mp3";

export default function NoisePlayer({ floating = false }: { floating?: boolean }) {
  const player = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const audio = player.current;
    return () => { if (audio && !audio.paused) audio.pause(); };
  }, []);

  async function togglePlayback() {
    const audio = player.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }

    setFailed(false);
    audio.volume = 0.2;
    try {
      await audio.play();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailed(true);
    }
  }

  const audio = (
    <audio
      ref={player}
      aria-label={floating ? undefined : "Background noise"}
      controls={!floating}
      hidden={floating}
      loop
      preload="none"
      src={noise}
      onPlay={(event) => {
        if (floating) setPlaying(true);
        else if (event.currentTarget.volume === 1) event.currentTarget.volume = 0.2;
      }}
      onPause={floating ? () => setPlaying(false) : undefined}
      onError={floating ? () => { setPlaying(false); setFailed(true); } : undefined}
    />
  );

  if (floating) {
    return (
      <div className="noise-float-space">
        {audio}
        <div className="noise-float">
          {failed && <p className="notice" role="status">Background noise couldn’t play.</p>}
          <button type="button" className="button primary" aria-label="Background noise" aria-pressed={playing}
            title={playing ? "Pause background noise" : "Play background noise"} onClick={togglePlayback}>
            <span className="noise-icon" aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
            <span className="noise-label" aria-hidden="true">Background noise</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <details className="noise">
      <summary>Background noise</summary>
      {audio}
    </details>
  );
}
