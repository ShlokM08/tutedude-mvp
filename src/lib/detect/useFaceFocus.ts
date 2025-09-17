"use client";

import { useEffect, useRef, useState } from "react";
import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

export type FocusStatus = "focused" | "away" | "no-face";

type Opts = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (type: "NO_FACE_10S" | "FOCUS_LOST_5S" | "MULTIPLE_FACES", meta?: Record<string, unknown>) => void;
  // tuning
  maxFps?: number;                 // face check fps
  noFaceMs?: number;               // time before NO_FACE_10S
  awayMs?: number;                 // time before FOCUS_LOST_5S
  multiFacesCooldownMs?: number;   // debounce for MULTIPLE_FACES
};

const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

export function useFaceFocus({
  video,
  canvas,
  onEvent,
  maxFps = 24,
  noFaceMs = 10_000,
  awayMs = 5_000,
  multiFacesCooldownMs = 10_000,
}: Opts) {
  const [status, setStatus] = useState<FocusStatus>("no-face");
  const [faces, setFaces] = useState(0);

  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  // timers
  const noFaceStartRef = useRef<number | null>(null);
  const awayStartRef = useRef<number | null>(null);
  const lastMultiFaceAtRef = useRef(0);

  // helpers
  function bboxOf(pts: NormalizedLandmark[]) {
    let minX = 1, minY = 1, maxX = 0, maxY = 0;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY };
  }

  function drawBox(ctx: CanvasRenderingContext2D, w: number, h: number, b: { minX: number, minY: number, maxX: number, maxY: number }) {
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#21d07a";
    ctx.strokeRect(b.minX * w, b.minY * h, (b.maxX - b.minX) * w, (b.maxY - b.minY) * h);
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!video || !canvas) return;
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
      const lm = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL },
        runningMode: "VIDEO",
        numFaces: 2,
        outputFaceBlendshapes: true, // so we can infer yaw/pitch from blendshapes
      });
      if (cancelled) return;
      landmarkerRef.current = lm;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const loop = () => {
        const v = video;
        const lm = landmarkerRef.current;
        if (!v || !lm) return;

        const now = performance.now();
        if (now - lastTickRef.current < 1000 / maxFps) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }
        lastTickRef.current = now;

        // keep canvas sized
        if (canvas.width !== v.videoWidth || canvas.height !== v.videoHeight) {
          canvas.width = v.videoWidth || 640;
          canvas.height = v.videoHeight || 480;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const res = lm.detectForVideo(v, now);
        const n = res?.faceLandmarks?.length ?? 0;
        setFaces(n);

        // draw simple boxes
        if (n > 0 && res?.faceLandmarks) {
          for (const face of res.faceLandmarks) {
            drawBox(ctx, canvas.width, canvas.height, bboxOf(face));
          }
        }

        // logic
        if (n === 0) {
          if (noFaceStartRef.current == null) noFaceStartRef.current = now;
          if (now - (noFaceStartRef.current ?? now) >= noFaceMs) {
            setStatus("no-face");
            if (onEvent) onEvent("NO_FACE_10S");
            noFaceStartRef.current = now + 60_000; // avoid spamming: fire roughly once/min while empty
          }
          awayStartRef.current = null;
        } else {
          noFaceStartRef.current = null;

          // MULTIPLE_FACES
          if (n >= 2 && now - lastMultiFaceAtRef.current > multiFacesCooldownMs) {
            if (onEvent) onEvent("MULTIPLE_FACES", { faces: n });
            lastMultiFaceAtRef.current = now;
          }

          // "away" using blendshapes yaw/pitch (if available)
          // media pipe categories like "headYawLeft"/"headYawRight"/"headPitchUp"/"headPitchDown"
          const shapes = res?.faceBlendshapes?.[0]?.categories ?? [];
          const byName = new Map(shapes.map(c => [c.categoryName, c.score]));
          const yaw = Math.max(byName.get("headYawLeft") ?? 0, byName.get("headYawRight") ?? 0);
          const pitch = Math.max(byName.get("headPitchUp") ?? 0, byName.get("headPitchDown") ?? 0);
          const lookingAway = (yaw > 0.35) || (pitch > 0.35); // thresholds ~0..1

          if (lookingAway) {
            if (awayStartRef.current == null) awayStartRef.current = now;
            if (now - (awayStartRef.current ?? now) >= awayMs) {
              setStatus("away");
              if (onEvent) onEvent("FOCUS_LOST_5S", { yaw, pitch });
              awayStartRef.current = now + 60_000; // rate limit
            }
          } else {
            awayStartRef.current = null;
            setStatus("focused");
          }
        }

        rafRef.current = requestAnimationFrame(loop);
      };

      rafRef.current = requestAnimationFrame(loop);
    }

    load();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [video, canvas, maxFps, noFaceMs, awayMs, multiFacesCooldownMs, onEvent]);

  return { status, faces };
}
