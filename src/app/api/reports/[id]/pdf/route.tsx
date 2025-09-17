// src/app/api/reports/[id]/pdf/route.tsx
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
import {
  Document as PDFDocument,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function msToHMS(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (hh) return `${hh}h ${mm}m ${ss}s`;
  if (mm) return `${mm}m ${ss}s`;
  return `${ss}s`;
}

const styles = StyleSheet.create({
  page: { padding: 24, fontSize: 11, color: "#111" },
  h1: { fontSize: 18, marginBottom: 6, fontWeight: 700 },
  meta: { marginBottom: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
  pillRow: { flexDirection: "row", gap: 8, marginTop: 6, marginBottom: 6 },
  pillOk: { padding: 4, borderRadius: 8, backgroundColor: "#e8f6ef" },
  pillBad: { padding: 4, borderRadius: 8, backgroundColor: "#fde8ea" },
  scoreWrap: { marginTop: 6, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  scoreBig: { fontSize: 28, fontWeight: 700 },
  table: { marginTop: 8, borderTopWidth: 1, borderColor: "#ddd" },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#eee" },
  th: { flex: 1, fontWeight: 700, paddingVertical: 4 },
  td: { flex: 1, paddingVertical: 4 },
  mono: { fontFamily: "Helvetica" },
  timeline: { marginTop: 8 },
});

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const db = await getDb();

  const interview = await db
    .collection("interviews")
    .findOne({ _id: new ObjectId(id) });

  if (!interview) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const events: EventRow[] = await fetchEventsByInterview(db, id);
  const counts = summarizeCounts(events);
  const integrity = computeIntegrity(counts);
  const durationMs = estimateDurationMs(
    interview.startedAt as string | undefined,
    interview.endedAt as string | undefined,
    events
  );

  await db
    .collection("interviews")
    .updateOne(
      { _id: new ObjectId(id) },
      { $set: { integrityScore: integrity.score } }
    );

  const phoneDetected = (counts["PHONE_DETECTED"] ?? 0) > 0;
  const multipleFaces = (counts["MULTIPLE_FACES"] ?? 0) > 0;

  const Doc = (
    <PDFDocument>
      <Page size="A4" style={styles.page}>
        <Text style={styles.h1}>Interview Integrity Report</Text>

        <View style={styles.meta}>
          <View style={styles.row}>
            <Text>Interview ID</Text>
            <Text style={styles.mono}>{id}</Text>
          </View>
          {interview.candidateName && (
            <View style={styles.row}>
              <Text>Candidate</Text>
              <Text>{String(interview.candidateName)}</Text>
            </View>
          )}
          {interview.startedAt && (
            <View style={styles.row}>
              <Text>Started</Text>
              <Text>{String(interview.startedAt)}</Text>
            </View>
          )}
          {interview.endedAt && (
            <View style={styles.row}>
              <Text>Ended</Text>
              <Text>{String(interview.endedAt)}</Text>
            </View>
          )}
          <View style={styles.row}>
            <Text>Duration</Text>
            <Text>{msToHMS(durationMs)}</Text>
          </View>
        </View>

        <View style={styles.scoreWrap}>
          <Text>Final score:</Text>
          <Text style={styles.scoreBig}>{integrity.score}</Text>
        </View>

        <View style={styles.pillRow}>
          <View style={phoneDetected ? styles.pillBad : styles.pillOk}>
            <Text>Phone shown: {phoneDetected ? "Yes" : "No"}</Text>
          </View>
          <View style={multipleFaces ? styles.pillBad : styles.pillOk}>
            <Text>Multiple faces: {multipleFaces ? "Yes" : "No"}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.tr}>
            <Text style={styles.th}>Type</Text>
            <Text style={styles.th}>Count</Text>
            <Text style={styles.th}>Deduction</Text>
          </View>
          {integrity.breakdown.map((b) => (
            <View key={b.type} style={styles.tr}>
              <Text style={styles.td}>{b.type}</Text>
              <Text style={styles.td}>{b.times}</Text>
              <Text style={styles.td}>-{b.deduct}</Text>
            </View>
          ))}
        </View>

        <View style={styles.timeline}>
          <Text style={{ fontWeight: 700, marginBottom: 4 }}>
            Timeline (first 50)
          </Text>
          {events.slice(0, 50).map((e, i) => (
            <View key={i} style={styles.row}>
              <Text style={styles.mono}>{(e.t / 1000).toFixed(1)}s</Text>
              <Text>{e.type}</Text>
              <Text>
                {typeof e.confidence === "number"
                  ? `conf ${e.confidence.toFixed(2)}`
                  : ""}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </PDFDocument>
  );

  // Get raw bytes from react-pdf. In Node this resolves to a Buffer,
  // which is a Uint8Array subclass. We copy into a fresh Uint8Array
  // so its .buffer is an ArrayBuffer (not ArrayBufferLike), then return that.
  const raw = (await pdf(Doc).toBuffer()) as unknown as Uint8Array;
  const u8 = new Uint8Array(raw);         // ensure offset 0 / ArrayBuffer type
  const ab: ArrayBuffer = u8.buffer;      // clean ArrayBuffer for BodyInit

  return new NextResponse(ab, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="report-${id}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
