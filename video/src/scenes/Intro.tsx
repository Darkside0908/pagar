import { AbsoluteFill, interpolate } from "remotion";
import { useG } from "../clock";
import { Bad, BoomGate, Chip, Cursor, Flash, Stage } from "../components/Base";
import { C, F, expoOut, quintInOut, shake, springAt, tween, typed } from "../theme";

// ─────────────────────────────────────────────────────────── 0:00–0:04 cold open
export function ColdOpen() {
  const g = useG();
  const reason = "RECIPIENT_NOT_ALLOWED";
  const sentence = tween(g, [84, 100], [0, 1]);
  const out = tween(g, [114, 120], [1, 0]);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Stage glow={false} />
      <AbsoluteFill style={{ transform: shake(g, [16], 20, 14) }}>
        <BoomGate at={16} length={2200} thickness={70} style={{ left: -60, top: 300 }} />
        <div style={{ position: "absolute", left: 170, top: 470 }}>
          <div style={{ transform: `scale(${springAt(g, 30)})`, transformOrigin: "0 50%", opacity: g >= 30 ? 1 : 0 }}>
            <Chip kind="block" size={40}>
              Blocked
            </Chip>
          </div>
          <div style={{ marginTop: 26, font: `800 112px ${F.mono}`, fontStretch: "90%", color: C.redHi, letterSpacing: "-0.02em", textShadow: "0 0 40px rgba(255,45,72,.45)" }}>
            {typed(reason, g, 36, 2)}
            {g >= 36 && g < 96 && <Cursor color={C.redHi} h={100} />}
          </div>
          <div style={{ marginTop: 30, font: `500 48px ${F.body}`, color: C.redInk, opacity: sentence, transform: `translateY(${(1 - sentence) * 16}px)` }}>
            Transfer 0.06999 BNB → <Bad size={48}>0xbAD6…3Ab0</Bad>
          </div>
        </div>
        <div style={{ position: "absolute", left: 170, bottom: 90, font: `500 28px ${F.mono}`, color: C.muted, opacity: tween(g, [92, 104], [0, 1]) }}>
          BSC Testnet · tx 0xfa26…9530 · ActionBlocked(reason 4)
        </div>
      </AbsoluteFill>
      <Flash at={16} peak={0.45} dur={12} />
    </AbsoluteFill>
  );
}

// ─────────────────────────────────────────────────────────── 0:04–0:10 hook
const WORDS: [string, number][] = [
  ["SIAPA", 120],
  ["YANG", 135],
  ["MAU", 150],
  ["KASIH", 165],
  ["PRIVATE KEY", 180],
  ["KE", 195],
  ["AI?", 210],
];

