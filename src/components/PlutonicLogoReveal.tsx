import { useEffect, useState } from 'react';

type Props = {
  active: boolean;
  reducedMotion?: boolean;
};

const LOGO_SRC = '/plutonic-logo.webp';

// Keep empty until the approved brand punchline is supplied.
const BRAND_PUNCHLINE = '';

/**
 * The supplied artwork already contains the complete orbital symbol and
 * PLUTONIC wordmark. Render this one image exactly once. No SVG recreation,
 * particle layer, duplicate type, or decorative orbit is placed over it.
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

    // The background completes its push-in and fades to pure black in 3.4s.
    // Reveal the full-frame logo only after that, preventing the old video
    // from showing through its near-black source background and doubling it.
    const timer = window.setTimeout(() => setVisible(true), 3550);
    return () => window.clearTimeout(timer);
  }, [active, reducedMotion]);

  return (
    <div
      className={`plutonic-logo-reveal ${active ? 'is-active' : ''} ${visible ? 'is-visible' : ''}`}
      aria-live="polite"
    >
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
