// Serve ./dist locally with the response headers from vercel.json applied, so the service worker and headers can be tested
// without deploying. Usage: node scripts/serve-dist.mjs [port]   (default 4173)
// /api/* is answered with 404 JSON here (the real API lives on Vercel); tests that need it should stub it.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const cfg = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain' };

// vercel.json "source" patterns are path-to-regexp-ish; the ones used here are literals and "/x/(.*)" / "/(.*)".
const toRe = (src) => new RegExp('^' + src.replace(/[.+?^${}|[\]\\]/g, '\\$&') + '$');
const rules = (cfg.headers ?? []).map((h) => ({ re: toRe(h.source), headers: h.headers }));

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path.startsWith('/api/')) { res.writeHead(404, { 'content-type': 'application/json', 'cache-control': 'no-store' }); return res.end('{"error":"no api in local server"}'); }
  if (path === '/admin' || path.startsWith('/admin/')) { res.writeHead(307, { location: '/#/admin/login' }); return res.end(); }
  let file = join(root, normalize(path));
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { if (path !== '/' && !extname(path)) file = join(root, 'index.html'); }
  try {
    const body = await readFile(file);
    const headers = { 'content-type': types[extname(file)] ?? 'application/octet-stream' };
    for (const r of rules) if (r.re.test(path)) for (const h of r.headers) headers[h.key.toLowerCase()] = h.value;
    res.writeHead(200, headers); res.end(body);
  } catch { res.writeHead(404); res.end('not found'); }
}).listen(port, () => console.log(`dist served on http://localhost:${port}`));
