import { useCallback, useEffect, useRef, useState } from 'react';
import AstroBlackHoleSequence, { type AstroSceneMode } from './components/AstroBlackHoleSequence';
import CategorySelect from './components/CategorySelect';
import SiteApp from './site/SiteApp';
import { hasSiteRoute } from './site/router';
import { BRAND_HOLD_MS, INTRO_SPEED } from './lib/introTiming';

type Stage = 'intro' | 'categories' | 'store';
type Category = 'him' | 'her';

/** Time from the brand trigger to the collection gateway: pull-back, morph, lockup, hold. */
const INTRO_HOLD_MS = BRAND_HOLD_MS / INTRO_SPEED;
const INTRO_HOLD_REDUCED_MS = 3800;

function CinematicIntro({
  revealed,
  dismissed = false,
  onSkip,
}: {
  revealed: boolean;
  dismissed?: boolean;
  onSkip: () => void;
}) {
  return (
    <div className={`cinematic-intro-ui ${revealed ? 'is-revealed' : ''} ${dismissed ? 'is-dismissed' : ''}`}>
      <div className="cinematic-corner-brand">PLUTONIC <span>—</span> AN EXPRESSION IN MOTION</div>
      {!dismissed && <button className="cinematic-skip" onClick={onSkip}>SKIP INTRO <span>↗</span></button>}
      <div className="cinematic-bottom-note">M87* / A STUDY IN GRAVITY</div>
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof window === 'undefined') return 'intro';
    // A shared deep link (e.g. #/product/m2) goes straight to the store.
    if (hasSiteRoute()) return 'store';
    return window.sessionStorage.getItem('plutonic-intro-seen') === 'yes' ? 'categories' : 'intro';
  });
  const [brandReveal, setBrandReveal] = useState(false);
  const [categoryLeaving, setCategoryLeaving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [introArrival, setIntroArrival] = useState(false);
  const transitionTimer = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  useEffect(() => () => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
  }, []);

  const beginBrandReveal = useCallback(() => setBrandReveal(true), []);

  useEffect(() => {
    if (stage !== 'intro' || !brandReveal) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem('plutonic-intro-seen', 'yes');
      setIntroArrival(true);
      setStage('categories');
    }, reducedMotion ? INTRO_HOLD_REDUCED_MS : INTRO_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [stage, brandReveal, reducedMotion]);

  const skipIntro = useCallback(() => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    window.sessionStorage.setItem('plutonic-intro-seen', 'yes');
    setStage('categories');
  }, []);

  const enterCollection = useCallback((next: Category) => {
    setCategoryLeaving(true);
    transitionTimer.current = window.setTimeout(() => {
      window.location.hash = next === 'him' ? '#/men' : '#/women';
      setStage('store');
      setCategoryLeaving(false);
    }, 650);
  }, []);

  const mode: AstroSceneMode = stage === 'intro'
    ? brandReveal ? 'brand' : 'intro'
    : stage;

  return (
    <div className="site-shell" style={{ ['--intro-speed' as string]: INTRO_SPEED }}>
      <main className={`cinematic-experience mode-${mode}`}>
        <AstroBlackHoleSequence
          mode={mode}
          reducedMotion={reducedMotion}
          onBrandReveal={beginBrandReveal}
        />
        {stage !== 'store' && (
          <CinematicIntro
            revealed={brandReveal}
            dismissed={stage === 'categories'}
            onSkip={skipIntro}
          />
        )}
        {stage === 'categories' && (
          <CategorySelect onSelect={enterCollection} isLeaving={categoryLeaving} introArrival={introArrival && !reducedMotion} />
        )}
        {stage === 'store' && (
          <div className="site-enter">
            <SiteApp onGateway={() => { window.history.replaceState(null, '', window.location.pathname); setStage('categories'); }} />
          </div>
        )}
      </main>
    </div>
  );
}
