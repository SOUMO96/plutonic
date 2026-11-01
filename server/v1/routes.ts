import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, bearer, clientFor, clientIp, dbFail, limit, readRaw, serviceClient, str, type Ctx } from './lib';
import { cashfreeConfigured, cashfreeMode, createSession, fetchSettlement, verifyWebhookSignature } from './cashfree';

type Result = unknown | { __status: number; body: unknown };
type Handler = (c: Ctx) => Promise<Result>;
type Auth = 'none' | 'optional' | 'required';
type Route = { method: string; parts: string[]; handler: Handler; auth: Auth; bucket: string; max: number; raw?: boolean };

const created = (body: unknown) => ({ __status: 201, body });
const UUIDISH = /^[\w-]{1,64}$/;
const routes: Route[] = [];
function add(method: string, path: string, auth: Auth, handler: Handler, o: { bucket?: string; max?: number; raw?: boolean } = {}) {
  routes.push({ method, parts: path.split('/').filter(Boolean), handler, auth, bucket: o.bucket ?? 'api', max: o.max ?? 120, raw: o.raw });
}
const must = <T>(r: { data: T | null; error: { code?: string; message: string } | null }): T => { if (r.error) dbFail(r.error); return r.data as T; };

// ------------------------------------------------------------------ public catalogue
add('GET', '/config', 'none', async () => ({ version: 'v1', payments: { cashfree: cashfreeConfigured(), mode: cashfreeConfigured() ? cashfreeMode() : null } }));

add('GET', '/products', 'none', async ({ db, url }) => {
  const q = url.searchParams;
  let query = db.from('products').select('data').order('sort');
  const gender = q.get('gender'); if (gender === 'men' || gender === 'women') query = query.eq('data->>gender', gender);
  const category = q.get('category'); if (category && category.length < 80) query = query.eq('data->>category', category);
  const search = (q.get('q') ?? '').replace(/[%_,()*]/g, ' ').trim().slice(0, 60); if (search) query = query.ilike('data->>name', `%${search}%`);
  const lim = Math.min(100, Math.max(1, Number(q.get('limit')) || 50)), off = Math.max(0, Number(q.get('offset')) || 0);
  const rows = must(await query.range(off, off + lim - 1));
  return { items: rows.map((r: any) => r.data), limit: lim, offset: off };
});
add('GET', '/products/:id', 'none', async ({ db, params }) => {
  const r = must(await db.from('products').select('data').eq('id', params.id).maybeSingle());
  if (!r) throw new ApiError(404, 'not_found', 'Product not found.');
  return (r as any).data;
});
add('GET', '/categories', 'none', async ({ db }) => ({ items: must(await db.from('categories').select('slug, gender, name').order('sort')) }));
add('GET', '/coupons/:code', 'none', async ({ db, params }) => {
  const r = must(await db.rpc('get_coupon', { p_code: params.code }));
  if (!r) throw new ApiError(404, 'not_found', 'That code is not valid.');
  return r;
}, { bucket: 'coupon', max: 20 });
add('GET', '/reviews', 'none', async ({ db, url }) => {
  const pid = url.searchParams.get('productId') ?? '';
  if (!UUIDISH.test(pid)) throw new ApiError(400, 'invalid', 'productId is required.');
  return { items: must(await db.from('reviews').select('id, name, rating, body, size, fit, created_at').eq('product_id', pid).eq('status', 'Published').order('created_at', { ascending: false }).limit(100)) };
});

// ------------------------------------------------------------------ checkout, orders (guest allowed on checkout/track)
add('POST', '/orders', 'required', async ({ db, body }) => {
  const b = await body();
  const order = must(await db.rpc('place_order', { p: { items: b.items, coupon: b.coupon, delivery: b.delivery, payment: b.payment, address: b.address, email: b.email, mobile: b.mobile } }));
  return created(order);
}, { bucket: 'checkout', max: 10 });
add('GET', '/orders/track', 'none', async ({ db, url }) => {
  const r = must(await db.rpc('track_order', { p_id: url.searchParams.get('id') ?? '', p_email: url.searchParams.get('email') ?? '' }));
  if (!r) throw new ApiError(404, 'not_found', 'No matching order.');
  return r;
}, { bucket: 'track', max: 20 });
add('GET', '/orders', 'required', async ({ db }) => ({ items: must(await db.from('orders').select('data').order('created_at', { ascending: false }).limit(200)).map((r: any) => r.data) }));
add('GET', '/orders/:id', 'required', async ({ db, params }) => {
  const r = must(await db.from('orders').select('data').eq('id', params.id).maybeSingle());
  if (!r) throw new ApiError(404, 'not_found', 'Order not found.');
  return (r as any).data;
});
add('POST', '/orders/:id/cancel', 'required', async ({ db, params }) => must(await db.rpc('cancel_order', { p_id: params.id })));

