import { useCallback, useEffect, useState } from "react";
import { createWalletClient, custom, getAddress, type Address, type WalletClient } from "viem";
import "viem/window";
import { pagarVaultAbi } from "../abi/pagarVault";
import { chain } from "../lib/chain";
import { publicClient } from "../web/client";
import { deployment } from "../lib/deployment";

export type WalletPhase = "idle" | "connecting" | "confirm" | "mining" | "done" | "error";

function message(e: unknown): string {
  const any = e as { shortMessage?: string; message?: string; code?: number; cause?: { code?: number } };
  if (any?.code === 4001 || any?.cause?.code === 4001) return "Rejected in wallet";
  return any?.shortMessage ?? any?.message ?? String(e);
}

function isUnknownChain(e: unknown): boolean {
  const any = e as { code?: number; cause?: { code?: number }; message?: string };
  return any?.code === 4902 || any?.cause?.code === 4902 || /4902|unrecognized chain|not been added|unknown chain/i.test(any?.message ?? "");
}

async function ensureChain(wc: WalletClient) {
  if ((await wc.getChainId()) === chain.id) return;
  try {
    await wc.switchChain({ id: chain.id });
  } catch (e) {
    if (!isUnknownChain(e)) throw e;
    await wc.addChain({ chain });
    await wc.switchChain({ id: chain.id });
  }
}

/** Injected wallet (MetaMask / Rabby) for the owner-only Freeze / Unfreeze button. */
export function useOwnerWallet(onDone: () => void) {
  const [account, setAccount] = useState<Address | null>(null);
  const [phase, setPhase] = useState<WalletPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const hasWallet = typeof window !== "undefined" && !!window.ethereum;

  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;
    const onAccounts = (a: readonly string[]) => setAccount(a[0] ? getAddress(a[0]) : null);
    eth.request({ method: "eth_accounts" }).then(onAccounts).catch(() => {});
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener("accountsChanged", onAccounts);
  }, []);

  const client = () => createWalletClient({ chain, transport: custom(window.ethereum!) });

  const connect = useCallback(async () => {
    if (!window.ethereum) return;
    setError(null);
    setPhase("connecting");
    try {
      const [a] = await client().requestAddresses();
      setAccount(a ?? null);
      setPhase("idle");
    } catch (e) {
      setError(message(e));
      setPhase("error");
    }
  }, []);

  const setFrozen = useCallback(
    async (frozen: boolean) => {
      if (!account) return;
      setError(null);
      try {
        const wc = client();
        await ensureChain(wc);
        setPhase("confirm");
        const hash = await wc.writeContract({
          address: deployment.vault,
          abi: pagarVaultAbi,
          functionName: "setFrozen",
          args: [frozen],
          account,
          chain,
        });
        setPhase("mining");
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("setFrozen reverted");
        setPhase("done");
        onDone();
      } catch (e) {
        setError(message(e));
        setPhase("error");
      }
    },
    [account, onDone],
  );

  return { hasWallet, account, phase, error, connect, setFrozen };
}
