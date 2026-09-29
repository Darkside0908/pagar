import { useG } from "../clock";
import { Picket } from "./Base";
import { C, F, tween } from "../theme";

/** The dashboard's top bar, so the product scenes feel like they happen inside PAGAR. */
export function Hud({ at, label }: { at: number; label?: string }) {
  const g = useG();
  const o = tween(g, [at, at + 12], [0, 1]);
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 96, display: "flex", alignItems: "center", gap: 20, padding: "0 120px", opacity: o, borderBottom: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
        {[0, 1, 2, 3].map((i) => (
          <Picket key={i} w={11} h={34} fill={C.brand} />
        ))}
      </div>
      <span style={{ font: `900 46px/1 ${F.display}`, letterSpacing: "0.07em", color: C.text }}>PAGAR</span>
      {label && (
        <span style={{ marginLeft: 30, font: `600 28px ${F.mono}`, letterSpacing: "0.16em", color: C.brand, textTransform: "uppercase" }}>{label}</span>
      )}
      <div style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderRadius: 999, border: "2px solid rgba(240,185,11,.45)", background: "rgba(240,185,11,.1)", color: C.brand, font: `600 28px ${F.body}` }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: C.brand }} />
          BSC Testnet
        </span>
        <span style={{ padding: "8px 18px", borderRadius: 999, border: `2px solid ${C.lineHi}`, color: C.text2, font: `500 28px ${F.mono}` }}>Vault 0x131C…742B</span>
      </div>
    </div>
  );
}
