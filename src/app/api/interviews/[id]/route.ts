import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();

  let doc;
  try {
    doc = await db.collection("interviews").findOne({ _id: new ObjectId(id) });
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(doc);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const db = await getDb();
  try {
    await db.collection("interviews").updateOne({ _id: new ObjectId(id) }, { $set: patch });
  } catch {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
