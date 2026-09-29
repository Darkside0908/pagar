import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill } from "remotion";
import { useG } from "../clock";
import { C, F, gateAngle, hazard, springAt, tween } from "../theme";

/** Warm black stage: picket-line texture + two faint brand glows + vignette. Static on purpose. */
export function Stage({ glow = true }: { glow?: boolean }) {
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      {glow && (
        <AbsoluteFill
          style={{
            background:
              "radial-gradient(1100px 560px at 4% -8%, rgba(240,185,11,0.07), transparent 62%), radial-gradient(1000px 700px at 104% 108%, rgba(255,45,72,0.07), transparent 60%)",
          }}
        />
      )}
      <AbsoluteFill
        style={{ backgroundImage: "repeating-linear-gradient(90deg, rgba(238,237,230,0.03) 0 1px, transparent 1px 34px)" }}
      />
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)" }} />
    </AbsoluteFill>
  );
}

const GRAIN = Array.from({ length: 6 }, (_, seed) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='2' seed='${seed * 7 + 3}' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )}")`,
);

/** Film grain that re-seeds every 2 frames. */
export function Grain() {
  const frame = useG();
  return (
    <AbsoluteFill
      style={{ backgroundImage: GRAIN[Math.floor(frame / 2) % GRAIN.length], opacity: 0.055, mixBlendMode: "overlay", pointerEvents: "none" }}
    />
  );
}

/** One fence picket (pointed post). */
export function Picket({ w = 30, h = 110, fill = C.brand, stroke, glow }: { w?: number; h?: number; fill?: string; stroke?: string; glow?: string }) {
  const tip = w / 2;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ overflow: "visible", filter: glow ? `drop-shadow(0 0 14px ${glow})` : undefined }}>
      <path
        d={`M1 ${tip} L${w / 2} 1 L${w - 1} ${tip} V${h - 1} H1 Z`}
        fill={fill}
        stroke={stroke ?? "none"}
        strokeWidth={stroke ? 2 : 0}
        strokeDasharray={stroke ? "6 5" : undefined}
      />
    </svg>
  );
}

/** The PAGAR logo mark: four pickets rising one by one on two rails. `at` = first picket frame. */
export function LogoMark({ at, scale = 1, color = C.brand, stagger = 15 }: { at: number; scale?: number; color?: string; stagger?: number }) {
  const frame = useG();
  const posts = [0, 1, 2, 3];
  const W = 44 * scale;
  const H = 150 * scale;
  const gap = 26 * scale;
  const total = W * 4 + gap * 3;
  const rails = springAt(frame, at + stagger * 4, "snappy");
  return (
    <div style={{ position: "relative", width: total + 40 * scale, height: H }}>
      {posts.map((i) => {
        const p = springAt(frame, at + i * stagger, "heavy");
        return (
          <div key={i} style={{ position: "absolute", left: 20 * scale + i * (W + gap), bottom: 0, height: H, overflow: "hidden" }}>
            <div style={{ transform: `translateY(${(1 - p) * H * 1.05}px)` }}>
              <Picket w={W} h={H} fill={color} />
            </div>
          </div>
        );
      })}
      {[0.38, 0.72].map((y, j) => (
        <div
          key={y}
          style={{
            position: "absolute",
            top: H * y,
            left: 0,
            height: 12 * scale,
            width: total + 40 * scale,
            background: color,
            borderRadius: 3 * scale,
            transformOrigin: j === 0 ? "left center" : "right center",
            transform: `scaleX(${rails})`,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Hazard-stripe boom gate: pivots at its left end and swings from -80° to 0° with a mechanical
 * overshoot. `at` = the frame it hits the stop (the "clack").
 */
export function BoomGate({ at, length, thickness = 34, style }: { at: number; length: number; thickness?: number; style?: CSSProperties }) {
  const frame = useG();
  const angle = gateAngle(frame, at);
  return (
    <div
      style={{
        position: "absolute",
        width: length,
        height: thickness,
        background: hazard(thickness * 0.85),
        borderRadius: thickness / 2,
        transformOrigin: `${thickness / 2}px 50%`,
        transform: `rotate(${angle}deg)`,
        boxShadow: `0 0 ${frame >= at ? 34 : 0}px rgba(255,45,72,0.55), inset 0 -4px 0 rgba(0,0,0,0.18)`,
        opacity: frame < at - 5 ? 0 : 1,
        ...style,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, width: thickness, height: thickness, borderRadius: "50%", background: "#2a2b27", border: `4px solid ${C.paper}` }} />
    </div>
  );
}

/** Red flash layer that fires on impacts. */
export function Flash({ at, color = C.red, peak = 0.35, dur = 10 }: { at: number; color?: string; peak?: number; dur?: number }) {
  const frame = useG();
  const o = frame < at ? 0 : tween(frame, [at, at + dur], [peak, 0]);
  return <AbsoluteFill style={{ background: color, opacity: o, pointerEvents: "none" }} />;
}

export function Chip({ kind, children, size = 30 }: { kind: "block" | "ok" | "rev"; children: ReactNode; size?: number }) {
  const s: CSSProperties =
    kind === "block"
      ? { background: C.red, color: "#fff", boxShadow: "0 0 26px rgba(255,45,72,0.55)" }
      : kind === "ok"
        ? { color: C.ok, background: "rgba(82,212,142,0.1)", border: `2px solid rgba(82,212,142,0.4)` }
        : { color: C.steel, border: `2px dashed rgba(158,174,192,0.6)` };
  return (
    <span
      style={{
        display: "inline-block",
        font: `700 ${size}px ${F.mono}`,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        padding: `${size * 0.22}px ${size * 0.45}px`,
        borderRadius: size * 0.28,
        whiteSpace: "nowrap",
        ...s,
      }}
    >
      {children}
    </span>
  );
}

/** Attacker address mark, identical to the dashboard's. */
export function Bad({ children, size }: { children: ReactNode; size: number }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "rgba(255,45,72,0.2)",
        color: "#fff",
        border: `2px solid rgba(255,45,72,0.8)`,
        borderRadius: 8,
        padding: `0 ${size * 0.25}px`,
        font: `700 ${size * 0.86}px ${F.mono}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

/** Blinking block cursor for typewriter lines. */
export function Cursor({ color = C.text, h = 30 }: { color?: string; h?: number }) {
  const frame = useG();
  return <span style={{ display: "inline-block", width: h * 0.55, height: h, marginLeft: 4, background: color, verticalAlign: "-0.15em", opacity: Math.floor(frame / 8) % 2 ? 0 : 1 }} />;
}
