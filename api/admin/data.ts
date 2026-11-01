import type { IncomingMessage, ServerResponse } from 'node:http';
import { requireAdmin, send } from '../_lib/adminAuth';
import { adminDb } from '../_lib/supabaseAdmin';
import { readSettings } from '../../server/automation/core';
import { activeCourier } from '../../server/courier';

/** GET /api/admin/data — everything the dashboard shows. Administrator session required. */
export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'GET') return send(res, 405, { error: 'method_not_allowed' }, { Allow: 'GET' });
  if (!(await requireAdmin(req, res))) return;
  const db = adminDb();
  if (!db) return send(res, 503, { error: 'database_not_configured' });
  const [products, orders, returns, reviews, coupons, refunds, autolog, settings] = await Promise.all([
    db.from('products').select('data').order('sort'),
    db.from('orders').select('data').order('created_at', { ascending: false }).limit(500),
    db.from('returns').select('data').order('created_at', { ascending: false }).limit(500),
    db.from('reviews').select('id, product_id, name, rating, body, size, fit, status, created_at').order('created_at', { ascending: false }).limit(500),
    db.from('coupons').select('*').order('code'),
    db.from('refunds').select('*').order('created_at', { ascending: false }).limit(500),
    db.from('automation_log').select('*').order('id', { ascending: false }).limit(60),
    readSettings(db),
  ]);
  const failed = [products, orders, returns, reviews, coupons, refunds, autolog].find((r) => r.error);
  if (failed) return send(res, 502, { error: 'database_error' });
  return send(res, 200, {
    products: products.data!.map((r) => r.data),
    orders: orders.data!.map((r) => r.data),
    returns: returns.data!.map((r) => r.data),
    reviews: reviews.data!.map((r) => ({ id: r.id, productId: r.product_id, name: r.name, rating: r.rating, text: r.body, size: r.size, fit: r.fit, status: r.status, createdAt: Date.parse(r.created_at) })),
    refunds: refunds.data!.map((x) => ({ id: x.id, orderId: x.order_id, returnId: x.return_id ?? undefined, source: x.source, amount: x.amount, status: x.status, note: x.note ?? undefined, reference: x.reference ?? undefined, createdAt: Date.parse(x.created_at), processedAt: x.processed_at ? Date.parse(x.processed_at) : undefined })),
    automation: { mode: activeCourier()?.name ?? 'manual', settings, log: autolog.data!.map((l) => ({ id: l.id, at: Date.parse(l.at), subject: l.subject, action: l.action, detail: l.detail ?? undefined, level: l.level })) },
    coupons: coupons.data!.map((c) => ({ code: c.code, kind: c.kind, value: c.value, minSubtotal: c.min_subtotal, active: c.active, label: c.label, perUserLimit: c.per_user_limit ?? null })),
  });
}
