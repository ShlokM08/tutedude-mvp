# TuteDude – Proctored Interview (Focus & Object Detection)

Minimal Next.js + TypeScript app that records a webcam interview, detects focus loss & objects (phone, etc.) on-device, logs events to MongoDB, and generates a Proctoring Report (JSON + CSV).

Video files are stored in Vercel Blob (URL saved in MongoDB as videoUrl).
Events & interviews are stored in MongoDB.

Stack

Next.js (App Router), TypeScript

MediaRecorder (WebM) for recording

MediaPipe Face Landmarker (focus / no-face / optional multi-face)

TensorFlow.js COCO-SSD (phone / notes / devices)

MongoDB Atlas (interviews + events)

Vercel (hosting) + Vercel Blob (video storage)

# Quickstart
## 1) Install
npm i
or: pnpm i

## 2) Environment

Create .env.local:

MONGODB_URI=mongodb+srv://<user>:<pass>@<cluster>/<db>?retryWrites=true&w=majority

Use a Blob write token from vercel too

## 3) Model file

Download MediaPipe Face Landmarker .task file and place it at:

public/models/face_landmarker.task

## 4) Run
npm run dev
 open http://localhost:3000

# How it Works (super short)

Home → create interview → redirects to /interview/[id].

Interview → Start begins recording + on-device detections, events buffered to /api/events every ~3s.
Stop uploads video (to Vercel Blob), patches interview with videoUrl, then shows Open Report / Download CSV.

Report /report/[id] → final score (100 − deductions), flags (phone / multi-faces), event counts, timeline, CSV button.

API (summary)
Method	Path	What it returns/does
POST	/api/interviews	Create interview → { id }
PATCH	/api/interviews/[id]	Update { videoUrl?, endedAt? }
POST	/api/events	Buffer of detection events for an interview
GET	/api/reports/[id]	JSON report { interview, counts, integrity, flags, eventSample }
GET	/api/reports/[id]/csv	CSV export of the same report

Event shape

{
  interviewId: string;
  t: number;                 // ms since start
  type: string;              // e.g. NO_FACE_10S, FOCUS_LOST_5S, PHONE_DETECTED
  confidence?: number;
  meta?: Record<string, unknown>;
  createdAt: string;         // ISO
}

Detection Rules (defaults)

No face ≥ 10s → NO_FACE_10S

Focus lost (looking away) ≥ 5s → FOCUS_LOST_5S

Phone detected → PHONE_DETECTED

(Optional) more: MULTIPLE_FACES, notes/books, extra devices

Report Contents

Candidate, start/end, duration

Integrity score = 100 − total deductions

Flags: phone shown, multiple faces

Event counts, deduction breakdown

Timeline sample (first 50 events)

CSV download

Project Structure (key)
/public
  tutedude_logo.png
  /models/face_landmarker.task

/src
  /app
    page.tsx                 # Home (create interview)
    /interview/[id]/page.tsx # Interview screen
    /report/[id]/page.tsx    # Report UI
    /api
      /interviews            # POST create, PATCH update
      /events                # POST events
      /reports/[id]          # GET JSON
      /reports/[id]/csv      # GET CSV
      /upload                # Upload video (uses Vercel Blob in demo)
  /lib
    mongo.ts                 # Mongo connection
    report.ts                # scoring & summarization
    types.ts
    /detect
      useFaceFocus.ts
      useObjectDetect.ts

# Deployment Notes

## Deploy on Vercel. Use MongoDB Atlas for MONGODB_URI.

Video uploads: prefer direct-to-storage (Vercel Blob / S3). Large bodies to API routes can 413.
Keep MediaRecorder bitrate modest (e.g., 300 kbps video / 48 kbps audio) for small files.

### If using Vercel Blob, connect the integration (dashboard) or set BLOB_READ_WRITE_TOKEN for local dev.

Scripts
npm run dev      # start dev server
npm run build    # build
npm start        # run production build
