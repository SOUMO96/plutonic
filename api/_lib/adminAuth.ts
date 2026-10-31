/**
 * Server-only administrator authentication for PLUTONIC.
 *
 * Runs inside Vercel serverless functions (and the Vite dev middleware). Nothing in this
 * file is ever bundled into the browser. Secrets come only from environment variables:
 *
 *   ADMIN_EMAIL           the single authorised administrator's email
 *   ADMIN_PASSWORD_HASH   `scrypt$N$r$p$<salt b64>$<hash b64>` from `npm run admin:hash`
 *   ADMIN_SESSION_SECRET  >= 32 random characters used to sign session cookies
 *
 * If any of them is missing or malformed, every function fails closed.
 */
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const COOKIE_NAME = 'pl_admin';
export const SESSION_SECONDS = 60 * 60 * 8; // 8 hours, absolute (no sliding renewal)

type Config = { email: string; hash: string; secret: string };

export function readConfig(): Config | null {
  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const hash = (process.env.ADMIN_PASSWORD_HASH ?? '').trim();
  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!email || !hash || secret.length < 32) return null;
  if (!parseHash(hash)) return null;
  return { email, hash, secret };
}

type Parsed = { N: number; r: number; p: number; salt: Buffer; key: Buffer };
function parseHash(h: string): Parsed | null {
  const parts = h.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
  const N = Number(parts[1]), r = Number(parts[2]), p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 2 || N > 1 << 20 || r < 1 || r > 32 || p < 1 || p > 16) return null;
  const salt = Buffer.from(parts[4], 'base64'), key = Buffer.from(parts[5], 'base64');
  if (salt.length < 8 || key.length < 16) return null;
  return { N, r, p, salt, key };
}

const sha = (s: string) => createHash('sha256').update(s).digest();
const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && timingSafeEqual(a, b);

// A fixed decoy so the work done is the same whether or not the email matched.
const DECOY: Parsed = { N: 16384, r: 8, p: 1, salt: Buffer.alloc(16, 7), key: Buffer.alloc(64, 9) };

/** Constant-time check of email + password. Always performs one scrypt derivation. */
export function verifyCredentials(cfg: Config, email: string, password: string): boolean {
  const parsed = parseHash(cfg.hash)!;
  const emailOk = safeEqual(sha(email.trim().toLowerCase()), sha(cfg.email));
  const target = emailOk ? parsed : DECOY;
  const derived = scryptSync(password, target.salt, target.key.length, { N: target.N, r: target.r, p: target.p, maxmem: 256 * 1024 * 1024 });
  const passOk = safeEqual(derived, target.key);
  return emailOk && passOk;
}

/** Create a signed, expiring session token bound to the configured admin identity. */
export function signSession(cfg: Config, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ r: 'admin', s: sha(cfg.email).toString('hex').slice(0, 16), iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + SESSION_SECONDS, n: randomBytes(8).toString('hex') })).toString('base64url');
  const sig = createHmac('sha256', cfg.secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** True only for a token this server signed, that has not expired and matches the current admin. */
export function verifySession(cfg: Config, token: string | undefined, now = Date.now()): boolean {
  if (!token || token.length > 1024) return false;
  const [payload, sig, extra] = token.split('.');
  if (!payload || !sig || extra !== undefined) return false;
  const expected = createHmac('sha256', cfg.secret).update(payload).digest();
  let given: Buffer;
  try { given = Buffer.from(sig, 'base64url'); } catch { return false; }
  if (!safeEqual(expected, given)) return false;
  try {
    const d = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { r?: string; s?: string; exp?: number };
    return d.r === 'admin' && d.s === sha(cfg.email).toString('hex').slice(0, 16) && typeof d.exp === 'number' && d.exp * 1000 > now;
  } catch { return false; }
}

// ---------------------------------------------------------------- HTTP helpers

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const isSecure = (req: IncomingMessage) => (req.headers['x-forwarded-proto'] ?? '').toString().split(',')[0] === 'https' || process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

export function sessionCookie(req: IncomingMessage, token: string, maxAge: number) {
  return [`${COOKIE_NAME}=${token}`, 'Path=/api/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`, ...(isSecure(req) ? ['Secure'] : [])].join('; ');
}

export function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function readJson(req: IncomingMessage): Promise<Record<string, unknown> | null> {
  const preset = (req as IncomingMessage & { body?: unknown }).body;
  if (preset && typeof preset === 'object') return preset as Record<string, unknown>;
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 8192) return null; chunks.push(c as Buffer); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString('utf8')); return v && typeof v === 'object' ? v : null; } catch { return null; }
}

/** Reject cross-site POSTs: Origin (when sent) must match the host, and the body must be JSON. */
export function sameOriginJson(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin) {
    try { if (new URL(origin).host !== req.headers.host) return false; } catch { return false; }
  }
  return (req.headers['content-type'] ?? '').toString().toLowerCase().startsWith('application/json');
}

// Best-effort brute-force throttle (per warm function instance; see README for limits).
const attempts = new Map<string, { n: number; first: number }>();
export function throttled(req: IncomingMessage): boolean {
  const ip = ((req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').toString().split(',')[0]).trim();
  const now = Date.now(), rec = attempts.get(ip);
  if (!rec || now - rec.first > 15 * 60_000) { attempts.set(ip, { n: 1, first: now }); return false; }
  rec.n += 1;
  return rec.n > 8;
}
export const clearThrottle = (req: IncomingMessage) => { attempts.delete(((req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').toString().split(',')[0]).trim()); };

/**
 * Reusable guard for every admin API endpoint, present and future:
 *   const cfg = requireAdmin(req, res); if (!cfg) return;
 * Sends 401/503 and returns null unless the request carries a valid administrator session.
 */
export function requireAdmin(req: IncomingMessage, res: ServerResponse) {
  const cfg = readConfig();
  if (!cfg) { send(res, 503, { error: 'admin_not_configured' }); return null; }
  if (!verifySession(cfg, parseCookies(req.headers.cookie)[COOKIE_NAME])) { send(res, 401, { error: 'unauthorized' }); return null; }
  return cfg;
}
