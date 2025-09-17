import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import type { ProctorEventInput, ProctorEventDB } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { interviewId: string; events: ProctorEventInput[] };
  if (!body?.interviewId || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const nowIso = new Date().toISOString();
  const docs: ProctorEventDB[] = body.events.map((e) => ({
    interviewId: body.interviewId,
    t: e.t,
    type: e.type,
    confidence: e.confidence,
    meta: e.meta,
    createdAt: e.createdAt ?? nowIso,
  }));

  const db = await getDb();
  await db.collection<ProctorEventDB>("events").insertMany(docs);
  return NextResponse.json({ inserted: docs.length });
}
