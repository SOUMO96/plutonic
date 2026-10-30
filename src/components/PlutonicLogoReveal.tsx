type Props = {
  active: boolean;
  reducedMotion?: boolean;
};

// Leave empty until the approved punchline is supplied.
const BRAND_PUNCHLINE = '';

/**
 * Single-image lockup. The source artwork already contains the symbol and
 * PLUTONIC wordmark. A luminance key in public/plutonic-logo-transparent.svg
 * removes only the near-black image background; no logo paths are redrawn.
 *
 * The logo reveal is CSS-timed from the same .astro-mode-brand class change
 * as the background push-in. There is no independent JS timer or delayed image
 * insertion to create a black gap.
 */
export default function PlutonicLogoReveal({ active, reducedMotion = false }: Props) {
  return (
    <div
      className={'plutonic-logo-reveal ' + (active ? 'is-active ' : '') + (reducedMotion ? 'is-reduced' : '')}
      aria-live="polite"
    >
      <img
        className="plutonic-final-logo"
        src="/plutonic-logo-transparent.svg"
        alt="PLUTONIC"
        draggable={false}
        decoding="sync"
        fetchPriority="high"
      />
      {BRAND_PUNCHLINE && <p className="plutonic-punchline">{BRAND_PUNCHLINE}</p>}
    </div>
  );
}
