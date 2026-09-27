import type { Address } from "viem";
import { useLang } from "../i18n";
import { sameAddress, short } from "../lib/deployment";
import { useOwnerWallet } from "../hooks/useOwnerWallet";

/** Owner-only kill switch. Frozen = every propose() reverts; withdraw still works (PRD §5.6). */
export function FreezeControl({ frozen, owner, onDone }: { frozen: boolean; owner: Address; onDone: () => void }) {
  const { t } = useLang();
  const w = useOwnerWallet(onDone);
  const busy = w.phase === "connecting" || w.phase === "confirm" || w.phase === "mining";
  const isOwner = !!w.account && sameAddress(w.account, owner);

  let control;
  if (!w.hasWallet) control = <p className="freeze-msg">{t("noWallet")}</p>;
  else if (!w.account)
    control = (
      <button type="button" className="btn ghost" onClick={w.connect} disabled={busy}>
        {t("connectOwner")}
      </button>
    );
  else if (!isOwner) control = <p className="freeze-msg warn">{t("notOwner", { addr: short(w.account) })}</p>;
  else
    control = (
      <button
        type="button"
        className={`btn ${frozen ? "btn-unfreeze" : "btn-freeze"}`}
        disabled={busy}
        onClick={() => w.setFrozen(!frozen)}
      >
        {w.phase === "confirm" ? t("confirmInWallet") : w.phase === "mining" ? t("waitingBlock") : frozen ? t("unfreeze") : t("freeze")}
      </button>
    );

  return (
    <div className="freeze">
      {control}
      {w.error && <p className="freeze-msg err">{w.error}</p>}
      <p className="note">{t("ownerNote")}</p>
    </div>
  );
}
