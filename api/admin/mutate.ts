import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJson, requireAdmin, sameOriginJson, send } from '../_lib/adminAuth';
import { adminDb } from '../_lib/supabaseAdmin';
import { cancelItem, cancelWhole } from '../../src/site/orderCancel';

/**
 * POST /api/admin/mutate  { op, ...payload } — every administrator write.
 * Administrator session is required for every op; input is validated; the browser never
 * touches these tables directly (row-level security gives clients no write access).
 */
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const int = (v: unknown, min = 0, max = 10_000_000) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const RETURN_STATUS = ['Requested', 'Approved', 'Pickup scheduled', 'Completed', 'Rejected'];
const REVIEW_STATUS = ['Published', 'Pending', 'Hidden'];

function validProduct(p: any): string | null {
  if (!p || typeof p !== 'object') return 'product';
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/i.test(p.id)) return 'id';
  if (!str(p.name, 160) || !str(p.category, 80) || (p.gender !== 'men' && p.gender !== 'women')) return 'name/category/gender';
  if (!int(p.price) || !int(p.originalPrice) || typeof p.active !== 'boolean') return 'price/active';
  if (!Array.isArray(p.colours) || p.colours.length < 1 || p.colours.length > 12 || !p.colours.every((c: any) => str(c?.id, 30) && str(c?.name, 40) && /^#[0-9a-f]{3,8}$/i.test(c?.hex ?? ''))) return 'colours';
  if (!Array.isArray(p.sizes) || p.sizes.length < 1 || p.sizes.length > 12 || !p.sizes.every((s: any) => str(s, 10))) return 'sizes';
  if (!p.stock || typeof p.stock !== 'object' || !Object.values(p.stock).every((n) => int(n, 0, 100_000))) return 'stock';
  if (!Array.isArray(p.images) || p.images.length > 12 || !p.images.every((i: any) => typeof i === 'string' && i.length < 600_000)) return 'images';
  if (JSON.stringify(p).length > 2_500_000) return 'too large';
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!requireAdmin(req, res)) return;
  if (!sameOriginJson(req)) return send(res, 400, { error: 'bad_request' });
  const db = adminDb();
  if (!db) return send(res, 503, { error: 'database_not_configured' });
  const b = (await readJson(req)) as any;
  if (!b || typeof b.op !== 'string') return send(res, 400, { error: 'bad_request' });
  const fail = (why: string) => send(res, 400, { error: 'invalid', field: why });
  const dbErr = () => send(res, 502, { error: 'database_error' });

  switch (b.op) {
    case 'product.upsert': {
      const bad = validProduct(b.product); if (bad) return fail(bad);
      const { data: last } = await db.from('products').select('sort').order('sort', { ascending: false }).limit(1);
      const { data: existing } = await db.from('products').select('sort').eq('id', b.product.id).maybeSingle();
      const sort = existing?.sort ?? ((last?.[0]?.sort ?? -1) + 1);
      const { error } = await db.from('products').upsert({ id: b.product.id, data: b.product, sort });
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    case 'product.setActive': {
      if (!str(b.id, 60) || typeof b.active !== 'boolean') return fail('id/active');
      const { data, error } = await db.from('products').select('data').eq('id', b.id).maybeSingle();
      if (error) return dbErr(); if (!data) return send(res, 404, { error: 'not_found' });
      const { error: e2 } = await db.from('products').update({ data: { ...data.data, active: b.active } }).eq('id', b.id);
      return e2 ? dbErr() : send(res, 200, { ok: true });
    }
    case 'order.advance': {
      if (!str(b.id, 40)) return fail('id');
      const { data, error } = await db.from('orders').select('data').eq('id', b.id).maybeSingle();
      if (error) return dbErr(); if (!data) return send(res, 404, { error: 'not_found' });
      const o = data.data;
      if (o.step < 0 || o.step >= 4) return send(res, 409, { error: 'cannot_advance' });
      const next = { ...o, step: o.step + 1, history: [...(o.history ?? []), Date.now()] };
      const { error: e2 } = await db.from('orders').update({ data: next }).eq('id', b.id);
      return e2 ? dbErr() : send(res, 200, { ok: true });
    }
    case 'order.cancel':
    case 'order.cancelItem': {
      if (!str(b.id, 40)) return fail('id');
      const reason = typeof b.reason === 'string' ? b.reason.trim().slice(0, 200) : '';
      if (b.op === 'order.cancelItem' && !int(b.index, 0, 200)) return fail('index');
      const { data, error } = await db.from('orders').select('data, payment_status').eq('id', b.id).maybeSingle();
      if (error) return dbErr(); if (!data) return send(res, 404, { error: 'not_found' });
      const result = b.op === 'order.cancel' ? cancelWhole(data.data, reason) : cancelItem(data.data, b.index, reason);
      if (!result) return send(res, 409, { error: 'cannot_cancel' });
      // Unpaid online orders must not be re-released by the payment-expiry job after this.
      const patch: Record<string, unknown> = { data: result.order };
      if (result.whole && data.payment_status === 'pending') patch.payment_status = 'failed';
      const { error: e2 } = await db.from('orders').update(patch).eq('id', b.id);
      if (e2) return dbErr();
      if (result.restock.length) { const { error: e3 } = await db.rpc('restock_items', { p_items: result.restock }); if (e3) return dbErr(); }
      return send(res, 200, { ok: true });
    }
    case 'return.setStatus': {
      if (!str(b.id, 40) || !RETURN_STATUS.includes(b.status)) return fail('id/status');
      const { data, error } = await db.from('returns').select('data').eq('id', b.id).maybeSingle();
      if (error) return dbErr(); if (!data) return send(res, 404, { error: 'not_found' });
      const { error: e2 } = await db.from('returns').update({ status: b.status, data: { ...data.data, status: b.status } }).eq('id', b.id);
      return e2 ? dbErr() : send(res, 200, { ok: true });
    }
    case 'review.setStatus': {
      if (!str(b.id, 60) || !REVIEW_STATUS.includes(b.status)) return fail('id/status');
      const { error } = await db.from('reviews').update({ status: b.status }).eq('id', b.id);
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    case 'coupon.upsert': {
      const c = b.coupon;
      const code = typeof c?.code === 'string' ? c.code.trim().toUpperCase() : '';
      if (!/^[A-Z0-9_-]{3,40}$/.test(code) || (c.kind !== 'percent' && c.kind !== 'flat') || !int(c.value, 1, 1_000_000) || !int(c.minSubtotal) || typeof c.active !== 'boolean' || typeof c.label !== 'string' || c.label.length > 160) return fail('coupon');
      if (c.kind === 'percent' && c.value > 100) return fail('percent');
      const { error } = await db.from('coupons').upsert({ code, kind: c.kind, value: c.value, min_subtotal: c.minSubtotal, active: c.active, label: c.label });
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    default:
      return fail('op');
  }
}
