// Small broadcast match icons, shared by the timeline and the lineup pitch.

export function BallIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="goal" role="img" className="ic-ball">
      <circle cx="12" cy="12" r="10.5" fill="#fff" stroke="#0b0b0c" strokeWidth="1.4" />
      <g fill="#0b0b0c">
        {/* centre pentagon */}
        <path d="M12 7.4 16 10.3 14.5 15 9.5 15 8 10.3Z" />
        {/* edge hints */}
        <path d="M12 2.2 13.4 5.2 12 6.3 10.6 5.2Z" />
        <path d="M21.2 9.2 20.4 12.4 18.4 12 18.7 9.4Z" />
        <path d="M2.8 9.2 3.6 12.4 5.6 12 5.3 9.4Z" />
        <path d="M6.6 20.4 8.7 18 10 19.6 8.6 21.6Z" />
        <path d="M17.4 20.4 15.3 18 14 19.6 15.4 21.6Z" />
      </g>
    </svg>
  );
}

export function BootIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-label="assist" role="img" className="ic-boot">
      <path
        d="M3 6 C3 5 4 4.5 5.5 4.7 L9 5.2 C10 5.3 10.8 5.8 11.6 6.6 L17.5 12 C19 12.4 21 13 21 15.4 L21 17 L4 17 C3 17 3 16 3 15 Z"
        fill="var(--gold)"
        stroke="#0b0b0c"
        strokeWidth="1"
      />
      <rect x="3" y="17" width="18.5" height="2.4" fill="#0b0b0c" />
      <g stroke="#0b0b0c" strokeWidth="0.9">
        <line x1="8" y1="20.6" x2="8" y2="21.8" />
        <line x1="12" y1="20.6" x2="12" y2="21.8" />
        <line x1="16" y1="20.6" x2="16" y2="21.8" />
      </g>
    </svg>
  );
}

export function CardIcon({ kind, size = 11 }: { kind: "yellow" | "red"; size?: number }) {
  return (
    <svg width={Math.round(size * 0.72)} height={size} viewBox="0 0 8 11" aria-label={`${kind} card`} role="img">
      <rect x="0.5" y="0.5" width="7" height="10" rx="0.6" fill={kind === "yellow" ? "#e6c130" : "#e4002b"} stroke="#0b0b0c" strokeWidth="0.6" />
    </svg>
  );
}

export function SubIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" aria-label="substitution" role="img">
      <path d="M3 7 L3 2 L1 2 L3.5 -0.5 L6 2 L4 2 L4 7 Z" transform="translate(0,1)" fill="var(--mex-green)" />
      <path d="M9 5 L9 10 L11 10 L8.5 12.5 L6 10 L8 10 L8 5 Z" transform="translate(0,-1)" fill="var(--can-red)" />
    </svg>
  );
}
