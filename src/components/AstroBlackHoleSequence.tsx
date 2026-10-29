import { useRef, useState, type SyntheticEvent } from 'react';

const EHT_OBSERVATION = 'https://cdn.eso.org/images/large/eso1907a.jpg';

const CLIPS = [
  {
    label: 'CLOSE APPROACH',
    hd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/4-Black_hole_up_close-HD.mp4',
    uhd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/4-Black_hole_up_close-4K.mp4',
  },
  {
    label: 'PULLBACK',
    hd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-HD.mp4',
    uhd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-4K.mp4',
  },
  {
    label: 'ORBIT',
    hd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/2-Orbiting_a_black_hole-HD.mp4',
    uhd: 'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/2-Orbiting_a_black_hole-4K.mp4',
  },
] as const;

type Props = {
  reducedMotion?: boolean;
  onSequenceComplete: () => void;
};

/**
 * Opens with the Event Horizon Telescope's M87* observation, then transitions
 * into NASA/JPL-Caltech visualizations for the close-up, camera pullback and orbit.
 * The NASA sequence is a scientific visualization, not live observational footage.
 */
export default function AstroBlackHoleSequence({
  reducedMotion = false,
  onSequenceComplete,
}: Props) {
  const [clipIndex, setClipIndex] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const completedRef = useRef(false);

  const finishOnce = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onSequenceComplete();
  };

  const handleCanPlay = (event: SyntheticEvent<HTMLVideoElement>) => {
    setVideoReady(true);
    event.currentTarget.play().catch(() => {
      // The EHT observation remains as a still fallback if autoplay is blocked.
    });
  };

  const handleEnded = () => {
    if (clipIndex < CLIPS.length - 1) {
      setVideoReady(false);
      setClipIndex((index) => index + 1);
    } else {
      finishOnce();
    }
  };

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (clipIndex === CLIPS.length - 1 && event.currentTarget.currentTime >= 9) {
      finishOnce();
    }
  };

  const handleError = () => {
    setVideoFailed(true);
    if (clipIndex < CLIPS.length - 1) {
      setClipIndex((index) => index + 1);
    } else {
      // Keep the real EHT still visible and allow the brand reveal to continue.
      finishOnce();
    }
  };

  const current = CLIPS[clipIndex];

  return (
    <div
      className={`astro-scene ${videoReady ? 'has-footage' : ''} ${videoFailed ? 'video-fallback' : ''}`}
      aria-label="Event Horizon Telescope observation and NASA black-hole simulation"
    >
      <img
        className="astro-observation"
        src={EHT_OBSERVATION}
        alt=""
        fetchPriority="high"
        aria-hidden="true"
      />

      {!reducedMotion && (
        <video
          key={clipIndex}
          className={`astro-footage astro-clip-${clipIndex} ${videoReady ? 'is-ready' : ''}`}
          poster={EHT_OBSERVATION}
          autoPlay
          muted
          playsInline
          preload={clipIndex === 0 ? 'auto' : 'metadata'}
          onCanPlay={handleCanPlay}
          onEnded={handleEnded}
          onTimeUpdate={handleTimeUpdate}
          onError={handleError}
          loop={clipIndex === 2}
          aria-hidden="true"
        >
          <source src={current.uhd} type="video/mp4" media="(min-width: 1600px)" />
          <source src={current.hd} type="video/mp4" />
        </video>
      )}

      <div className="astro-vignette" />
      <div className="astro-credit">
        <span>OBSERVATION · EHT COLLABORATION · M87*</span>
        <span>SIMULATION · NASA / JPL-CALTECH · SIMPLIFIED OPTICAL MODEL</span>
      </div>
      <span className="astro-shot-label">{reducedMotion ? 'M87* / EHT OBSERVATION' : current.label}</span>
    </div>
  );
}
