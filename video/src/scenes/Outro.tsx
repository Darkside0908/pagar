import { AbsoluteFill, Img, staticFile } from "remotion";
import { useG } from "../clock";
import { Flash, LogoMark, Stage } from "../components/Base";
import { Hud } from "../components/Hud";
import { C, F, expoOut, quintInOut, springAt, tween } from "../theme";
import { GateWipe } from "./Reveal";

const PROOF: { at: number; mark: "code" | "ok" | "id" | "live"; title: string; ref: string }[] = [
  { at: 1560, mark: "code", title: "Kontrak verified di BscScan", ref: "0x131C…742B" },
  { at: 1575, mark: "ok", title: "45 test · fuzz 2×2.000 run", ref: "forge test — lulus" },
  { at: 1590, mark: "id", title: "ERC-8004 · Agent #2527", ref: "0x25c5…3ece" },
  { at: 1605, mark: "live", title: "Live di BSC Testnet", ref: "pagar-4mj.pages.dev" },
];

function Mark({ kind }: { kind: (typeof PROOF)[number]["mark"] }) {
  const base = { width: 18, height: 18, flexShrink: 0 } as const;
  if (kind === "code") return <span style={{ ...base, border: `3px solid ${C.brand}`, borderRadius: 3 }} />;
  if (kind === "ok") return <span style={{ ...base, background: C.ok, borderRadius: 3 }} />;
  if (kind === "id") return <span style={{ ...base, border: `3px solid ${C.steel}`, borderRadius: "50%" }} />;
  return <span style={{ ...base, background: C.red, borderRadius: 3, boxShadow: "0 0 12px rgba(255,45,72,.8)" }} />;
}

