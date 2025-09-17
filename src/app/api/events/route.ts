// src/app/api/events/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import type { ProctorEventInput, ProctorEventDB } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as { interviewId: string; events: ProctorEventInput[] };

  if (!body?.interviewId || !Array.isArray(body.events)) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();

  // Normalize incoming events -> DB shape (no string _id!)
  const docs: ProctorEventDB[] = body.events.map((e) => ({
    interviewId: body.interviewId,
    t: e.t,
    type: e.type,
    confidence: e.confidence,
    meta: e.meta,
    createdAt: e.createdAt ?? nowIso,
  }));

  const db = await getDb();
  const col = db.collection<ProctorEventDB>("events");
  await col.insertMany(docs); // OK: OptionalId<ProctorEventDB> matches (_id added by Mongo)

  return NextResponse.json({ inserted: docs.length });
}
