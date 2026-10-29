import type { CSSProperties } from 'react';

type BrandMarkProps = {
  size?: number;
  wordmark?: boolean;
  className?: string;
};

/**
 * Temporary, replaceable brand emblem.
 * Swap only this component when the final brand artwork is ready.
 */
export default function BrandMark({ size = 46, wordmark = false, className = '' }: BrandMarkProps) {
  const style = { width: size, height: size } as CSSProperties;

  return (
    <span className={'brand-lockup ' + className} aria-label="Plutonic temporary brand mark">
      <svg viewBox="0 0 100 100" style={style} className="brand-mark" role="img" aria-hidden="true">
        <circle cx="50" cy="50" r="36" fill="none" stroke="currentColor" strokeWidth="2.7" strokeDasharray="192 34" transform="rotate(-38 50 50)" />
        <path d="M15 62 C34 55 55 43 84 25" fill="none" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" />
        <path d="M31 77 C47 68 63 51 77 31" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".72" />
        <circle cx="50" cy="50" r="5" fill="currentColor" />
      </svg>
      {wordmark && <span className="brand-wordmark">PLUTONIC</span>}
    </span>
  );
}
