// src/app/api/reports/[id]/route.ts
import { NextResponse, type NextRequest } from "next/server";
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

// 👇 describe your collection’s _id properly (ObjectId OR string)
type InterviewDoc = {
  _id: ObjectId | string;
  candidateName?: string;
  startedAt?: string;
  endedAt?: string;
  videoUrl?: string;
  reportPdfUrl?: string;
  integrityScore?: number;
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();

  const col = db.collection<InterviewDoc>("interviews");

  // 👇 one key that is either ObjectId or string, depending on validity
  const key: InterviewDoc["_id"] = ObjectId.isValid(id) ? new ObjectId(id) : id;

  const interview = await col.findOne({ _id: key });
  if (!interview) return NextResponse.json({ error: "not found" }, { status: 404 });

  const events: EventRow[] = await fetchEventsByInterview(db, String(interview._id));
  const counts = summarizeCounts(events);
  const integrity = computeIntegrity(counts);
  const durationMs = estimateDurationMs(
    interview.startedAt,
    interview.endedAt,
    events
  );

  await col.updateOne({ _id: interview._id }, { $set: { integrityScore: integrity.score } });

  return NextResponse.json({
    interview: {
      _id: String(interview._id),
      candidateName: interview.candidateName ?? null,
      startedAt: interview.startedAt ?? null,
      endedAt: interview.endedAt ?? null,
      videoUrl: interview.videoUrl ?? null,
      integrityScore: integrity.score,
      durationMs,
    },
    counts,
    integrity,
    phoneDetected: (counts["PHONE_DETECTED"] ?? 0) > 0,
    multipleFaces: (counts["MULTIPLE_FACES"] ?? 0) > 0,
    eventSample: events.slice(0, 50),
  });
}
