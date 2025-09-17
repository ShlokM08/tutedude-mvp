"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [name, setName] = useState("");
  const router = useRouter();

  async function create() {
    const r = await fetch("/api/interviews", { method: "POST", body: JSON.stringify({ candidateName: name }) });
    const { id } = await r.json();
    router.push(`/interview/${id}`);
  }
  return (
    <main style={{ padding: 24 }}>
      <h1>Start an Interview</h1>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Candidate name" />
      <button onClick={create} disabled={!name.trim()}>Create</button>
    </main>
  );
}
