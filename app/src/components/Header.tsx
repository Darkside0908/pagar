import { useLang } from "../i18n";
import { addressUrl, deployment, ERC8004_IDENTITY_REGISTRY, IS_TESTNET, short, txUrl } from "../lib/deployment";
import { Logo } from "./Logo";
import { MaybeLink } from "./Text";

export function Header({ feeBps }: { feeBps?: number }) {
  const { t, lang, setLang } = useLang();
  const d = deployment;
  const agentHref = d.agentRegistrationTx ? txUrl(d.agentRegistrationTx) : addressUrl(ERC8004_IDENTITY_REGISTRY);

  return (
    <header className="topbar">
      <div className="brand">
        <Logo />
        <div className="brand-text">
          <span className="wordmark">PAGAR</span>
          <span className="tagline">{t("tagline")}</span>
        </div>
      </div>

      <div className="badges">
        <span className="badge net">
          <i className="pulse" aria-hidden="true" />
          {IS_TESTNET ? "BSC Testnet" : t("local")}
        </span>
        <MaybeLink className="badge" href={addressUrl(d.vault)} title={d.vault}>
          <span className="k">Vault</span> <code>{short(d.vault)}</code>
          {IS_TESTNET && <span aria-hidden="true">↗</span>}
        </MaybeLink>
        {d.agentId !== undefined && (
          <MaybeLink className="badge" href={agentHref}>
            <span className="k">Agent #{d.agentId}</span> · ERC-8004
            {IS_TESTNET && <span aria-hidden="true">↗</span>}
          </MaybeLink>
        )}
        <span className="badge fee">{t("feeBadge", { bps: feeBps ?? "…" })}</span>
      </div>

      <div className="lang" role="group" aria-label="Language">
        {(["id", "en"] as const).map((l) => (
          <button key={l} type="button" className={lang === l ? "on" : ""} aria-pressed={lang === l} onClick={() => setLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </header>
  );
}