export function Hook() {
  const g = useG();
  const current = [...WORDS].reverse().find(([, at]) => g >= at);
  const assembled = g >= 225;
  const slideT = interpolate(g, [240, 270], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: (t) => t * t });
  const keyX = 170 + slideT * 700;
  const frozen = g >= 270;
  const answer = tween(g, [276, 290], [0, 1]);

  return (
    <AbsoluteFill>
      <Stage />
      {!assembled && current && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
          <div
            key={current[0]}
            style={{
              font: `900 ${current[0].length > 6 ? 300 : 380}px/0.85 ${F.display}`,
              letterSpacing: "0.01em",
              color: current[0] === "PRIVATE KEY" ? C.brand : C.text,
              transform: `scale(${interpolate(g - current[1], [0, 6], [1.14, 1], { extrapolateRight: "clamp", easing: expoOut })})`,
            }}
          >
            {current[0]}
          </div>
        </AbsoluteFill>
      )}
      {assembled && (
        <>
          <div style={{ position: "absolute", left: 170, top: 150, font: `900 150px/0.9 ${F.display}`, color: C.text }}>
            {["SIAPA YANG MAU KASIH", "PRIVATE KEY KE AI?"].map((line, i) => {
              const p = springAt(g, 225 + i * 4);
              return (
                <div key={line} style={{ transform: `translateX(${(1 - p) * -60}px)`, opacity: p }}>
                  {i === 1 ? (
                    <>
                      <span style={{ color: C.brand }}>PRIVATE KEY</span> KE AI?
                    </>
                  ) : (
                    line
                  )}
                </div>
              );
            })}
          </div>
          {/* the key travels toward the agent… and nobody lets it arrive */}
          <div style={{ position: "absolute", left: 170, right: 170, top: 700, height: 4, background: C.line }} />
          {g >= 240 && (
            <div
              style={{
                position: "absolute",
                left: keyX,
                top: 702,
                transform: "translateY(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "16px 26px",
                borderRadius: 999,
                background: C.panelHi,
                border: `2px solid ${frozen ? C.red : C.brand}`,
                font: `600 32px ${F.mono}`,
                color: frozen ? C.redHi : C.text,
                filter: !frozen && g > 250 ? "blur(1.2px)" : "none",
                boxShadow: frozen ? "0 0 34px rgba(255,45,72,.45)" : "0 14px 40px -16px rgba(240,185,11,.6)",
              }}
            >
              <KeyGlyph color={frozen ? C.redHi : C.brand} />
              0x4f2a9c…e81b
            </div>
          )}
          <div
            style={{
              position: "absolute",
              right: 170,
              top: 632,
              width: 330,
              height: 140,
              borderRadius: 18,
              border: `2px solid ${C.lineHi}`,
              background: C.panel,
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              padding: "0 30px",
              opacity: tween(g, [236, 248], [0, 1]),
            }}
          >
            <div style={{ font: `600 28px ${F.mono}`, letterSpacing: "0.14em", color: C.muted }}>AI AGENT</div>
            <div style={{ font: `500 40px ${F.body}`, color: C.text, marginTop: 6 }}>
              siap eksekusi
              <Cursor h={36} />
            </div>
          </div>
          <div style={{ position: "absolute", left: 170, top: 800, font: `600 54px ${F.body}`, color: C.text, opacity: answer, transform: `translateY(${(1 - answer) * 14}px)` }}>
            Nggak ada. <span style={{ color: C.muted }}>Itulah masalahnya.</span>
          </div>
        </>
      )}
    </AbsoluteFill>
  );
}