add('GET', '/returns', 'required', async ({ db }) => ({ items: must(await db.from('returns').select('data').order('created_at', { ascending: false }).limit(200)).map((r: any) => r.data) }));
add('POST', '/returns', 'required', async ({ db, body }) => {
  const b = await body();
  return created(must(await db.rpc('create_return', { p: { orderId: b.orderId, itemIndex: b.itemIndex, kind: b.kind, reason: b.reason, note: b.note, exchangeSize: b.exchangeSize, exchangeColour: b.exchangeColour } })));
}, { bucket: 'write', max: 20 });
add('GET', '/refunds', 'required', async ({ db }) => ({ items: must(await db.from('refunds').select('id, order_id, return_id, source, amount, status, reference, created_at, processed_at').order('created_at', { ascending: false }).limit(200)) }));
add('POST', '/reviews', 'required', async (c) => {
  const b = await c.body(); const u = await c.user();
  if (!UUIDISH.test(String(b.productId ?? '')) || !str(b.name, 80) || !str(b.text, 2000, 10) || !Number.isInteger(b.rating) || (b.rating as number) < 1 || (b.rating as number) > 5) throw new ApiError(400, 'invalid', 'Check the review fields.');
  const r = must(await c.db.from('reviews').insert({ product_id: b.productId, user_id: u.id, name: b.name, rating: b.rating, body: b.text, size: String(b.size ?? '').slice(0, 10), fit: String(b.fit ?? '').slice(0, 40) }).select('id, status').single());
  return created(r);
}, { bucket: 'write', max: 20 });

// ------------------------------------------------------------------ account
add('GET', '/me', 'required', async (c) => {
  const u = await c.user();
  const p = must(await c.db.from('profiles').select('*').eq('id', u.id).maybeSingle()) as any;
  return { id: u.id, email: u.email, firstName: p?.first_name ?? '', lastName: p?.last_name ?? '', mobile: p?.mobile ?? '', fit: p?.fit ?? null, whatsapp: p?.whatsapp ?? true, newsletter: p?.newsletter ?? false };
});
add('PATCH', '/me', 'required', async (c) => {
  const u = await c.user(); const b = await c.body(); const patch: Record<string, unknown> = {};
  if (b.firstName !== undefined) { if (!str(b.firstName, 80, 0)) throw new ApiError(400, 'invalid', 'Invalid first name.'); patch.first_name = b.firstName; }
  if (b.lastName !== undefined) { if (!str(b.lastName, 80, 0)) throw new ApiError(400, 'invalid', 'Invalid last name.'); patch.last_name = b.lastName; }
  if (b.mobile !== undefined) { if (typeof b.mobile !== 'string' || !/^\d{0,15}$/.test(b.mobile)) throw new ApiError(400, 'invalid', 'Invalid mobile.'); patch.mobile = b.mobile; }
  if (b.fit !== undefined) { if (!str(b.fit, 40, 0)) throw new ApiError(400, 'invalid', 'Invalid value.'); patch.fit = b.fit; }
  if (typeof b.whatsapp === 'boolean') patch.whatsapp = b.whatsapp;
  if (typeof b.newsletter === 'boolean') patch.newsletter = b.newsletter;
  if (!Object.keys(patch).length) throw new ApiError(400, 'invalid', 'Nothing to update.');
  must(await c.db.from('profiles').update(patch).eq('id', u.id));
  return { ok: true };
}, { bucket: 'write', max: 30 });

add('GET', '/cart', 'required', async (c) => {
  const u = await c.user();
  const items = must(await c.db.from('cart_items').select('product_id, colour_id, size, qty').eq('user_id', u.id)) as any[];
  const cart = must(await c.db.from('carts').select('coupon_code').eq('user_id', u.id).maybeSingle()) as any;
  return { items: items.map((i) => ({ productId: i.product_id, colourId: i.colour_id, size: i.size, qty: i.qty })), coupon: cart?.coupon_code ?? null };
});
add('PUT', '/cart', 'required', async (c) => {
  const b = await c.body();
  if (!Array.isArray(b.items) || b.items.length > 50) throw new ApiError(400, 'invalid', 'items must be an array of up to 50 lines.');
  for (const i of b.items as any[]) if (!UUIDISH.test(String(i?.productId)) || !str(i?.colourId, 30) || !str(i?.size, 10) || !Number.isInteger(i?.qty)) throw new ApiError(400, 'invalid', 'Invalid cart line.');
  must(await c.db.rpc('set_cart', { p_items: b.items, p_coupon: typeof b.coupon === 'string' ? b.coupon : null }));
  return { ok: true };
}, { bucket: 'write', max: 60 });

