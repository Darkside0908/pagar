import { Easing, interpolate, random, spring } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/BigShoulders";
import { loadFont as loadStencil } from "@remotion/google-fonts/BigShouldersStencil";
import { loadFont as loadBody } from "@remotion/google-fonts/InstrumentSans";
import { loadFont as loadMono } from "@remotion/google-fonts/MartianMono";
import timeline from "./timeline.json";

// Same tokens as the dashboard (app/src/styles.css) — the film and the product are one brand.
export const C = {
  bg: "#0A0B09",
  bgRaise: "#0E0F0C",
  panel: "#131411",
  panelHi: "#1A1C17",
  line: "rgba(238,237,230,0.09)",
  lineHi: "rgba(238,237,230,0.18)",
  text: "#EFEEE7",
  text2: "#CBCAC0",
  muted: "#929186",
  dim: "#86857C",
  brand: "#F0B90B",
  brandInk: "#171100",
  red: "#FF2D48",
  redHi: "#FF6E80",
  redInk: "#FFE4E8",
  redMid: "#2E0910",
  redDeep: "#1A0508",
  ok: "#52D48E",
  steel: "#9EAEC0",
  paper: "#F5EFE6",
} as const;

export const F = {
  display: loadDisplay("normal", { weights: ["700", "800", "900"], subsets: ["latin"] }).fontFamily,
  stencil: loadStencil("normal", { weights: ["900"], subsets: ["latin"] }).fontFamily,
  body: loadBody("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily,
  mono: loadMono("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily,
};

export const FPS = timeline.fps;
export type SceneKey = keyof typeof timeline.scenes;
export const SCENES = timeline.scenes as unknown as Record<SceneKey, [number, number]>;
export const BEAT = timeline.framesPerBeat;

export const expoOut = Easing.bezier(0.16, 1, 0.3, 1);
export const quintInOut = Easing.bezier(0.83, 0, 0.17, 1);
export const backOut = Easing.bezier(0.34, 1.56, 0.64, 1);

/** Clamped interpolate with an easing — the only tween helper the scenes use. */
export function tween(frame: number, [a, b]: [number, number], [from, to]: [number, number], easing = expoOut) {
  return interpolate(frame, [a, b], [from, to], { easing, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
}

/** Spring that starts at `at`; `snappy` for UI, `heavy` for the boom gate. */
export function springAt(frame: number, at: number, kind: "snappy" | "heavy" | "soft" = "snappy") {
  const config =
    kind === "heavy"
      ? { damping: 11, stiffness: 260, mass: 1.1 }
      : kind === "soft"
        ? { damping: 20, stiffness: 120, mass: 1 }
        : { damping: 16, stiffness: 320, mass: 0.7 };
  return spring({ frame: frame - at, fps: FPS, config });
}

/**
 * Angle of a boom arm that hits its rest at frame `at` and bounces UP off it (a real gate never
 * swings through its stop). The heavy spring (ζ≈0.33) first reaches 1 about 4 frames after it starts.
 */
export function gateAngle(frame: number, at: number, from = -80) {
  const p = springAt(frame, at - 4, "heavy");
  return p <= 1 ? from * (1 - p) : from * (p - 1) * 0.55;
}

/** Camera shake after impacts: deterministic, decays over `dur` frames. */
export function shake(frame: number, impacts: number[], amp = 14, dur = 12) {
  let x = 0;
  let y = 0;
  for (const at of impacts) {
    const t = frame - at;
    if (t < 0 || t > dur) continue;
    const k = (1 - t / dur) ** 2 * amp;
    x += (random(`sx${at}-${t}`) - 0.5) * 2 * k;
    y += (random(`sy${at}-${t}`) - 0.5) * 2 * k;
  }
  return `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
}

/** Characters visible for a typewriter that starts at `at`, one char every `per` frames. */
export function typed(text: string, frame: number, at: number, per = 1) {
  if (frame < at) return "";
  return text.slice(0, Math.min(text.length, Math.floor((frame - at) / per) + 1));
}

export const hazard = (px = 28) =>
  `repeating-linear-gradient(135deg, ${C.red} 0 ${px}px, ${C.paper} ${px}px ${px * 2}px)`;
