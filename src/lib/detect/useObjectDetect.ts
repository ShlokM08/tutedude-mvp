"use client";

import { useEffect, useRef, useState } from "react";
import type * as cocoSsdNS from "@tensorflow-models/coco-ssd";

type DetEvent = "PHONE_DETECTED" | "BOOK_DETECTED" | "EXTRA_DEVICE";
type PerClassMin = Partial<Record<"phone" | "book" | "laptop" | "tv" | "keyboard" | "mouse", number>>;

type Opts = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (type: DetEvent, meta?: Record<string, unknown>) => void;
  everyNFrames?: number;
  minConfidence?: number;
  perClassMinConfidence?: PerClassMin;
  persistMs?: number;
  perClassPersistMs?: Partial<Record<keyof PerClassMin, number>>;
  cooldownMs?: number;
};

export function useObjectDetect({
  video,
  canvas,
  onEvent,
  everyNFrames = 3,
  minConfidence = 0.6,
  perClassMinConfidence = { phone: 0.45 },
  persistMs = 1000,
  perClassPersistMs = { phone: 500 },
  cooldownMs = 10_000,
}: Opts) {
  const [ready, setReady] = useState(false);
  const modelRef = useRef<cocoSsdNS.ObjectDetection | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameRef = useRef(0);

  // timers & last-seen details per class
  const seenSinceRef = useRef<Record<string, number | null>>({
    phone: null, book: null, laptop: null, tv: null, keyboard: null, mouse: null,
  });
  const lastDetRef = useRef<Record<
    string,
    { score: number; bbox: [number, number, number, number]; frameW: number; frameH: number } | null
  >>({
    phone: null, book: null, laptop: null, tv: null, keyboard: null, mouse: null,
  });
  const lastFiredRef = useRef<Record<string, number>>({
    PHONE_DETECTED: 0, BOOK_DETECTED: 0, EXTRA_DEVICE: 0,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!video || !canvas) return;

      const tf = await import("@tensorflow/tfjs");
      await import("@tensorflow/tfjs-backend-webgl");
      await tf.setBackend("webgl");
      await tf.ready();

      const cocoSsd = await import("@tensorflow-models/coco-ssd");
      const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
      if (cancelled) return;

      modelRef.current = model;
      setReady(true);

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const loop = async () => {
        const v = video, m = modelRef.current;
        if (!v || !m) return;

        if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
          canvas.width = v.videoWidth || 640;
          canvas.height = v.videoHeight || 480;
        }

        frameRef.current++;
        const runNow = frameRef.current % everyNFrames === 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (runNow) {
          const preds = await m.detect(v, 10);
          const seenThisFrame: Record<string, boolean> = {};

          for (const p of preds) {
            let label = p.class.toLowerCase();
            if (label === "cell phone") label = "phone";

            const threshold = perClassMinConfidence[label as keyof PerClassMin] ?? minConfidence;
            if (p.score < threshold) continue;

            // draw
            const [x, y, w, h] = p.bbox;
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#f6ad55";
            ctx.strokeRect(x, y, w, h);
            ctx.font = "12px sans-serif";
            ctx.fillStyle = "#f6ad55";
            ctx.fillText(`${p.class} ${(p.score * 100).toFixed(0)}%`, x + 4, y + 14);

            if (label in seenSinceRef.current) {
              seenThisFrame[label] = true;
              if (seenSinceRef.current[label] == null) seenSinceRef.current[label] = performance.now();
              // remember best (highest score) this frame for meta
              const prev = lastDetRef.current[label];
              if (!prev || p.score > prev.score) {
                lastDetRef.current[label] = {
                  score: p.score,
                  bbox: [x, y, w, h],
                  frameW: canvas.width,
                  frameH: canvas.height,
                };
              }
            }
          }

          // reset timers/details for classes not seen this frame
          for (const key of Object.keys(seenSinceRef.current)) {
            if (!seenThisFrame[key]) {
              seenSinceRef.current[key] = null;
              lastDetRef.current[key] = null;
            }
          }

          // decide events
          const now = performance.now();
          const fire = (type: DetEvent, meta?: Record<string, unknown>) => {
            const last = lastFiredRef.current[type] ?? 0;
            if (now - last > cooldownMs) {
              onEvent?.(type, {
                source: "object",
                model: "coco-ssd(lite_mobilenet_v2)",
                ...meta,
              });
              lastFiredRef.current[type] = now;
            }
          };
          const need = (k: keyof PerClassMin) => perClassPersistMs[k] ?? persistMs;

          // phone
          if (seenSinceRef.current.phone && now - (seenSinceRef.current.phone ?? now) >= need("phone")) {
            const d = lastDetRef.current.phone;
            fire("PHONE_DETECTED", d ? {
              label: "phone",
              score: d.score,
              bbox: d.bbox,             // [x,y,w,h] in pixels
              frame: { w: d.frameW, h: d.frameH },
              persistedMs: now - (seenSinceRef.current.phone ?? now),
            } : { label: "phone" });
            seenSinceRef.current.phone = now + 60_000;
          }

          // book
          if (seenSinceRef.current.book && now - (seenSinceRef.current.book ?? now) >= need("book")) {
            const d = lastDetRef.current.book;
            fire("BOOK_DETECTED", d ? {
              label: "book",
              score: d.score,
              bbox: d.bbox,
              frame: { w: d.frameW, h: d.frameH },
              persistedMs: now - (seenSinceRef.current.book ?? now),
            } : { label: "book" });
            seenSinceRef.current.book = now + 60_000;
          }

          // extras
          (["laptop", "tv", "keyboard", "mouse"] as const).forEach((n) => {
            if (seenSinceRef.current[n] && now - (seenSinceRef.current[n] ?? now) >= need(n)) {
              const d = lastDetRef.current[n];
              fire("EXTRA_DEVICE", d ? {
                label: n,
                score: d.score,
                bbox: d.bbox,
                frame: { w: d.frameW, h: d.frameH },
                persistedMs: now - (seenSinceRef.current[n] ?? now),
              } : { label: n });
              seenSinceRef.current[n] = now + 60_000;
            }
          });
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    }

    load();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      modelRef.current = null;
      setReady(false);
    };
  }, [
    video,
    canvas,
    onEvent,
    everyNFrames,
    minConfidence,
    JSON.stringify(perClassMinConfidence),
    persistMs,
    JSON.stringify(perClassPersistMs),
    cooldownMs,
  ]);

  return { ready };
}
