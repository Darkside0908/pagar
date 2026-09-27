import raw from "../deployment.json";
import type { Address, Hex } from "viem";

// Single address source for agent + dashboard (PRD §4.8). Refresh with `npm run sync -- <chainId>`.
export type Deployment = {
  chainId: number;
  vault: Address;
  musdt: Address;
  router: Address;
  wbnb: Address;
  owner: Address;
  agent: Address;
  treasury: Address;
  alice: Address;
  bob: Address;
  bad: Address;
  deployBlock: number;
  agentId?: number;
  agentRegistrationTx?: Hex;
  demoTxs?: Hex[];
};

export const deployment = raw as Deployment;

export const ZERO: Address = "0x0000000000000000000000000000000000000000";
export const MAX_UINT = (1n << 256n) - 1n;

export const IS_TESTNET = deployment.chainId === 97;
export const EXPLORER = IS_TESTNET ? "https://testnet.bscscan.com" : "";
export const ERC8004_IDENTITY_REGISTRY: Address = "0x8004A818BFB912233c491871b3d84c89A494BD9e";

export const txUrl = (hash: string) => (EXPLORER ? `${EXPLORER}/tx/${hash}` : "");
export const addressUrl = (a: string) => (EXPLORER ? `${EXPLORER}/address/${a}` : "");
export const eventsUrl = () => (EXPLORER ? `${EXPLORER}/address/${deployment.vault}#events` : "");

const eq = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Human label for a known address, or null (unknown addresses — like 0xbad… — stay raw on purpose). */
export function labelOf(a: string): string | null {
  const d = deployment;
  if (eq(a, d.alice)) return "Alice";
  if (eq(a, d.bob)) return "Bob";
  if (eq(a, d.router)) return "Router";
  if (eq(a, d.musdt)) return "mUSDT";
  if (eq(a, d.vault)) return "Vault";
  if (eq(a, d.treasury)) return "PAGAR treasury";
  if (eq(a, d.agent)) return "Agent";
  if (eq(a, d.owner)) return "Owner";
  return null;
}

export function assetSymbol(asset: string): string {
  if (eq(asset, ZERO)) return "BNB";
  if (eq(asset, deployment.musdt)) return "mUSDT";
  return short(asset);
}

export function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function isBad(a: string): boolean {
  return eq(a, deployment.bad);
}

export { eq as sameAddress };
