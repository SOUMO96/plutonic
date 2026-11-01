import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAdminQuiet, send } from '../_lib/adminAuth.js';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  const r = await requireAdminQuiet(req);
  if (r === 'unconfigured') return send(res, 503, { authenticated: false, error: 'admin_not_configured' });
  if (r === 'no') return send(res, 401, { authenticated: false });
  return send(res, 200, { authenticated: true });
}
