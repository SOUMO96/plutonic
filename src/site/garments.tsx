import { useId, type ReactElement } from 'react';

/**
 * Original flat-lay garment illustrations used while real photography is pending.
 * They are drawn in the product's actual colour, so choosing a colour changes the
 * garment. They are illustrations, not photographs, and are labelled as such.
 */
export type Garment = 'tee' | 'oversized' | 'tank' | 'longsleeve' | 'shorts' | 'jogger' | 'hoodie' | 'bra' | 'legging' | 'crop' | 'jacket' | 'set';

const BY_CATEGORY: Record<string, Garment> = {
  'T-shirts': 'tee', 'Oversized tees': 'oversized', 'Tank tops': 'tank', Compression: 'longsleeve', 'Gym shorts': 'shorts', Joggers: 'jogger',
  Hoodies: 'hoodie', 'Sports bras': 'bra', Leggings: 'legging', 'Training tops': 'crop', Sets: 'set', Jackets: 'jacket',
};
export const garmentFor = (category: string): Garment => BY_CATEGORY[category] ?? 'tee';

const lum = (hex: string) => { const n = parseInt(hex.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

type Shapes = { body: string[]; detail: string[]; dash?: string[]; extra?: ReactElement };

const SHAPES: Record<Exclude<Garment, 'set'>, Shapes> = {
  tee: {
    body: ['M140 92 L98 112 L48 176 L86 206 L116 178 L116 424 L284 424 L284 178 L314 206 L352 176 L302 112 L260 92 Q200 134 140 92 Z'],
    detail: ['M150 97 Q200 140 250 97', 'M116 178 L128 150', 'M284 178 L272 150'], dash: ['M116 408 L284 408', 'M62 184 L92 204', 'M338 184 L308 204'],
  },
  oversized: {
    body: ['M132 84 L70 106 L22 196 L64 224 L100 196 L92 436 L308 436 L300 196 L336 224 L378 196 L330 106 L268 84 Q200 130 132 84 Z'],
    detail: ['M144 90 Q200 138 256 90', 'M100 196 L112 140', 'M300 196 L288 140'], dash: ['M92 420 L308 420', 'M40 202 L68 220', 'M360 202 L332 220'],
  },
  tank: {
    body: ['M150 66 L150 150 Q150 192 122 218 L122 424 L278 424 L278 218 Q250 192 250 150 L250 66 L226 66 Q200 138 174 66 Z'],
    detail: ['M174 66 Q200 138 226 66', 'M122 218 Q150 200 150 150', 'M278 218 Q250 200 250 150'], dash: ['M122 408 L278 408'],
  },
  longsleeve: {
    body: ['M146 90 L104 106 L58 160 L42 346 L82 352 L106 226 L118 180 L118 416 L282 416 L282 180 L294 226 L318 352 L358 346 L342 160 L296 106 L254 90 Q200 130 146 90 Z'],
    detail: ['M156 95 Q200 134 244 95', 'M118 180 L120 150', 'M58 330 L88 336', 'M342 330 L312 336'], dash: ['M118 400 L282 400', 'M118 250 L118 400', 'M282 250 L282 400'],
  },
  shorts: {
    body: ['M112 112 L288 112 L304 336 L218 336 L200 214 L182 336 L96 336 Z'],
    detail: ['M112 112 L288 112 L288 148 L112 148 Z', 'M200 148 L200 214', 'M176 148 Q200 172 224 148'], dash: ['M100 322 L184 322', 'M216 322 L300 322', 'M118 130 L282 130'],
  },
  jogger: {
    body: ['M118 70 L282 70 L300 444 L226 444 L200 182 L174 444 L100 444 Z'],
    detail: ['M118 70 L282 70 L282 108 L118 108 Z', 'M102 424 L174 424', 'M226 424 L298 424', 'M200 108 L200 182'], dash: ['M118 90 L282 90', 'M108 410 L176 410', 'M224 410 L292 410'],
  },
  hoodie: {
    body: ['M146 104 L92 128 L46 204 L44 392 L86 398 L112 236 L112 426 L288 426 L288 236 L314 398 L356 392 L354 204 L308 128 L254 104 Q200 142 146 104 Z', 'M148 104 Q146 40 200 30 Q254 40 252 104 Q200 146 148 104 Z'],
    detail: ['M148 104 Q200 146 252 104', 'M170 112 L170 168', 'M230 112 L230 168', 'M134 312 L266 312 L282 372 L118 372 Z', 'M112 236 L124 200', 'M288 236 L276 200'], dash: ['M112 410 L288 410', 'M50 384 L84 390', 'M350 384 L316 390'],
  },
  bra: {
    body: ['M128 74 L152 74 L170 176 Q200 208 230 176 L248 74 L272 74 L290 196 Q306 252 284 278 L116 278 Q94 252 110 196 Z', 'M116 278 L284 278 L280 322 L120 322 Z'],
    detail: ['M170 176 Q200 224 230 176', 'M150 130 Q184 190 200 214', 'M250 130 Q216 190 200 214', 'M116 300 L284 300'], dash: ['M122 314 L278 314'],
  },
  legging: {
    body: ['M122 56 L278 56 L296 206 L262 446 L214 446 L200 170 L186 446 L138 446 L104 206 Z'],
    detail: ['M122 56 L278 56 L278 94 L122 94 Z', 'M200 94 L200 170', 'M236 428 L262 428', 'M164 428 L138 428'], dash: ['M122 76 L278 76', 'M141 432 L186 432', 'M214 432 L259 432'],
  },
  crop: {
    body: ['M146 120 L110 136 L70 184 L100 210 L126 190 L126 334 L274 334 L274 190 L300 210 L330 184 L290 136 L254 120 Q200 154 146 120 Z'],
    detail: ['M156 126 Q200 160 244 126', 'M126 190 L134 160', 'M274 190 L266 160'], dash: ['M126 320 L274 320', 'M80 190 L104 208', 'M320 190 L296 208'],
  },
  jacket: {
    body: ['M152 82 L102 104 L56 176 L50 372 L92 378 L114 232 L114 412 L286 412 L286 232 L308 378 L350 372 L344 176 L298 104 L248 82 L234 110 L200 128 L166 110 Z'],
    detail: ['M200 128 L200 412', 'M166 110 Q200 150 234 110', 'M114 232 L126 196', 'M286 232 L274 196', 'M140 330 L160 330', 'M240 330 L260 330'], dash: ['M114 396 L286 396', 'M56 362 L90 368', 'M344 362 L310 368'],
  },
};

function Single({ kind, fill, line, id }: { kind: Exclude<Garment, 'set'>; fill: string; line: string; id: string }) {
  const s = SHAPES[kind];
  return (
    <g>
      {s.body.map((d, i) => <path key={i} d={d} fill={fill} />)}
      {s.body.map((d, i) => <path key={'g' + i} d={d} fill={`url(#${id}-sh)`} />)}
      {s.body.map((d, i) => <path key={'o' + i} d={d} fill="none" stroke={line} strokeWidth="1.6" strokeLinejoin="round" />)}
      {s.detail.map((d, i) => <path key={'d' + i} d={d} fill="none" stroke={line} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity=".8" />)}
      {s.dash?.map((d, i) => <path key={'s' + i} d={d} fill="none" stroke={line} strokeWidth="1" strokeDasharray="3 4" opacity=".55" />)}
    </g>
  );
}

/** view: 0 front, 1 back (neckline lowered), 2 upper detail, 3 lower detail. */
export function GarmentArt({ kind, colour, view = 0 }: { kind: Garment; colour: string; view?: number }) {
  const id = useId().replace(/:/g, '');
  const dark = lum(colour) < 0.45;
  const line = dark ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.34)';
  const viewBox = view === 2 ? '90 40 220 275' : view === 3 ? '90 245 220 275' : '0 0 400 500';
  return (
    <svg className="garment" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id + '-sh'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity={dark ? 0.1 : 0.32} />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity={dark ? 0.32 : 0.14} />
        </linearGradient>
        <radialGradient id={id + '-fl'} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#000" stopOpacity=".28" /><stop offset="1" stopColor="#000" stopOpacity="0" /></radialGradient>
      </defs>
      {view < 2 && <ellipse cx="200" cy="470" rx="120" ry="14" fill={`url(#${id}-fl)`} />}
      {kind === 'set' ? (
        <>
          <g transform="translate(40 0) scale(.62)"><Single kind="bra" fill={colour} line={line} id={id} /></g>
          <g transform="translate(130 120) scale(.66)"><Single kind="legging" fill={colour} line={line} id={id} /></g>
        </>
      ) : (
        <g transform={view === 1 ? 'translate(0 0)' : undefined}><Single kind={kind} fill={colour} line={line} id={id} />
          {view === 1 && <path d="M150 92 Q200 108 250 92" fill="none" stroke={line} strokeWidth="1.3" opacity=".9" />}</g>
      )}
    </svg>
  );
}
