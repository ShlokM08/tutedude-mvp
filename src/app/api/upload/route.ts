import { NextResponse, type NextRequest } from "next/server";
import { put } from "@vercel/blob";

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Missing BLOB_READ_WRITE_TOKEN" }, { status: 500 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });

  const res = await put(`videos/${Date.now()}-${file.name}`, file, { access: "public", token });
  return NextResponse.json({ url: res.url });
}
