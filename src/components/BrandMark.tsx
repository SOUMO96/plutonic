import type { CSSProperties } from 'react';

type BrandMarkProps = {
  size?: number;
  wordmark?: boolean;
  className?: string;
};

/**
 * Uses the approved Plutonic artwork from the public logo asset.
 * The source contains the complete symbol and wordmark; no placeholder
 * geometry or separately typeset brand name is used.
 */
export default function BrandMark({ size = 46, className = '' }: BrandMarkProps) {
  const style = {
    width: size * 1.478,
    height: size,
    objectFit: 'contain',
    display: 'block',
    flexShrink: 0,
  } as CSSProperties;

  return (
    <span className={'brand-lockup ' + className} aria-label="Plutonic">
      <img
        src="/plutonic-logo-transparent.svg"
        alt="PLUTONIC"
        style={style}
        className="brand-mark-image"
        draggable={false}
        decoding="async"
      />
    </span>
  );
}
