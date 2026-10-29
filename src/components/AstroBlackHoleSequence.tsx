import { useEffect, useRef, useState, type SyntheticEvent } from 'react';

export type AstroSceneMode = 'intro' | 'brand' | 'categories' | 'store';

const EHT_OBSERVATION = 'https://cdn.eso.org/images/large/eso1907a.jpg';

// Keep only the second NASA sequence: the continuous camera pullback.
const CLIP = {
  label: 'PULLBACK',
  src: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-HD.mp4',
  revealAt: 7.5,
} as const;

type Props = {
  mode: AstroSceneMode;
  reducedMotion?: boolean;
  onBrandReveal: () => void;
};

/**
 * Persistent astrophysical background. The EHT M87* image is the observational
 * fallback; the one moving shot is NASA/JPL-Caltech's black-hole pullback
 * simulation. The same video remains mounted behind the logo and category layers.
 */
export default function AstroBlackHoleSequence({
  mode,
  reducedMotion = false,
  onBrandReveal,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [showObservation, setShowObservation] = useState(true);
  const revealSent = useRef(false);

  useEffect(() => {
    if (reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {
      // If autoplay is denied, the EHT observation stays visible as fallback.
    });
  }, [reducedMotion]);

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

  const handleCanPlay = () => {
    setVideoAvailable(true);
    setShowObservation(false);
    videoRef.current?.play().catch(() => undefined);
  };

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget.currentTime >= CLIP.revealAt) {
      signalBrandReveal();
    }
  };

  const handleVideoError = () => {
    setShowObservation(true);
    // Do not leave the visitor on a loading screen if NASA media is unavailable.
    signalBrandReveal();
  };

  return (
    <div className={`astro-scene astro-mode-${mode} ${videoAvailable ? 'has-footage' : ''}`} aria-label="NASA black-hole pullback simulation">
      <img
        className={'astro-observation ' + (showObservation ? 'is-visible' : 'is-receded')}
        src={EHT_OBSERVATION}
        alt=""
        fetchPriority="high"
        aria-hidden="true"
      />
      {!reducedMotion && (
        <video
          ref={videoRef}
          className={`astro-footage is-active ${videoAvailable ? 'is-ready' : ''}`}
          src={CLIP.src}
          poster={EHT_OBSERVATION}
          muted
          playsInline
          autoPlay
          preload="auto"
          loop
          onCanPlay={handleCanPlay}
          onTimeUpdate={handleTimeUpdate}
          onError={handleVideoError}
          aria-hidden="true"
        />
      )}
      <div className="astro-photon-ring" aria-hidden="true" />
      <div className="astro-vignette" />
      <div className="astro-credit">
        <span>OBSERVATION · EHT COLLABORATION · M87*</span>
        <span>SIMULATION · NASA / JPL-CALTECH · SIMPLIFIED OPTICAL MODEL</span>
      </div>
      <span className="astro-shot-label">
        {reducedMotion ? 'M87* / EHT OBSERVATION' : CLIP.label}
      </span>
    </div>
  );
}
