"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { EventType, ProctorEventInput } from "@/lib/types";
import { useFaceFocus } from "@/lib/detect/useFaceFocus";
import { useObjectDetect } from "@/lib/detect/useObjectDetect";

/** --- limits & helpers --- */
const MAX_UPLOAD_BYTES = 4_000_000; // ~4MB guard to avoid Vercel 413
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

type Notice =
  | { type: "info"; text: string }
  | { type: "success"; text: string }
  | { type: "error"; text: string }
  | null;

export default function InterviewPage() {
  const { id: interviewId } = useParams<{ id: string }>();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTsRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // 👇 new: only show Report/CSV after "Stop" was pressed at least once
  const [hasStopped, setHasStopped] = useState(false);

  // small toast notice
  const [notice, setNotice] = useState<Notice>(null);

  // event buffer
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
        bufferRef.current.unshift(...events);
      }
    }, 3000);
    return () => clearInterval(iv);
  }, [interviewId]);

  // detectors
  const { status, faces } = useFaceFocus({
    video: videoRef.current,
    canvas: canvasRef.current,
    onEvent: (t, meta) => pushEvent(t, 1.0, meta),
  });
  useObjectDetect({
    video: videoRef.current,
    canvas: canvasRef.current,
    onEvent: (t, meta) => pushEvent(t, 0.9, meta),
  });

  // elapsed timer
  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (recording) t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => { if (t) clearInterval(t); };
  }, [recording]);

  async function start() {
    setNotice(null);
    setHasStopped(false); // hide actions again if user restarts

    // keep file small
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 640, max: 640 },
        height: { ideal: 360, max: 360 },
        frameRate: { ideal: 24, max: 24 },
        facingMode: "user",
      },
      audio: true,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      setNotice({ type: "error", text: "Failed to access camera/mic. Check permissions." });
      return;
    }

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try { await videoRef.current.play(); } catch {/* ignore */ }

    const mimeType = pickSupportedMime();
    if (!mimeType) {
      setNotice({ type: "error", text: "MediaRecorder WebM not supported. Use latest Chrome/Edge." });
      return;
    }

    const rec = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 300_000,
      audioBitsPerSecond: 48_000,
    });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e: BlobEvent) => { if (e.data.size > 0) chunks.push(e.data); };

    rec.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size > MAX_UPLOAD_BYTES) {
          const mb = (blob.size / (1024 * 1024)).toFixed(2);
          setNotice({ type: "error", text: `Recording too large (${mb} MB). Try shorter duration.` });
          return;
        }

        setNotice({ type: "info", text: "Uploading…" });
        const fd = new FormData();
        fd.append("file", new File([blob], "interview.webm"));

        // upload
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) {
          const t = await up.text().catch(() => "");
          setNotice({ type: "error", text: `Upload failed (${up.status}) ${t}` });
          return;
        }
        const { url } = (await up.json()) as { url: string };

        // attach to interview
        const patch = await fetch(`/api/interviews/${interviewId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: url, endedAt: new Date().toISOString() }),
        });
        if (!patch.ok) {
          const t = await patch.text().catch(() => "");
          setNotice({ type: "error", text: `Upload ok, attach failed (${patch.status}) ${t}` });
          return;
        }

        setNotice({ type: "success", text: "Upload complete and attached to the interview." });
      } catch (e) {
        setNotice({ type: "error", text: (e as Error).message || "Unexpected upload/attach error" });
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
    setHasStopped(true); // 👈 now we can reveal Report/CSV
  }

  /** ------------------- styling ------------------- */
  const outer: React.CSSProperties = {
    minHeight: "100vh",
    background:
      "radial-gradient(1200px 600px at 70% -10%, rgba(129,61,255,0.18), transparent), #000",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    color: "#fff",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 960,
    borderRadius: 16,
    border: "1px solid #262626",
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    padding: "24px",
    backdropFilter: "blur(6px)",
    position: "relative",
    overflow: "hidden",
  };

  const headerRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 12,
  };

  const btn: React.CSSProperties = {
    background: "#1b1b1e",
    border: "1px solid #3a3a3f",
    color: "#fff",
    padding: "10px 16px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const chip: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
  };

  // neat toast
  const toastBase: React.CSSProperties = {
    position: "absolute",
    left: 16,
    bottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid transparent",
    fontSize: 14,
    boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
  };
  const toastStyle =
    notice?.type === "success"
      ? { ...toastBase, background: "#0b2a1a", borderColor: "#174d31", color: "#d7ffe7" }
      : notice?.type === "error"
      ? { ...toastBase, background: "#2a0b0b", borderColor: "#4d1717", color: "#ffd7d7" }
      : { ...toastBase, background: "#0e1116", borderColor: "#262b36", color: "#e6eefc" };

  return (
    <main style={outer}>
      <section style={card}>
        {/* header with status chip */}
        <div style={headerRow}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Interview</h1>
          <div
            style={{
              ...chip,
              background: status === "focused" ? "#143d2a" : status === "away" ? "#3d2a14" : "#3d142a",
              color: status === "focused" ? "#21d07a" : status === "away" ? "#f6ad55" : "#ff6b6b",
            }}
          >
            {status} • {faces} face(s)
          </div>
        </div>

        {/* video */}
        <div style={{ position: "relative", width: "100%", borderRadius: 12, overflow: "hidden", border: "1px solid #2c2c2c", background: "#000" }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", display: "block" }} />
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
            }}
          />
        </div>

        {/* primary controls row */}
        <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 12 }}>
          {!recording ? (
            <button style={btn} onClick={start}>Start</button>
          ) : (
            <button style={btn} onClick={stop}>Stop</button>
          )}
          <span style={{ color: "#cfcfcf" }}>Elapsed: {elapsed}s</span>
        </div>

        {/* secondary actions — only after Stop */}
        {hasStopped && (
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href={`/report/${interviewId}`} style={{ textDecoration: "none" }}>
              <button style={btn}>Open Report</button>
            </a>
            <a href={`/api/reports/${interviewId}/csv`} style={{ textDecoration: "none" }}>
              <button style={btn}>Download CSV</button>
            </a>
          </div>
        )}

        {/* neat toast */}
        {notice && (
          <div style={toastStyle}>
            <span
              aria-hidden
              style={{ fontWeight: 700 }}
            >
              {notice.type === "success" ? "✓" : notice.type === "error" ? "!" : "•"}
            </span>
            <span>{notice.text}</span>
            <button
              onClick={() => setNotice(null)}
              style={{
                marginLeft: 8,
                background: "transparent",
                border: "none",
                color: "inherit",
                cursor: "pointer",
                opacity: 0.9,
              }}
              aria-label="Dismiss"
              title="Dismiss"
            >
              ×
            </button>
          </div>
        )}
      </section>

      {/* bottom-right helper — single line */}
      <aside
        style={{
          position: "fixed",
          right: 14,
          bottom: 14,
          background: "#0f0f10",
          border: "1px solid #2c2c2c",
          color: "#cfcfcf",
          borderRadius: 12,
          padding: "10px 12px",
          boxShadow: "0 8px 28px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          whiteSpace: "nowrap",
        }}
      >
        <span>Issues during the session? Mail <strong>help</strong> with ID:</span>
        <code
          style={{
            background: "#141415",
            padding: "2px 6px",
            borderRadius: 6,
            border: "1px solid #2c2c2c",
            color: "#eaeaea",
          }}
        >
          {String(interviewId)}
        </code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(String(interviewId));
              setNotice({ type: "success", text: "Interview ID copied to clipboard." });
            } catch {
              setNotice({ type: "error", text: "Could not copy Interview ID." });
            }
          }}
          style={{
            background: "#1b1b1e",
            border: "1px solid #3a3a3f",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: 8,
            cursor: "pointer",
          }}
        >
          Copy
        </button>
      </aside>
    </main>
  );
}
