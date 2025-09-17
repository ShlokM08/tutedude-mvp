import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { Interview } from "@/lib/types";

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<Interview>;
  if (!body.candidateName) return NextResponse.json({ error: "candidateName required" }, { status: 400 });
  const startedAt = body.startedAt ?? new Date().toISOString();

  const db = await getDb();
  const r = await db.collection("interviews").insertOne({
    candidateName: body.candidateName,
    startedAt,
  });

  return NextResponse.json({ id: r.insertedId.toString() });
}
