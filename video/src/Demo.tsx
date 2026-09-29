import { AbsoluteFill, Audio, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";
import { SceneClock } from "./clock";
import { Grain, Stage } from "./components/Base";
import { Pagar } from "./Pagar";
import { C, F, expoOut, quintInOut, springAt, tween } from "./theme";
import D from "./demo-marks.json";

const FILM_CUT = 1650; // the film's dead stop, right before the punchline
const TITLE = D.titleFrames;
const SEG = D.titleFrames + D.recFrames;
export const SUBMISSION_FRAMES = FILM_CUT + SEG + 150;

const m = D.marks;
const rows = D.rows;

// [start, end, eyebrow, text] in recording seconds
const CAPTIONS: [number, number, string, string][] = [
  [0.3, 4.8, "pagar-4mj.pages.dev", "Tanpa demo key: read-only. Semua bukti on-chain bisa dicek siapa saja."],
  [m.key, m.swap_click - 0.1, "Demo key", "Konsol agent dibuka. Otaknya LLM asli — tangannya cuma gas key."],
  [m.swap_click, m.moon_click - 0.1, "Beat 1 · swap", "Swap 0,01 BNB lolos semua gerbang — fee 0,00001 BNB masuk ke PAGAR."],
  [m.moon_click, rows.moon - 0.05, "Beat 2 · prompt injection", "“Cek token MOON.” Deskripsinya menyuruh agent kirim seluruh saldo ke 0xbad… Agent-nya nurut."],
  [rows.moon, m.approve_click - 0.1, "Beat 2 · ditolak", "Kontrak menolak: RECIPIENT_NOT_ALLOWED. Dana tidak bergerak, tanpa fee."],
  [m.approve_click, m.final - 0.1, "Beat 3 · approve unlimited", "“Biar hemat gas.” Ditolak: UNLIMITED_APPROVAL."],
  [m.final, 99, "Dibaca dari kontrak", "2 executed · 4 blocked. Setiap penolakan tercatat on-chain — bukan di-revert."],
];

// virtual camera: [recording second, scale, centre x, centre y] — it lands on the action as it happens
const CAMERA: [number, number, number, number][] = [
  [0, 1, 960, 540],
  [rows.swap - 0.2, 1, 960, 540],
  [rows.swap + 0.4, 1.45, 1250, 520],
  [m.moon_click - 0.3, 1.45, 1250, 520],
  [m.moon_click + 0.3, 1, 960, 540],
  [m.moon_click + 1.9, 1, 960, 540],
  [m.moon_click + 2.6, 1.6, 330, 640],
  [rows.moon - 0.5, 1.6, 330, 640],
  [rows.moon - 0.1, 1.45, 1250, 500],
  [m.approve_click - 0.4, 1.45, 1250, 500],
  [m.approve_click + 0.2, 1, 960, 540],
  [rows.approve - 0.35, 1, 960, 540],
  [rows.approve + 0.1, 1.45, 1250, 500],
  [m.final - 0.2, 1.45, 1250, 500],
  [m.final + 0.4, 1.5, 1290, 520],
  [99, 1.5, 1290, 520],
];

function camera(t: number) {
  let i = CAMERA.findIndex((k) => k[0] > t) - 1;
  if (i < 0) i = CAMERA.length - 2;
  const [t0, s0, x0, y0] = CAMERA[i];
  const [t1, s1, x1, y1] = CAMERA[i + 1];
  const p = interpolate(t, [t0, t1], [0, 1], { easing: quintInOut, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const s = s0 + (s1 - s0) * p;
  const cx = x0 + (x1 - x0) * p;
  const cy = y0 + (y1 - y0) * p;
  const tx = Math.min(0, Math.max(1920 - 1920 * s, 960 - cx * s));
  const ty = Math.min(0, Math.max(1080 - 1080 * s, 540 - cy * s));
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}

function Caption({ t }: { t: number }) {
  const cap = CAPTIONS.find(([a, b]) => t >= a && t < b);
  if (!cap) return null;
  const [a, , eyebrow, text] = cap;
  const p = tween(t * 30, [a * 30, a * 30 + 8], [0, 1], expoOut);
  return (
    <div
      style={{
        position: "absolute",
        left: 60,
        bottom: 56,
        maxWidth: 1380,
        padding: "22px 30px",
        background: "rgba(10,11,9,0.9)",
        borderLeft: `6px solid ${cap[2].includes("ditolak") || cap[2].includes("Beat 3") ? C.red : C.brand}`,
        borderRadius: 12,
        boxShadow: "0 24px 60px -20px rgba(0,0,0,.9)",
        opacity: p,
        transform: `translateY(${(1 - p) * 18}px)`,
      }}
    >
      <div style={{ font: `700 28px ${F.mono}`, letterSpacing: "0.14em", textTransform: "uppercase", color: C.brand }}>{eyebrow}</div>
      <div style={{ font: `500 40px/1.3 ${F.body}`, color: C.text, marginTop: 8 }}>{text}</div>
    </div>
  );
}

/** Title card + the real screen recording (BSC Testnet, 1× speed), with camera moves and captions. */
function DemoSegment() {
  const f = useCurrentFrame();
  const t = (f - TITLE) / 30;
  const recIn = springAt(f, TITLE - 8, "soft");
  const head = springAt(f, 4);
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {f < TITLE + 4 && (
        <AbsoluteFill>
          <SceneClock start={0}>
            <Stage />
          </SceneClock>
          <div style={{ position: "absolute", left: 170, top: 330, opacity: head, transform: `translateY(${(1 - head) * 24}px)` }}>
            <div style={{ font: `700 30px ${F.mono}`, letterSpacing: "0.16em", color: C.brand }}>DEMO LIVE · BSC TESTNET</div>
            <div style={{ font: `900 190px/0.9 ${F.display}`, color: C.text, marginTop: 18 }}>SEKARANG, LIVE.</div>
            <div style={{ font: `500 44px ${F.body}`, color: C.text2, marginTop: 26 }}>
              Dashboard asli · agent LLM asli · transaksi asli. <span style={{ color: C.text }}>Tanpa edit, kecepatan 1×.</span>
            </div>
          </div>
          <Grain />
        </AbsoluteFill>
      )}
      <Sequence from={TITLE}>
        <AbsoluteFill style={{ opacity: recIn, transform: `scale(${0.94 + 0.06 * recIn})` }}>
          <AbsoluteFill style={{ transformOrigin: "0 0", transform: camera(t) }}>
            <OffthreadVideo src={staticFile("rec/demo-rec.mp4")} muted />
          </AbsoluteFill>
          <Caption t={t} />
        </AbsoluteFill>
      </Sequence>
      <Audio src={staticFile("audio/demo.wav")} />
    </AbsoluteFill>
  );
}

/** Submission cut: film (until its dead stop) → live demo → the film's punchline and end card. */
export function Submission() {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Sequence durationInFrames={FILM_CUT}>
        <Pagar withAudio />
      </Sequence>
      <Sequence from={FILM_CUT} durationInFrames={SEG}>
        <DemoSegment />
      </Sequence>
      <Sequence from={FILM_CUT + SEG} durationInFrames={150}>
        <Sequence from={-FILM_CUT}>
          <Pagar withAudio />
        </Sequence>
      </Sequence>
    </AbsoluteFill>
  );
}