add('GET', '/wishlist', 'required', async (c) => ({ items: (must(await c.db.from('wishlist').select('product_id').order('created_at')) as any[]).map((r) => r.product_id) }));
add('PUT', '/wishlist/:productId', 'required', async (c) => {
  const u = await c.user();
  if (!UUIDISH.test(c.params.productId)) throw new ApiError(400, 'invalid', 'Invalid product.');
  must(await c.db.from('wishlist').upsert({ user_id: u.id, product_id: c.params.productId })); return { ok: true };
}, { bucket: 'write', max: 60 });
add('DELETE', '/wishlist/:productId', 'required', async (c) => { must(await c.db.from('wishlist').delete().eq('product_id', c.params.productId)); return { ok: true }; }, { bucket: 'write', max: 60 });

const addressOf = (b: Record<string, unknown>) => {
  const a = { label: String(b.label ?? 'Home').slice(0, 40), name: b.name, mobile: b.mobile, line1: b.line1, line2: String(b.line2 ?? '').slice(0, 200), landmark: String(b.landmark ?? '').slice(0, 200), pin: b.pin, city: b.city, state: String(b.state ?? '').slice(0, 80) };
  if (!str(a.name, 120, 2) || typeof a.mobile !== 'string' || !/^[6-9]\d{9}$/.test(a.mobile) || !str(a.line1, 200, 3) || typeof a.pin !== 'string' || !/^[1-9]\d{5}$/.test(a.pin) || !str(a.city, 80, 2)) throw new ApiError(400, 'invalid', 'Check the address fields.');
  return a;
};
add('GET', '/addresses', 'required', async (c) => ({ items: (must(await c.db.from('addresses').select('id, data').order('created_at')) as any[]).map((r) => ({ ...r.data, id: r.id })) }));
add('POST', '/addresses', 'required', async (c) => {
  const u = await c.user(); const data = addressOf(await c.body());
  const r = must(await c.db.from('addresses').insert({ user_id: u.id, data }).select('id').single()) as any;
  return created({ ...data, id: r.id });
}, { bucket: 'write', max: 30 });
add('PUT', '/addresses/:id', 'required', async (c) => {
  const data = addressOf(await c.body());
  must(await c.db.from('addresses').update({ data }).eq('id', c.params.id)); return { ...data, id: c.params.id };
}, { bucket: 'write', max: 30 });
add('DELETE', '/addresses/:id', 'required', async (c) => { must(await c.db.from('addresses').delete().eq('id', c.params.id)); return { ok: true }; }, { bucket: 'write', max: 30 });

// ------------------------------------------------------------------ Cashfree payments
add('POST', '/payments/cashfree/session', 'optional', async (c) => {
  const b = await c.body(); const orderId = String(b.orderId ?? '');
  if (!/^PL-\d{4,9}$/.test(orderId)) throw new ApiError(400, 'invalid', 'orderId is required.');
  const svc = serviceClient();
  await svc.rpc('expire_pending_orders', { p_minutes: 30 });
  const o = must(await svc.from('orders').select('user_id, email, payment_status, data').eq('id', orderId).maybeSingle()) as any;
  if (!o) throw new ApiError(404, 'not_found', 'Order not found.');
  // Only the order's owner (signed in) or someone who knows its email may pay for it.
  const user = c.token ? await c.user() : null;
  const mine = user ? o.user_id === user.id : String(b.email ?? '').trim().toLowerCase() === o.email;
  if (!mine) throw new ApiError(404, 'not_found', 'Order not found.');
  if (o.payment_status !== 'pending') throw new ApiError(409, 'not_payable', 'This order is not awaiting payment.');
  const origin = process.env.SITE_URL ?? `https://${c.req.headers.host}`;
  const sessionId = await createSession({
    id: orderId, total: o.data.total, email: o.email, mobile: o.data.mobile, customerId: user?.id ?? 'guest-' + orderId.toLowerCase(),
    returnUrl: `${origin}/#/order/{order_id}?cf=1`, notifyUrl: `${origin}/api/v1/payments/cashfree/webhook`,
  });
  return { orderId, paymentSessionId: sessionId, mode: cashfreeMode() };
}, { bucket: 'pay', max: 20 });

