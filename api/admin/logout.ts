import type { IncomingMessage, ServerResponse } from 'node:http';
import { COOKIE_NAME, parseCookies, readConfig, revokeSessions, sameOriginJson, send, sessionCookie, verifySession } from '../_lib/adminAuth.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'bad_request' });
  // Only a signed-in administrator can end sessions. Signing out invalidates every session issued before now
  // (a stolen cookie stops working), and clears the cookie in this browser.
  const cfg = readConfig();
  if (cfg && verifySession(cfg, parseCookies(req.headers.cookie)[COOKIE_NAME])) await revokeSessions();
  return send(res, 200, { authenticated: false }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}
