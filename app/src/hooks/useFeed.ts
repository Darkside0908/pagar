import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AbiEvent, Log } from "viem";
import { pagarVaultAbi } from "../abi/pagarVault";
import { actionsFromLogs, type VaultAction } from "../lib/actions";
import { LOG_CHUNK, LOG_LOOKBACK_BLOCKS } from "../lib/chain";
import { publicClient } from "../web/client";
import { deployment } from "../lib/deployment";

export type FeedRow = VaultAction & {
  pinned?: boolean;
  fresh?: boolean; // arrived after the first load → gets the entrance animation
  sortBlock: bigint;
  sortLog: number;
};

const LIVE_MS = 3_000;
const MAX_ROWS = 80;
const EVENTS = pagarVaultAbi.filter(
  (x): x is Extract<(typeof pagarVaultAbi)[number], { type: "event" }> =>
    x.type === "event" && (x.name === "ActionExecuted" || x.name === "ActionBlocked"),
) as unknown as AbiEvent[];

async function getLogsChunked(from: bigint, to: bigint): Promise<Log[]> {
  const out: Log[] = [];
  for (let start = from; start <= to; start += LOG_CHUNK) {
    const end = start + LOG_CHUNK - 1n < to ? start + LOG_CHUNK - 1n : to;
    out.push(...(await publicClient.getLogs({ address: deployment.vault, events: EVENTS, fromBlock: start, toBlock: end })));
  }
  return out;
}

/**
 * Activity feed (PRD §7). Four sources, merged and de-duplicated by `txHash:logIndex`:
 *  1. receipts returned by /api/chat and /api/simulate-compromise → `push()` (instant)
 *  2. pinned demo txs from deployment.demoTxs → getTransactionReceipt
 *  3. history: GET /api/events (server RPC), falling back to chunked browser getLogs
 *  4. live: our own getLogs polling from the last seen block (no eth_newFilter)
 * Failures in 2–4 are ignored silently; the counter comes from the contract, not from here.
 */
export function useFeed(onNewAction: () => void) {
  const [rows, setRows] = useState<Map<string, FeedRow>>(() => new Map());
  const [blockTs, setBlockTs] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);
  const lastBlock = useRef<bigint | null>(null);
  const onNew = useRef(onNewAction);
  onNew.current = onNewAction;

  const merge = useCallback((list: VaultAction[], opts: { fresh?: boolean; pinned?: boolean } = {}) => {
    if (!list.length) return;
    setRows((prev) => {
      const next = new Map(prev);
      let top = lastBlock.current ?? 0n;
      for (const r of prev.values()) if (r.sortBlock > top) top = r.sortBlock;
      let changed = false;
      for (const a of list) {
        const old = next.get(a.id);
        if (old) {
          if (opts.pinned && !old.pinned) {
            next.set(a.id, { ...old, pinned: true });
            changed = true;
          }
          continue;
        }
        // Rows without a block (reverted before sending) float just above the newest known block.
        const sortBlock = a.blockNumber ? BigInt(a.blockNumber) : top;
        const sortLog = a.blockNumber ? (a.logIndex ?? 0) : Number.MAX_SAFE_INTEGER;
        next.set(a.id, { ...a, pinned: opts.pinned, fresh: opts.fresh, sortBlock, sortLog });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const push = useCallback(
    (a: VaultAction) => {
      merge([{ ...a, ts: a.ts ?? Date.now() }], { fresh: true });
      onNew.current();
    },
    [merge],
  );

  // Sources 2 + 3: pinned demo txs, then recent history.
  useEffect(() => {
    let alive = true;
    (async () => {
      await Promise.all(
        (deployment.demoTxs ?? []).map(async (hash) => {
          try {
            const r = await publicClient.getTransactionReceipt({ hash });
            if (alive) merge(actionsFromLogs(r.logs, deployment.vault), { pinned: true });
          } catch {
            /* ignore */
          }
        }),
      );

      let latest: bigint | null = null;
      try {
        const res = await fetch("/api/events");
        const j = (await res.json()) as { latest?: string; actions?: VaultAction[]; error?: string };
        if (!res.ok || !j.actions || !j.latest) throw new Error(j.error ?? `HTTP ${res.status}`);
        if (alive) merge(j.actions);
        latest = BigInt(j.latest);
      } catch {
        try {
          latest = await publicClient.getBlockNumber();
          const floor = BigInt(deployment.deployBlock);
          const from = latest > LOG_LOOKBACK_BLOCKS && latest - LOG_LOOKBACK_BLOCKS > floor ? latest - LOG_LOOKBACK_BLOCKS : floor;
          const logs = await getLogsChunked(from, latest);
          if (alive) merge(actionsFromLogs(logs, deployment.vault));
        } catch {
          /* ignore */
        }
      }
      if (!alive) return;
      if (latest !== null && (lastBlock.current === null || latest > lastBlock.current)) lastBlock.current = latest;
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, [merge]);

  // Source 4: live polling from the last seen block.
  useEffect(() => {
    let busy = false;
    const id = window.setInterval(async () => {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const latest = await publicClient.getBlockNumber();
        if (lastBlock.current === null) {
          lastBlock.current = latest;
          return;
        }
        let from = lastBlock.current + 1n;
        if (latest < from) return;
        if (latest - from > LOG_LOOKBACK_BLOCKS) from = latest - LOG_LOOKBACK_BLOCKS;
        const logs = await getLogsChunked(from, latest);
        lastBlock.current = latest;
        const found = actionsFromLogs(logs, deployment.vault).map((a) => ({ ...a, ts: Date.now() }));
        if (found.length) {
          merge(found, { fresh: true });
          onNew.current();
        }
      } catch {
        /* ignore — receipts from the API still arrive */
      } finally {
        busy = false;
      }
    }, LIVE_MS);
    return () => window.clearInterval(id);
  }, [merge]);

  // Block timestamps for history rows, so they can show "3m ago".
  const asked = useRef(new Set<string>());
  useEffect(() => {
    const need = [...rows.values()]
      .filter((r) => !r.ts && r.blockNumber && !asked.current.has(r.blockNumber))
      .map((r) => r.blockNumber as string)
      .slice(0, 40);
    if (!need.length) return;
    need.forEach((b) => asked.current.add(b));
    Promise.all(
      [...new Set(need)].map(async (b) => {
        try {
          const blk = await publicClient.getBlock({ blockNumber: BigInt(b) });
          return [b, Number(blk.timestamp) * 1000] as const;
        } catch {
          return null;
        }
      }),
    ).then((pairs) => {
      const got = Object.fromEntries(pairs.filter((p): p is readonly [string, number] => p !== null));
      if (Object.keys(got).length) setBlockTs((prev) => ({ ...prev, ...got }));
    });
  }, [rows]);

  const sorted = useMemo(
    () =>
      [...rows.values()]
        .sort((a, b) =>
          a.sortBlock !== b.sortBlock ? (b.sortBlock > a.sortBlock ? 1 : -1) : b.sortLog - a.sortLog || (b.ts ?? 0) - (a.ts ?? 0),
        )
        .slice(0, MAX_ROWS),
    [rows],
  );

  const timeOf = useCallback((r: FeedRow) => r.ts ?? (r.blockNumber ? blockTs[r.blockNumber] : undefined), [blockTs]);

  return { rows: sorted, push, loaded, timeOf };
}
