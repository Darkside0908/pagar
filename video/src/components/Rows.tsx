import type { ReactNode } from "react";
import { useG } from "../clock";
import { Chip } from "./Base";
import { C, F, gateAngle, hazard, springAt, tween } from "../theme";

/** Video-scale copy of the dashboard's blocked feed row: drops in, flashes, barrier swings shut. */
export function BlockedRow({ at, reason, children, foot, width = 1080, reasonSize = 46 }: { at: number; reason: string; children: ReactNode; foot: string; width?: number; reasonSize?: number }) {
  const frame = useG();
  const p = springAt(frame, at, "snappy");
  const flash = frame < at ? 0 : tween(frame, [at, at + 16], [0.75, 0]);
  const barrier = gateAngle(frame, at + 6);
  return (
    <div
      style={{
        position: "relative",
        width,
        overflow: "hidden",
        borderRadius: 18,
        padding: "34px 36px 28px 48px",
        border: "2px solid rgba(255,45,72,0.6)",
        background: `linear-gradient(100deg, ${C.redMid} 0%, ${C.redDeep} 58%, #120406 100%)`,
        boxShadow: "0 30px 70px -30px rgba(255,45,72,0.7)",
        opacity: frame < at ? 0 : Math.min(1, p * 1.4),
        transform: `translateY(${(1 - p) * -40}px) scale(${0.97 + 0.03 * p})`,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 10, background: C.red, boxShadow: `0 0 26px ${C.red}` }} />
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 10,
          background: hazard(20),
          transformOrigin: "0 50%",
          transform: `rotate(${barrier}deg)`,
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Chip kind="block">Blocked</Chip>
        <span style={{ font: `800 ${reasonSize}px ${F.mono}`, fontStretch: "92%", color: C.redHi, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{reason}</span>
      </div>
      <div style={{ marginTop: 18, font: `500 40px ${F.body}`, color: C.redInk }}>{children}</div>
      <div style={{ marginTop: 14, font: `500 28px ${F.body}`, color: "rgba(255,178,190,0.8)" }}>{foot}</div>
      <div style={{ position: "absolute", inset: 0, background: C.red, opacity: flash, pointerEvents: "none" }} />
    </div>
  );
}

export function ExecutedRow({ at, children, fee, width = 1080 }: { at: number; children: ReactNode; fee?: ReactNode; width?: number }) {
  const frame = useG();
  const p = springAt(frame, at, "snappy");
  return (
    <div
      style={{
        width,
        borderRadius: 18,
        padding: "28px 36px",
        border: `2px solid rgba(82,212,142,0.28)`,
        background: C.panelHi,
        opacity: frame < at ? 0 : p,
        transform: `translateY(${(1 - p) * 24}px)`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
        <Chip kind="ok">Executed</Chip>
        <span style={{ font: `500 40px ${F.body}`, color: C.text }}>{children}</span>
      </div>
      {fee && <div style={{ marginTop: 14, font: `600 30px ${F.mono}`, color: C.brand }}>{fee}</div>}
    </div>
  );
}

/** The presenter's message, styled like the dashboard chat bubble. */
export function UserBubble({ at, children }: { at: number; children: ReactNode }) {
  const frame = useG();
  const p = springAt(frame, at, "snappy");
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, opacity: frame < at ? 0 : 1, transform: `translateY(${(1 - p) * 20}px) scale(${0.96 + 0.04 * p})`, transformOrigin: "100% 100%" }}>
      <span style={{ font: `600 26px ${F.mono}`, letterSpacing: "0.16em", color: C.muted }}>KAMU</span>
      <div style={{ background: C.text, color: C.bg, font: `500 36px ${F.body}`, padding: "18px 26px", borderRadius: "18px 18px 4px 18px", maxWidth: 840 }}>{children}</div>
    </div>
  );
}

/** A tool call the agent makes, like the dashboard's tool chips. */
export function ToolCall({ at, name, children, tone = "neutral" }: { at: number; name: string; children?: ReactNode; tone?: "neutral" | "danger" }) {
  const frame = useG();
  const p = springAt(frame, at, "snappy");
  return (
    <div
      style={{
        opacity: frame < at ? 0 : 1,
        transform: `translateX(${(1 - p) * -24}px)`,
        border: `2px solid ${tone === "danger" ? "rgba(255,45,72,0.7)" : C.lineHi}`,
        background: tone === "danger" ? "rgba(255,45,72,0.08)" : C.panel,
        borderRadius: 14,
        padding: "16px 22px",
        font: `600 30px ${F.mono}`,
        color: C.text,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "10px 16px",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: 14, height: 14, background: C.brand, transform: "rotate(45deg)", flexShrink: 0 }} />
      <span>{name}</span>
      {children && <span style={{ color: C.muted }}>·</span>}
      {children}
    </div>
  );
}
