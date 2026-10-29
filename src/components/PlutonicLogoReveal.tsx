import { useEffect, useRef, useState } from 'react';

type Props = {
  active: boolean;
  reducedMotion?: boolean;
};

const LOGO_SRC = '/plutonic-logo.svg';
const MORPH_DURATION_MS = 3400;
const PARTICLE_COUNT = 1900;
const BRAND_PUNCHLINE = ''; // Add approved punchline copy here when supplied.

type Particle = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  phase: number;
  size: number;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => {
  const t = clamp01(n);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

export default function PlutonicLogoReveal({ active, reducedMotion = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!active) {
      setComplete(false);
      return;
    }
    if (reducedMotion) {
      setComplete(true);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !ctx) {
      setComplete(true);
      return;
    }

    let raf = 0;
    let image: HTMLImageElement | null = null;
    let particles: Particle[] = [];
    let startedAt = 0;
    let disposed = false;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.8);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const sampleLogo = (img: HTMLImageElement) => {
      const sample = document.createElement('canvas');
      sample.width = 300;
      sample.height = 300;
      const sampleCtx = sample.getContext('2d', { willReadFrequently: true });
      if (!sampleCtx) return [];
      sampleCtx.drawImage(img, 0, 0, 300, 300);
      const pixels = sampleCtx.getImageData(0, 0, 300, 300).data;
      const bright: Array<[number, number]> = [];
      for (let y = 0; y < 300; y += 1) {
        for (let x = 0; x < 300; x += 1) {
          const i = (y * 300 + x) * 4;
          const luma = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
          if (pixels[i + 3] > 160 && luma > 105) bright.push([x, y]);
        }
      }
      return bright;
    };

    const buildParticles = (points: Array<[number, number]>) => {
      const logoSize = Math.min(width * .72, 400, height * .58);
      const left = (width - logoSize) / 2;
      const top = (height - logoSize) / 2;
      const cx = width / 2;
      const cy = height / 2;

      particles = Array.from({ length: Math.min(PARTICLE_COUNT, points.length) }, (_, index) => {
        const target = points[Math.floor(Math.random() * points.length)];
        const angle = Math.random() * Math.PI * 2;
        const radius = .42 + Math.random() * .62;
        const ringX = Math.min(width * .39, 410) * radius;
        const ringY = Math.min(height * .28, 235) * radius;

        // Origins follow an inclined accretion plane and a surrounding photon arc.
        const onDisk = index % 3 !== 0;
        const sx = onDisk
          ? cx + (Math.random() - .5) * Math.min(width * .78, 840)
          : cx + Math.cos(angle) * ringX;
        const sy = onDisk
          ? cy + (sx - cx) * .43 + (Math.random() - .5) * 15
          : cy + Math.sin(angle) * ringY;

        return {
          sx,
          sy,
          tx: left + (target[0] / 300) * logoSize,
          ty: top + (target[1] / 300) * logoSize,
          phase: Math.random() * .22,
          size: .55 + Math.random() * 1.15,
        };
      });
    };

    const draw = (now: number) => {
      if (disposed) return;
      if (!startedAt) startedAt = now;
      const progress = clamp01((now - startedAt) / MORPH_DURATION_MS);
      const collapse = ease(progress / .48);
      const form = ease((progress - .3) / .7);
      const cx = width / 2;
      const cy = height / 2;
      ctx.clearRect(0, 0, width, height);

      for (const p of particles) {
        const t = clamp01(form + p.phase * (1 - form) * .45);
        const x = p.sx * (1 - collapse) * (1 - form) + p.tx * form + cx * collapse * (1 - form);
        const y = p.sy * (1 - collapse) * (1 - form) + p.ty * form + cy * collapse * (1 - form);
        const swirl = (1 - t) * (1 - t) * 22;
        const a = Math.atan2(p.sy - cy, p.sx - cx) + (1 - t) * 1.7;
        const px = x + Math.cos(a) * swirl;
        const py = y + Math.sin(a) * swirl;
        const alpha = .18 + .82 * clamp01(progress * 2.1 + .25);
        const warmth = 1 - clamp01(progress * 1.6);
        const r = Math.round(255);
        const g = Math.round(255 - warmth * 62);
        const b = Math.round(255 - warmth * 165);
        ctx.fillStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
        ctx.shadowColor = warmth > .15 ? 'rgba(255,184,103,.8)' : 'rgba(255,255,255,.88)';
        ctx.shadowBlur = (1 - progress) * 8 + 1;
        ctx.beginPath();
        ctx.arc(px, py, p.size * (.55 + form * .35), 0, Math.PI * 2);
        ctx.fill();
      }

      if (progress < 1) {
        raf = requestAnimationFrame(draw);
      } else {
        ctx.clearRect(0, 0, width, height);
        setComplete(true);
      }
    };

    resize();
    image = new Image();
    image.onload = () => {
      if (disposed) return;
      const points = sampleLogo(image as HTMLImageElement);
      if (!points.length) {
        setComplete(true);
        return;
      }
      buildParticles(points);
      raf = requestAnimationFrame(draw);
    };
    image.onerror = () => setComplete(true);
    image.src = LOGO_SRC;

    const handleResize = () => {
      resize();
      if (image?.complete && image.naturalWidth) buildParticles(sampleLogo(image));
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', handleResize);
    };
  }, [active, reducedMotion]);

  return (
    <div className={'plutonic-logo-reveal ' + (active ? 'is-active' : '') + (complete ? ' is-complete' : '')}>
      <canvas ref={canvasRef} className="logo-morph-particles" aria-hidden="true" />
      <img
        className="plutonic-final-logo"
        src={LOGO_SRC}
        alt="PLUTONIC"
        draggable={false}
      />
      {BRAND_PUNCHLINE && <p className="plutonic-punchline">{BRAND_PUNCHLINE}</p>}
    </div>
  );
}
