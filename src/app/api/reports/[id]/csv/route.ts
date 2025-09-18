import { type NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";
import {
  summarizeCounts,
  computeIntegrity,
  fetchEventsByInterview,
  estimateDurationMs,
  type EventRow,
} from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InterviewDoc = {
  _id: ObjectId | string;
  candidateName?: string;
  startedAt?: string;
  endedAt?: string;
  videoUrl?: string;
  integrityScore?: number;
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

function q(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Quote if we see comma, quote, newline; double the quotes inside.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const db = await getDb();
  const col = db.collection<InterviewDoc>("interviews");

  // Accept ObjectId or string IDs (since you have both in your DB).
  const key: InterviewDoc["_id"] = ObjectId.isValid(id) ? new ObjectId(id) : id;
  const interview = await col.findOne({ _id: key });
  if (!interview) {
    return new Response("not found", { status: 404 });
  }

  // Gather data
  const events: EventRow[] = await fetchEventsByInterview(db, String(interview._id));
  const counts = summarizeCounts(events);
  const integrity = computeIntegrity(counts);
  const durationMs = estimateDurationMs(interview.startedAt, interview.endedAt, events);

  // Persist score back (handy for lists)
  await col.updateOne({ _id: interview._id }, { $set: { integrityScore: integrity.score } });

  const phoneDetected = (counts["PHONE_DETECTED"] ?? 0) > 0;
  const multipleFaces = (counts["MULTIPLE_FACES"] ?? 0) > 0;

  // Build CSV rows (with blank rows separating sections)
  const rows: (string | number)[][] = [];

  rows.push(["Section", "Field", "Value"]);
  rows.push(["Meta", "Interview ID", String(interview._id)]);
  rows.push(["Meta", "Candidate", interview.candidateName ?? ""]);
  rows.push(["Meta", "Started At", interview.startedAt ?? ""]);
  rows.push(["Meta", "Ended At", interview.endedAt ?? ""]);
  rows.push(["Meta", "Duration", msToHMS(durationMs)]);
  rows.push([]);
  rows.push(["Score", "Final Score", integrity.score]);
  rows.push(["Flags", "Phone shown", phoneDetected ? "Yes" : "No"]);
  rows.push(["Flags", "Multiple faces", multipleFaces ? "Yes" : "No"]);

  rows.push([]);
  rows.push(["Deductions", "Type", "Times", "Deduction"]);
  for (const b of integrity.breakdown) {
    rows.push(["Deductions", b.type, b.times, `-${b.deduct}`]);
  }

  rows.push([]);
  rows.push(["Event Counts", "Type", "Count"]);
  for (const [k, v] of Object.entries(counts)) {
    rows.push(["Event Counts", k, v]);
  }

  rows.push([]);
  rows.push(["Timeline (first 200)", "t (ms)", "type", "confidence"]);
  for (const e of events.slice(0, 200)) {
    rows.push(["Timeline", e.t, e.type, typeof e.confidence === "number" ? e.confidence : ""]);
  }

  // Excel-friendly: add UTF-8 BOM
  const csv =
    "\uFEFF" +
    rows.map((r) => r.map(q).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="report-${String(interview._id)}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
