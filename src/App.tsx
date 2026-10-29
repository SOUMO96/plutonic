import { useCallback, useEffect, useRef, useState } from 'react';
import AstroBlackHoleSequence, { type AstroSceneMode } from './components/AstroBlackHoleSequence';
import BrandMark from './components/BrandMark';
import CategorySelect from './components/CategorySelect';
import Storefront from './components/Storefront';

type Stage = 'intro' | 'categories' | 'store';
type Category = 'him' | 'her';

function CinematicIntro({ revealed, onSkip }: { revealed: boolean; onSkip: () => void }) {
  return (
    <div className={`cinematic-intro-ui ${revealed ? 'is-revealed' : ''}`}>
      <div className="cinematic-corner-brand">PLUTONIC <span>—</span> AN EXPRESSION IN MOTION</div>
      <div className="cinematic-brand-stack" aria-live="polite">
        <div className="cinematic-brand-aura" />
        <div className="cinematic-brand-mark"><BrandMark size={94} /></div>
        <p className="cinematic-brand-name">PLUTONIC</p>
        <p className="cinematic-brand-line">BEYOND THE ORDINARY.</p>
      </div>
      <button className="cinematic-skip" onClick={onSkip}>SKIP INTRO <span>↗</span></button>
      <div className="cinematic-bottom-note">M87* / A STUDY IN GRAVITY</div>
    </div>
  );
}

export default function App() {
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof window === 'undefined') return 'intro';
    return window.sessionStorage.getItem('plutonic-intro-seen') === 'yes' ? 'categories' : 'intro';
  });
  const [brandReveal, setBrandReveal] = useState(false);
  const [category, setCategory] = useState<Category>('him');
  const [categoryLeaving, setCategoryLeaving] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
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

  const beginBrandReveal = useCallback(() => {
    setBrandReveal(true);
  }, []);

  useEffect(() => {
    if (stage !== 'intro' || !brandReveal) return;
    const timer = window.setTimeout(() => {
      window.sessionStorage.setItem('plutonic-intro-seen', 'yes');
      setStage('categories');
    }, 5200);
    return () => window.clearTimeout(timer);
  }, [stage, brandReveal]);

  const skipIntro = useCallback(() => {
    if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    window.sessionStorage.setItem('plutonic-intro-seen', 'yes');
    setStage('categories');
  }, []);

  const enterCollection = useCallback((next: Category) => {
    setCategory(next);
    setCategoryLeaving(true);
    transitionTimer.current = window.setTimeout(() => {
      setStage('store');
      setCategoryLeaving(false);
    }, 650);
  }, []);

  return (
    <div className="site-shell">
      {stage !== 'store' && (
        <main className={`cinematic-experience mode-${stage === 'categories' ? 'categories' : brandReveal ? 'brand' : 'intro'}`}>
          <AstroBlackHoleSequence
            mode={stage === 'categories' ? 'categories' : brandReveal ? 'brand' : 'intro'}
            reducedMotion={reducedMotion}
            onBrandReveal={beginBrandReveal}
          />
          {stage === 'intro' && <CinematicIntro revealed={brandReveal} onSkip={skipIntro} />}
          {stage === 'categories' && (
            <CategorySelect onSelect={enterCollection} isLeaving={categoryLeaving} />
          )}
        </main>
      )}
      {stage === 'store' && (
        <div className="store-transition-in">
          <Storefront category={category} onChangeCategory={() => setStage('categories')} />
        </div>
      )}
    </div>
  );
}
