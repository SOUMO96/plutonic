/**
 * Framework-independent plumbing for the PLUTONIC REST API (/api/v1).
 * No UI code lives here. The same handlers serve the web app and any future mobile client,
 * which authenticate with a Supabase access token (`Authorization: Bearer <jwt>`).
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

const env = (k: string) => process.env[k];
export const supabaseUrl = () => env('SUPABASE_URL') ?? env('VITE_SUPABASE_URL');
const anonKey = () => env('SUPABASE_ANON_KEY') ?? env('VITE_SUPABASE_ANON_KEY');

/** Client acting as the caller: row-level security applies. Anonymous when no token. */
export function clientFor(token?: string): SupabaseClient {
  const url = supabaseUrl(), key = anonKey();
  if (!url || !key) throw new ApiError(503, 'not_configured', 'The database is not configured.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined });
}

/** Service-role client. Server-only; use only for payment settlement and other trusted work. */
let service: SupabaseClient | null = null;
export function serviceClient(): SupabaseClient {
  const url = supabaseUrl(), key = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new ApiError(503, 'not_configured', 'Server database access is not configured.');
  return (service ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}

export type Ctx = {
  req: IncomingMessage; res: ServerResponse; url: URL; params: Record<string, string>; ip: string;
  token?: string; db: SupabaseClient;
  /** Verified user (throws 401 if the token is missing/invalid). */
  user: () => Promise<User>;
  /** Parsed JSON body (throws 400 if invalid or too large). */
  body: () => Promise<Record<string, unknown>>;
};

export async function readRaw(req: IncomingMessage, max = 65536): Promise<string> {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) { n += (c as Buffer).length; if (n > max) throw new ApiError(413, 'too_large', 'Request body too large.'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString('utf8');
}

export const clientIp = (req: IncomingMessage) => ((req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').toString().split(',')[0]).trim();

// Best-effort per-instance rate limiting. Use the host's firewall for hard limits (see API.md).
const hits = new Map<string, { n: number; t: number }>();
export function limit(ip: string, bucket: string, max: number, windowMs = 60_000) {
  const k = bucket + '|' + ip, now = Date.now(), r = hits.get(k);
  if (!r || now - r.t > windowMs) { hits.set(k, { n: 1, t: now }); if (hits.size > 5000) for (const [kk, v] of hits) if (now - v.t > windowMs) hits.delete(kk); return; }
  if (++r.n > max) throw new ApiError(429, 'rate_limited', 'Too many requests. Please slow down.');
}

export const bearer = (req: IncomingMessage) => { const m = /^Bearer\s+([\w.-]{20,4096})$/.exec((req.headers.authorization ?? '').toString()); return m?.[1]; };

/** Turn a PostgREST/Postgres error into an API error without leaking internals. */
export function dbFail(error: { code?: string; message: string }): never {
  if (error.code === 'P0001') throw new ApiError(422, 'rejected', error.message);          // our own `raise exception`
  if (error.code === '42501' || error.code === 'PGRST301' || error.code === 'PGRST302') throw new ApiError(401, 'unauthorized', 'Please sign in.');
  if (error.code === '23514' || error.code === '22P02' || error.code === '23502') throw new ApiError(400, 'invalid', 'Invalid request.');
  throw new ApiError(500, 'server_error', 'Something went wrong.');
}

export const str = (v: unknown, max: number, min = 1) => typeof v === 'string' && v.trim().length >= min && v.length <= max;
