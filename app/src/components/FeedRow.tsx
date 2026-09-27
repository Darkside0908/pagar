import { useLang } from "../i18n";
import { describe, feeText, touchesBad } from "../lib/actions";
import { short, txUrl } from "../lib/deployment";
import { timeAgo } from "../lib/format";
import { REASON_HINTS, type ReasonName } from "../lib/reasons";
import type { FeedRow as Row } from "../hooks/useFeed";
import { HighlightBad, MaybeLink } from "./Text";

function Meta({ row, time }: { row: Row; time?: number }) {
  const { t, lang } = useLang();
  return (
    <div className="row-meta">
      {row.pinned && <span className="pin">{t("pinned")}</span>}
      {row.nonce && <span>#{row.nonce}</span>}
      {time !== undefined && <span>{timeAgo(time, lang)}</span>}
      {row.txHash && (
        <MaybeLink className="tx" href={txUrl(row.txHash)} title={row.txHash}>
          {txUrl(row.txHash) ? "BscScan ↗" : short(row.txHash)}
        </MaybeLink>
      )}
    </div>
  );
}

// `now` is unused on purpose: it changes every few seconds so relative times re-render.
export function FeedRow({ row, time }: { row: Row; time?: number; now: number }) {
  const { t, lang } = useLang();
  const sentence = describe(row);

  if (row.status === "blocked") {
    const hint = REASON_HINTS[row.reasonName as ReasonName]?.[lang] ?? "";
    return (
      <li className={`row blocked${row.fresh ? " fresh" : ""}${touchesBad(row) ? " bad" : ""}`}>
        <span className="barrier" aria-hidden="true" />
        <div className="row-head">
          <span className="chip block">Blocked</span>
          <span className="reason" title={hint}>
            {row.reasonName}
          </span>
          <Meta row={row} time={time} />
        </div>
        <p className="sentence">
          <HighlightBad text={sentence} />
        </p>
        <p className="row-foot">
          {hint}
          <span className="sep">·</span>
          {t("noFee")}
          <span className="sep">·</span>
          {t("targetUntouched")}
        </p>
      </li>
    );
  }

  if (row.status === "executed") {
    const fee = feeText(row);
    return (
      <li className={`row executed${row.fresh ? " fresh" : ""}`}>
        <span className="chip ok">Executed</span>
        <p className="sentence">{sentence}</p>
        <Meta row={row} time={time} />
        {fee && <p className="fee-line">{fee}</p>}
      </li>
    );
  }

  // "reverted": gas estimation failed, so no transaction and no event exist (PRD §6.2).
  return (
    <li className={`row reverted${row.fresh ? " fresh" : ""}`}>
      <span className="chip rev">{row.status === "dry-run" ? "Dry-run" : "Reverted"}</span>
      <p className="sentence">
        <HighlightBad text={sentence} />
        {row.error && <code className="rev-err">{row.error}</code>}
      </p>
      <Meta row={row} time={time} />
      {!row.txHash && <p className="fee-line muted">{t("noTx")}</p>}
    </li>
  );
}
