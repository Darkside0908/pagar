import { useLang } from "../i18n";
import { LOG_LOOKBACK_BLOCKS } from "../lib/chain";
import { deployment, eventsUrl } from "../lib/deployment";
import type { FeedRow as Row } from "../hooks/useFeed";
import { useNow } from "../hooks/useNow";
import { Counter } from "./Counter";
import { FeedRow } from "./FeedRow";

type Props = {
  rows: Row[];
  loaded: boolean;
  timeOf: (r: Row) => number | undefined;
  executed?: bigint;
  blocked?: bigint;
  block?: bigint; // latest block the dashboard has read
};

export function ActivityFeed({ rows, loaded, timeOf, executed, blocked, block }: Props) {
  const { t, lang } = useLang();
  const now = useNow(5_000);
  const all = eventsUrl();
  const fmtBlock = (n: bigint | number) => n.toLocaleString(lang === "id" ? "id-ID" : "en-US");
  // Every action since deployment is in the list while the vault is younger than the log lookback.
  const complete = block !== undefined && block - BigInt(deployment.deployBlock) <= LOG_LOOKBACK_BLOCKS;

  return (
    <section className="panel feed" aria-label={t("feedTitle")}>
      <header className="feed-head">
        <div className="panel-title">{t("feedTitle")}</div>
        <div className="counters" title={t("counterNote")}>
          <Counter value={executed} label={t("executed")} tone="ok" />
          <span className="dot-sep" aria-hidden="true" />
          <Counter value={blocked} label={t("blocked")} tone="block" />
        </div>
        <div className="feed-links">
          <span className="note" title="executedCount() · blockedCount()">
            {block !== undefined && (
              <span className="live">
                <i aria-hidden="true" />
                {t("liveBlock", { n: fmtBlock(block) })}
              </span>
            )}
            <span className="note-txt">{t("counterNote")}</span>
          </span>
          {all && (
            <a href={all} target="_blank" rel="noreferrer">
              {t("allEvents")} ↗
            </a>
          )}
        </div>
      </header>

      <ol className="feed-list" aria-live="polite">
        {rows.length === 0 ? (
          <li className="feed-empty">{loaded ? t("emptyFeed") : t("loading")}</li>
        ) : (
          rows.map((r) => <FeedRow key={r.id} row={r} time={timeOf(r)} now={now} />)
        )}
        {rows.length > 0 && loaded && block !== undefined && (
          <li className="feed-end">{complete ? t("feedStart", { n: fmtBlock(deployment.deployBlock) }) : t("feedWindow")}</li>
        )}
      </ol>
    </section>
  );
}
