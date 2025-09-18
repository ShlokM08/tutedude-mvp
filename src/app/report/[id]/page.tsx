"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type EventRow = { t: number; type: string; confidence?: number };
type BreakdownRow = { type: string; times: number; deduct: number };
type Summary = {
  interview: {
    _id: string;
    candidateName?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    videoUrl?: string | null;
    integrityScore: number;
    durationMs: number;
  };
  counts: Record<string, number>;
  integrity: { score: number; breakdown: BreakdownRow[] };
  phoneDetected: boolean;
  multipleFaces: boolean;
  eventSample?: EventRow[];
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
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/reports/${id}`, { cache: "no-store" });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}${t ? ` – ${t}` : ""}`);
        }
        const j = (await r.json()) as Summary;
        if (alive) setData(j);
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const csvUrl = `/api/reports/${id}/csv`;

  const btn: React.CSSProperties = {
    background: "#222",
    border: "1px solid #555",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  };

  return (
    <main style={{ padding: 24, color: "#fff", background: "#000", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 22, marginBottom: 8 }}>Interview Integrity Report</h1>

      {loading && <p style={{ opacity: 0.85 }}>Loading…</p>}
      {error && <p style={{ color: "#ff6b6b" }}>Error: {error}</p>}

      {!loading && !error && data && (
        <>
          {/* Meta */}
          <div style={{ display: "grid", gap: 6, marginBottom: 12, opacity: 0.95 }}>
            <div>Interview: <code>{data.interview?._id ?? String(id)}</code></div>
            {data.interview?.candidateName && <div>Candidate: {data.interview.candidateName}</div>}
            {data.interview?.startedAt && <div>Started: {data.interview.startedAt}</div>}
            {data.interview?.endedAt && <div>Ended: {data.interview.endedAt}</div>}
            <div>Duration: {msToHMS(data.interview?.durationMs ?? 0)}</div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
              <a href={csvUrl} style={{ textDecoration: "none" }}>
                <button style={btn}>Download CSV</button>
              </a>
              <a href={`/interview/${id}`} style={{ textDecoration: "none" }}>
                <button style={btn}>Back to Interview</button>
              </a>
            </div>
          </div>

          {/* Score + Flags */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 14, opacity: 0.85 }}>Final Score</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{data.integrity?.score ?? 0}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: data.phoneDetected ? "#3d142a" : "#143d2a",
                  color: data.phoneDetected ? "#ff6b6b" : "#21d07a",
                }}
              >
                Phone shown: {data.phoneDetected ? "Yes" : "No"}
              </div>
              <div
                style={{
                  padding: "4px 8px",
                  borderRadius: 999,
                  background: data.multipleFaces ? "#3d142a" : "#143d2a",
                  color: data.multipleFaces ? "#ff6b6b" : "#21d07a",
                }}
              >
                Multiple faces: {data.multipleFaces ? "Yes" : "No"}
              </div>
            </div>
          </div>

          {/* Deductions */}
          {Array.isArray(data.integrity?.breakdown) && data.integrity.breakdown.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Deductions</div>
              <div style={{ borderTop: "1px solid #333" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "6px 0", opacity: 0.8 }}>
                  <div style={{ fontWeight: 700 }}>Type</div>
                  <div style={{ fontWeight: 700 }}>Count</div>
                  <div style={{ fontWeight: 700 }}>Deduction</div>
                </div>
                {data.integrity.breakdown.map((b, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", padding: "6px 0", borderTop: "1px dashed #333" }}>
                    <div>{b.type}</div>
                    <div>{b.times}</div>
                    <div>-{b.deduct}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Counts */}
          {data.counts && Object.keys(data.counts).length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>Event Counts</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, maxWidth: 560 }}>
                {Object.entries(data.counts).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px dashed #333", paddingBottom: 4 }}>
                    <span style={{ opacity: 0.85 }}>{k}</span>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Timeline (first 50)</div>
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>t = seconds since start</div>
            <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0, maxWidth: 720 }}>
              {(data.eventSample ?? []).slice(0, 50).map((e, i) => (
                <li key={i} style={{ borderTop: "1px dashed #333", padding: "6px 0" }}>
                  <span style={{ width: 64, display: "inline-block", opacity: 0.8 }}>
                    {(e.t / 1000).toFixed(1)}s
                  </span>
                  <span style={{ fontWeight: 600 }}>{e.type}</span>
                  {typeof e.confidence === "number" && (
                    <span style={{ opacity: 0.7 }}> • conf {e.confidence.toFixed(2)}</span>
                  )}
                </li>
              ))}
              {(data.eventSample ?? []).length === 0 && (
                <li style={{ opacity: 0.8 }}>No events captured.</li>
              )}
            </ul>
          </div>
        </>
      )}
    </main>
  );
}
