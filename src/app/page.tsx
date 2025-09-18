"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Image from "next/image";


export default function HomePage() {
  const router = useRouter();
  const [candidateName, setCandidateName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateName: candidateName.trim() ? candidateName.trim() : null,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }
      const { id } = (await res.json()) as { id: string };
      router.push(`/interview/${id}`);
    } catch (e) {
      setErr((e as Error).message || "Failed to create interview");
    } finally {
      setLoading(false);
    }
  }

  const outer: React.CSSProperties = {
    minHeight: "100vh",
    background: "radial-gradient(1200px 600px at 70% -10%, rgba(129,61,255,0.18), transparent), #000",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    color: "#fff",
  };

  const card: React.CSSProperties = {
    width: "100%",
    maxWidth: 520,
    borderRadius: 16,
    border: "1px solid #262626",
    background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))",
    boxShadow: "0 10px 40px rgba(0,0,0,0.4)",
    padding: "28px",
    backdropFilter: "blur(6px)",
  };

  const logoWrap: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  };

  const titleRow: React.CSSProperties = {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 16,
  };

  const label: React.CSSProperties = {
    fontSize: 14,
    color: "#cfcfcf",
    display: "inline-block",
    marginBottom: 8,
  };

  const input: React.CSSProperties = {
    width: "100%",
    background: "#0f0f10",
    border: "1px solid #2c2c2c",
    color: "#fff",
    padding: "12px 14px",
    borderRadius: 10,
    outline: "none",
    fontSize: 16,
  };

  const btn: React.CSSProperties = {
    appearance: "none",
    border: "1px solid #5a4cff",
    background:
      "linear-gradient(180deg, rgba(130,115,255,0.25), rgba(130,115,255,0.15))",
    color: "#fff",
    padding: "12px 18px",
    borderRadius: 12,
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform .06s ease, filter .15s ease",
  };

  const hint: React.CSSProperties = {
    fontSize: 12,
    color: "#a7a7a7",
    marginTop: 10,
  };

  return (
    <main style={outer}>
      <section style={card}>
        {/* Logo + wordmark */}
        <div style={logoWrap}>
          <Image
  src="/tutedude_logo.png"
  alt="TuteDude logo"
  width={42}
  height={42}
  priority
  style={{
    borderRadius: 8,
    background:
      "linear-gradient(135deg, rgba(121,88,255,0.25), rgba(255,96,224,0.18))",
    padding: 6,
  }}
/>
          <div style={{ lineHeight: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 0.2 }}>TuteDude</div>
            <div style={{ fontSize: 12, color: "#bdbdbd" }}>Indias Preimer E-Learning Platform</div>
          </div>
        </div>

        <div style={titleRow}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            Start an Interview
          </h1>
        </div>

        <form onSubmit={onCreate}>
          <label htmlFor="candidate" style={label}>
            Candidate name
          </label>
          <input
            id="candidate"
            name="candidate"
            placeholder="e.g., Jane Doe"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            style={input}
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <button
              type="submit"
              style={btn}
              disabled={loading}
              onMouseDown={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(1px)";
              }}
              onMouseUp={(e) => {
                (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
              }}
            >
              {loading ? "Creating…" : "Create"}
            </button>
          </div>

          <p style={hint}>
            By continuing you consent to grant camera & microphone access for the interview.
          </p>

          {err && (
            <p style={{ color: "#ff6b6b", marginTop: 10 }}>
              {err}
            </p>
          )}
        </form>
      </section>
    </main>
  );
}
