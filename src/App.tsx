import { useCallback, useEffect, useState } from 'react';
import AstroBlackHoleSequence from './components/AstroBlackHoleSequence';
import BrandMark from './components/BrandMark';
import CategorySelect from './components/CategorySelect';
import Storefront from './components/Storefront';

type Stage = 'intro' | 'categories' | 'store';
type Category = 'him' | 'her';

function CinematicIntro({ reducedMotion, onFinish }: { reducedMotion: boolean; onFinish: () => void }) {
  const [phase, setPhase] = useState(0);
  const [revealStarted, setRevealStarted] = useState(false);

  const beginBrandReveal = useCallback(() => {
    if (revealStarted) return;
    setRevealStarted(true);
    setPhase(1);
  }, [revealStarted]);

  useEffect(() => {
    if (!revealStarted) return;
    const wordmarkTimer = window.setTimeout(() => setPhase(2), 1250);
    const taglineTimer = window.setTimeout(() => setPhase(3), 2450);
    const finishTimer = window.setTimeout(onFinish, 6100);
    return () => {
      window.clearTimeout(wordmarkTimer);
      window.clearTimeout(taglineTimer);
      window.clearTimeout(finishTimer);
    };
  }, [revealStarted, onFinish]);

  useEffect(() => {
    if (!reducedMotion) return;
    const timer = window.setTimeout(beginBrandReveal, 1600);
    return () => window.clearTimeout(timer);
  }, [reducedMotion, beginBrandReveal]);

  return (
    <main className={`intro-screen phase-${phase}`}>
      <AstroBlackHoleSequence
        reducedMotion={reducedMotion}
        onSequenceComplete={beginBrandReveal}
      />
      <div className="intro-topline"><span>PLUTONIC</span><span>AN EXPRESSION IN MOTION</span></div>
      <div className="intro-centre">
        <div className="intro-mark"><BrandMark size={reducedMotion ? 86 : 104} /></div>
        <p className="intro-wordmark">PLUTONIC</p>
        <p className="intro-tagline">BEYOND THE ORDINARY.</p>
      </div>
      <p className="intro-coordinate">A STUDY IN GRAVITY, FORM & MOTION</p>
      <button className="skip-intro" onClick={onFinish}>SKIP INTRO <span>↗</span></button>
      <div className="intro-progress"><span /></div>
      <span className="intro-caption">M87* / THE EVENT HORIZON</span>
    </main>
  );
}

export default function App() {
  const [stage, setStage] = useState<Stage>(() => {
    if (typeof window === 'undefined') return 'intro';
    return window.sessionStorage.getItem('plutonic-intro-seen') === 'yes' ? 'categories' : 'intro';
  });
  const [category, setCategory] = useState<Category>('him');
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  const finishIntro = useCallback(() => {
    window.sessionStorage.setItem('plutonic-intro-seen', 'yes');
    setStage('categories');
  }, []);

  return (
    <div className="site-shell">
      {stage === 'intro' && <CinematicIntro reducedMotion={reducedMotion} onFinish={finishIntro} />}
      {stage === 'categories' && <CategorySelect onSelect={(next) => { setCategory(next); setStage('store'); }} />}
      {stage === 'store' && <Storefront category={category} onChangeCategory={() => setStage('categories')} />}
    </div>
  );
}
