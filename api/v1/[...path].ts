import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleV1 } from '../../server/v1/routes.js';

// One serverless function serves the whole versioned REST API (/api/v1/*). Routing and all
// business rules live in server/v1 so they can be reused and tested independently of the web UI.
export default function handler(req: IncomingMessage, res: ServerResponse) {
  return handleV1(req, res);
}
