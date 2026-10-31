import type { IncomingMessage, ServerResponse } from 'node:http';
import { sameOriginJson, send, sessionCookie } from '../_lib/adminAuth';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!sameOriginJson(req)) return send(res, 400, { error: 'bad_request' });
  // Clears the cookie in the browser. Tokens are short-lived and bound to the configured
  // admin; rotate ADMIN_SESSION_SECRET to invalidate every outstanding session at once.
  return send(res, 200, { authenticated: false }, { 'Set-Cookie': sessionCookie(req, '', 0) });
}
