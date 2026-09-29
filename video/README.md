# PAGAR — 60-second motion film

The pitch video is code: [Remotion](https://www.remotion.dev) scenes in React, plus an original score
synthesised from the same timeline, so every gate slam lands on its sound to the frame.

- `src/timeline.json`: the single source of truth. Scene boundaries, 120 BPM beat grid, and every
  SFX cue in **global frames** (30 fps, 1800 frames).
- `src/scenes/*`: cold open → hook → problem → reveal/mechanism → two attacks → happy path → proof → end card.
  Scenes read global frames through `useG()` (`src/clock.tsx`), so the numbers in code match the timeline.
- `src/components/Fence.tsx`: the decision trace as a physical fence. A `propose()` packet rides the rail,
  passes gates in contract order (PRD §4.3), and a hazard boom gate closes the path at the gate that refuses it.
- `scripts/score.py`: numpy/scipy synthesis of the music bed and SFX from `timeline.json`, loudness-normalised
  to −14 LUFS with ffmpeg.
- Every number on screen comes from the live BSC Testnet deployment (see the repo README).

```bash
npm install
npm run score                                   # public/audio/score.wav
npx remotion studio                             # preview
npx remotion render PagarSilent out/pagar-60s-silent.mp4 --crf=16
ffmpeg -i out/pagar-60s-silent.mp4 -i public/audio/score.wav -map 0:v -map 1:a \
  -c:v copy -c:a aac -b:a 320k -movflags +faststart -shortest out/pagar-60s.mp4
node scripts/stills.mjs 100 612 1135           # style-board stills
```

Fonts: Big Shoulders, Big Shoulders Stencil, Instrument Sans, Martian Mono (Google Fonts via `@remotion/google-fonts`).
Remotion is free for individuals and small teams; see its license for company use.
