// src/lib/types.ts
import type { ObjectId } from "mongodb";

export type EventType =
  | "FOCUS_LOST_5S"
  | "NO_FACE_10S"
  | "MULTIPLE_FACES"
  | "PHONE_DETECTED"
  | "BOOK_DETECTED"
  | "EXTRA_DEVICE";

/** Client → API payload */
export interface ProctorEventInput {
  interviewId: string;
  t: number;                        // ms since start
  type: EventType;
  confidence?: number;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

/** Stored in Mongo */
export interface ProctorEventDB {
  _id?: ObjectId;
  interviewId: string;
  t: number;
  type: EventType;
  confidence?: number;
  meta?: Record<string, unknown>;
  createdAt: string;
}

export interface Interview {
  _id?: ObjectId;
  candidateName: string;
  startedAt: string;
  endedAt?: string;
  videoUrl?: string;
  integrityScore?: number;
}
