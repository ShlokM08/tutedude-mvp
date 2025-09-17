"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { EventType, ProctorEventInput } from "@/lib/types";

/* ---------- helpers ---------- */
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

function pickSupportedMime(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  for (const mt of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return undefined;
}

export default function InterviewPage() {
  const { id: interviewId } = useParams<{ id: string }>();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const startTsRef = useRef<number | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [camId, setCamId] = useState<string>("");
  const [micId, setMicId] = useState<string>("");

  // in-memory event buffer
  const bufferRef = useRef<ProctorEventInput[]>([]);

  // flush events every 3s
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

  function pushEvent(type: EventType, confidence?: number, meta?: Record<string, unknown>) {
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
  }

  const refreshDevices = useCallback(async () => {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const camList = list.filter((d) => d.kind === "videoinput");
      const micList = list.filter((d) => d.kind === "audioinput");
      setCams(camList);
      setMics(micList);
      if (!camId && camList[0]) setCamId(camList[0].deviceId);
      if (!micId && micList[0]) setMicId(micList[0].deviceId);
    } catch {
      // ignore
    }
  }, [camId, micId]);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener?.("devicechange", refreshDevices);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | undefined;
    if (recording) t = setInterval(() => setElapsed((p) => p + 1), 1000);
    return () => { if (t) clearInterval(t); };
  }, [recording]);

  async function start() {
    setErr(null);

    const constraints: MediaStreamConstraints = {
      video: camId ? { deviceId: { exact: camId }, width: { ideal: 1280 }, height: { ideal: 720 } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: micId ? { deviceId: { exact: micId }, echoCancellation: true, noiseSuppression: true } : true,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name ?? "Error";
      if (name === "NotAllowedError") setErr("Permission denied. Allow camera & microphone for this site.");
      else if (name === "NotFoundError") setErr("No camera/microphone found. Pick a different device from the dropdowns.");
      else if (name === "NotReadableError") setErr("Camera is busy in another app (Zoom/Teams/etc.). Close it and retry.");
      else setErr(`getUserMedia failed: ${name}`);
      return;
    }

    if (!videoRef.current) return;
    videoRef.current.srcObject = stream;
    try { await videoRef.current.play(); } catch { /* autoplay quirks */ }

    const mimeType = pickSupportedMime();
    if (!mimeType) {
      setErr("MediaRecorder WebM not supported in this browser. Use latest Chrome/Edge.");
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
      } catch (e: unknown) {
        setErr((e as Error)?.message ?? "Upload/patch failed");
      }
    };
    rec.start(1000);

    mediaRecorderRef.current = rec;
    startTsRef.current = Date.now();
    setElapsed(0);
    setRecording(true);

    // after permission, device labels populate
    refreshDevices();
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    (videoRef.current?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  }

  return (
    <main style={{ padding: 24, color: "#eee" }}>
      <h1>Interview: {String(interviewId)}</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
        <label>
          Camera:&nbsp;
          <select value={camId} onChange={(e) => setCamId(e.target.value)}>
            {cams.map((c) => (
              <option key={c.deviceId} value={c.deviceId}>
                {c.label || `Camera ${c.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mic:&nbsp;
          <select value={micId} onChange={(e) => setMicId(e.target.value)}>
            {mics.map((m) => (
              <option key={m.deviceId} value={m.deviceId}>
                {m.label || `Mic ${m.deviceId.slice(0, 6)}`}
              </option>
            ))}
          </select>
        </label>
        <button onClick={refreshDevices}>Refresh devices</button>
      </div>

      <video
        ref={videoRef}
        playsInline
        muted
        style={{ width: "100%", maxWidth: 720, background: "#000", borderRadius: 12, display: "block" }}
      />

      <div style={{ marginTop: 12, display: "flex", gap: 12, alignItems: "center" }}>
        {!recording ? <button onClick={start}>Start</button> : <button onClick={stop}>Stop</button>}
        <span>Elapsed: {elapsed}s</span>
        <button onClick={() => pushEvent("PHONE_DETECTED", 0.9, { note: "simulated" })}>Simulate Phone</button>
        <button onClick={() => pushEvent("NO_FACE_10S", 1.0, { note: "simulated" })}>Simulate No Face</button>
      </div>

      {err && <p style={{ color: "#ff6b6b", marginTop: 8 }}>{err}</p>}

      <p style={{ opacity: 0.7, marginTop: 8 }}>
        If the video stays black: ensure Chrome site permissions are <b>Allow</b>, the correct camera is selected above,
        and Windows 11 privacy toggles for Camera/Mic are <b>On</b>.
      </p>
    </main>
  );
}
