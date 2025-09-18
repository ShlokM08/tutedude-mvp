// src/lib/detect/useObjectDetect.ts
import { useEffect, useMemo, useRef } from "react";
import type { EventType } from "@/lib/types";

type Props = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (type: EventType, meta?: Record<string, unknown>) => void;
  perClassMinConfidence?: Record<string, number>;
  perClassPersistMs?: Record<string, number>;
  draw?: boolean;
};

const CLASS_TO_EVENT: Record<string, EventType> = {
  "cell phone": "PHONE_DETECTED",
};

const DEFAULT_MIN_CONF: Record<string, number> = { PHONE_DETECTED: 0.7 };
const DEFAULT_PERSIST_MS: Record<string, number> = { PHONE_DETECTED: 800 };

export function useObjectDetect({
  video,
  canvas,
  onEvent,
  perClassMinConfidence,
  perClassPersistMs,
  draw = true,
}: Props) {
  const minConf = useMemo(
    () => ({ ...DEFAULT_MIN_CONF, ...(perClassMinConfidence ?? {}) }),
    [perClassMinConfidence]
  );
  const persistMs = useMemo(
    () => ({ ...DEFAULT_PERSIST_MS, ...(perClassPersistMs ?? {}) }),
    [perClassPersistMs]
  );

  const modelRef = useRef<{
    model: unknown | null;
    predict: ((video: HTMLVideoElement) => Promise<DetectedObject[]>) | null;
  }>({ model: null, predict: null });

  const firstAboveRef = useRef<Record<EventType, number>>({} as Record<EventType, number>);
  const lastFiredRef = useRef<Record<EventType, number>>({} as Record<EventType, number>);

  // Load model
  useEffect(() => {
    let cancelled = false;

    async function loadModel() {
      type TfCoreModule = {
        ready: () => Promise<void>;
        setBackend?: (b: string) => Promise<void> | Promise<boolean>;
      };

      const tfCore = (await import("@tensorflow/tfjs-core")) as unknown as TfCoreModule;
      await import("@tensorflow/tfjs-converter");
      await import("@tensorflow/tfjs-backend-webgl");
      await tfCore.ready();

      // ✅ type-guarded, no ts-expect-error
      if (typeof tfCore.setBackend === "function") {
        try {
          await tfCore.setBackend("webgl");
        } catch {
          /* ignore */
        }
      }

      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const mdl = await cocoSsd.load({ base: "lite_mobilenet_v2" });

      if (cancelled) {
        try {
          (mdl as unknown as { dispose?: () => void }).dispose?.();
        } catch {}
        return;
      }

      modelRef.current.model = mdl;
      modelRef.current.predict = async (vid: HTMLVideoElement) => {
        const res = await mdl.detect(vid);
        return res.map((r) => ({
          bbox: r.bbox as [number, number, number, number],
          class: r.class,
          score: r.score,
        }));
      };
    }

    if (video && canvas && !modelRef.current.model) loadModel();

    return () => {
      cancelled = true;
      const m = modelRef.current.model as unknown as { dispose?: () => void } | null;
      modelRef.current.model = null;
      modelRef.current.predict = null;
      try {
        m?.dispose?.();
      } catch {}
    };
  }, [video, canvas]);

  // Detect loop
  useEffect(() => {
    let raf = 0;
    let running = true;

    const run = async () => {
      if (!running) return;
      if (!video || !canvas || !modelRef.current.predict) {
        raf = requestAnimationFrame(run);
        return;
      }
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        raf = requestAnimationFrame(run);
        return;
      }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        raf = requestAnimationFrame(run);
        return;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      let dets: DetectedObject[] = [];
      try {
        dets = await modelRef.current.predict(video);
      } catch {}

      const now = Date.now();
      const presentThisFrame = new Set<EventType>();

      for (const d of dets) {
        const evt = CLASS_TO_EVENT[d.class];
        if (!evt) continue;

        const conf = d.score ?? 0;
        const needConf = minConf[evt] ?? 0.7;
        if (conf < needConf) continue;

        presentThisFrame.add(evt);
        if (firstAboveRef.current[evt] == null) firstAboveRef.current[evt] = now;

        if (draw) {
          const [x, y, w, h] = d.bbox;
          ctx.strokeStyle = "rgba(97,218,251,0.9)";
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = "rgba(97,218,251,0.9)";
          ctx.font = "12px sans-serif";
          ctx.fillText(`${evt} ${(conf * 100).toFixed(0)}%`, x + 4, Math.max(12, y - 4));
        }

        const needMs = persistMs[evt] ?? 800;
        const persisted = now - (firstAboveRef.current[evt] ?? now);
        const last = lastFiredRef.current[evt] ?? 0;

        if (persisted >= needMs && now - last >= 1500) {
          lastFiredRef.current[evt] = now;
          onEvent?.(evt, {
            source: "coco-ssd (lite_mobilenet_v2)",
            label: d.class,
            score: d.score ?? 0,
            bbox: d.bbox,
            frame: { w: canvas.width, h: canvas.height },
            persistedMs: persisted,
          });
        }
      }

      // reset persistence for classes not present
      for (const key of Object.values(CLASS_TO_EVENT)) {
        if (!presentThisFrame.has(key)) delete firstAboveRef.current[key];
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

type DetectedObject = {
  bbox: [number, number, number, number];
  class: string;
  score?: number;
};
