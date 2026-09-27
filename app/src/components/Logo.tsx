/** PAGAR = "fence": three pickets on two rails. */
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="logo">
      <g fill="currentColor">
        <path d="M12 22 L17 13 L22 22 V54 H12 Z" />
        <path d="M27 22 L32 13 L37 22 V54 H27 Z" />
        <path d="M42 22 L47 13 L52 22 V54 H42 Z" />
        <rect x="7" y="29" width="50" height="5" rx="1" />
        <rect x="7" y="43" width="50" height="5" rx="1" />
      </g>
    </svg>
  );
}
