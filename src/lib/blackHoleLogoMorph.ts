/**
 * WebGL renderer for the black-hole → PLUTONIC mark transformation.
 *
 * The live NASA pullback <video> is the only source of imagery until the
 * mark has formed. Each frame the footage is sampled through the same camera
 * the CSS plate uses, then (during the morph) its coordinates are deformed
 * toward the mark's geometry and its luminance field is level-set morphed
 * into a signed-distance field generated from the real logo asset.
 */

export const LOGO_SRC = '/plutonic-logo.webp';

/** Measurements of public/plutonic-logo.webp (640 × 640), in source pixels. */
export const LOGO = {
  ring: { x: 309.5, y: 255 },
  innerRadius: 84,
  slashAngle: (19.7 * Math.PI) / 180,
  markCentreX: 319.5,
  markTop: 137,
  lockupBottom: 456,
  /** Padded crop of the symbol only (no wordmark). */
  field: { x: 61, y: 117, w: 517, h: 275 },
  /** Padded crop of the PLUTONIC wordmark. */
  word: { x: 85, y: 402, w: 470, h: 56 },
} as const;

const FIELD_SCALE = 2;
/** Encoded SDF range, in logo source pixels either side of the edge. */
const FIELD_RANGE = 32;

/**
 * Pullback footage measurements (shadow width as a fraction of frame width,
 * shadow-dome centroid as a fraction of frame height), sampled from the
 * 1920 × 1080 transcode. Used to keep the virtual camera locked on the hole.
 */
const FOOTAGE_T = [6, 7.5, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22];
const FOOTAGE_W = [73, 65, 57, 53, 50, 46, 43, 40, 36, 32, 30, 30].map((v) => v / 480);
const FOOTAGE_CY = [0.368, 0.372, 0.381, 0.39, 0.398, 0.406, 0.412, 0.418, 0.427, 0.433, 0.437, 0.439];

function interp(table: number[], t: number) {
  if (t <= FOOTAGE_T[0]) return table[0];
  for (let i = 1; i < FOOTAGE_T.length; i++) {
    if (t <= FOOTAGE_T[i]) {
      const u = (t - FOOTAGE_T[i - 1]) / (FOOTAGE_T[i] - FOOTAGE_T[i - 1]);
      return table[i - 1] + (table[i] - table[i - 1]) * u;
    }
  }
  return table[table.length - 1];
}

/** Black-hole centre and shadow radius in video pixels at footage time t. */
export function footageHole(t: number, videoW: number, videoH: number) {
  const width = interp(FOOTAGE_W, t);
  const radius = (width * videoW) / 2;
  // The measured centroid is that of the upper shadow dome; the hole's centre
  // sits on the disk plane, 4r/3π below it.
  const y = interp(FOOTAGE_CY, t) * videoH + (4 * radius) / (3 * Math.PI);
  return { x: videoW / 2, y, radius };
}

export type LockupLayout = {
  /** CSS px per logo source px. */
  scale: number;
  ringX: number;
  ringY: number;
  top: number;
  centreX: number;
  taglineTop: number;
};

export function computeLockupLayout(vw: number, vh: number): LockupLayout {
  const narrow = vw < 700;
  const portrait = vh > vw;
  const markW = narrow
    ? Math.min(vw * 0.62, 300)
    : portrait ? Math.min(vw * 0.55, 420) : Math.min(vw * 0.3, 400);
  const scale = Math.min(markW / 477, (vh * 0.34) / 235);
  const taglineGap = Math.max(20, 42 * scale);
  const taglineH = narrow ? 10 : 12;
  const stackH = (LOGO.lockupBottom - LOGO.markTop) * scale + taglineGap + taglineH;
  const top = (vh - stackH) / 2 - vh * 0.015;
  const centreX = vw / 2;
  return {
    scale,
    top,
    centreX,
    ringX: centreX + (LOGO.ring.x - LOGO.markCentreX) * scale,
    ringY: top + (LOGO.ring.y - LOGO.markTop) * scale,
    taglineTop: top + (LOGO.lockupBottom - LOGO.markTop) * scale + taglineGap,
  };
}

export type LogoAssets = {
  field: { data: Uint8Array; width: number; height: number };
  markUrl: string;
  wordUrl: string;
};

function edt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/** Squared Euclidean distance transform (Felzenszwalb & Huttenlocher). */
function edt(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }
}

