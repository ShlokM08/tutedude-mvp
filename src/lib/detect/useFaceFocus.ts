// src/lib/detect/useFaceFocus.ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { EventType } from "@/lib/types";

type Args = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (type: EventType, meta?: Record<string, unknown>) => void;
};
type Status = "idle" | "focused" | "away" | "alert";

const WASM_BASE =
  process.env.NEXT_PUBLIC_MEDIAPIPE_WASM ??
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm";

const MODEL_LOCAL = process.env.NEXT_PUBLIC_FACE_MODEL_URL ?? "/models/face_landmarker.task";
const MODEL_CDN =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export function useFaceFocus({ video, canvas, onEvent }: Args) {
  const [status, setStatus] = useState<Status>("idle");
  const [faces, setFaces] = useState(0);

  const lmRef = useRef<any | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastDimsRef = useRef<{ w: number; h: number } | null>(null);
  const lastStatusRef = useRef<Status>("idle");

  useEffect(() => {
    let cancelled = false;

    if (!video || !canvas) return;

    (async () => {
      try {
        const vision = await import("@mediapipe/tasks-vision");
        const { FaceLandmarker, FilesetResolver } = vision;

        const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

        async function createWithFallback() {
          try {
            return await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_LOCAL },
              runningMode: "VIDEO",
              numFaces: 2,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          } catch {
            console.warn("[useFaceFocus] Local model missing, using CDN");
            return await FaceLandmarker.createFromOptions(fileset, {
              baseOptions: { modelAssetPath: MODEL_CDN },
              runningMode: "VIDEO",
              numFaces: 2,
              minFaceDetectionConfidence: 0.5,
              minFacePresenceConfidence: 0.5,
              minTrackingConfidence: 0.5,
            });
          }
        }

        const lm = await createWithFallback();

        // If the effect got cancelled during async init, just bail.
        // DO NOT call lm.close() here; some builds throw on immediate close.
        if (cancelled) return;

        lmRef.current = lm;

        const loop = () => {
          if (cancelled) return;

          const v = video;
          const c = canvas;
          const model = lmRef.current;

          if (!v || !c || !model) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }

          if (
            v.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
            v.paused ||
            v.ended ||
            v.videoWidth === 0 ||
            v.videoHeight === 0
          ) {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }

          const w = v.videoWidth;
          const h = v.videoHeight;
          const dims = lastDimsRef.current;
          if (!dims || dims.w !== w || dims.h !== h) {
            c.width = w;
            c.height = h;
            lastDimsRef.current = { w, h };
          }

          let result: any | undefined;
          try {
            result = model.detectForVideo(v, performance.now());
          } catch {
            rafRef.current = requestAnimationFrame(loop);
            return;
          }

          const n = result?.faceLandmarks?.length ?? 0;
          setFaces(n);

          const newStatus: Status = n === 0 ? "away" : n === 1 ? "focused" : "alert";
          if (newStatus !== lastStatusRef.current) {
            setStatus(newStatus);
            lastStatusRef.current = newStatus;
            if (onEvent) {
              const meta = { faces: n };
              if (newStatus === "away") onEvent("NO_FACE_10S" as EventType, meta);
              else if (newStatus === "alert") onEvent("MULTIPLE_FACES" as EventType, meta);
            }
          }

          const ctx = c.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, c.width, c.height);
            ctx.strokeStyle = "rgba(255,255,255,0.6)";
            ctx.lineWidth = 2;

            const landmarks = result?.faceLandmarks ?? [];
            for (const lm of landmarks) {
              const nose = lm[1];
              if (nose) {
                const x = nose.x * c.width;
                const y = nose.y * c.height;
                ctx.beginPath();
                ctx.moveTo(x - 6, y);
                ctx.lineTo(x + 6, y);
                ctx.moveTo(x, y - 6);
                ctx.lineTo(x, y + 6);
                ctx.stroke();
              }
            }
          }

          rafRef.current = requestAnimationFrame(loop);
        };

        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        console.error("[useFaceFocus] init failed:", e);
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try {
        lmRef.current?.close?.();
      } catch { /* ignore */ }
      lmRef.current = null;
    };
  }, [video, canvas, onEvent]);

  return { status, faces };
}
