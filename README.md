# Local Soundboard

Trigger sound effects from your phone onto your streaming PC — same Wi‑Fi, instant playback.

## How it works

1. Run the server on your **Streaming PC**
2. Open the site on the laptop → choose **Streaming PC** (preloads & caches every clip)
3. Open the same URL on your phone → choose **Soundboard**
4. Tap a pad on the phone → audio plays instantly on the laptop

Add more sounds anytime from the Streaming PC side (upload panel).

## Quick start

```bash
npm install
npm run generate-demos
npm start
```

Then open:

- Laptop: `http://localhost:3847`
- Phone: the LAN URL printed in the terminal (same Wi‑Fi)

## Tips for streaming

- Keep the **Streaming PC** tab open and unmuted
- Route that browser tab / system audio into OBS as needed
- Upload `mp3`, `wav`, `ogg`, `m4a`, etc. from the streamer panel
- Use **Stop all** if a long clip needs cutting

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `--watch` |
| `npm run generate-demos` | Create a few built-in demo tones |
