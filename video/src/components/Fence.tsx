import { interpolate } from "remotion";
import { useG } from "../clock";
import { BoomGate, Picket } from "./Base";
import { C, F, quintInOut, springAt, tween } from "../theme";

export type Gate = { label: string; at: number; fail?: boolean };

type Props = {
  gates: Gate[];
  /** frame the packet leaves the agent */
  departAt: number;
  /** frame the packet reaches the exit after the last gate (executed path only) */
  exitAt?: number;
  width: number;
  packet?: string;
  appearAt?: number;
  postH?: number;
  padL?: number;
  padR?: number;
  /** x (inside the fence box) where the packet parks after the last gate */
  exitX?: number;
};

const POST_W = 34;

/**
 * The decision trace as a physical fence: a propose() packet rides the rail, every gate it clears
 * turns green, the gate that refuses it turns red and a hazard boom gate closes the rest of the path.
 */
export function Fence({ gates, departAt, exitAt, width, packet = "propose()", appearAt = departAt - 25, postH = 132, padL = 150, padR, exitX }: Props) {
  const frame = useG();
  const right = padR ?? (exitAt ? 340 : 90);
  const span = width - padL - right;
  const spacing = gates.length > 1 ? span / (gates.length - 1) : 0;
  const xs = gates.map((_, i) => padL + i * spacing);
  const railY = postH * 0.58;
  const failIdx = gates.findIndex((g) => g.fail);
  const failAt = failIdx >= 0 ? gates[failIdx].at : Infinity;

  // packet path: start → each gate (until the refusing one) → exit
  const stops = failIdx >= 0 ? gates.slice(0, failIdx + 1) : gates;
  const keys = [departAt, ...stops.map((g) => g.at)];
  const vals = [20, ...stops.map((_, i) => xs[i] - (failIdx === i ? 58 : 0))];
  if (exitAt && failIdx < 0) {
    keys.push(exitAt);
    vals.push(exitX ?? width - 150);
  }
  let px = vals[0];
  for (let i = 1; i < keys.length; i++) {
    if (frame >= keys[i - 1]) px = interpolate(frame, [keys[i - 1], keys[i]], [vals[i - 1], vals[i]], { easing: quintInOut, extrapolateRight: "clamp" });
  }
  // recoil when refused
  if (frame >= failAt) px -= 22 * Math.exp(-(frame - failAt) / 4) * Math.sin((frame - failAt) * 0.9);
  const blocked = frame >= failAt;
  const executed = exitAt !== undefined && frame >= exitAt;
  const packetIn = springAt(frame, departAt - 6, "snappy");
  const appear = tween(frame, [appearAt, appearAt + 18], [0, 1]);
  const railLit = Math.max(0, Math.min(px, blocked ? xs[failIdx] : width));

  return (
    <div style={{ position: "relative", width, height: postH + 92, opacity: appear }}>
      {/* rails */}
      {[postH * 0.36, postH * 0.72].map((y) => (
        <div key={y} style={{ position: "absolute", left: 0, top: y, width, height: 6, background: C.lineHi, borderRadius: 3 }} />
      ))}
      {/* path already travelled */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: railY - 3,
          width: railLit,
          height: 6,
          borderRadius: 3,
          background: blocked ? `linear-gradient(90deg, ${C.ok}, ${C.red})` : C.ok,
          boxShadow: `0 0 16px ${blocked ? "rgba(255,45,72,.5)" : "rgba(82,212,142,.45)"}`,
        }}
      />
      {/* posts */}
      {gates.map((g, i) => {
        const state = frame >= g.at ? (g.fail ? "fail" : "pass") : i > failIdx && failIdx >= 0 && frame >= failAt ? "dead" : "idle";
        const pop = springAt(frame, g.at, "snappy");
        const intro = springAt(frame, appearAt + i * 3, "soft");
        const fill = state === "pass" ? C.ok : state === "fail" ? C.red : "transparent";
        const stroke = state === "idle" ? C.dim : state === "dead" ? "rgba(134,133,124,0.45)" : undefined;
        return (
          <div key={g.label} style={{ position: "absolute", left: xs[i] - POST_W / 2, top: 0, width: POST_W, height: postH + 92 }}>
            <div style={{ transform: `translateY(${(1 - intro) * 60}px) scale(${state === "idle" || state === "dead" ? 1 : 1 + 0.18 * (1 - pop)})`, transformOrigin: "50% 100%" }}>
              <Picket w={POST_W} h={postH} fill={fill} stroke={stroke} glow={state === "fail" ? "rgba(255,45,72,.9)" : state === "pass" ? "rgba(82,212,142,.35)" : undefined} />
            </div>
            <div
              style={{
                position: "absolute",
                top: postH + 22,
                left: "50%",
                transform: "translateX(-50%)",
                whiteSpace: "nowrap",
                font: `${state === "fail" ? 800 : 600} 28px ${F.mono}`,
                color: state === "fail" ? "#fff" : state === "pass" ? C.text : C.dim,
                background: state === "fail" ? C.red : "transparent",
                padding: state === "fail" ? "3px 12px" : "3px 0",
                borderRadius: 6,
                boxShadow: state === "fail" ? "0 0 22px rgba(255,45,72,.55)" : "none",
                opacity: state === "dead" ? 0.55 : 1,
              }}
            >
              {g.label}
            </div>
          </div>
        );
      })}
      {/* the gate closes the rest of the path */}
      {failIdx >= 0 && frame >= failAt - 10 && (
        <BoomGate at={failAt + 4} length={Math.max(220, width - xs[failIdx] + 10)} thickness={30} style={{ left: xs[failIdx] - 15, top: railY - 15 }} />
      )}
      {/* the packet */}
      {frame >= departAt - 6 && (
        <div
          style={{
            position: "absolute",
            left: px,
            top: railY,
            transform: `translate(-50%, -50%) scale(${packetIn})`,
            font: `700 28px ${F.mono}`,
            color: blocked ? "#fff" : executed ? C.brandInk : C.text,
            background: blocked ? C.red : executed ? C.ok : C.panelHi,
            border: `2px solid ${blocked ? C.red : executed ? C.ok : C.brand}`,
            borderRadius: 999,
            padding: "8px 18px",
            whiteSpace: "nowrap",
            boxShadow: blocked ? "0 0 30px rgba(255,45,72,.6)" : executed ? "0 0 30px rgba(82,212,142,.5)" : "0 10px 30px -10px rgba(240,185,11,.5)",
          }}
        >
          {packet}
        </div>
      )}
    </div>
  );
}
