import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const db = await getDb();
  const doc = await db.collection("interviews").findOne({ _id: new ObjectId(params.id) });
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const patch = await req.json();
  const db = await getDb();
  await db.collection("interviews").updateOne({ _id: new ObjectId(params.id) }, { $set: patch });
  return NextResponse.json({ ok: true });
}
