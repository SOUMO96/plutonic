import type { IncomingMessage, ServerResponse } from 'node:http';
import { readJson, requireAdmin, sameOriginJson, send } from '../_lib/adminAuth.js';
import { adminDb } from '../_lib/supabaseAdmin.js';
import { cancelItem, cancelWhole } from '../../src/site/orderCancel.js';
import { moveReturn } from '../../server/automation/core.js';

/**
 * POST /api/admin/mutate  { op, ...payload } — every administrator write.
 * Administrator session is required for every op; input is validated; the browser never
 * touches these tables directly (row-level security gives clients no write access).
 */
const str = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const int = (v: unknown, min = 0, max = 10_000_000) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const RETURN_STATUS = ['Requested', 'Approved', 'Pickup scheduled', 'Picked up', 'Replacement packed', 'Replacement shipped', 'Replacement out for delivery', 'Completed', 'Rejected'];
const REVIEW_STATUS = ['Published', 'Pending', 'Hidden'];

function validProduct(p: any): string | null {
  if (!p || typeof p !== 'object') return 'product';
  if (typeof p.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,59}$/i.test(p.id)) return 'id';
  if (!str(p.name, 160) || !str(p.category, 80) || (p.gender !== 'men' && p.gender !== 'women')) return 'name/category/gender';
  if (!int(p.price, 1) || !int(p.originalPrice, 1) || typeof p.active !== 'boolean') return 'price/active';
  if (!Array.isArray(p.colours) || p.colours.length < 1 || p.colours.length > 12 || !p.colours.every((c: any) => str(c?.id, 30) && str(c?.name, 40) && /^#[0-9a-f]{3,8}$/i.test(c?.hex ?? ''))) return 'colours';
  if (!Array.isArray(p.sizes) || p.sizes.length < 1 || p.sizes.length > 12 || !p.sizes.every((s: any) => str(s, 10))) return 'sizes';
  if (!p.stock || typeof p.stock !== 'object' || !Object.values(p.stock).every((n) => int(n, 0, 100_000))) return 'stock';
  // every stock key must be a real colour:size of this product (a typo would create an unsellable or phantom variant)
  const valid = new Set(p.colours.flatMap((c: any) => p.sizes.map((s: string) => c.id + ':' + s)));
  if (!Object.keys(p.stock).every((k) => valid.has(k))) return 'stock keys';
  if (!Array.isArray(p.images) || p.images.length > 12 || !p.images.every((i: any) => typeof i === 'string' && i.length < 600_000)) return 'images';
  if (JSON.stringify(p).length > 2_500_000) return 'too large';
  return null;
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' });
  if (!(await requireAdmin(req, res))) return;
  if (!sameOriginJson(req)) return send(res, 400, { error: 'bad_request' });
  const db = adminDb();
  if (!db) return send(res, 503, { error: 'database_not_configured' });
  const b = (await readJson(req, 3_000_000)) as any;
  if (!b || typeof b.op !== 'string') return send(res, 400, { error: 'bad_request' });
  const fail = (why: string) => send(res, 400, { error: 'invalid', field: why });
  const dbErr = () => send(res, 502, { error: 'database_error' });

  switch (b.op) {
    case 'product.upsert': {
      const bad = validProduct(b.product); if (bad) return fail(bad);
      // stock is merged on the server as (what you typed - what the form opened with) on top of the live stock, so a sale
      // made while the form was open is never overwritten
      const base = b.baseStock && typeof b.baseStock === 'object' && Object.values(b.baseStock).every((n) => int(n, 0, 100_000)) ? b.baseStock : null;
      const { data: last } = await db.from('products').select('sort').order('sort', { ascending: false }).limit(1);
      const { data: existing } = await db.from('products').select('sort').eq('id', b.product.id).maybeSingle();
      const sort = existing?.sort ?? ((last?.[0]?.sort ?? -1) + 1);
      const { error } = await db.rpc('save_product', { p_id: b.product.id, p_data: b.product, p_base_stock: existing ? base : null, p_sort: sort });
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    case 'product.setActive': {
      if (!str(b.id, 60) || typeof b.active !== 'boolean') return fail('id/active');
      const { data: found, error } = await db.rpc('set_product_active', { p_id: b.id, p_active: b.active });
      if (error) return dbErr(); if (!found) return send(res, 404, { error: 'not_found' });
      return send(res, 200, { ok: true });
    }
    case 'order.advance': {
      if (!str(b.id, 40)) return fail('id');
      const { data, error } = await db.from('orders').select('data, payment_status').eq('id', b.id).maybeSingle();
      if (error) return dbErr(); if (!data) return send(res, 404, { error: 'not_found' });
      const o = data.data;
      if (o.step < 0 || o.step >= 4) return send(res, 409, { error: 'cannot_advance' });
      if (!['paid', 'simulated', 'cod'].includes(data.payment_status)) return send(res, 409, { error: 'payment_not_received', message: 'Payment has not been received for this order, so it cannot be moved forward.' });
      const next = { ...o, step: o.step + 1, history: [...(o.history ?? []), Date.now()] };
      const { data: ok, error: e2 } = await db.rpc('apply_order_update', { p_id: b.id, p_expected: o, p_new: next });
      if (e2) return dbErr(); if (!ok) return send(res, 409, { error: 'changed', message: 'This order was just updated. Refresh and try again.' });
      return send(res, 200, { ok: true });
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
      // compare-and-set: if the customer (or the automation) changed the order meanwhile, nothing is cancelled twice
      const { data: applied, error: e2 } = await db.rpc('apply_order_update', { p_id: b.id, p_expected: data.data, p_new: result.order, p_payment_status: result.whole && data.payment_status === 'pending' ? 'failed' : null });
      if (e2) return dbErr(); if (!applied) return send(res, 409, { error: 'changed', message: 'This order was just updated. Refresh and try again.' });
      if (result.restock.length) { const { error: e3 } = await db.rpc('restock_items', { p_items: result.restock }); if (e3) return dbErr(); }
      const owed = (result.order.refundDue ?? 0) - (data.data.refundDue ?? 0);
      if (owed > 0) { const { error: e4 } = await db.from('refunds').insert({ order_id: b.id, source: 'cancellation', amount: owed, note: reason || 'Cancelled by admin' }); if (e4) return dbErr(); }
      return send(res, 200, { ok: true });
    }
    case 'return.update': {
      if (!str(b.id, 40) || !RETURN_STATUS.includes(b.status)) return fail('id/status');
      const m = await moveReturn(db, b.id, b.status, { pickupDate: b.pickupDate, pickupSlot: b.pickupSlot, note: typeof b.note === 'string' ? b.note : undefined });
      if ('http' in m) return send(res, m.http, { error: m.error, message: m.message });
      return send(res, 200, { ok: true, request: m.ret });
    }
    case 'setting.set': {
      const KEYS: Record<string, 'switch' | 'number'> = { auto_courier: 'switch', auto_approve_returns: 'switch', auto_refund: 'switch', auto_approve_max_value: 'number', auto_approve_max_requests: 'number' };
      const kind = KEYS[b.key as string];
      if (!kind) return fail('key');
      const v = String(b.value);
      if (kind === 'switch' ? !(v === 'on' || v === 'off') : !/^\d{1,7}$/.test(v)) return fail('value');
      const { error } = await db.from('app_settings').upsert({ key: b.key, value: v });
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    case 'refund.markRefunded': {
      if (!int(b.id, 1, 2_000_000_000)) return fail('id');
      const reference = typeof b.reference === 'string' ? b.reference.trim().slice(0, 80) : '';
      const { data: done, error } = await db.from('refunds').update({ status: 'Refunded', reference: reference || null, processed_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'Pending').select('id');
      if (error) return dbErr(); if (!done?.length) return send(res, 409, { error: 'already_refunded' });
      return send(res, 200, { ok: true });
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
      const limit = c.perUserLimit === null || c.perUserLimit === undefined ? null : c.perUserLimit;
      if (limit !== null && !int(limit, 1, 1000)) return fail('perUserLimit');
      const { error } = await db.from('coupons').upsert({ code, kind: c.kind, value: c.value, min_subtotal: c.minSubtotal, active: c.active, label: c.label, per_user_limit: limit });
      return error ? dbErr() : send(res, 200, { ok: true });
    }
    default:
      return fail('op');
  }
}
