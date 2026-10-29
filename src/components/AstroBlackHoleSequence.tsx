import { useEffect, useState, type SyntheticEvent } from 'react';

const EHT_OBSERVATION =
  'https://cdn.eso.org/images/large/eso1907a.jpg';

const NASA_CLIPS = [
  'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/4-Black_hole_up_close-HD.mp4',
  'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/3-Pulling_back_from_a_black_hole-HD.mp4',
  'https://svs.gsfc.nasa.gov/vis/a010000/a014600/a014619/2-Orbiting_a_black_hole-HD.mp4',
] as const;

type Props = { reducedMotion?: boolean };

/**
 * Uses a real EHT reconstructed observation as the first frame, then transitions
 * to NASA/JPL-Caltech scientific visualizations for the moving camera sequence.
 * The NASA shots are simulations, not live telescope footage.
 */
export default function AstroBlackHoleSequence({ reducedMotion = false }: Props) {
  const [clipIndex, setClipIndex] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setVideoReady(false);
  }, [clipIndex]);

  const handleTimeUpdate = (event: SyntheticEvent<HTMLVideoElement>) => {
    if (clipIndex === 0 && event.currentTarget.currentTime >= 3.8) {
      setClipIndex(1);
    } else if (clipIndex === 1 && event.currentTarget.currentTime >= 6.6) {
      setClipIndex(2);
    }
  };

  const advanceClip = () => {
    setClipIndex((current) => Math.min(current + 1, NASA_CLIPS.length - 1));
  };

  const handleVideoReady = (event: SyntheticEvent<HTMLVideoElement>) => {
    setVideoReady(true);
    event.currentTarget.play().catch(() => {
      // The still EHT observation remains visible if autoplay is unavailable.
    });
  };

  return (
    <div className={`astro-scene ${videoReady ? 'has-footage' : ''}`} aria-label="Black hole observation and scientific simulation">
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
          className={`astro-footage ${videoReady ? 'is-ready' : ''} astro-clip-${clipIndex}`}
          src={NASA_CLIPS[clipIndex]}
          poster={EHT_OBSERVATION}
          autoPlay
          muted
          playsInline
          preload={clipIndex === 0 ? 'auto' : 'metadata'}
          loop={clipIndex === 2}
          onCanPlay={handleVideoReady}
          onTimeUpdate={handleTimeUpdate}
          onEnded={advanceClip}
          aria-hidden="true"
        />
      )}

      <div className="astro-vignette" />
      <div className="astro-credit">
        <span>OBSERVATION: EHT COLLABORATION · M87*</span>
        <span>SIMULATION: NASA/JPL-CALTECH/R. HURT (IPAC)</span>
      </div>
    </div>
  );
}
