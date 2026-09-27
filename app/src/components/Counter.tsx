import { useEffect, useRef, useState } from "react";

/** Big on-chain counter; bumps when the value goes up. */
export function Counter({ value, label, tone }: { value?: bigint; label: string; tone: "ok" | "block" }) {
  const prev = useRef(value);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    if (value !== undefined && prev.current !== undefined && value > prev.current) setBump((b) => b + 1);
    prev.current = value;
  }, [value]);

  return (
    <div className={`counter ${tone}`}>
      <span key={bump} className={`num${bump ? " bump" : ""}`}>
        {value === undefined ? "–" : value.toString()}
      </span>
      <span className="lbl">{label}</span>
    </div>
  );
}
