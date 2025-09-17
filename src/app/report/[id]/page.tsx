"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type ReportResp = {
  interviewId: string;
  candidateName?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs: number;
  counts: Record<string, number>;
  integrity: { score: number; breakdown: { type: string; times: number; deduct: number }[] };
  phoneDetected: boolean;
  multipleFaces: boolean;
  timeline: Array<{ t: number; type: string; confidence?: number; meta?: Record<string, unknown> }>;
};

function msToHMS(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh) return `${hh}h ${mm}m ${ss}s`;
  if (mm) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReportResp | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function run() {
      try {
        setLoading(true);
        const r = await fetch(`/api/reports/${id}`, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = (await r.json()) as ReportResp;
        setData(json);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [id]);

  const scoreColor = useMemo(() => {
    const s = data?.integrity.score ?? 0;
    if (s >= 85) return "#21d07a"; // green
    if (s >= 70) return "#f6ad55"; // amber
    return "#ff6b6b";              // red
  }, [data]);

  if (loading) return <main style={{ padding: 24, color: "#eee" }}>Loading report…</main>;
  if (err || !data) return <main style={{ padding: 24, color: "#eee" }}>Error: {err ?? "no data"}</main>;

  return (
    <main style={{ padding: 24, color: "#eaeaea" }}>
      <h1 style={{ marginBottom: 4 }}>Integrity Report</h1>
      <div style={{ opacity: 0.8 }}>
        <div><b>Interview ID:</b> {data.interviewId}</div>
        {data.candidateName && <div><b>Candidate:</b> {data.candidateName}</div>}
        {data.startedAt && <div><b>Started:</b> {new Date(data.startedAt).toLocaleString()}</div>}
        {data.endedAt && <div><b>Ended:</b> {new Date(data.endedAt).toLocaleString()}</div>}
        <div><b>Duration:</b> {msToHMS(data.durationMs)}</div>
      </div>

      {/* score badge */}
      <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          width: 96, height: 96, borderRadius: "50%",
          border: `6px solid ${scoreColor}`,
          display: "grid", placeItems: "center", fontSize: 24, fontWeight: 700, color: scoreColor
        }}>
          {data.integrity.score}
        </div>
        <div style={{ opacity: 0.9 }}>
          <div><b>Final integrity score</b></div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Higher is better. Based on focus, face presence, multiple faces, and prohibited objects.
          </div>
        </div>
      </div>

      {/* key badges */}
      <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <Badge label={`Phone shown: ${data.phoneDetected ? "Yes" : "No"}`} ok={!data.phoneDetected} />
        <Badge label={`Multiple faces: ${data.multipleFaces ? "Yes" : "No"}`} ok={!data.multipleFaces} />
      </div>

      {/* counts table */}
      <section style={{ marginTop: 24 }}>
        <h3>Event counts</h3>
        <table style={{ width: "100%", maxWidth: 560, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left", opacity: 0.8 }}>
              <th style={{ padding: "8px 4px" }}>Type</th>
              <th style={{ padding: "8px 4px" }}>Count</th>
              <th style={{ padding: "8px 4px" }}>Deduction</th>
            </tr>
          </thead>
          <tbody>
            {data.integrity.breakdown.map((b) => (
              <tr key={b.type} style={{ borderTop: "1px solid #333" }}>
                <td style={{ padding: "8px 4px" }}>{b.type}</td>
                <td style={{ padding: "8px 4px" }}>{b.times}</td>
                <td style={{ padding: "8px 4px" }}>-{b.deduct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* timeline */}
      <section style={{ marginTop: 24 }}>
        <h3>Timeline</h3>
        <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>First 50 events (t = seconds since start)</div>
        <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0, maxWidth: 720 }}>
          {data.timeline.slice(0, 50).map((e, i) => (
            <li key={i} style={{ borderTop: "1px dashed #333", padding: "6px 0" }}>
              <span style={{ width: 64, display: "inline-block", opacity: 0.8 }}>{(e.t/1000).toFixed(1)}s</span>
              <span style={{ fontWeight: 600 }}>{e.type}</span>
              {typeof e.confidence === "number" && <span style={{ opacity: 0.7 }}> · conf {e.confidence.toFixed(2)}</span>}
            </li>
          ))}
        </ul>
      </section>

      {/* actions */}
      <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <a href={`/api/reports/${id}`} target="_blank" rel="noreferrer">
          <button>Download JSON</button>
        </a>
        <button onClick={() => window.print()}>Print / Save PDF</button>
      </div>
       <a href={`/api/reports/${id}`} target="_blank" rel="noreferrer">
    <button>Download JSON</button>
  </a>
  <a href={`/api/reports/${id}/pdf`} target="_blank" rel="noreferrer">
    <button>Download PDF (server)</button>
  </a>
  <button onClick={() => window.print()}>Print / Save PDF</button>
    </main>
    
  );
}

function Badge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span style={{
      padding: "6px 10px", borderRadius: 999,
      background: ok ? "#143d2a" : "#3d142a", color: ok ? "#21d07a" : "#ff6b6b",
      fontSize: 12
    }}>
      {label}
    </span>
  );
}
