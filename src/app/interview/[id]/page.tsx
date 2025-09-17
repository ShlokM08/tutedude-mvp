"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { EventType, ProctorEventInput } from "@/lib/types";
import { useFaceFocus } from "@/lib/detect/useFaceFocus";
import { useObjectDetect } from "@/lib/detect/useObjectDetect";

/* ----- record helpers ----- */
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
function pickSupportedMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mt of MIME_CANDIDATES) if (MediaRecorder.isTypeSupported(mt)) return mt;
  return undefined;
}

export default function InterviewPage() {
  const { id: interviewId } = useParams<{ id: string }>();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTsRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  // small event buffer
  const bufferRef = useRef<ProctorEventInput[]>([]);
  const pushEvent = useCallback(
    (type: EventType, confidence?: number, meta?: Record<string, unknown>) => {
      const now = Date.now();
      const start = startTsRef.current ?? now;
      bufferRef.current.push({
        interviewId: String(interviewId),
        t: now - start,
        type,
        confidence,
        meta,
        createdAt: new Date().toISOString(),
      });
    },
    [interviewId]
  );

  // flush buffer every 3s
  useEffect(() => {
    const iv = setInterval(async () => {
      if (!bufferRef.current.length) return;
      const events = bufferRef.current.splice(0, bufferRef.current.length);
      try {
        await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId, events }),
        });
      } catch {
        bufferRef.current.unshift(...events);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [interviewId]);

  // Face/focus detector
  const { status, faces } = useFaceFocus({
    video: videoRef.current,
    canvas: canvasRef.current,
    onEvent: (t, meta) => pushEvent(t, 1.0, meta),
  });

  // Object detector (draws on same canvas layer)
  useObjectDetect({
    video: videoRef.current,
    canvas: canvasRef.current,
    onEvent: (t, meta) => pushEvent(t, 0.9, meta),
  });

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (recording) t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => { if (t) clearInterval(t); };
  }, [recording]);

  async function start() {
    setErr(null);
    const constraints: MediaStreamConstraints = {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: true,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e) {
      setErr("Failed to access camera/mic. Check site permissions and Windows privacy toggles.");
      return;
    }

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try { await videoRef.current.play(); } catch {}

    const mimeType = pickSupportedMime();
    if (!mimeType) {
      setErr("MediaRecorder WebM not supported. Use latest Chrome/Edge.");
      return;
    }

    const rec = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const fd = new FormData();
        fd.append("file", new File([blob], "interview.webm"));
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (!r.ok) throw new Error("Upload failed");
        const { url } = (await r.json()) as { url: string };
        await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          body: JSON.stringify({ videoUrl: url, endedAt: new Date().toISOString() }),
        });
        alert("Upload complete");
      } catch (e) {
        setErr("Upload/patch failed");
      }
    };
    rec.start(1000);

    mediaRecorderRef.current = rec;
    startTsRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  return (
    <main style={{ padding: 24, color: "#eee" }}>
      <h1>Interview: {String(interviewId)}</h1>

      <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
        <video
          ref={videoRef}
          playsInline
          muted
          style={{ width: "100%", background: "#000", borderRadius: 12, display: "block" }}
        />
        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            padding: "4px 10px",
            borderRadius: 999,
            fontSize: 12,
            background:
              status === "focused" ? "#143d2a" : status === "away" ? "#3d2a14" : "#3d142a",
            color: status === "focused" ? "#21d07a" : status === "away" ? "#f6ad55" : "#ff6b6b",
          }}
        >
          {status} • {faces} face(s)
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        {!recording ? <button onClick={start}>Start</button> : <button onClick={stop}>Stop</button>}
        <span>Elapsed: {elapsed}s</span>
        {/* keep simulators for quick testing */}
        <button onClick={() => pushEvent("PHONE_DETECTED", 0.9, { note: "simulated" })}>Simulate Phone</button>
        <button onClick={() => pushEvent("NO_FACE_10S", 1.0, { note: "simulated" })}>Simulate No Face</button>
      </div>

      {err && <p style={{ color: "#ff6b6b", marginTop: 8 }}>{err}</p>}
    </main>
  );
}
