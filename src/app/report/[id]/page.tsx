"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

/** Matches /api/reports/[id] */
type EventRow = {
  t: number;
  type: string;
  confidence?: number;
  meta?: Record<string, unknown>;
};

type BreakdownRow = {
  type: string;
  times: number;
  deduct: number;
};

type Summary = {
  interview: {
    _id: string;
    candidateName?: string | null;
    startedAt?: string | null;
    endedAt?: string | null;
    durationMs: number;
    integrityScore: number;
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
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(`/api/reports/${id}`, { cache: "no-store" });
        if (!r.ok) {
          const t = await r.text().catch(() => "");
          throw new Error(`HTTP ${r.status}${t ? ` – ${t}` : ""}`);
        }
        const j = (await r.json()) as Summary;
        if (alive) setData(j);
      } catch (e) {
        if (alive) setErr((e as Error).message);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const csvUrl = `/api/reports/${id}/csv`;

  /** ---------- styles (dark / glass) ---------- */
  const outer: React.CSSProperties = {
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

  const headerRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  };

  const btn: React.CSSProperties = {
    background: "#1b1b1e",
    border: "1px solid #3a3a3f",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const chip: React.CSSProperties = {
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
  };

  const sectionTitle: React.CSSProperties = {
    fontWeight: 700,
    marginTop: 18,
    marginBottom: 8,
  };

  const table: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    borderTop: "1px solid #2f2f33",
  };

  const th: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 6px",
    fontWeight: 700,
    borderBottom: "1px solid #2f2f33",
    color: "#d9d9d9",
  };

  const td: React.CSSProperties = {
    padding: "8px 6px",
    borderBottom: "1px dashed #2a2a2e",
    color: "#ebebeb",
  };

  return (
    <main style={outer}>
      <section style={card}>
        {/* Header */}
        <div style={headerRow}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Interview Integrity Report</h1>
            <div style={{ marginTop: 4, opacity: 0.85, fontSize: 14 }}>
              Interview: <code style={{ background: "#141415", padding: "2px 6px", borderRadius: 6, border: "1px solid #2c2c2c" }}>{String(id)}</code>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <a href={csvUrl} style={{ textDecoration: "none" }}>
              <button style={btn}>Download CSV</button>
            </a>
            <a href={`/interview/${id}`} style={{ textDecoration: "none" }}>
              <button style={btn}>Back to Interview</button>
            </a>
          </div>
        </div>

        {/* Status */}
        {loading && <p style={{ opacity: 0.85 }}>Loading…</p>}
        {err && <p style={{ color: "#ff6b6b" }}>Error: {err}</p>}

        {!loading && !err && data && (
          <>
            {/* Meta */}
            <div style={{ display: "grid", gap: 6, marginBottom: 12, opacity: 0.95 }}>
              {data.interview?.candidateName && <div>Candidate: {data.interview.candidateName}</div>}
              {data.interview?.startedAt && <div>Started: {data.interview.startedAt}</div>}
              {data.interview?.endedAt && <div>Ended: {data.interview.endedAt}</div>}
              <div>Duration: {msToHMS(data.interview?.durationMs ?? 0)}</div>
            </div>

            {/* Score & Flags */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 14, opacity: 0.85 }}>Final Score</div>
              <div style={{ fontSize: 32, fontWeight: 800 }}>{data.integrity?.score ?? 0}</div>
              <div
                style={{
                  ...chip,
                  background: data.phoneDetected ? "#3d142a" : "#143d2a",
                  color: data.phoneDetected ? "#ff6b6b" : "#21d07a",
                }}
              >
                Phone shown: {data.phoneDetected ? "Yes" : "No"}
              </div>
              <div
                style={{
                  ...chip,
                  background: data.multipleFaces ? "#3d142a" : "#143d2a",
                  color: data.multipleFaces ? "#ff6b6b" : "#21d07a",
                }}
              >
                Multiple faces: {data.multipleFaces ? "Yes" : "No"}
              </div>
            </div>

            {/* Deductions */}
            {Array.isArray(data.integrity?.breakdown) && data.integrity.breakdown.length > 0 && (
              <>
                <div style={sectionTitle}>Deductions</div>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Type</th>
                      <th style={th}>Count</th>
                      <th style={th}>Deduction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.integrity.breakdown.map((b, i) => (
                      <tr key={i}>
                        <td style={td}>{b.type}</td>
                        <td style={td}>{b.times}</td>
                        <td style={td}>-{b.deduct}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Counts */}
            {data.counts && Object.keys(data.counts).length > 0 && (
              <>
                <div style={sectionTitle}>Event Counts</div>
                <table style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Type</th>
                      <th style={th}>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(data.counts).map(([k, v]) => (
                      <tr key={k}>
                        <td style={td}>{k}</td>
                        <td style={td}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Timeline */}
            <div style={{ ...sectionTitle, marginBottom: 4 }}>Timeline (first 50)</div>
            <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 8 }}>t = seconds since start</div>
            {(data.eventSample ?? []).length === 0 ? (
              <div style={{ opacity: 0.85 }}>No events captured.</div>
            ) : (
              <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0, maxWidth: 800 }}>
                {(data.eventSample ?? []).slice(0, 50).map((e, i) => (
                  <li
                    key={i}
                    style={{
                      borderTop: "1px dashed #2a2a2e",
                      padding: "8px 0",
                      display: "flex",
                      gap: 14,
                      alignItems: "baseline",
                    }}
                  >
                    <span style={{ width: 72, display: "inline-block", opacity: 0.75 }}>
                      {(e.t / 1000).toFixed(1)}s
                    </span>
                    <span style={{ fontWeight: 700 }}>{e.type}</span>
                    {typeof e.confidence === "number" && (
                      <span style={{ opacity: 0.75 }}>• conf {e.confidence.toFixed(2)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
