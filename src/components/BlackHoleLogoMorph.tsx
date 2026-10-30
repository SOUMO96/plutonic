import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { AstroSceneMode } from './AstroBlackHoleSequence';
import {
  LOGO,
  MorphRenderer,
  computeLockupLayout,
  footageHole,
  prepareLogoAssets,
  type FrameUniforms,
  type LockupLayout,
  type LogoAssets,
} from '../lib/blackHoleLogoMorph';

export const BRAND_PUNCHLINE = 'BEYOND THE ORDINARY';

/** Seconds after the handoff from the CSS plate to the WebGL canvas. */
const TIMELINE = {
  pullEnd: 2.4,
  /** The morph begins while the camera is still easing out, so motion never stops. */
  morphStart: 1.8,
  morphEnd: 5.0,
  /** The camera drift is released from here until settleEnd. */
  driftRelease: 1.0,
  settleEnd: 6.2,
  name: 5.6,
  punchline: 6.3,
} as const;

/** Extra magnification carried by the camera drift and released as it comes to rest. */
const DRIFT_SCALE = 0.11;
const DRIFT_ROTATION = 0.028;

type Props = {
  mode: AstroSceneMode;
  videoRef: RefObject<HTMLVideoElement | null>;
  footageReady: boolean;
  reducedMotion: boolean;
};

type Phase = 'idle' | 'morph' | 'static';

/** The visible shadow reads ~1.35× the measured dome; fit it to the mark's aperture. */
const SHADOW_FIT = 0.75;

/** Dev-only: set window.__morphHold = seconds to freeze the timeline for inspection. */
const devHold = (): number | undefined =>
  (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV
    ? (window as unknown as { __morphHold?: number }).__morphHold
    : undefined;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function viewportLayout() {
  return computeLockupLayout(window.innerWidth, window.innerHeight);
}

function canvasDpr() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.5 : 2);
}

/**
 * Reads the CSS plate's live transform so the first WebGL frame lands on
 * exactly the pixels the <video> element was showing.
 */
function readPlateCamera(video: HTMLVideoElement, hole: { x: number; y: number }) {
  const cs = getComputedStyle(video);
  const m = new DOMMatrixReadOnly(cs.transform === 'none' ? undefined : cs.transform);
  const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
  const parent = (video.offsetParent as HTMLElement | null)?.getBoundingClientRect();
  const w = video.offsetWidth;
  const h = video.offsetHeight;
  const cover = Math.max(w / video.videoWidth, h / video.videoHeight);
  const rx = (hole.x - video.videoWidth / 2) * cover + w / 2 - ox;
  const ry = (hole.y - video.videoHeight / 2) * cover + h / 2 - oy;
  return {
    x: (parent?.left ?? 0) + video.offsetLeft + ox + m.a * rx + m.c * ry + m.e,
    y: (parent?.top ?? 0) + video.offsetTop + oy + m.b * rx + m.d * ry + m.f,
    k: Math.hypot(m.a, m.b) * cover,
    theta: Math.atan2(m.b, m.a),
  };
}

/**
 * The black hole becomes the PLUTONIC symbol. The live footage is handed to
 * a WebGL canvas that pulls the camera back, then deforms and level-set
 * morphs the footage's own structure into the logo's signed-distance field.
 * Wordmark and punchline follow only once the symbol has formed.
 */