/** Apply a gateway outcome to our order. Idempotent. */
async function settle(orderId: string) {
  const svc = serviceClient(); const s = await fetchSettlement(orderId);
  if (s.status === 'paid') { const { error } = await svc.rpc('mark_order_paid', { p_id: orderId, p_gateway_order_id: orderId, p_payment_id: s.paymentId, p_amount: s.amount, p_raw: s.raw }); if (error) dbFail(error); }
  else if (s.status === 'closed') await svc.rpc('fail_order', { p_id: orderId, p_raw: { reason: 'gateway_closed' } });
  return s.status;
}
add('GET', '/payments/cashfree/verify', 'none', async (c) => {
  const orderId = c.url.searchParams.get('orderId') ?? '';
  if (!/^PL-\d{4,9}$/.test(orderId)) throw new ApiError(400, 'invalid', 'orderId is required.');
  return { orderId, status: await settle(orderId) };   // the gateway, not the browser, decides
}, { bucket: 'pay', max: 30 });

add('POST', '/payments/cashfree/webhook', 'none', async (c) => {
  const raw = await readRaw(c.req);   // raw bytes are needed for the signature
  const h = c.req.headers;
  if (!verifyWebhookSignature(raw, h['x-webhook-timestamp'] as string | undefined, h['x-webhook-signature'] as string | undefined)) throw new ApiError(401, 'bad_signature', 'Invalid signature.');
  let evt: any; try { evt = JSON.parse(raw); } catch { throw new ApiError(400, 'invalid', 'Bad JSON.'); }
  const orderId = String(evt?.data?.order?.order_id ?? '');
  if (/^PL-\d{4,9}$/.test(orderId) && String(evt?.type ?? '').startsWith('PAYMENT_')) await settle(orderId);   // re-check with the gateway rather than trusting the payload
  return { received: true };
}, { bucket: 'webhook', max: 300, raw: true });

// ------------------------------------------------------------------ dispatcher
function match(method: string, parts: string[]): { route: Route; params: Record<string, string> } | 'method' | null {
  let pathHit = false;
  for (const r of routes) {
    if (r.parts.length !== parts.length) continue;
    const params: Record<string, string> = {}; let ok = true;
    for (let i = 0; i < parts.length; i++) {
      if (r.parts[i].startsWith(':')) params[r.parts[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (r.parts[i] !== parts[i]) { ok = false; break; }
    }
    if (!ok) continue;
    pathHit = true;
    if (r.method === method) return { route: r, params };
  }
  return pathHit ? 'method' : null;
}

function out(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}

export async function handleV1(req: IncomingMessage, res: ServerResponse) {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    const parts = url.pathname.replace(/^\/api\/v1\/?/, '').split('/').filter(Boolean);
    const m = match((req.method ?? 'GET').toUpperCase(), parts);
    if (m === null) throw new ApiError(404, 'not_found', 'Unknown endpoint.');
    if (m === 'method') throw new ApiError(405, 'method_not_allowed', 'Method not allowed.');
    const { route, params } = m;
    const ip = clientIp(req); limit(ip, route.bucket, route.max);
    const token = bearer(req);
    if (route.auth === 'required' && !token) throw new ApiError(401, 'unauthorized', 'Sign in required.');
    if (!route.raw && route.method !== 'GET' && route.method !== 'DELETE') {
      const ct = (req.headers['content-type'] ?? '').toString().toLowerCase();
      if (!ct.startsWith('application/json')) throw new ApiError(415, 'unsupported_media_type', 'Use application/json.');
    }
    const db = clientFor(token);
    let verified: Awaited<ReturnType<Ctx['user']>> | null = null;
    const ctx: Ctx = {
      req, res, url, params, ip, token, db,
      user: async () => {
        if (verified) return verified;
        if (!token) throw new ApiError(401, 'unauthorized', 'Sign in required.');
        const { data, error } = await db.auth.getUser(token);
        if (error || !data.user) throw new ApiError(401, 'unauthorized', 'Your session is invalid or has expired.');
        return (verified = data.user);
      },
      body: async () => {
        const raw = await readRaw(req, 32768);
        try { const v = JSON.parse(raw || '{}'); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* fallthrough */ }
        throw new ApiError(400, 'invalid_json', 'Body must be a JSON object.');
      },
    };
    if (route.auth === 'required') await ctx.user();
    const result = (await route.handler(ctx)) as any;
    if (result && typeof result === 'object' && '__status' in result) return out(res, result.__status, result.body);
    return out(res, 200, result ?? { ok: true });
  } catch (e) {
    if (e instanceof ApiError) return out(res, e.status, { error: { code: e.code, message: e.message } }, e.status === 429 ? { 'Retry-After': '60' } : {});
    console.error('api/v1 error', e);
    return out(res, 500, { error: { code: 'server_error', message: 'Something went wrong.' } });
  }
}
