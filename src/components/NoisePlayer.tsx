import noise from "../sounds/noise.mp3";

export default function NoisePlayer() {
  return (
    <details className="noise">
      <summary>Background noise</summary>
      <audio
        aria-label="Background noise"
        controls
        loop
        preload="none"
        src={noise}
        onPlay={(event) => {
          if (event.currentTarget.volume === 1) event.currentTarget.volume = 0.2;
        }}
      />
    </details>
  );
}
