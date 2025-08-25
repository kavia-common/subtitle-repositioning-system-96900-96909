# Subtitle Repositioning Frontend (React)

A minimal, modern UI for uploading a video and subtitle file, sending them to the backend for repositioning to avoid overlap with burnt‑in text, and downloading the result.

## Features

- Video and subtitle upload (supported subs: `.srt`, `.ass`, `.ssa`, `.vtt`)
- Submit to backend `/reposition` endpoint
- Clear status and simulated progress while waiting
- Download repositioned subtitle file
- Light/Dark theme toggle

## Getting Started

Install dependencies and run:

```
npm install
npm start
```

The app will run at http://localhost:3000

## Backend connection

By default, the app submits to `http://subtitle_backend:3001/reposition` (useful in Docker).
You can override the backend base URL via environment variable:

- Copy `.env.example` to `.env`
- Set `REACT_APP_BACKEND_URL`, e.g.:

```
REACT_APP_BACKEND_URL=http://localhost:3001
```

Restart the dev server after changing `.env`.

## Usage

1. Select a video file and a subtitle file.
2. Click "Reposition Subtitles".
3. Wait while the app shows status/progress.
4. Download the resulting subtitle file.

## Notes

- Large videos may take longer to process; keep the tab open.
- For true upload progress visualization, you may switch to XHR and a backend that reports progress; this UI currently simulates progress during upload/processing for user feedback.

