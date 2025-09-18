import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/mongo";
import { ObjectId } from "mongodb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Build a flexible filter that matches either string _id or ObjectId _id
function idFilter(id: string) {
  const or: Array<Record<string, unknown>> = [{ _id: id }];
  if (ObjectId.isValid(id)) {
    or.push({ _id: new ObjectId(id) });
  }
  return { $or: or };
}

// GET /api/interviews/:id  -> returns the interview doc
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();

  const doc = await db.collection("interviews").findOne(idFilter(id));
  if (!doc) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(doc, { headers: { "Cache-Control": "no-store" } });
}

// PATCH /api/interviews/:id  -> updates allowed fields (e.g., videoUrl, endedAt, integrityScore)
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const db = await getDb();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // allow-list fields you expect to update
  const allowed = new Set(["videoUrl", "endedAt", "candidateName", "integrityScore"]);
  const $set: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (allowed.has(k)) $set[k] = v;
  }
  if (Object.keys($set).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }

  const res = await db.collection("interviews").updateOne(idFilter(id), { $set });

  // If it matched but didn't modify, that's still success (e.g., same value)
  if (res.matchedCount === 0) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, matchedCount: res.matchedCount, modifiedCount: res.modifiedCount });
}