// ─────────────────────────────────────────────── 0:51–0:55 counters + proof + the real product
export function Proof() {
  const g = useG();
  const executed = g >= 1536 ? 1 : 0;
  const blocked = g >= 1550 ? 2 : g >= 1543 ? 1 : 0;
  const browser = springAt(g, 1545, "soft");
  const push = tween(g, [1545, 1650], [0.97, 1.03], quintInOut);
  return (
    <AbsoluteFill>
      <Stage />
      <Hud at={1525} label="Bukti · bukan klaim" />
      <div style={{ position: "absolute", left: 120, top: 170 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 26 }}>
          <Num value={executed} at={1536} color={C.text} />
          <span style={{ font: `700 32px ${F.mono}`, letterSpacing: "0.12em", color: C.muted }}>EXECUTED</span>
          <span style={{ width: 14, height: 14, borderRadius: "50%", background: C.dim, alignSelf: "center" }} />
          <Num value={blocked} at={1543} color={C.red} glow />
          <span style={{ font: `700 32px ${F.mono}`, letterSpacing: "0.12em", color: C.muted }}>BLOCKED</span>
        </div>
        <div style={{ font: `500 30px ${F.mono}`, color: C.dim, marginTop: 14, opacity: tween(g, [1552, 1562], [0, 1]) }}>
          dibaca langsung dari kontrak
        </div>
        <div style={{ marginTop: 44, display: "flex", flexDirection: "column", gap: 16, width: 820 }}>
          {PROOF.map((p) => {
            const s = springAt(g, p.at);
            return (
              <div
                key={p.title}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 22,
                  padding: "18px 24px",
                  borderRadius: 14,
                  border: `2px solid ${C.lineHi}`,
                  background: C.panel,
                  opacity: g >= p.at ? 1 : 0,
                  transform: `translateX(${(1 - s) * -30}px)`,
                }}
              >
                <Mark kind={p.mark} />
                <span style={{ font: `600 32px ${F.body}`, color: C.text, flex: 1, whiteSpace: "nowrap" }}>{p.title}</span>
                <span style={{ font: `500 28px ${F.mono}`, color: C.muted, whiteSpace: "nowrap" }}>{p.ref}</span>
              </div>
            );
          })}
        </div>
      </div>
      {/* the real dashboard, once, in a tilted browser frame */}
      <div style={{ position: "absolute", left: 1010, top: 200, width: 860, height: 700, perspective: 1600, opacity: browser }}>
        <div
          style={{
            width: 840,
            borderRadius: 16,
            overflow: "hidden",
            border: `2px solid ${C.lineHi}`,
            background: C.panel,
            transform: `translateX(${(1 - browser) * 120}px) rotateY(-16deg) rotateX(5deg) scale(${push})`,
            transformOrigin: "100% 50%",
            boxShadow: "0 60px 120px -40px rgba(0,0,0,.9), 0 0 0 1px rgba(255,255,255,.03)",
          }}
        >
          <div style={{ height: 56, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: C.panelHi, borderBottom: `1px solid ${C.line}` }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
              <span key={c} style={{ width: 14, height: 14, borderRadius: "50%", background: c, opacity: 0.8 }} />
            ))}
            <span style={{ marginLeft: 16, flex: 1, padding: "6px 16px", borderRadius: 8, background: C.bg, font: `500 28px ${F.mono}`, color: C.text2 }}>pagar-4mj.pages.dev</span>
          </div>
          <Img src={staticFile("img/dashboard.png")} style={{ width: 840, display: "block" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
}

function Num({ value, at, color, glow }: { value: number; at: number; color: string; glow?: boolean }) {
  const g = useG();
  const s = g >= at ? 1.3 - 0.3 * tween(g, [at, at + 8], [0, 1], expoOut) : 1;
  return (
    <span
      style={{
        display: "inline-block",
        font: `900 200px/0.8 ${F.display}`,
        color,
        fontVariantNumeric: "tabular-nums",
        transform: `scale(${s})`,
        textShadow: glow ? "0 0 40px rgba(255,45,72,.45)" : "none",
      }}
    >
      {value}
    </span>
  );
}

// ─────────────────────────────────────────────── 0:55–1:00 punchline + end card
export function End() {
  const g = useG();
  const l1 = g >= 1658 ? 1.18 - 0.18 * tween(g, [1658, 1664], [0, 1], expoOut) : 0;
  const l2 = g >= 1680 ? 1.18 - 0.18 * tween(g, [1680, 1686], [0, 1], expoOut) : 0;
  const card = g >= 1718;
  const links = tween(g, [1740, 1752], [0, 1]);
  const fade = tween(g, [1788, 1800], [1, 0]);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Stage glow={card} />
      {!card && (
        <AbsoluteFill style={{ justifyContent: "center", paddingLeft: 170 }}>
          <div style={{ font: `900 210px/0.9 ${F.display}`, color: C.text, opacity: g >= 1658 ? 1 : 0, transform: `scale(${l1})`, transformOrigin: "0 50%" }}>AI BOLEH SALAH.</div>
          <div style={{ font: `900 150px/0.95 ${F.stencil}`, color: C.brand, opacity: g >= 1680 ? 1 : 0, transform: `scale(${l2})`, transformOrigin: "0 50%", marginTop: 20 }}>
            KONTRAK NGGAK BISA
            <br />
            DIAJAK NEGO.
          </div>
        </AbsoluteFill>
      )}
      <Flash at={1658} color={C.text} peak={0.08} dur={8} />
      <Flash at={1680} color={C.brand} peak={0.1} dur={8} />
      <GateWipe at={1710} />
      {card && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 44 }}>
            <LogoMark at={1722} stagger={3} scale={1.05} />
            <div style={{ font: `900 190px/0.8 ${F.display}`, letterSpacing: "0.06em", color: C.text, opacity: tween(g, [1728, 1734], [0, 1]) }}>PAGAR</div>
          </div>
          <div style={{ marginTop: 50, font: `700 60px ${F.display}`, letterSpacing: "0.02em", textTransform: "uppercase", opacity: tween(g, [1732, 1742], [0, 1]) }}>
            <span style={{ color: C.text }}>Agent mengusulkan. </span>
            <span style={{ color: C.brand }}>Kontrak memutuskan.</span>
          </div>
          <div style={{ marginTop: 44, display: "flex", gap: 36, font: `600 34px ${F.mono}`, color: C.text, opacity: links }}>
            <span>pagar-4mj.pages.dev</span>
            <span style={{ color: C.dim }}>·</span>
            <span>github.com/Darkside0908/pagar</span>
          </div>
          <div style={{ position: "absolute", bottom: 80, textAlign: "center", opacity: links }}>
            <div style={{ font: `500 30px ${F.body}`, color: C.text2 }}>Muhammad Ghani Nurramdhan · Gempar Cahyo Nugroho</div>
            <div style={{ font: `500 28px ${F.body}`, color: C.muted, marginTop: 10 }}>Indonesia Web3 Hackathon 2026 · AI Agents × Finance &amp; Commerce · BNB Chain</div>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}
