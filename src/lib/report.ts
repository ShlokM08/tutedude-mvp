// src/lib/report.ts
import type { Db } from "mongodb";

/** Minimal shape of an event row used by reports. */
export type EventRow = {
  interviewId: string;
  t: number;                           // ms since interview start
  type: string;
  confidence?: number;
  meta?: Record<string, unknown>;
  createdAt: string;
};

export type CountMap = Record<string, number>;

/** Build a { type -> count } map. */
export function summarizeCounts(events: EventRow[]): CountMap {
  const m: CountMap = {};
  for (const e of events) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
}

/** Scoring rules (deductions). Tweak as you like. */
const RULES: Record<string, { per: number; cap: number }> = {
  FOCUS_LOST_5S:   { per: 2,  cap: 20 },
  NO_FACE_10S:     { per: 5,  cap: 25 },
  MULTIPLE_FACES:  { per: 15, cap: 30 },
  PHONE_DETECTED:  { per: 10, cap: 30 },
  BOOK_DETECTED:   { per: 5,  cap: 20 },
  EXTRA_DEVICE:    { per: 5,  cap: 20 },
};

/** Compute final score + a readable breakdown. */
export function computeIntegrity(counts: CountMap) {
  let score = 100;
  const breakdown: Array<{ type: string; times: number; deduct: number }> = [];

  for (const [type, n] of Object.entries(counts)) {
    const r = RULES[type];
    if (!r) continue;
    const deduct = Math.min(r.per * n, r.cap);
    score = Math.max(0, score - deduct);
    breakdown.push({ type, times: n, deduct });
  }

  breakdown.sort((a, b) => b.deduct - a.deduct);
  return { score, breakdown };
}

/**
 * Fetch all events for an interview in time order (typed).
 * Use projection inside `find` so the generic <EventRow> is preserved
 * and we don't fall back to Mongo's `Document`.
 */
export async function fetchEventsByInterview(
  db: Db,
  interviewId: string
): Promise<EventRow[]> {
  const rows = await db
    .collection<EventRow>("events")
    .find(
      { interviewId },
      { projection: { _id: 0 }, sort: { t: 1 } } // <- keeps EventRow generic
    )
    .toArray();

  return rows; // EventRow[]
}

/** Estimate duration from interview doc or from last event. */
export function estimateDurationMs(
  startedAtIso?: string,
  endedAtIso?: string,
  events?: EventRow[]
): number {
  if (startedAtIso && endedAtIso) {
    return new Date(endedAtIso).getTime() - new Date(startedAtIso).getTime();
  }
  const lastT = events?.length ? events[events.length - 1].t : 0;
  return lastT || 0;
}
