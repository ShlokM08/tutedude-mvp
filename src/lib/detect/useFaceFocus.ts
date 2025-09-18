import { useEffect, useRef, useState } from "react";
import type { EventType } from "@/lib/types";
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from "@mediapipe/tasks-vision";

type Props = {
  video: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  onEvent?: (t: EventType, meta?: Record<string, unknown>) => void;
};

type Status = "idle" | "focused" | "away";

/**
 * Lightweight face/focus detector using MediaPipe Tasks Vision (WebAssembly).
 * Returns a status + number of faces and draws overlays on the provided canvas.
 */
export function useFaceFocus({ video, canvas, onEvent }: Props) {
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [faces, setFaces] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function createWithFallback(): Promise<FaceLandmarker> {
      // Try local .task first, then CDN
      const fileset = await FilesetResolver.forVisionTasks(
        // This can be any base URL; using the official CDN keeps it robust
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
      );

      try {
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/models/face_landmarker.task" },
          runningMode: "VIDEO",
          numFaces: 2,
        });
      } catch {
        // Fallback to CDN model
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          },
          runningMode: "VIDEO",
          numFaces: 2,
        });
      }
    }

    (async () => {
      if (!video || !canvas) return;

      const lm = await createWithFallback();
      if (cancelled) {
        // ensure cleanup if effect already unmounted
        try {
          lm.close();
        } catch {
          /* ignore */
        }
        return;
      }
      landmarkerRef.current = lm;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const loop = () => {
        if (cancelled || !video || !canvas || !landmarkerRef.current) return;

        const now = performance.now();
        let res: FaceLandmarkerResult | undefined;

        try {
          res = landmarkerRef.current.detectForVideo(video, now);
        } catch {
          // If detect fails once (e.g., before metadata ready), skip this frame
          requestAnimationFrame(loop);
          return;
        }

        const n = res?.faceLandmarks?.length ?? 0;
        setFaces(n);

        // simple status: face present => focused; if not, idle/away
        setStatus(n > 0 ? "focused" : "idle");

        // clear & draw basic overlay (optional)
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (n > 0 && res?.faceLandmarks) {
          ctx.strokeStyle = "rgba(97,218,251,0.9)";
          ctx.lineWidth = 2;
          for (const lmks of res.faceLandmarks) {
            // draw a tiny box around nose tip-ish if available
            const p = lmks[1];
            if (p) {
              const x = p.x * canvas.width;
              const y = p.y * canvas.height;
              ctx.strokeRect(x - 8, y - 8, 16, 16);
            }
          }
        }

        requestAnimationFrame(loop);
      };

      requestAnimationFrame(loop);
    })();

    return () => {
      cancelled = true;
      const lm = landmarkerRef.current;
      landmarkerRef.current = null;
      try {
        lm?.close();
      } catch {
        /* ignore */
      }
    };
  }, [video, canvas, onEvent]);

  return { status, faces };
}
