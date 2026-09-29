import { AbsoluteFill } from "remotion";
import { useG } from "../clock";
import { BoomGate, Chip, Flash, LogoMark, Stage } from "../components/Base";
import { Fence } from "../components/Fence";
import { Hud } from "../components/Hud";
import { C, F, expoOut, quintInOut, shake, springAt, tween } from "../theme";

const TAGLINE = ["AI", "boleh", "mikir.", "Kontrak", "yang", "megang", "kunci."];

// ─────────────────────────────────────────── 0:17–0:31 reveal → mechanism (one continuous shot)
export function Reveal() {
  const g = useG();
  // 676 → 700: the brand lockup shrinks into the corner, the mechanism takes the stage
  const move = tween(g, [676, 700], [0, 1], quintInOut);
  const wordmark = springAt(g, 600, "heavy");

  return (
    <AbsoluteFill>
      <Stage />
      <AbsoluteFill style={{ transform: shake(g, [600, 902], 12, 12) }}>
        {/* brand lockup */}
        {g < 700 && (
          <div
            style={{
              position: "absolute",
              left: 960,
              top: 470,
              transform: `translate(-50%, -50%) translate(${-move * 700}px, ${-move * 380}px) scale(${1 - move * 0.75})`,
              opacity: 1 - move,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 56 }}>
              <LogoMark at={525} scale={1.45} />
              <div
                style={{
                  font: `900 250px/0.8 ${F.display}`,
                  letterSpacing: "0.06em",
                  color: C.text,
                  opacity: g >= 600 ? 1 : 0,
                  transform: `scale(${1.25 - 0.25 * wordmark})`,
                  transformOrigin: "0 100%",
                }}
              >
                PAGAR
              </div>
            </div>
            <div style={{ marginTop: 70, font: `500 52px ${F.body}`, color: C.text2, display: "flex", gap: 16 }}>
              {TAGLINE.map((w, i) => {
                const p = tween(g, [615 + i * 5, 627 + i * 5], [0, 1], expoOut);
                return (
                  <span key={i} style={{ opacity: p, transform: `translateY(${(1 - p) * 18}px)`, color: i >= 3 ? C.text : C.text2 }}>
                    {w}
                  </span>
                );
              })}
            </div>
            <div style={{ marginTop: 22, font: `500 30px ${F.mono}`, color: C.muted, opacity: tween(g, [658, 670], [0, 1]) }}>
              Vault non-custodial untuk AI agent · BNB Chain
            </div>
          </div>
        )}
        <Flash at={600} color={C.brand} peak={0.12} dur={10} />

        {g >= 690 && <Mechanism />}
      </AbsoluteFill>
      <Flash at={902} peak={0.22} dur={10} />
      <GateWipe at={918} />
    </AbsoluteFill>
  );
}

function Mechanism() {
  const g = useG();
  const head = springAt(g, 700);
  const agentIn = springAt(g, 705, "soft");
  const exits = springAt(g, 735, "soft");
  const executedLit = g >= 855 && g < 870;
  const blockedLit = g >= 906;
  const gatesLabels = ["Kontrak", "Decode", "Penerima", "Per-tx", "Harian", "Slippage"];

  return (
    <AbsoluteFill>
      <Hud at={690} />
      <div style={{ position: "absolute", left: 120, top: 150, font: `900 104px/0.92 ${F.display}`, opacity: head, transform: `translateY(${(1 - head) * 30}px)` }}>
        <div style={{ color: C.text }}>AGENT MENGUSULKAN.</div>
        <div style={{ color: C.brand }}>KONTRAK MEMUTUSKAN.</div>
      </div>

      {/* the agent: gas key only */}
      <div
        style={{
          position: "absolute",
          left: 120,
          top: 520,
          width: 300,
          padding: "26px 28px",
          borderRadius: 18,
          border: `2px solid ${C.lineHi}`,
          background: C.panel,
          opacity: agentIn,
          transform: `translateX(${(1 - agentIn) * -40}px)`,
        }}
      >
        <div style={{ font: `600 28px ${F.mono}`, letterSpacing: "0.14em", color: C.muted }}>AI AGENT</div>
        <div style={{ font: `600 38px ${F.body}`, color: C.text, marginTop: 8 }}>gas key saja</div>
        <div style={{ font: `500 28px ${F.mono}`, color: C.brand, marginTop: 8 }}>propose()</div>
      </div>

      {/* the fence: first proposal clears every gate, the second is refused at "Penerima" */}
      <div style={{ position: "absolute", left: 450, top: 500 }}>
        {g < 866 ? (
          <Fence
            width={1010}
            padL={70}
            padR={150}
            exitX={985}
            appearAt={712}
            departAt={780}
            exitAt={855}
            gates={gatesLabels.map((label, i) => ({ label, at: 792 + i * 10 }))}
          />
        ) : (
          <Fence
            width={1010}
            padL={70}
            padR={150}
            appearAt={600}
            departAt={870}
            packet="propose()"
            gates={gatesLabels.map((label, i) => ({ label, at: i < 2 ? 882 + i * 10 : i === 2 ? 898 : 99999, fail: i === 2 }))}
          />
        )}
      </div>

      {/* two exits */}
      <div style={{ position: "absolute", left: 1510, top: 400, opacity: exits, transform: `translateX(${(1 - exits) * 40}px)` }}>
        <Exit lit={executedLit} kind="ok" title="Executed" sub="fee 10 bps → PAGAR" />
      </div>
      <div style={{ position: "absolute", left: 1510, top: 700, opacity: exits, transform: `translateX(${(1 - exits) * 40}px)` }}>
        <Exit lit={blockedLit} kind="block" title="Blocked" sub={blockedLit ? "ActionBlocked(4)" : "event on-chain · 0 fee"} />
      </div>
    </AbsoluteFill>
  );
}

function Exit({ lit, kind, title, sub }: { lit: boolean; kind: "ok" | "block"; title: string; sub: string }) {
  const color = kind === "ok" ? C.ok : C.red;
  return (
    <div
      style={{
        width: 340,
        padding: "22px 24px",
        borderRadius: 18,
        border: `2px solid ${lit ? color : C.lineHi}`,
        background: lit ? (kind === "ok" ? "rgba(82,212,142,.1)" : "rgba(255,45,72,.12)") : C.panel,
        boxShadow: lit ? `0 0 40px ${kind === "ok" ? "rgba(82,212,142,.35)" : "rgba(255,45,72,.45)"}` : "none",
      }}
    >
      <Chip kind={kind} size={28}>
        {title}
      </Chip>
      <div style={{ font: `500 28px ${kind === "block" && lit ? F.mono : F.body}`, color: kind === "block" && lit ? C.redHi : C.text2, marginTop: 14, whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

/** Scene transition: a hazard boom gate slams across the frame and the stage goes dark behind it. */
export function GateWipe({ at }: { at: number }) {
  const g = useG();
  if (g < at - 10) return null;
  const dark = tween(g, [at + 2, at + 10], [0, 1]);
  const leave = tween(g, [at + 8, at + 16], [0, 1], expoOut);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ background: C.bg, opacity: dark }} />
      <div style={{ position: "absolute", inset: 0, opacity: 1 - leave, transform: `translateY(${leave * -140}px)` }}>
        <BoomGate at={at} length={2300} thickness={80} style={{ left: -60, top: 500 }} />
      </div>
    </AbsoluteFill>
  );
}
