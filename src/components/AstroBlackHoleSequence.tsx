import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import BlackHoleLogoMorph from './BlackHoleLogoMorph';
import { computePlateScale } from '../lib/plateFrame';
import { INTRO_SPEED } from '../lib/introTiming';

export type AstroSceneMode = 'intro' | 'brand' | 'categories' | 'store';

const EHT_OBSERVATION = 'https://cdn.eso.org/images/large/eso1907a.jpg';

const CLIP = {
  label: 'PULLBACK',
  desktopSrc: '/media/plutonic-pullback-1080.webm',
  mobileSrc: '/media/plutonic-pullback-720.webm',
  fallbackSrc: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-HD.mp4',
  revealAt: 7.5,
} as const;

type Props = {
  mode: AstroSceneMode;
  reducedMotion?: boolean;
  onBrandReveal: () => void;
};

/**
 * Persistent astrophysical background. Uses build-local, bandwidth-efficient
 * VP9 transcodes of the approved NASA pullback: 1080p on desktop and 720p on
 * smaller screens. The original NASA MP4 remains as a compatibility fallback.
 */
/** On a slow connection or with Data Saver on, use the small clip (a quarter of the size) instead of the full-size one. */
const leanConnection = () => {
  const c = (typeof navigator !== 'undefined' ? (navigator as unknown as { connection?: { saveData?: boolean; effectiveType?: string } }).connection : undefined);
  return !!c && (!!c.saveData || /^(slow-2g|2g|3g)$/.test(c.effectiveType ?? ''));
};

export default function AstroBlackHoleSequence({
  mode,
  reducedMotion = false,
  onBrandReveal,
}: Props) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fallbackUsed = useRef(false);
  const revealSent = useRef(false);
  const [videoAvailable, setVideoAvailable] = useState(false);
  const [showObservation, setShowObservation] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string>(() => (
    typeof window !== 'undefined' && (window.matchMedia('(max-width: 900px)').matches || leanConnection())
      ? CLIP.mobileSrc
      : CLIP.desktopSrc
  ));

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const updateSource = () => {
      if (!fallbackUsed.current) {
        setVideoSrc(media.matches || leanConnection() ? CLIP.mobileSrc : CLIP.desktopSrc);
      }
    };
    updateSource();
    media.addEventListener?.('change', updateSource);
    return () => media.removeEventListener?.('change', updateSource);
  }, []);

  // The footage is only a backdrop once the store is open: stop decoding it.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (mode === 'store') video.pause();
    else if (mode === 'categories' && !reducedMotion) video.play().catch(() => undefined);
  }, [mode, reducedMotion]);

  // One animation on every screen: only the plate's uniform magnification adapts.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const apply = () => {
      const { width, height } = scene.getBoundingClientRect();
      scene.style.setProperty('--plate-k', computePlateScale(width, height).toFixed(4));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(scene);
    window.addEventListener('resize', apply);
    window.visualViewport?.addEventListener('resize', apply);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', apply);
      window.visualViewport?.removeEventListener('resize', apply);
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = INTRO_SPEED;
    video.play().catch(() => {
      // Keep the EHT observation visible until the video can play.
    });
  }, [reducedMotion, videoSrc]);

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

  // Frame-accurate brand trigger: at INTRO_SPEED the ~4 Hz timeupdate event
  // would land up to a quarter-second (0.75 s of footage) late.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || reducedMotion || !('requestVideoFrameCallback' in video)) return;
    let handle = 0;
    const tick = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (meta.mediaTime >= CLIP.revealAt) {
        signalBrandReveal();
        return;
      }
      handle = video.requestVideoFrameCallback(tick);
    };
    handle = video.requestVideoFrameCallback(tick);
    return () => video.cancelVideoFrameCallback(handle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion, videoSrc]);

  const handleCanPlay = () => {
    setVideoAvailable(true);
    setShowObservation(false);
    const video = videoRef.current;
    if (video && !revealSent.current) video.playbackRate = INTRO_SPEED;
    video?.play().catch(() => undefined);
  };

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (event.currentTarget.currentTime >= CLIP.revealAt) {
      signalBrandReveal();
    }
  };

  const handleVideoError = () => {
    if (!fallbackUsed.current) {
      fallbackUsed.current = true;
      setVideoSrc(CLIP.fallbackSrc);
      setVideoAvailable(false);
      setShowObservation(true);
      return;
    }
    setShowObservation(true);
    signalBrandReveal();
  };

  return (
    <div ref={sceneRef} className={`astro-scene astro-mode-${mode} ${videoAvailable ? 'has-footage' : ''}`} aria-label="NASA black-hole pullback simulation">
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
          src={videoSrc}
          poster={EHT_OBSERVATION}
          muted
          playsInline
          autoPlay
          preload="auto"
          loop
          disablePictureInPicture
          onCanPlay={handleCanPlay}
          onTimeUpdate={handleTimeUpdate}
          onError={handleVideoError}
          aria-hidden="true"
        />
      )}
      <BlackHoleLogoMorph
        mode={mode}
        videoRef={videoRef}
        footageReady={videoAvailable}
        reducedMotion={reducedMotion}
      />
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
