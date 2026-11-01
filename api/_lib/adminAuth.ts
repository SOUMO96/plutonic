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
import { adminDb } from './supabaseAdmin.js';

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
const decoyFor = (real: Parsed): Parsed => ({ N: real.N, r: real.r, p: real.p, salt: Buffer.alloc(real.salt.length, 7), key: Buffer.alloc(real.key.length, 9) });

/** Constant-time check of email + password. Always performs one scrypt derivation. */
export function verifyCredentials(cfg: Config, email: string, password: string): boolean {
  const parsed = parseHash(cfg.hash)!;
  const emailOk = safeEqual(sha(email.trim().toLowerCase()), sha(cfg.email));
  const target = emailOk ? parsed : decoyFor(parsed);
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

/** Tokens issued before this moment (unix seconds) are refused: set when the administrator signs out. */
export function sessionIssuedAt(token: string | undefined): number {
  try { const d = JSON.parse(Buffer.from((token ?? '').split('.')[0], 'base64url').toString('utf8')) as { iat?: number }; return typeof d.iat === 'number' ? d.iat : 0; } catch { return 0; }
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
    if (i > 0) { const raw = part.slice(i + 1).trim(); let v = raw; try { v = decodeURIComponent(raw); } catch { /* a malformed cookie is just an unusable cookie */ } out[part.slice(0, i).trim()] = v; }
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

export async function readJson(req: IncomingMessage, maxBytes = 8192): Promise<Record<string, unknown> | null> {
  const preset = (req as IncomingMessage & { body?: unknown }).body;
  if (preset && typeof preset === 'object') return preset as Record<string, unknown>;
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > maxBytes) return null; chunks.push(c as Buffer); }
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

// Brute-force throttle. Counted in the database so it holds across serverless instances; falls back to this
// instance's memory if the database is unreachable. The client address comes from the platform's own header.
const attempts = new Map<string, { n: number; first: number }>();
export const clientAddress = (req: IncomingMessage) => {
  const h = (k: string) => (req.headers[k] ?? '').toString().split(',').map((x) => x.trim()).filter(Boolean);
  return h('x-vercel-forwarded-for')[0] ?? h('x-real-ip')[0] ?? h('x-forwarded-for').pop() ?? req.socket.remoteAddress ?? 'unknown';
};
async function hit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const db = adminDb();
  if (db) { const { data, error } = await db.rpc('rate_hit', { p_key: key, p_window_seconds: windowSeconds, p_max: max }); if (!error && typeof data === 'boolean') return data; }
  const now = Date.now(), rec = attempts.get(key);
  if (!rec || now - rec.first > windowSeconds * 1000) { attempts.set(key, { n: 1, first: now }); return true; }
  return ++rec.n <= max;
}
/** True when this sign-in attempt should be refused (too many from this address, for this email, or overall). */
export async function throttled(req: IncomingMessage, email = ''): Promise<boolean> {
  const ip = clientAddress(req);
  const okIp = await hit('login:ip:' + ip, 900, 30);
  const okEmail = await hit('login:email:' + sha(email.trim().toLowerCase()).toString('hex').slice(0, 24), 900, 20);
  const okAll = await hit('login:all', 900, 300);
  return !(okIp && okEmail && okAll);
}

// ---------------------------------------------------------------- sign-out really signs out
let revokedCache: { at: number; before: number } | null = null;
async function revokedBefore(): Promise<number> {
  if (revokedCache && Date.now() - revokedCache.at < 10_000) return revokedCache.before;
  const db = adminDb();
  let before = revokedCache?.before ?? 0;
  if (db) { const { data } = await db.from('app_settings').select('value').eq('key', 'admin_revoked_before').maybeSingle(); before = Number(data?.value ?? 0) || 0; }
  revokedCache = { at: Date.now(), before }; return before;
}
export async function revokeSessions() {
  const now = Math.floor(Date.now() / 1000);
  const db = adminDb(); if (db) await db.from('app_settings').upsert({ key: 'admin_revoked_before', value: String(now) });
  revokedCache = { at: Date.now(), before: now };
}

/** Same check as requireAdmin without sending a response. */
export async function requireAdminQuiet(req: IncomingMessage): Promise<'ok' | 'no' | 'unconfigured'> {
  const cfg = readConfig();
  if (!cfg) return 'unconfigured';
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  return verifySession(cfg, token) && sessionIssuedAt(token) > (await revokedBefore()) ? 'ok' : 'no';
}

/**
 * Reusable guard for every admin API endpoint, present and future:
 *   const cfg = requireAdmin(req, res); if (!cfg) return;
 * Sends 401/503 and returns null unless the request carries a valid administrator session.
 */
export async function requireAdmin(req: IncomingMessage, res: ServerResponse) {
  const cfg = readConfig();
  if (!cfg) { send(res, 503, { error: 'admin_not_configured' }); return null; }
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!verifySession(cfg, token) || sessionIssuedAt(token) <= (await revokedBefore())) { send(res, 401, { error: 'unauthorized' }); return null; }
  return cfg;
}
