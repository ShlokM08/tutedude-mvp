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


## Deployment Link

Demo: https://drive.google.com/file/d/1lHTXfzQ4TG8ZrBJZxgQ3DWbeVfYzLL3k/view?usp=sharing
Website Link: https://tutedude-mvp.vercel.app/

### If using Vercel Blob, connect the integration (dashboard) or set BLOB_READ_WRITE_TOKEN for local dev.

Scripts
npm run dev      # start dev server
npm run build    # build
npm start        # run production build
