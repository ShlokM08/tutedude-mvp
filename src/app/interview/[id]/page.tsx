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

  // Visible message line for success/failure details
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Keep last uploaded URL so we can retry attaching if needed
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState<string | null>(null);

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
        const resp = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interviewId, events }),
        });
        if (!resp.ok) throw new Error(`events POST ${resp.status}`);
      } catch {
        // put them back to try again later
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

  // elapsed timer while recording
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (recording) t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => { if (t) clearInterval(t); };
  }, [recording]);

  async function start() {
    setStatusMsg(null);
    setUploadedVideoUrl(null);

    const constraints: MediaStreamConstraints = {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: true,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      setStatusMsg("❌ Failed to access camera/mic. Check site permissions and Windows privacy toggles.");
      return;
    }

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try { await videoRef.current.play(); } catch {/* ignore */ }

    const mimeType = pickSupportedMime();
    if (!mimeType) {
      setStatusMsg("❌ MediaRecorder WebM not supported. Use latest Chrome/Edge.");
      return;
    }

    const rec = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];

    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    rec.onstop = async () => {
      setStatusMsg("Uploading…");
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const fd = new FormData();
        fd.append("file", new File([blob], "interview.webm"));

        // 1) Upload
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) {
          const t = await up.text().catch(() => "");
          setStatusMsg(`❌ Upload failed (${up.status}) ${t}`);
          return;
        }
        const { url } = (await up.json()) as { url: string };
        setUploadedVideoUrl(url);

        // 2) Attach to interview
        const patch = await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: url, endedAt: new Date().toISOString() }),
        });
        if (!patch.ok) {
          const t = await patch.text().catch(() => "");
          setStatusMsg(`⚠️ Upload ok, attach failed (${patch.status}) ${t}`);
          return;
        }

        setStatusMsg("✅ Upload complete and attached to the interview.");
      } catch (e) {
        const msg = (e as Error).message || "Unexpected error during upload/attach";
        setStatusMsg(`❌ ${msg}`);
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

  async function retryAttach() {
    if (!uploadedVideoUrl) return;
    setStatusMsg("Retrying attach…");
    try {
      const r = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: uploadedVideoUrl, endedAt: new Date().toISOString() }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        setStatusMsg(`❌ Attach failed (${r.status}) ${t}`);
        return;
      }
      setStatusMsg("✅ Attached successfully.");
    } catch (e) {
      const msg = (e as Error).message || "Attach failed";
      setStatusMsg(`❌ ${msg}`);
    }
  }

  // styles
  const btn: React.CSSProperties = {
    background: "#222",
    border: "1px solid #555",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
  };

  return (
    <main style={{ padding: 24, color: "#eee", background: "#000", minHeight: "100vh" }}>
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

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        {!recording ? <button style={btn} onClick={start}>Start</button> : <button style={btn} onClick={stop}>Stop</button>}
        <span style={{ minWidth: 120 }}>Elapsed: {elapsed}s</span>

        {/* simulators for quick testing */}
        <button style={btn} onClick={() => pushEvent("PHONE_DETECTED", 0.9, { note: "simulated" })}>
          Simulate Phone
        </button>
        <button style={btn} onClick={() => pushEvent("NO_FACE_10S", 1.0, { note: "simulated" })}>
          Simulate No Face
        </button>
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Open analysis page (contains CSV download) */}
        <a href={`/report/${interviewId}`} style={{ textDecoration: "none" }}>
          <button style={btn}>Open Report</button>
        </a>
        {/* Direct CSV download */}
        <a href={`/api/reports/${interviewId}/csv`} style={{ textDecoration: "none" }}>
          <button style={btn}>Download CSV</button>
        </a>
        {/* Retry attach appears only if upload succeeded but attach didn't */}
        {uploadedVideoUrl && statusMsg?.startsWith("⚠️") && (
          <button style={btn} onClick={retryAttach}>Retry Attach</button>
        )}
      </div>

      {statusMsg && (
        <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid #444", borderRadius: 8 }}>
          {statusMsg}
        </div>
      )}
    </main>
  );
}
