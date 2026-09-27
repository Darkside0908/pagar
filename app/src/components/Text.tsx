import { Fragment, type ReactNode } from "react";
import { deployment, short, ZERO } from "../lib/deployment";

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BAD_RE = deployment.bad !== ZERO ? new RegExp(`(${esc(deployment.bad)}|${esc(short(deployment.bad))})`, "gi") : null;

/** Marks the attacker address (full or shortened) wherever it appears. */
export function HighlightBad({ text }: { text: string }) {
  if (!BAD_RE) return <>{text}</>;
  const parts = text.split(BAD_RE);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark className="bad-addr" key={i}>
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

const TOKEN_RE = /(https?:\/\/[^\s)\]]+)|\*\*([^*]+)\*\*|`([^`]+)`/g;

/** Minimal formatting for agent replies: links, **bold**, `code`, attacker highlight. */
export function RichText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<HighlightBad key={`t${last}`} text={text.slice(last, at)} />);
    if (m[1]) {
      out.push(
        <a key={`a${at}`} href={m[1]} target="_blank" rel="noreferrer">
          {m[1].includes("/tx/") ? "BscScan ↗" : m[1]}
        </a>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={`b${at}`}>
          <HighlightBad text={m[2]} />
        </strong>,
      );
    } else if (m[3]) {
      out.push(
        <code key={`c${at}`}>
          <HighlightBad text={m[3]} />
        </code>,
      );
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(<HighlightBad key={`t${last}`} text={text.slice(last)} />);
  return <>{out}</>;
}

/** <a> when there is an explorer URL, plain <span> on a local chain. */
export function MaybeLink({ href, className, children, title }: { href: string; className?: string; children: ReactNode; title?: string }) {
  return href ? (
    <a className={className} href={href} target="_blank" rel="noreferrer" title={title}>
      {children}
    </a>
  ) : (
    <span className={className} title={title}>
      {children}
    </span>
  );
}
