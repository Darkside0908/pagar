import { useCallback, useState } from "react";
import { readStore, writeStore } from "../web/storage";

const KEY = "pagar.demoKey";

/** The demo key is typed by the presenter and lives in sessionStorage only — never in the bundle (PRD §7). */
export function useDemoKey() {
  const [demoKey, setKey] = useState<string | null>(() => readStore("session", KEY));
  const setDemoKey = useCallback((k: string | null) => {
    const v = k?.trim() || null;
    setKey(v);
    writeStore("session", KEY, v);
  }, []);
  return { demoKey, setDemoKey };
}
