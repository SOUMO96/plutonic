import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform float uMorph;
  uniform float uZoom;
  uniform vec2 uPointer;
  varying vec2 vUv;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float starField(vec2 p) {
    vec2 grid = p * 112.0;
    vec2 cell = floor(grid);
    vec2 f = fract(grid) - 0.5;
    float n = hash21(cell);
    vec2 offset = vec2(hash21(cell + 13.1), hash21(cell + 7.7)) - 0.5;
    float d = length(f - offset);
    float size = mix(0.008, 0.026, hash21(cell + 5.3));
    return (1.0 - smoothstep(0.0, size, d)) * step(0.984, n) * (0.3 + 0.9 * hash21(cell + 2.0));
  }

  void main() {
    vec2 screen = (vUv - 0.5) * 2.0;
    screen.x *= uResolution.x / max(uResolution.y, 1.0);
    float time = uTime;
    float morph = clamp(uMorph, 0.0, 1.0);

    float orbit = 0.055 * sin(time * 0.22) + 0.025 * sin(time * 0.09);
    float c = cos(orbit);
    float s = sin(orbit);
    mat2 cameraTurn = mat2(c, -s, s, c);
    vec2 p = cameraTurn * (screen + uPointer * 0.012);

    vec2 lensed = p * (1.0 + 0.12 / (dot(p, p) + 0.055));
    float stars = starField(lensed + vec2(time * 0.0012, -time * 0.0007));
    vec3 color = vec3(0.003, 0.004, 0.007);
    color += vec3(0.52, 0.62, 0.74) * stars * 0.92;

    float shrink = mix(1.0, 0.006, morph);
    vec2 q = p / max(uZoom * shrink, 0.001);
    float holeRadius = length(q);
    vec2 disc = vec2(q.x, q.y * 2.8);
    float radius = length(disc);
    float angle = atan(disc.y, disc.x);

    float turbulence = 0.70
      + 0.15 * sin(angle * 8.0 - time * 1.1 + radius * 31.0)
      + 0.09 * sin(angle * 19.0 + time * 0.75 - radius * 67.0)
      + 0.06 * sin(radius * 155.0 - time * 1.6 + angle * 3.0);
    float innerEdge = smoothstep(0.35, 0.48, radius);
    float outerEdge = 1.0 - smoothstep(0.67, 0.86, radius);
    float diskBand = exp(-pow((radius - 0.54) / 0.14, 2.0));
    float disk = diskBand * innerEdge * outerEdge * max(turbulence, 0.0);

    float doppler = clamp(0.69 + 0.31 * cos(angle - 0.35), 0.18, 1.0);
    vec3 deepBlue = vec3(0.16, 0.27, 0.39);
    vec3 silver = vec3(0.72, 0.80, 0.88);
    vec3 warmWhite = vec3(1.0, 0.88, 0.73);
    vec3 diskColor = mix(deepBlue, silver, clamp(0.36 + 0.36 * turbulence + 0.18 * cos(angle * 2.0), 0.0, 1.0));
    diskColor = mix(diskColor, warmWhite, clamp((doppler - 0.55) * 1.5, 0.0, 0.7));

    float halo = exp(-pow((radius - 0.56) / 0.23, 2.0)) * 0.19;
    float diskLight = disk * doppler;
    float objectFade = 1.0 - smoothstep(0.73, 0.99, morph);
    color += diskColor * (diskLight * 1.65 + halo) * objectFade;

    float photonRing = exp(-pow((holeRadius - 0.174) / 0.012, 2.0));
    float photonFlicker = 0.83 + 0.17 * sin(angle * 7.0 - time * 1.2);
    color += vec3(0.84, 0.91, 1.0) * photonRing * photonFlicker * 0.82 * objectFade;

    float innerGlow = exp(-pow((holeRadius - 0.205) / 0.055, 2.0));
    color += vec3(0.27, 0.39, 0.52) * innerGlow * 0.24 * objectFade;

    float eventHorizon = 1.0 - smoothstep(0.148, 0.163, holeRadius);
    color = mix(color, vec3(0.0003, 0.0004, 0.0007), eventHorizon * objectFade);

    float dustSpiral = exp(-pow(sin(angle * 3.0 + radius * 20.0 - time * 0.8), 2.0) * 18.0);
    dustSpiral *= exp(-pow((radius - 0.61) / 0.11, 2.0)) * (1.0 - smoothstep(0.5, 0.95, morph));
    color += vec3(0.64, 0.73, 0.84) * dustSpiral * 0.11;

    float convergence = exp(-dot(p, p) * 180.0) * smoothstep(0.38, 0.98, morph);
    color += vec3(0.73, 0.84, 1.0) * convergence * 0.56;

    float vignette = 1.0 - smoothstep(0.46, 1.52, length(screen));
    color *= 0.56 + vignette * 0.44;
    color = pow(max(color, 0.0), vec3(0.88));

    gl_FragColor = vec4(color, 1.0);
  }
`;

type BlackHoleCanvasProps = {
  reducedMotion?: boolean;
};

export default function BlackHoleCanvas({ reducedMotion = false }: BlackHoleCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: window.devicePixelRatio < 1.6,
        powerPreference: 'high-performance',
        stencil: false,
        depth: false,
      });
    } catch {
      mount.classList.add('webgl-unavailable');
      return;
    }

    const mobile = window.matchMedia('(max-width: 760px)').matches;
    const maxPixelRatio = reducedMotion ? 1 : mobile ? 1.15 : 1.65;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setSize(mount.clientWidth || window.innerWidth, mount.clientHeight || window.innerHeight, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.14;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const uniforms = {
      uResolution: { value: new THREE.Vector2(mount.clientWidth, mount.clientHeight) },
      uTime: { value: 0 },
      uMorph: { value: 0 },
      uZoom: { value: 1.4 },
      uPointer: { value: new THREE.Vector2(0, 0) },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthWrite: false,
      depthTest: false,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(plane);

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    const onPointer = (event: PointerEvent) => {
      const bounds = mount.getBoundingClientRect();
      uniforms.uPointer.value.set(
        (event.clientX - bounds.left) / bounds.width - 0.5,
        0.5 - (event.clientY - bounds.top) / bounds.height,
      );
    };
    mount.addEventListener('pointermove', onPointer, { passive: true });

    const start = performance.now();
    let frame = 0;
    let lastFrame = 0;
    const frameInterval = 1000 / 60;
    const smooth = (value: number) => {
      const x = Math.min(1, Math.max(0, value));
      return x * x * (3 - 2 * x);
    };

    const render = (now: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || now - lastFrame < frameInterval) return;
      lastFrame = now;

      const elapsed = reducedMotion ? 1.2 : (now - start) / 1000;
      const zoomOut = smooth(elapsed / 4.2);
      const zoomIn = elapsed > 4.3 && elapsed < 5.7 ? Math.sin(((elapsed - 4.3) / 1.4) * Math.PI) * 0.08 : 0;
      uniforms.uTime.value = elapsed;
      uniforms.uZoom.value = 1.48 - zoomOut * 0.43 + zoomIn;
      uniforms.uMorph.value = reducedMotion ? 0 : smooth((elapsed - 6.1) / 2.15);
      renderer.render(scene, camera);
    };

    if (reducedMotion) {
      uniforms.uTime.value = 1.2;
      renderer.render(scene, camera);
    } else {
      frame = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      mount.removeEventListener('pointermove', onPointer);
      scene.remove(plane);
      plane.geometry.dispose();
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [reducedMotion]);

  return <div ref={mountRef} className="black-hole-canvas" aria-hidden="true" />;
}
