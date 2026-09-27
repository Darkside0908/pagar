import { useLang } from "../i18n";
import { deployment, short } from "../lib/deployment";
import { fmtBps, fmtUnits } from "../lib/format";
import type { VaultState } from "../hooks/useVaultState";
import { FreezeControl } from "./FreezeControl";

type Limit = VaultState["limits"]["bnb"];

function LimitLine({ sym, lim }: { sym: string; lim: Limit }) {
  const { t } = useLang();
  const pct = lim.dailyCap > 0n ? Number((lim.remaining * 1000n) / lim.dailyCap) / 10 : 0;
  return (
    <div className="limit">
      <div className="limit-top">
        <span className="sym">{sym}</span>
        <span className="lim-val">
          <b>{fmtUnits(lim.maxPerTx)}</b>/tx · <b>{fmtUnits(lim.dailyCap)}</b>/{t("perDay")}
        </span>
      </div>
      <div className="bar" role="presentation">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div className="limit-left">
        {fmtUnits(lim.remaining)} {sym} {t("leftToday")}
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`check ${ok ? "yes" : "no"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
}

function AllowRow({ name, addr, checks, bad }: { name: string; addr: string; checks: [string, boolean][]; bad?: boolean }) {
  return (
    <div className={`allow-row${bad ? " bad" : ""}`} title={addr}>
      <span className="who">
        <span className="nm">{name}</span>
        {!bad && <code>{short(addr)}</code>}
      </span>
      <span className="checks">
        {checks.map(([label, ok]) => (
          <Check key={label} ok={ok} label={label} />
        ))}
      </span>
    </div>
  );
}

export function PolicyPanel({ state, error, onChanged }: { state: VaultState | null; error: string | null; onChanged: () => void }) {
  const { t } = useLang();
  const d = deployment;

  return (
    <section className="panel policy" aria-label={t("policyTitle")}>
      <header className="panel-head">
        <div className="panel-title">
          <span className="idx">02</span>
          {t("policyTitle")}
        </div>
        {state && <span className={`state-pill ${state.frozen ? "frozen" : "active"}`}>{state.frozen ? t("frozen") : t("active")}</span>}
      </header>

      {!state ? (
        <p className="policy-loading">{error ? `RPC: ${error.slice(0, 140)}` : t("loading")}</p>
      ) : (
        <div className="policy-grid">
          <div className="pcell">
            <h3>{t("limits")}</h3>
            <LimitLine sym="BNB" lim={state.limits.bnb} />
            <LimitLine sym="mUSDT" lim={state.limits.musdt} />
            <div className="kv">
              <span>{t("maxSlippage")}</span>
              <b>{fmtBps(state.maxSlippageBps)}</b>
            </div>
          </div>

          <div className="pcell">
            <h3>{t("allowlist")}</h3>
            <AllowRow name="Alice" addr={d.alice} checks={[[t("recipient"), state.allow.alice]]} />
            <AllowRow name="Bob" addr={d.bob} checks={[[t("recipient"), state.allow.bob]]} />
            <AllowRow name="Router" addr={d.router} checks={[[t("spender"), state.allow.router]]} />
            <AllowRow
              name={short(d.bad)}
              addr={d.bad}
              bad
              checks={[
                [t("recipient"), state.allow.badRecipient],
                [t("spender"), state.allow.badSpender],
              ]}
            />
          </div>

          <div className="pcell">
            <h3>{t("vaultTitle")}</h3>
            <div className="balances">
              <span>
                <b>{fmtUnits(state.balances.bnb)}</b> BNB
              </span>
              <span>
                <b>{fmtUnits(state.balances.musdt)}</b> mUSDT
              </span>
            </div>
            <div className="earned">
              <span>{t("earned")}</span>
              <b>
                <span className="amt">{fmtUnits(state.fees.bnb)} BNB</span> · <span className="amt">{fmtUnits(state.fees.musdt)} mUSDT</span>
              </b>
              <small>{t("earnedNote")}</small>
            </div>
            <FreezeControl frozen={state.frozen} owner={state.owner} onDone={onChanged} />
          </div>
        </div>
      )}
    </section>
  );
}
