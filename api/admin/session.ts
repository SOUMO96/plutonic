import type { IncomingMessage, ServerResponse } from 'node:http';
import { COOKIE_NAME, parseCookies, readConfig, send, verifySession } from '../_lib/adminAuth';

export default function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  const cfg = readConfig();
  if (!cfg) return send(res, 503, { authenticated: false, error: 'admin_not_configured' });
  if (!verifySession(cfg, parseCookies(req.headers.cookie)[COOKIE_NAME])) return send(res, 401, { authenticated: false });
  return send(res, 200, { authenticated: true });
}
