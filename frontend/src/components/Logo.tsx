export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#0F6B4C" />
      <path d="M8 21c0-6 4-9 8-9s8 3 8 9" fill="none" stroke="#C9F24F" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="8" cy="21" r="2.6" fill="#FFFFFF" />
      <circle cx="24" cy="21" r="2.6" fill="#F5A300" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-xl font-semibold tracking-tight">
        Campus<span className="text-forest">Pool</span>
      </span>
    </span>
  );
}
