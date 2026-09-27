import { useEffect, useState } from "react";
import type { AgentStatus } from "../lib/agentEvents";

/** GET /api/status once: which model and agent address the server runs with (no secrets). */
export function useAgentStatus() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => (r.ok ? (r.json() as Promise<AgentStatus>) : null))
      .then((s) => alive && setStatus(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return status;
}
