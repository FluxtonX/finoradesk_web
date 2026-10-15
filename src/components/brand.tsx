import Link from "next/link";
export function Mark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="13" fill="currentColor" />
      <path
        d="M12 27V13h16M12 20h12"
        stroke="#ddf593"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="m23 27 5-5"
        stroke="#ddf593"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="Finoredesk home"
    >
      <Mark />
      <span>
        finoredesk<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function EmptyArt({ kind = "records" }: { kind?: string }) {
  return (
    <svg
      className="empty-art"
      width="152"
      height="120"
      viewBox="0 0 152 120"
      fill="none"
      role="img"
      aria-label={`Empty ${kind} illustration`}
    >
      <ellipse cx="76" cy="103" rx="51" ry="9" fill="var(--border)" />
      <rect
        x="30"
        y="24"
        width="70"
        height="77"
        rx="11"
        transform="rotate(-10 30 24)"
        fill="var(--accent-soft)"
      />
      <rect
        x="49"
        y="15"
        width="65"
        height="85"
        rx="11"
        fill="var(--surface)"
        stroke="var(--green)"
        strokeWidth="1.5"
      />
      <path
        d="M63 36h36M63 48h26M63 60h36M63 72h18"
        stroke="var(--border-strong)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="110" cy="83" r="18" fill="var(--lime)" />
      <path
        d="M103 83h14M110 76v14"
        stroke="var(--green)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="m25 52-5-4m106-18 5-5m-5 32 7 1"
        stroke="var(--green)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
