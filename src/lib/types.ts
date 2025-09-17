// src/lib/types.ts
import type { ObjectId } from "mongodb";

export type EventType =
  | "FOCUS_LOST_5S"
  | "NO_FACE_10S"
  | "MULTIPLE_FACES"
  | "PHONE_DETECTED"
  | "BOOK_DETECTED"
  | "EXTRA_DEVICE";

/** What the client sends to the API */
export interface ProctorEventInput {
  interviewId: string;        // string id from URL
  t: number;                  // ms since start
  type: EventType;
  confidence?: number;
  meta?: Record<string, any>;
  createdAt?: string;         // optional ISO on client
}

/** What we store in MongoDB */
export interface ProctorEventDB {
  _id?: ObjectId;             // Mongo will add this
  interviewId: string;        // keep as string for simplicity
  t: number;
  type: EventType;
  confidence?: number;
  meta?: Record<string, any>;
  createdAt: string;          // stored as ISO string
}

export interface Interview {
  _id?: ObjectId;
  candidateName: string;
  startedAt: string;
  endedAt?: string;
  videoUrl?: string;
  integrityScore?: number;
}
