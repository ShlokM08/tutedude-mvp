import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import type { Interview } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Interview>;
  if (!body.candidateName) return NextResponse.json({ error: "candidateName required" }, { status: 400 });

  const db = await getDb();
  const r = await db.collection("interviews").insertOne({
    candidateName: body.candidateName,
    startedAt: new Date().toISOString(),
  });
  return NextResponse.json({ id: r.insertedId.toString() });
}