export default function BlackHoleLogoMorph({ mode, videoRef, footageReady, reducedMotion }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<MorphRenderer | null>(null);
  const finalFrame = useRef<FrameUniforms | null>(null);
  const started = useRef(false);
  const [assets, setAssets] = useState<LogoAssets | null>(null);
  const [assetsFailed, setAssetsFailed] = useState(false);
  const [layout, setLayout] = useState<LockupLayout>(() => viewportLayout());
  const layoutRef = useRef(layout);
  const [phase, setPhase] = useState<Phase>('idle');
  const [canvasOn, setCanvasOn] = useState(false);
  const [markIn, setMarkIn] = useState(false);
  const [nameIn, setNameIn] = useState(false);
  const [punchlineIn, setPunchlineIn] = useState(false);
  const gone = mode === 'categories' || mode === 'store';

  useEffect(() => {
    if (gone || assets || assetsFailed) return;
    let cancelled = false;
    prepareLogoAssets()
      .then((a) => !cancelled && setAssets(a))
      .catch(() => !cancelled && setAssetsFailed(true));
    return () => {
      cancelled = true;
    };
  }, [gone, assets, assetsFailed]);

  useEffect(() => {
    const onResize = () => {
      const next = viewportLayout();
      layoutRef.current = next;
      setLayout(next);
      const renderer = rendererRef.current;
      if (!renderer) return;
      renderer.resize(window.innerWidth, window.innerHeight, canvasDpr());
      if (finalFrame.current) {
        finalFrame.current = {
          ...finalFrame.current,
          layout: next,
          bhX: next.ringX,
          bhY: next.ringY,
        };
        renderer.render(finalFrame.current);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (mode !== 'brand' || started.current) return;
    if (!assets && !assetsFailed) return;
    started.current = true;
    const timers: number[] = [];
    const later = (seconds: number, fn: () => void) => timers.push(window.setTimeout(fn, seconds * 1000));

    const runStatic = () => {
      setPhase('static');
      later(0.05, () => setMarkIn(true));
      later(0.8, () => setNameIn(true));
      later(1.6, () => setPunchlineIn(true));
    };

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (reducedMotion || !assets || !video || !canvas || !footageReady || video.readyState < 2) {
      runStatic();
      return () => timers.forEach(clearTimeout);
    }

    const renderer = MorphRenderer.create(canvas, assets.field);
    if (!renderer) {
      runStatic();
      return () => timers.forEach(clearTimeout);
    }
    try {
      renderer.pushVideoFrame(video, true);
    } catch {
      // Cross-origin fallback footage cannot be sampled by WebGL.
      renderer.dispose();
      runStatic();
      return () => timers.forEach(clearTimeout);
    }
    rendererRef.current = renderer;
    renderer.resize(window.innerWidth, window.innerHeight, canvasDpr());
    setPhase('morph');

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const camera = readPlateCamera(video, footageHole(video.currentTime, vw, vh));
    const t0 = performance.now();
    let raf = 0;
    let rate = 1;
    let videoCallback = 0;
    let canvasShown = false;

    // Frame clock: track the hole with the timestamp of the frame actually on the
    // texture, and blend toward the newest frame across its display interval.
    const clock = {
      prev: video.currentTime,
      cur: video.currentTime,
      at: performance.now(),
      interval: 1000 / 30,
    };
    const hasFrameCallback = 'requestVideoFrameCallback' in video;
    const onVideoFrame = (now: number, meta: VideoFrameCallbackMetadata) => {
      if ((now - t0) / 1000 > TIMELINE.morphEnd + 0.2) return;
      try {
        renderer.pushVideoFrame(video);
      } catch {
        return;
      }
      const delta = meta.mediaTime - clock.cur;
      clock.prev = clock.cur;
      clock.cur = meta.mediaTime;
      clock.at = now;
      clock.interval = delta > 0
        ? Math.max(12, (delta / Math.max(video.playbackRate, 0.1)) * 1000)
        : 1000 / 30;
      videoCallback = video.requestVideoFrameCallback(onVideoFrame);
    };
    if (hasFrameCallback) videoCallback = video.requestVideoFrameCallback(onVideoFrame);
    let nameShown = false;
    let punchlineShown = false;

    const frame = (now: number) => {
      const hold = devHold();
      const t = hold ?? (now - t0) / 1000;
      const L = layoutRef.current;
      let frameMix = 1;
      let mediaTime = video.currentTime;
      if (hasFrameCallback) {
        frameMix = clamp01((now - clock.at) / clock.interval);
        mediaTime = lerp(clock.prev, clock.cur, frameMix);
      } else if (t < TIMELINE.morphEnd + 0.1) {
        try {
          renderer.pushVideoFrame(video, true);
        } catch {
          // Keep the last uploaded frame.
        }
      }
      const hole = footageHole(mediaTime, vw, vh);

      // Phase B — the camera pulls back and settles the hole onto the mark's centre.
      const pull = easeInOutCubic(clamp01(t / TIMELINE.pullEnd));
      const targetK = (LOGO.innerRadius * L.scale * SHADOW_FIT) / hole.radius;
      const k = Math.exp(lerp(Math.log(camera.k), Math.log(targetK), pull));

      // Phase C — the footage deforms into the mark.
      const u = clamp01((t - TIMELINE.morphStart) / (TIMELINE.morphEnd - TIMELINE.morphStart));
      const morph = easeInOutSine(u);

      // Phases B→D as one camera move: the drift builds with the pull-back and
      // is released continuously, so the zoom-out decelerates all the way to rest.
      const release = easeInOutSine(
        clamp01((t - TIMELINE.driftRelease) / (TIMELINE.settleEnd - TIMELINE.driftRelease)),
      );
      const drift = pull * (1 - release);

      const uniforms: FrameUniforms = {
        bhX: lerp(camera.x, L.ringX, pull),
        bhY: lerp(camera.y, L.ringY, pull),
        k,
        theta: lerp(camera.theta, -LOGO.slashAngle, pull),
        anchorX: hole.x,
        anchorY: hole.y,
        shadowPx: hole.radius * k,
        fadeR: Math.exp(lerp(Math.log(60), Math.log(6.5), easeOutCubic(clamp01(t / TIMELINE.pullEnd)))),
        layout: L,
        morph,
        settleScale: 1 + DRIFT_SCALE * drift,
        settleRot: DRIFT_ROTATION * drift,
        frameMix,
      };

      renderer.render(uniforms);
      if (!canvasShown) { canvasShown = true; setCanvasOn(true); }

      // Time dilation: the footage slows continuously as the hole gives up its shape.
      const nextRate = lerp(1, 0.45, smoothstep(0.4, 3.8, t));
      if (Math.abs(nextRate - rate) > 0.05) { rate = nextRate; video.playbackRate = rate; }

      if (!nameShown && t >= TIMELINE.name) { nameShown = true; setNameIn(true); }
      if (!punchlineShown && t >= TIMELINE.punchline) { punchlineShown = true; setPunchlineIn(true); }

      if (t < TIMELINE.settleEnd || hold !== undefined) {
        raf = requestAnimationFrame(frame);
      } else {
        finalFrame.current = { ...uniforms, morph: 1, settleScale: 1, settleRot: 0, frameMix: 1, bhX: L.ringX, bhY: L.ringY };
        renderer.render(finalFrame.current);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (hasFrameCallback) video.cancelVideoFrameCallback(videoCallback);
      timers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, assets, assetsFailed]);

  useEffect(() => {
    if (!gone) return;
    const video = videoRef.current;
    if (video) video.playbackRate = 1;
  }, [gone, videoRef]);

  useEffect(() => () => rendererRef.current?.dispose(), []);

  const S = layout.scale;
  const place = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({
    left: layout.centreX + (r.x - LOGO.markCentreX) * S,
    top: layout.top + (r.y - LOGO.markTop) * S,
    width: r.w * S,
    height: r.h * S,
  });

  return (
    <>
      <canvas
        ref={canvasRef}
        className={'bh-morph-canvas' + (phase === 'morph' && canvasOn ? ' is-on' : '') + (gone ? ' is-gone' : '')}
        aria-hidden="true"
      />
      {phase === 'static' && <div className={'bh-morph-backdrop' + (markIn && !gone ? ' is-on' : '')} aria-hidden="true" />}
      {phase !== 'idle' && (
        <div className={'bh-lockup' + (gone ? ' is-gone' : '')} role="img" aria-label={'PLUTONIC — ' + BRAND_PUNCHLINE.toLowerCase()}>
          {phase === 'static' && (
            <img
              className={'bh-lockup-mark' + (markIn ? ' is-in' : '')}
              src={assets?.markUrl ?? '/plutonic-logo-transparent.svg'}
              alt=""
              style={place(LOGO.field)}
              draggable={false}
            />
          )}
          {assets && (
            <img
              className={'bh-lockup-word' + (nameIn ? ' is-in' : '')}
              src={assets.wordUrl}
              alt=""
              style={place(LOGO.word)}
              draggable={false}
            />
          )}
          <p className={'bh-lockup-punchline' + (punchlineIn ? ' is-in' : '')} style={{ top: layout.taglineTop }}>
            {BRAND_PUNCHLINE}
          </p>
        </div>
      )}
    </>
  );
}
