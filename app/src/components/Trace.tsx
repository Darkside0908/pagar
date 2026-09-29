import type { CSSProperties } from "react";
import { useLang, type TKey } from "../i18n";
import { REASONS } from "../lib/reasons";
import type { Step } from "../lib/trace";

/** The fence a proposal walked through: one picket per policy gate, in contract order. */
export function Trace({ steps, executed }: { steps: Step[]; executed?: boolean }) {
  const { t } = useLang();
  return (
    <ol className="trace" aria-label={t("traceLabel")}>
      {steps.map((s, i) => {
        const name = t(`gate_${s.gate}` as TKey);
        const state = s.state === "fail" ? `${REASONS[s.code]} (${s.code})` : t(s.state === "pass" ? "gatePass" : "gateIdle");
        return (
          <li key={s.gate} className={`gate ${s.state}`} style={{ "--i": i } as CSSProperties} title={`${name}: ${state}`}>
            <Picket />
            <span className="gname">{name}</span>
            <span className="sr">: {state}</span>
          </li>
        );
      })}
      {executed && (
        <li className="gate end" style={{ "--i": steps.length } as CSSProperties}>
          <span className="gname">{t("gateExecute")}</span>
        </li>
      )}
    </ol>
  );
}

function Picket() {
  return (
    <svg className="picket" width="8" height="13" viewBox="0 0 8 13" aria-hidden="true">
      <path d="M0.75 4 4 0.75 7.25 4v8.25H0.75Z" />
    </svg>
  );
}
