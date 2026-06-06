import { useRef } from "react";

const DEFAULT_MS = 500;

export function useLongPress(onLongPress: () => void, delayMs = DEFAULT_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return {
    wasLongPress: () => firedRef.current,
    resetLongPress: () => {
      firedRef.current = false;
    },
    handlers: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        firedRef.current = false;
        clear();
        timerRef.current = setTimeout(() => {
          firedRef.current = true;
          onLongPress();
        }, delayMs);
      },
      onPointerUp: clear,
      onPointerLeave: clear,
      onPointerCancel: clear,
    },
  };
}