function keyedCrop(img: HTMLImageElement, r: { x: number; y: number; w: number; h: number }) {
  const c = document.createElement('canvas');
  c.width = r.w;
  c.height = r.h;
  const g = c.getContext('2d')!;
  g.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  const px = g.getImageData(0, 0, r.w, r.h);
  const d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 765;
    const a = Math.min(1, Math.max(0, (lum - 0.08) / 0.42));
    const tone = a > 0 ? Math.min(1, lum / Math.max(a, 1e-3)) : 0;
    d[i] = d[i + 1] = d[i + 2] = Math.round(tone * 255);
    d[i + 3] = Math.round(a * 255);
  }
  g.putImageData(px, 0, 0);
  return c.toDataURL('image/png');
}

/**
 * Builds the symbol's signed-distance field (R) and edge-dilated shading (G)
 * from the supplied raster logo, plus keyed crops of the symbol and wordmark.
 */
export async function prepareLogoAssets(): Promise<LogoAssets> {
  // The load event (not img.decode()) resolves even while the tab is hidden.
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Logo asset failed to load'));
    img.src = LOGO_SRC;
  });

  const { x, y, w, h } = LOGO.field;
  const W = w * FIELD_SCALE;
  const H = h * FIELD_SCALE;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, x, y, w, h, 0, 0, W, H);
  const src = g.getImageData(0, 0, W, H).data;

  const lum = new Float32Array(W * H);
  const inside = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    lum[i] = (src[i * 4] + src[i * 4 + 1] + src[i * 4 + 2]) / 765;
    inside[i] = lum[i] > 0.45 ? 1 : 0;
  }

  const outer = new Float64Array(W * H);
  const inner = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    outer[i] = inside[i] ? 0 : 1e20;
    inner[i] = inside[i] ? 1e20 : 0;
  }
  edt(outer, W, H);
  edt(inner, W, H);

  // Shading: carry the mark's own tones a few pixels past its edge so the
  // anti-aliased boundary never picks up the dark source background.
  let shade = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) shade[i] = inside[i] ? lum[i] : 0;
  for (let pass = 0; pass < 4; pass++) {
    const next = shade.slice();
    for (let py = 1; py < H - 1; py++) {
      for (let px = 1; px < W - 1; px++) {
        const i = py * W + px;
        if (next[i] > 0) continue;
        next[i] = Math.max(shade[i - 1], shade[i + 1], shade[i - W], shade[i + W]);
      }
    }
    shade = next;
  }

  const data = new Uint8Array(W * H * 4);
  const range = FIELD_RANGE * FIELD_SCALE;
  for (let i = 0; i < W * H; i++) {
    const sd = inside[i] ? -(Math.sqrt(inner[i]) - 0.5) : Math.sqrt(outer[i]) - 0.5;
    data[i * 4] = Math.round(Math.min(1, Math.max(0, 0.5 + sd / (2 * range))) * 255);
    data[i * 4 + 1] = Math.round(Math.min(1, shade[i]) * 255);
    data[i * 4 + 3] = 255;
  }

  return {
    field: { data, width: W, height: H },
    markUrl: keyedCrop(img, LOGO.field),
    wordUrl: keyedCrop(img, LOGO.word),
  };
}

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uViewport;
uniform float uDpr;
uniform sampler2D uVideo;
uniform sampler2D uVideoPrev;
uniform float uFrameMix;
uniform vec2 uVideoSize;
uniform sampler2D uField;
uniform vec4 uFieldRect;
uniform float uFieldRange;
uniform vec2 uRingLogo;
uniform float uInnerR;
uniform float uSlash;
uniform vec2 uBh;
uniform float uK;
uniform float uTheta;
uniform vec2 uAnchor;
uniform float uShadowPx;
uniform float uFadeR;
uniform vec2 uRing;
uniform float uS;
uniform float uMorph;
uniform float uSettleScale;
uniform float uSettleRot;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 footage(vec2 p) {
  vec2 r = rot(-uTheta) * (p - uBh) / uK;
  vec2 uv = (uAnchor + r) / uVideoSize;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(0.0);
  // Feather the frame edge so a pulled-back camera never shows the plate border.
  vec2 edge = smoothstep(vec2(0.0), vec2(0.06, 0.1), uv) * smoothstep(vec2(0.0), vec2(0.06, 0.1), 1.0 - uv);
  // Blend the previous decoded frame into the current one across its display
  // interval so slowed footage moves continuously instead of in held steps.
  vec3 c = mix(texture2D(uVideoPrev, uv).rgb, texture2D(uVideo, uv).rgb, uFrameMix);
  return c * edge.x * edge.y;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, uViewport.y - gl_FragCoord.y) / uDpr;
  // Settle: the whole object eases into its resting scale and angle.
  vec2 q = uRing + rot(-uSettleRot) * (p - uRing) / uSettleScale;
  float unit = uS * uInnerR;
  vec2 ml = (q - uRing) / unit;
  vec2 a = rot(uSlash) * ml;

  float m = uMorph;
  float w = m * m * (3.0 - 2.0 * m);
  float r = length(a);

  // Deform the footage itself toward the mark: frame-dragging twist around the
  // photon ring, the disk compressed into the slash, the ring held in place.
  float ringZone = 1.0 - smoothstep(1.25, 1.9, r);
  vec2 src = rot(0.42 * sin(3.14159265 * m) * exp(-(r - 1.1) * (r - 1.1) * 1.6)) * a;
  src.x *= mix(1.0, 1.55, w * (1.0 - ringZone));
  src.y *= mix(1.0, 2.2, w * (1.0 - 0.7 * ringZone));
  vec2 ps = uRing + rot(-uSlash) * src * unit;

  // Focus falloff aligned to the disk: generous along it, tight across it.
  vec2 fd = rot(-uTheta) * (ps - uBh) / uShadowPx;
  float focus = 1.0 - smoothstep(uFadeR * 0.55, uFadeR, length(vec2(fd.x, fd.y * 2.3)));
  vec3 col = footage(ps) * focus;
  if (m <= 0.0) { gl_FragColor = vec4(col, 1.0); return; }

  float px = 1.25;
  float l = luma(col) * 0.4 + 0.15 * focus * (
    luma(footage(ps + vec2(px, 0.0))) + luma(footage(ps - vec2(px, 0.0))) +
    luma(footage(ps + vec2(0.0, px))) + luma(footage(ps - vec2(0.0, px))));
  float dV = (0.45 - l) * 0.6;

  vec2 fuv = (uRingLogo + ml * uInnerR - uFieldRect.xy) / uFieldRect.zw;
  vec4 f = vec4(1.0, 0.0, 0.0, 1.0);
  if (fuv.x >= 0.0 && fuv.y >= 0.0 && fuv.x <= 1.0 && fuv.y <= 1.0) f = texture2D(uField, fuv);
  float dL = (f.r - 0.5) * 2.0 * uFieldRange / uInnerR;

  // Level-set morph: the footage's own bright structure becomes the mark.
  float d = mix(dV, dL, smoothstep(0.05, 1.0, m));
  // Focus pull in log space: edges sharpen at an even perceptual rate.
  float aa = exp(mix(log(0.25), log(0.8 / (unit * uSettleScale)), smoothstep(0.0, 1.0, m)));
  float A = clamp(0.5 - d / (2.0 * aa), 0.0, 1.0);

  vec3 chroma = col / max(max(col.r, max(col.g, col.b)), 0.04);
  vec3 logoTone = vec3(f.g) * vec3(0.965, 0.975, 1.0);
  vec3 shapeCol = mix(chroma * 0.96, logoTone, smoothstep(0.3, 0.85, m));
  float core = 1.0 - smoothstep(0.96, 1.02, length(ml));
  vec3 space = vec3(0.010, 0.011, 0.013) * (1.0 - core);
  vec3 formed = mix(space, shapeCol, A) + col * (1.0 - A) * (1.0 - smoothstep(0.1, 0.75, m)) * 0.85;
  gl_FragColor = vec4(mix(col, formed, smoothstep(0.0, 0.4, m)), 1.0);
}
`;

export type FrameUniforms = {
  bhX: number;
  bhY: number;
  k: number;
  theta: number;
  anchorX: number;
  anchorY: number;
  shadowPx: number;
  fadeR: number;
  layout: LockupLayout;
  morph: number;
  settleScale: number;
  settleRot: number;
  /** 0 → previous video frame, 1 → newest video frame. */
  frameMix: number;
};

export class MorphRenderer {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  /** Two video textures (units 0 and 2); `current` indexes the newest frame. */
  private videoTex: WebGLTexture[] = [];
  private current = 0;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private videoSize = [1920, 1080];
  private dpr = 1;

  static create(canvas: HTMLCanvasElement, field: LogoAssets['field']): MorphRenderer | null {
    const gl = canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) return null;
    try {
      return new MorphRenderer(gl, field);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGLRenderingContext, field: LogoAssets['field']) {
    this.gl = gl;
    const compile = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link');
    gl.useProgram(program);
    this.program = program;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    for (const name of [
      'uViewport', 'uDpr', 'uVideo', 'uVideoPrev', 'uFrameMix', 'uVideoSize', 'uField', 'uFieldRect', 'uFieldRange', 'uRingLogo',
      'uInnerR', 'uSlash', 'uBh', 'uK', 'uTheta', 'uAnchor', 'uShadowPx', 'uFadeR', 'uRing', 'uS',
      'uMorph', 'uSettleScale', 'uSettleRot',
    ]) {
      this.loc[name] = gl.getUniformLocation(program, name);
    }

    const texture = (unit: number) => {
      const t = gl.createTexture()!;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    for (const unit of [0, 2]) {
      this.videoTex.push(texture(unit));
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array(3));
    }
    texture(1);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.width, field.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.data);

    gl.uniform1i(this.loc.uVideo, 0);
    gl.uniform1i(this.loc.uVideoPrev, 2);
    gl.uniform1i(this.loc.uField, 1);
    gl.uniform4f(this.loc.uFieldRect, LOGO.field.x, LOGO.field.y, LOGO.field.w, LOGO.field.h);
    gl.uniform1f(this.loc.uFieldRange, FIELD_RANGE);
    gl.uniform2f(this.loc.uRingLogo, LOGO.ring.x, LOGO.ring.y);
    gl.uniform1f(this.loc.uInnerR, LOGO.innerRadius);
    gl.uniform1f(this.loc.uSlash, LOGO.slashAngle);
  }

  resize(cssW: number, cssH: number, dpr: number) {
    const canvas = this.gl.canvas as HTMLCanvasElement;
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    this.dpr = dpr;
    this.gl.viewport(0, 0, w, h);
  }

  /**
   * Uploads the video's newest frame into the older texture slot and makes it
   * current; the previous frame stays available for blending. `replaceBoth`
   * seeds both slots with the same frame. Throws for a cross-origin source.
   */
  pushVideoFrame(video: HTMLVideoElement, replaceBoth = false) {
    const gl = this.gl;
    const slots = replaceBoth ? [0, 1] : [1 - this.current];
    for (const slot of slots) {
      gl.activeTexture(slot === 0 ? gl.TEXTURE0 : gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.videoTex[slot]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, video);
    }
    this.current = replaceBoth ? 0 : 1 - this.current;
    gl.uniform1i(this.loc.uVideo, this.current === 0 ? 0 : 2);
    gl.uniform1i(this.loc.uVideoPrev, this.current === 0 ? 2 : 0);
    this.videoSize = [video.videoWidth, video.videoHeight];
  }

  render(u: FrameUniforms) {
    const gl = this.gl;
    const l = this.loc;
    const canvas = gl.canvas as HTMLCanvasElement;
    gl.uniform2f(l.uViewport, canvas.width, canvas.height);
    gl.uniform1f(l.uDpr, this.dpr);
    gl.uniform2f(l.uVideoSize, this.videoSize[0], this.videoSize[1]);
    gl.uniform2f(l.uBh, u.bhX, u.bhY);
    gl.uniform1f(l.uK, u.k);
    gl.uniform1f(l.uTheta, u.theta);
    gl.uniform2f(l.uAnchor, u.anchorX, u.anchorY);
    gl.uniform1f(l.uShadowPx, u.shadowPx);
    gl.uniform1f(l.uFadeR, u.fadeR);
    gl.uniform2f(l.uRing, u.layout.ringX, u.layout.ringY);
    gl.uniform1f(l.uS, u.layout.scale);
    gl.uniform1f(l.uMorph, u.morph);
    gl.uniform1f(l.uSettleScale, u.settleScale);
    gl.uniform1f(l.uSettleRot, u.settleRot);
    gl.uniform1f(l.uFrameMix, u.frameMix);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose() {
    this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
