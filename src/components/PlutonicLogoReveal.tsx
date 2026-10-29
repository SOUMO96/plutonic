import { useEffect, useState } from 'react';

type Props = {
  active: boolean;
  reducedMotion?: boolean;
};

const LOGO_SRC = '/plutonic-logo.svg';

// Leave this empty until the final approved brand line is supplied.
const BRAND_PUNCHLINE = '';

/**
 * A single-source logo reveal.
 * The uploaded PLUTONIC artwork includes both its symbol and wordmark, so it
 * must be rendered exactly once. No generated SVG, duplicate wordmark or
 * particle canvas is layered over it.
 */
export default function PlutonicLogoReveal({ active, reducedMotion = false }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    if (reducedMotion) {
      setVisible(true);
      return;
    }

    // This delay synchronizes the logo crossfade with the end of the video push-in.
    const timer = window.setTimeout(() => setVisible(true), 2350);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

  return (
    <div className={`plutonic-logo-reveal ${active ? 'is-active' : ''} ${visible ? 'is-visible' : ''}`}>
      <img
        className="plutonic-final-logo"
        src={LOGO_SRC}
        alt="PLUTONIC brand logo"
        draggable={false}
      />
      {BRAND_PUNCHLINE && <p className="plutonic-punchline">{BRAND_PUNCHLINE}</p>}
    </div>
  );
}
