import { useLang } from "./i18n";
import { ActivityFeed } from "./components/ActivityFeed";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { PolicyPanel } from "./components/PolicyPanel";
import { useAgentStatus } from "./hooks/useAgentStatus";
import { useDemoKey } from "./hooks/useDemoKey";
import { useFeed } from "./hooks/useFeed";
import { useVaultState } from "./hooks/useVaultState";

export function App() {
  const { t } = useLang();
  const vault = useVaultState();
  const feed = useFeed(vault.refresh); // every new receipt re-reads counters + policy from the contract
  const { demoKey, setDemoKey } = useDemoKey();
  const status = useAgentStatus();

  return (
    <div className="app">
      <Header feeBps={vault.state?.feeBps} />
      {vault.state?.frozen && (
        <div className="frozen-banner" role="alert">
          <span className="tape" aria-hidden="true" />
          {t("frozenBanner")}
        </div>
      )}
      <main className="grid">
        <ChatPanel demoKey={demoKey} setDemoKey={setDemoKey} status={status} onAction={feed.push} />
        <div className="right">
          <PolicyPanel state={vault.state} error={vault.error} onChanged={vault.refresh} />
          <ActivityFeed
            rows={feed.rows}
            loaded={feed.loaded}
            timeOf={feed.timeOf}
            executed={vault.state?.executed}
            blocked={vault.state?.blocked}
          />
        </div>
      </main>
    </div>
  );
}
