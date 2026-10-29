import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export type AstroSceneMode = 'intro' | 'brand' | 'categories' | 'store';

const EHT_OBSERVATION = 'https://cdn.eso.org/images/large/eso1907a.jpg';

const CLIPS = [
  {
    label: 'CLOSE APPROACH',
    src: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/4-Black_hole_up_close-HD.mp4',
    cutAt: 5.0,
  },
  {
    label: 'PULLBACK',
    src: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-HD.mp4',
    cutAt: 7.5,
  },
  {
    label: 'ORBIT',
    src: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/2-Orbiting_a_black_hole-HD.mp4',
    cutAt: 9.5,
  },
] as const;

type Props = {
  mode: AstroSceneMode;
  reducedMotion?: boolean;
  onBrandReveal: () => void;
};

/**
 * Persistent astrophysical background. The EHT M87* image is the observational
 * reference / fallback; the moving shots are NASA/JPL-Caltech simulations.
 * Keeping this component mounted lets the same footage continue beneath the
 * logo and category layers without replacing the background.
 */
export default function AstroBlackHoleSequence({
  mode,
  reducedMotion = false,
  onBrandReveal,
}: Props) {
  const videoRefs = useRef<Array<HTMLVideoElement | null>>([]);
  const [activeClip, setActiveClip] = useState(0);
  const [videoAvailable, setVideoAvailable] = useState<boolean[]>([false, false, false]);
  const advanceLocked = useRef(false);
  const revealSent = useRef(false);

  useEffect(() => {
    if (reducedMotion) return;
    const active = videoRefs.current[activeClip];
    if (!active) return;

    videoRefs.current.forEach((video, index) => {
      if (!video || index === activeClip) return;
      // Let the previous shot finish its opacity crossfade before pausing it.
      window.setTimeout(() => {
        if (index !== activeClip) video.pause();
      }, 1250);
    });

    active.currentTime = 0;
    active.play().catch(() => {
      // If autoplay is denied, the EHT observation remains visible underneath.
    });
  }, [activeClip, reducedMotion]);

  useEffect(() => {
    if (reducedMotion && !revealSent.current) {
      const timer = window.setTimeout(() => {
        revealSent.current = true;
        onBrandReveal();
      }, 1800);
      return () => window.clearTimeout(timer);
    }
  }, [reducedMotion, onBrandReveal]);

  const signalBrandReveal = () => {
    if (revealSent.current) return;
    revealSent.current = true;
    onBrandReveal();
  };

  const handleCanPlay = (index: number) => {
    setVideoAvailable((current) => current.map((value, i) => i === index ? true : value));
    if (index === activeClip) {
      videoRefs.current[index]?.play().catch(() => undefined);
    }
  };

  const handleTimeUpdate = (index: number, event: SyntheticEvent<HTMLVideoElement>) => {
    if (index !== activeClip || advanceLocked.current) return;
    if (event.currentTarget.currentTime < CLIPS[index].cutAt) return;

    advanceLocked.current = true;
    if (index < CLIPS.length - 1) {
      setActiveClip(index + 1);
      window.setTimeout(() => { advanceLocked.current = false; }, 1400);
    } else {
      signalBrandReveal();
    }
  };

  const handleVideoError = (index: number) => {
    if (index !== activeClip) return;
    if (index < CLIPS.length - 1) {
      advanceLocked.current = true;
      setActiveClip(index + 1);
      window.setTimeout(() => { advanceLocked.current = false; }, 1400);
    } else {
      signalBrandReveal();
    }
  };

  return (
    <div className={`astro-scene astro-mode-${mode}`} aria-label="EHT observation and NASA black-hole simulation">
      <img
        className="astro-observation"
        src={EHT_OBSERVATION}
        alt=""
        fetchPriority="high"
        aria-hidden="true"
      />
      {!reducedMotion && CLIPS.map((clip, index) => (
        <video
          key={clip.src}
          ref={(node) => { videoRefs.current[index] = node; }}
          className={`astro-footage ${activeClip === index ? 'is-active' : ''} ${videoAvailable[index] ? 'is-ready' : ''}`}
          src={clip.src}
          poster={EHT_OBSERVATION}
          muted
          playsInline
          autoPlay={index === 0}
          preload={index === 0 ? 'auto' : 'metadata'}
          loop={index === CLIPS.length - 1}
          onCanPlay={() => handleCanPlay(index)}
          onTimeUpdate={(event) => handleTimeUpdate(index, event)}
          onError={() => handleVideoError(index)}
          aria-hidden="true"
        />
      ))}
      <div className="astro-vignette" />
      <div className="astro-credit">
        <span>OBSERVATION · EHT COLLABORATION · M87*</span>
        <span>SIMULATION · NASA / JPL-CALTECH · SIMPLIFIED OPTICAL MODEL</span>
      </div>
      <span className="astro-shot-label">
        {reducedMotion ? 'M87* / EHT OBSERVATION' : CLIPS[activeClip].label}
      </span>
    </div>
  );
}
