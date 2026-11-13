// Prints the caching/security headers for key paths and fails (exit 1) if any expectation is broken.
// Usage: node scripts/check-headers.mjs [baseUrl]   (default https://plutonic-cinematic-preview.vercel.app)
const base = (process.argv[2] ?? 'https://plutonic-cinematic-preview.vercel.app').replace(/\/$/, '');
const get = (p) => fetch(base + p, { redirect: 'manual' });

const checks = [];
const expect = (path, header, test, label) => checks.push({ path, header, test, label });
const has = (s) => (v) => (v ?? '').toLowerCase().includes(s);

expect('/', 'cache-control', has('must-revalidate'), 'HTML always revalidates');
expect('/index.html', 'cache-control', has('must-revalidate'), 'index.html always revalidates');
expect('/sw.js', 'cache-control', has('no-cache'), 'service worker is never served stale');
expect('/manifest.webmanifest', 'cache-control', has('no-cache'), 'manifest revalidates');
for (const h of ['x-content-type-options', 'referrer-policy', 'permissions-policy', 'cross-origin-opener-policy']) expect('/', h, (v) => !!v, `${h} present`);
expect('/', 'x-content-type-options', has('nosniff'), 'nosniff');
expect('/', 'content-security-policy-report-only', (v) => !!v, 'CSP (report-only) present');
if (!/localhost|127.0.0.1/.test(base)) expect('/', 'strict-transport-security', has('max-age'), 'HSTS present (added by Vercel at the edge)');

let bad = 0;
const seen = {};
for (const c of checks) {
  seen[c.path] ??= await get(c.path);
  const v = seen[c.path].headers.get(c.header);
  const ok = c.test(v);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${c.path.padEnd(24)} ${c.header.padEnd(36)} ${(v ?? '(none)').slice(0, 80)}  — ${c.label}`);
}
// API responses for signed-in style requests must never be shared-cached.
const priv = await fetch(base + '/api/v1/config', { headers: { authorization: 'Bearer x' } });
console.log(`info /api/v1/config with Authorization: x-vercel-cache=${priv.headers.get('x-vercel-cache')} cache-control=${priv.headers.get('cache-control')}`);
process.exit(bad ? 1 : 0);
