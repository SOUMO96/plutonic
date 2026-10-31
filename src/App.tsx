import { useCallback, useEffect, useState } from 'react';
import AstroBlackHoleSequence, { type AstroSceneMode } from './components/AstroBlackHoleSequence';
import SiteApp from './site/SiteApp';
import { hasSiteRoute } from './site/router';
import { BRAND_HOLD_MS, INTRO_SPEED } from './lib/introTiming';

type Stage = 'intro' | 'store';

const SEEN_KEY = 'plutonic-intro-seen-v2';
const introSeen = () => { try { return window.localStorage.getItem(SEEN_KEY) === 'yes'; } catch { return false; } };
const markIntroSeen = () => { try { window.localStorage.setItem(SEEN_KEY, 'yes'); } catch { /* storage unavailable */ } };

/** Time from the brand trigger to the homepage: pull-back, morph, lockup, hold. */
const INTRO_HOLD_MS = BRAND_HOLD_MS / INTRO_SPEED;
const INTRO_HOLD_REDUCED_MS = 3800;

function CinematicIntro({
  revealed,
  onSkip,
}: {
  revealed: boolean;
  onSkip: () => void;
}) {
  return (
    <div className={`cinematic-intro-ui ${revealed ? 'is-revealed' : ''}`}>
      <div className="cinematic-corner-brand">PLUTONIC <span>—</span> AN EXPRESSION IN MOTION</div>
      <button className="cinematic-skip" onClick={onSkip}>SKIP INTRO <span>↗</span></button>
      <div className="cinematic-bottom-note">M87* / A STUDY IN GRAVITY</div>
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof window === 'undefined') return 'intro';
    // A shared deep link (e.g. #/product/m2) or a returning visitor goes straight to the store.
    return hasSiteRoute() || introSeen() ? 'store' : 'intro';
  });
  const [brandReveal, setBrandReveal] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  // Land on the homepage when the visitor arrives without a route.
  const enterStore = useCallback(() => {
    markIntroSeen();
    if (!hasSiteRoute()) window.location.hash = '#/';
    setStage('store');
  }, []);

  const beginBrandReveal = useCallback(() => setBrandReveal(true), []);

  useEffect(() => {
    if (stage !== 'intro' || !brandReveal) return;
    const timer = window.setTimeout(enterStore, reducedMotion ? INTRO_HOLD_REDUCED_MS : INTRO_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stage, brandReveal, reducedMotion, enterStore]);

  const replayIntro = useCallback(() => {
    try { window.localStorage.removeItem(SEEN_KEY); } catch { /* storage unavailable */ }
    window.location.href = window.location.pathname;
  }, []);

  const mode: AstroSceneMode = stage === 'intro' ? (brandReveal ? 'brand' : 'intro') : 'store';

  return (
    <div className="site-shell" style={{ ['--intro-speed' as string]: INTRO_SPEED }}>
      <main className={`cinematic-experience mode-${mode}`}>
        <AstroBlackHoleSequence mode={mode} reducedMotion={reducedMotion} onBrandReveal={beginBrandReveal} />
        {stage === 'intro' && <CinematicIntro revealed={brandReveal} onSkip={enterStore} />}
        {stage === 'store' && (
          <div className="site-enter">
            <SiteApp onReplayIntro={replayIntro} />
          </div>
        )}
      </main>
    </div>
  );
}
