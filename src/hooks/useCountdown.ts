import { useEffect, useRef, useState } from "react";

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return String(minutes).padStart(2, "0") + ":" + String(remainder).padStart(2, "0");
}

export default function useCountdown(deadline: number | undefined, expire: () => void) {
  const [now, setNow] = useState(Date.now);
  const onExpire = useRef(expire);
  onExpire.current = expire;

  useEffect(() => {
    if (deadline === undefined) return;
    let expired = false;
    function tick() {
      const current = Date.now();
      setNow(current);
      if (!expired && deadline !== undefined && current >= deadline) {
        expired = true;
        onExpire.current();
      }
    }
    tick();
    const interval = window.setInterval(tick, 200);
    const timer = window.setTimeout(tick, Math.max(0, deadline - Date.now()));
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [deadline]);

  return deadline === undefined ? 0 : Math.max(0, Math.ceil((deadline - Math.max(now, Date.now())) / 1000));
}
