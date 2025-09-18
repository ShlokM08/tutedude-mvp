import { useEffect, useMemo, useRef } from "react";
// …your other imports

type UseObjectDetectProps = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (t: any, meta?: Record<string, unknown>) => void;
  // These two exist in your code already:
  perClassMinConfidence?: Record<string, number>;
  perClassPersistMs?: Record<string, number>;
};

// default thresholds (adjust to your needs)
const DEFAULT_MIN_CONF: Record<string, number> = {
  PHONE_DETECTED: 0.7,
  MULTIPLE_FACES: 0.8,
};
const DEFAULT_PERSIST_MS: Record<string, number> = {
  PHONE_DETECTED: 800,
  MULTIPLE_FACES: 800,
};

export function useObjectDetect({
  video,
  canvas,
  onEvent,
  perClassMinConfidence,
  perClassPersistMs,
}: UseObjectDetectProps) {
  // ✅ make the config objects stable across renders
  const minConf = useMemo(
    () => ({ ...DEFAULT_MIN_CONF, ...(perClassMinConfidence ?? {}) }),
    [perClassMinConfidence]
  );
  const persistMs = useMemo(
    () => ({ ...DEFAULT_PERSIST_MS, ...(perClassPersistMs ?? {}) }),
    [perClassPersistMs]
  );

  // If you previously had something like:
  // useEffect(() => { /* init model using inline object literals */ }, [video, canvas, {…}, {…}]);
  // change it to:
  useEffect(() => {
    if (!video || !canvas) return;
    // init detector / drawing contexts here, using `minConf` and `persistMs`
    // …
    return () => {
      // cleanup
    };
  }, [video, canvas, minConf, persistMs]); // ✅ real, stable deps only

  // If you had other effects depending on the objects, do the same:
  useEffect(() => {
    // run detection loop, look at minConf / persistMs when deciding to fire events
    // …
  }, [video, canvas, onEvent, minConf, persistMs]); // ✅ no complex expressions
}
