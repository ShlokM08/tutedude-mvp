import { useEffect, useMemo, useRef } from "react";
import type { EventType } from "@/lib/types";

// ---- Types ---------------------------------------------------------------

type Props = {
  /** Video element to read frames from */
  video: HTMLVideoElement | null;
  /** Canvas to draw overlay (same one you use for face overlay) */
  canvas: HTMLCanvasElement | null;
  /** Called when an object-detection event should be logged */
  onEvent?: (type: EventType, meta?: Record<string, unknown>) => void;

  /**
   * Per-event minimum confidence to consider a detection valid.
   * Keys are EventType names (e.g., "PHONE_DETECTED").
   */
  perClassMinConfidence?: Record<string, number>;

  /**
   * Per-event persistence window; detection must be continuously present
   * for this long (ms) before we fire the event.
   */
  perClassPersistMs?: Record<string, number>;

  /** Draw overlay boxes/text on the canvas (default: true) */
  draw?: boolean;
};

// We only emit PHONE_DETECTED from this hook.
// (Multiple faces is handled by the face-focus hook.)
const CLASS_TO_EVENT: Record<string, EventType> = {
  "cell phone": "PHONE_DETECTED",
};

// Defaults (can be overridden by props)
const DEFAULT_MIN_CONF: Record<string, number> = {
  PHONE_DETECTED: 0.7,
};
const DEFAULT_PERSIST_MS: Record<string, number> = {
  PHONE_DETECTED: 800,
};

// ---- Hook ----------------------------------------------------------------

/**
 * Loads coco-ssd lazily on the client and runs a minimal detection loop.
 * Emits "PHONE_DETECTED" when "cell phone" is present with enough confidence
 * and persistence (debounced to avoid noisy logs).
 */
export function useObjectDetect({
  video,
  canvas,
  onEvent,
  perClassMinConfidence,
  perClassPersistMs,
  draw = true,
}: Props) {
  // Merge user thresholds with defaults — memoized so effects have stable deps
  const minConf = useMemo(
    () => ({ ...DEFAULT_MIN_CONF, ...(perClassMinConfidence ?? {}) }),
    [perClassMinConfidence]
  );
  const persistMs = useMemo(
    () => ({ ...DEFAULT_PERSIST_MS, ...(perClassPersistMs ?? {}) }),
    [perClassPersistMs]
  );

  // Keep model instance around between renders
  const modelRef = useRef<{
    // eslint-disable-next-line @typescript-eslint/ban-types
    model: {} | null;
    // narrow type locally after dynamic import, to avoid global @types churn
    predict: ((video: HTMLVideoElement) => Promise<DetectedObject[]>) | null;
  }>({ model: null, predict: null });

  // Track persistence windows & last-fire timestamps
  const firstAboveRef = useRef<Record<EventType, number>>({} as Record<EventType, number>);
  const lastFiredRef = useRef<Record<EventType, number>>({} as Record<EventType, number>);

  // Load model once we have a video/canvas
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      // dynamic imports so SSR never tries to load TF
      const tfCore = await import("@tensorflow/tfjs-core");
      await import("@tensorflow/tfjs-converter");
      await import("@tensorflow/tfjs-backend-webgl");
      await tfCore.ready();
      // Prefer webgl when available
      try {
        await (tfCore as unknown as { setBackend: (b: string) => Promise<void> }).setBackend("webgl");
      } catch {
        /* ignore and use default */
      }

      // Load coco-ssd with lite_mobilenet_v2 for speed
      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const mdl = await cocoSsd.load({ base: "lite_mobilenet_v2" });

      if (cancelled) {
        // If the effect already cleaned up, dispose the model
        try { (mdl as unknown as { dispose?: () => void }).dispose?.(); } catch { /* ignore */ }
        return;
      }

      modelRef.current.model = mdl;
      modelRef.current.predict = async (vid: HTMLVideoElement) => {
        const res = await mdl.detect(vid);
        // Map to a local, typed structure to avoid any
        return res.map((r) => ({
          bbox: r.bbox as [number, number, number, number],
          class: r.class,
          score: r.score,
        }));
      };
    }

    if (video && canvas && !modelRef.current.model) {
      loadModel();
    }

    return () => {
      cancelled = true;
      const m = modelRef.current.model as unknown as { dispose?: () => void } | null;
      modelRef.current.model = null;
      modelRef.current.predict = null;
      try { m?.dispose?.(); } catch { /* ignore */ }
    };
  }, [video, canvas]);

  // Main detection loop
  useEffect(() => {
    let raf = 0;
    let running = true;

    const run = async () => {
      if (!running) return;
      if (!video || !canvas || !modelRef.current.predict) {
        raf = requestAnimationFrame(run);
        return;
      }

      // Ensure video has dimensions before using canvas
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        raf = requestAnimationFrame(run);
        return;
      }

      // Size canvas to video to keep overlay aligned
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(run);
        return;
      }

      // Clear each frame (face hook may draw on same canvas; harmless to re-clear)
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Predict
      let dets: DetectedObject[] = [];
      try {
        dets = await modelRef.current.predict(video);
      } catch {
        // ignore transient predict errors
      }

      const now = Date.now();

      // Track if target classes are present this frame
      const presentThisFrame = new Set<EventType>();

      // Draw + detect
      for (const d of dets) {
        const evt = CLASS_TO_EVENT[d.class];
        if (!evt) continue;

        const conf = d.score ?? 0;
        const needConf = minConf[evt] ?? 0.7;
        if (conf < needConf) continue;

        presentThisFrame.add(evt);

        // Start/continue persistence window
        if (firstAboveRef.current[evt] == null) {
          firstAboveRef.current[evt] = now;
        }

        // Draw overlay
        if (draw && ctx) {
          const [x, y, w, h] = d.bbox;
          ctx.strokeStyle = "rgba(97,218,251,0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = "rgba(97,218,251,0.9)";
          const label = `${evt} ${(conf * 100).toFixed(0)}%`;
          ctx.font = "12px sans-serif";
          ctx.fillText(label, x + 4, Math.max(12, y - 4));
        }

        // If persisted long enough AND not fired too recently, emit event
        const needMs = persistMs[evt] ?? 800;
        const persisted = now - (firstAboveRef.current[evt] ?? now);
        const last = lastFiredRef.current[evt] ?? 0;

        if (persisted >= needMs && now - last >= 1500) {
          lastFiredRef.current[evt] = now;

          // meta payload (compact; extend as you like)
          const meta = {
            source: "coco-ssd (lite_mobilenet_v2)",
            label: d.class,
            score: d.score ?? 0,
            bbox: d.bbox,
            frame: { w: canvas.width, h: canvas.height },
            persistedMs: persisted,
          };

          onEvent?.(evt, meta);
        }
      }

      // Reset persistence for classes NOT present this frame
      for (const key of Object.values(CLASS_TO_EVENT)) {
        if (!presentThisFrame.has(key)) {
          delete firstAboveRef.current[key];
        }
      }

      raf = requestAnimationFrame(run);
    };

    raf = requestAnimationFrame(run);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
    };
  }, [video, canvas, onEvent, minConf, persistMs, draw]);
}

// ---- Local types to avoid `any` from coco-ssd ----------------------------

type DetectedObject = {
  bbox: [number, number, number, number]; // [x, y, width, height]
  class: string;
  score?: number;
};
