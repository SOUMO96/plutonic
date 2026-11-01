import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleV1 } from '../../server/v1/routes.js';

// One serverless function serves the whole versioned REST API (/api/v1/*). Routing and all business rules live in
// server/v1 so they can be reused and tested independently of the web UI.
//
// Vercel's file-based catch-all only matches ONE path segment, so vercel.json rewrites every /api/v1/<path> to this
// function as /api/v1?__p=<path>; here the original path is put back before the API sees the request.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  const u = new URL(req.url ?? '/', 'http://x');
  const p = u.searchParams.get('__p');
  if (p !== null) {
    u.searchParams.delete('__p');
    req.url = '/api/v1/' + p.replace(/^\/+/, '') + u.search;
  }
  return handleV1(req, res);
}
