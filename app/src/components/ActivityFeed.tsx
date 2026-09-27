import { useLang } from "../i18n";
import { eventsUrl } from "../lib/deployment";
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
};

export function ActivityFeed({ rows, loaded, timeOf, executed, blocked }: Props) {
  const { t } = useLang();
  const now = useNow(5_000);
  const all = eventsUrl();

  return (
    <section className="panel feed" aria-label={t("feedTitle")}>
      <header className="feed-head">
        <div className="panel-title">
          <span className="idx">03</span>
          {t("feedTitle")}
        </div>
        <div className="counters" title={t("counterNote")}>
          <Counter value={executed} label={t("executed")} tone="ok" />
          <span className="dot-sep" aria-hidden="true" />
          <Counter value={blocked} label={t("blocked")} tone="block" />
        </div>
        <div className="feed-links">
          <span className="note" title="executedCount() · blockedCount()">
            {t("counterNote")}
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
      </ol>
    </section>
  );
}
