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
  const [startedOnce, setStartedOnce] = useState(false); // gates post-stop actions
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [uploadOk, setUploadOk] = useState(false);

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

  // elapsed timer while recording
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (recording) t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => {
      if (t) clearInterval(t);
    };
  }, [recording]);

  async function start() {
    setErr(null);
    setUploadOk(false);
    const constraints: MediaStreamConstraints = {
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
      audio: true,
    };
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      setErr("Failed to access camera/mic. Check site permissions and Windows privacy toggles.");
      return;
    }

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try {
      await videoRef.current.play();
    } catch {}

    const mimeType = pickSupportedMime();
    if (!mimeType) {
      setErr("MediaRecorder WebM not supported. Use latest Chrome/Edge.");
      return;
    }

    const rec = new MediaRecorder(stream, { mimeType });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const fd = new FormData();
        fd.append("file", new File([blob], "interview.webm"));
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (!r.ok) {
          const txt = await r.text().catch(() => "");
          throw new Error(`Upload failed (${r.status}) ${txt}`);
        }
        const { url } = (await r.json()) as { url: string };

        const p = await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          body: JSON.stringify({ videoUrl: url, endedAt: new Date().toISOString() }),
        });
        if (!p.ok) {
          const t = await p.text().catch(() => "");
          throw new Error(`Attach failed (${p.status}) ${t}`);
        }
        setUploadOk(true);
      } catch (e) {
        setErr((e as Error).message || "Upload failed");
      }
    };
    rec.start(1000);

    mediaRecorderRef.current = rec;
    startTsRef.current = Date.now();
    setElapsed(0);
    setRecording(true);
    setStartedOnce(true);
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  /** ---------- styles (same family as the home page) ---------- */
  const page: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 70% -10%, rgba(129,61,255,0.18), transparent), #000",
    display: "grid",
    placeItems: "center",
    padding: 24,
    color: "#fff",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 1100,
    borderRadius: 16,
    border: "1px solid #262626",
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    padding: 24,
    backdropFilter: "blur(6px)",
  };

  const chip: React.CSSProperties = {
    position: "absolute",
    top: 12,
    right: 12,
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    background: status === "focused" ? "#143d2a" : status === "away" ? "#3d2a14" : "#3d142a",
    color: status === "focused" ? "#21d07a" : status === "away" ? "#f6ad55" : "#ff6b6b",
  };

  const btn: React.CSSProperties = {
    background: "#1b1b1e",
    border: "1px solid #3a3a3f",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
  };

  // --- helper strip (tight + lower so it doesn’t overlap the video) ---
  const helpWrap: React.CSSProperties = {
    position: "fixed",
    right: 16,
    bottom: 8, // closer to the edge so it clears the control bar
    zIndex: 50,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px", // tighter
    borderRadius: 10,     // tighter
    border: "1px solid #303036",
    background: "rgba(20,20,24,0.86)",
    backdropFilter: "blur(6px)",
    boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
  };
  const helpText: React.CSSProperties = { fontSize: 13, color: "#e9e9ea" };
  const helpInput: React.CSSProperties = {
    background: "#151519",
    border: "1px solid #2e2e33",
    color: "#fff",
    padding: "6px 8px",    // tighter
    borderRadius: 8,       // tighter
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 13,
    minWidth: 280,
    maxWidth: 360,         // keep compact even for long ids
  };
  const helpBtn: React.CSSProperties = {
    background: "#222227",
    border: "1px solid #3a3a3f",
    color: "#fff",
    padding: "6px 10px",   // tighter
    borderRadius: 8,       // tighter
    cursor: "pointer",
    fontSize: 13,
  };

  return (
    <main style={page}>
      <section style={card}>
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>Interview</h2>

        <div style={{ position: "relative" }}>
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: "100%",
              background: "#000",
              borderRadius: 12,
              display: "block",
            }}
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
          <div style={chip}>
            {status} • {faces} face(s)
          </div>
        </div>

        {/* Controls row */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
          }}
        >
          {!recording ? (
            <button style={btn} onClick={start}>
              Start
            </button>
          ) : (
            <button style={btn} onClick={stop}>
              Stop
            </button>
          )}
          <span style={{ minWidth: 120, opacity: 0.9 }}>Elapsed: {elapsed}s</span>
        </div>

        {/* Post-stop actions only */}
        {!recording && startedOnce && (
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href={`/report/${interviewId}`} style={{ textDecoration: "none" }}>
              <button style={btn}>Open Report</button>
            </a>
            <a href={`/api/reports/${interviewId}/csv`} style={{ textDecoration: "none" }}>
              <button style={btn}>Download CSV</button>
            </a>
          </div>
        )}

        {/* success / error notices */}
        {uploadOk && (
          <div
            style={{
              marginTop: 14,
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #284334",
              background: "rgba(26,58,41,0.45)",
              color: "#c8f3d2",
            }}
          >
            <span>✓</span> <span>Upload complete and attached to the interview.</span>
          </div>
        )}
        {err && (
          <p style={{ color: "#ff6b6b", marginTop: 12 }}>
            {err}
          </p>
        )}
      </section>

      {/* helper strip — lowered & tighter */}
      <div style={helpWrap}>
        <span style={helpText}>
          For any issues mail <strong>help</strong> with ID:
        </span>
        <input
          value={String(interviewId)}
          readOnly
          style={helpInput}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          style={helpBtn}
          onClick={() => {
            void navigator.clipboard.writeText(String(interviewId));
          }}
        >
          Copy
        </button>
      </div>
    </main>
  );
}