function KeyGlyph({ color }: { color: string }) {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.2" aria-hidden="true">
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="M10.7 12.3 21 2M16 7l3 3M18.5 4.5l2 2" strokeLinecap="round" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────── 0:10–0:17 problem
const LINES: [string, number, string][] = [
  ["1 PROMPT INJECTION.", 375, C.text],
  ["1 KEY BOCOR.", 405, C.text],
  ["DOMPET KOSONG.", 435, C.red],
];

export function Problem() {
  const g = useG();
  // 465 → 500: the whole scene plays backwards at ~3.2× (a tape rewind), then snaps to black.
  const rewinding = g >= 465;
  const t = rewinding ? Math.max(300, 465 - (g - 465) * 3.2) : g;
  const statUp = tween(t, [352, 368], [0, 1], quintInOut);
  const count = Math.round(tween(t, [300, 330], [0, 335000], expoOut));
  const pct = springAt(t, 330);
  const bal = t < 437 ? 0.08 : tween(t, [437, 465], [0.08, 0], quintInOut);
  const drained = t >= 440;
  const black = g >= 500;

  return (
    <AbsoluteFill>
      <Stage />
      <AbsoluteFill style={{ filter: rewinding ? "blur(1.5px) saturate(0.6)" : "none", transform: shake(g, [435], 12, 10) }}>
        {/* the trust problem, in two numbers */}
        <div style={{ position: "absolute", left: 170, top: 250 - statUp * 150, display: "flex", gap: 110, alignItems: "flex-end", transform: `scale(${1 - statUp * 0.32})`, transformOrigin: "0 0" }}>
          <div>
            <div style={{ font: `900 230px/0.82 ${F.display}`, color: C.text, fontVariantNumeric: "tabular-nums" }}>
              {count.toLocaleString("id-ID")}
              <span style={{ color: C.muted }}>+</span>
            </div>
            <div style={{ font: `500 38px ${F.body}`, color: C.muted, marginTop: 16 }}>agent ERC-8004 terdaftar di BSC</div>
          </div>
          <div style={{ opacity: t >= 330 ? 1 : 0, transform: `scale(${0.8 + 0.2 * pct})`, transformOrigin: "0 100%" }}>
            <div style={{ font: `900 200px/0.82 ${F.display}`, color: C.brand }}>~0,1%</div>
            <div style={{ font: `500 38px ${F.body}`, color: C.muted, marginTop: 16 }}>yang benar-benar hidup</div>
          </div>
        </div>
        <div style={{ position: "absolute", left: 170, bottom: 70, font: `500 28px ${F.mono}`, color: C.dim, opacity: tween(t, [345, 358], [0, 1]) }}>
          Sumber: AgentCensus · data per 24 Sep 2026
        </div>
        {/* one mistake is enough */}
        <div style={{ position: "absolute", left: 170, top: 520 }}>
          {LINES.map(([text, at, color]) => {
            const p = t >= at ? interpolate(t - at, [0, 5], [1.18, 1], { extrapolateRight: "clamp", easing: expoOut }) : 0;
            return (
              <div key={text} style={{ font: `900 104px/0.98 ${F.display}`, color, opacity: t >= at ? 1 : 0, transform: `scale(${p})`, transformOrigin: "0 50%" }}>
                {text}
              </div>
            );
          })}
        </div>
        {/* the vault without PAGAR */}
        <div
          style={{
            position: "absolute",
            right: 120,
            top: 560,
            width: 540,
            padding: "30px 36px",
            borderRadius: 20,
            border: `2px solid ${drained ? "rgba(255,45,72,.7)" : C.lineHi}`,
            background: drained ? "rgba(255,45,72,0.08)" : C.panel,
            opacity: tween(t, [372, 386], [0, 1]),
          }}
        >
          <div style={{ font: `600 28px ${F.mono}`, letterSpacing: "0.14em", color: C.muted }}>VAULT · TANPA PAGAR</div>
          <div style={{ font: `900 124px/1 ${F.display}`, color: drained ? C.red : C.text, marginTop: 10, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {bal.toFixed(5)} <span style={{ font: `700 44px ${F.mono}`, color: C.muted }}>BNB</span>
          </div>
          <div style={{ font: `500 30px ${F.body}`, color: C.redHi, opacity: drained ? 1 : 0, marginTop: 6 }}>
            → <Bad size={30}>0xbAD6…3Ab0</Bad>
          </div>
        </div>
      </AbsoluteFill>
      {rewinding && !black && <RewindMark g={g} />}
      {black && <AbsoluteFill style={{ background: C.bg }} />}
    </AbsoluteFill>
  );
}

function RewindMark({ g }: { g: number }) {
  const on = Math.floor(g / 5) % 2 === 0;
  return (
    <>
      <div style={{ position: "absolute", right: 170, top: 90, display: "flex", alignItems: "center", gap: 18, opacity: on ? 1 : 0.35 }}>
        <svg width="84" height="48" viewBox="0 0 84 48" fill={C.text} aria-hidden="true">
          <path d="M40 0 L0 24 L40 48 Z" />
          <path d="M84 0 L44 24 L84 48 Z" />
        </svg>
        <span style={{ font: `700 32px ${F.mono}`, letterSpacing: "0.16em", color: C.text }}>REWIND</span>
      </div>
      <AbsoluteFill style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(238,237,230,0.05) 0 2px, transparent 2px 7px)", mixBlendMode: "overlay" }} />
    </>
  );
}

