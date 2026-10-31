import type { IncomingMessage, ServerResponse } from 'node:http';
import { SESSION_SECONDS, clearThrottle, readConfig, readJson, sameOriginJson, send, sessionCookie, signSession, throttled, verifyCredentials } from '../_lib/adminAuth';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  const cfg = readConfig();
  if (!cfg) return send(res, 503, { error: 'admin_not_configured' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'bad_request' });
  if (throttled(req)) return send(res, 429, { error: 'too_many_attempts' }, { 'Retry-After': '900' });
  const body = await readJson(req);
  const email = typeof body?.email === 'string' ? body.email : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 254 || password.length > 256) return send(res, 400, { error: 'missing_fields' });
  if (!verifyCredentials(cfg, email, password)) return send(res, 401, { error: 'invalid_credentials' });
  clearThrottle(req);
  return send(res, 200, { authenticated: true }, { 'Set-Cookie': sessionCookie(req, signSession(cfg), SESSION_SECONDS) });
}
