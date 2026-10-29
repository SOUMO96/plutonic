import { useCallback, useEffect, useState } from 'react';
import BlackHoleCanvas from './components/BlackHoleCanvas';
import BrandMark from './components/BrandMark';
import CategorySelect from './components/CategorySelect';
import Storefront from './components/Storefront';

type Stage = 'intro' | 'categories' | 'store';
type Category = 'him' | 'her';

function CinematicIntro({ reducedMotion, onFinish }: { reducedMotion: boolean; onFinish: () => void }) {
  const [phase, setPhase] = useState(reducedMotion ? 3 : 0);

  useEffect(() => {
    if (reducedMotion) {
      const timer = window.setTimeout(onFinish, 2800);
      return () => window.clearTimeout(timer);
    }
    const timers = [
      window.setTimeout(() => setPhase(1), 6200),
      window.setTimeout(() => setPhase(2), 7600),
      window.setTimeout(() => setPhase(3), 9000),
      window.setTimeout(onFinish, 10800),
    ];
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [reducedMotion, onFinish]);

  return (
    <main className={`intro-screen phase-${phase}`}>
      <BlackHoleCanvas reducedMotion={reducedMotion} />
      <div className="intro-grain" />
      <div className="intro-topline"><span>PLUTONIC</span><span>AN EXPRESSION IN MOTION</span></div>
      <div className="intro-centre">
        <div className="intro-mark"><BrandMark size={reducedMotion ? 86 : 104} /></div>
        <p className="intro-wordmark">PLUTONIC</p>
        <p className="intro-tagline">BEYOND THE ORDINARY.</p>
      </div>
      <p className="intro-coordinate">19° 04' 11.4&quot; N&nbsp;&nbsp; 72° 52' 42.7&quot; E</p>
      <button className="skip-intro" onClick={onFinish}>SKIP INTRO <span>↗</span></button>
      <div className="intro-progress"><span /></div>
      <span className="intro-caption">A NEW POINT OF GRAVITY</span>
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
