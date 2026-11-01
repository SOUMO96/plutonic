/**
 * Cashfree Payment Gateway (PG API version 2023-08-01). Secrets stay on the server.
 * Env: CASHFREE_APP_ID, CASHFREE_SECRET_KEY, CASHFREE_ENV=sandbox|production, SITE_URL (web origin for the return URL).
 * Untested against the live gateway until sandbox credentials are supplied.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from './lib';

export const cashfreeConfigured = () => Boolean(process.env.CASHFREE_APP_ID && process.env.CASHFREE_SECRET_KEY);
export const cashfreeMode = () => (process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox');
const base = () => (cashfreeMode() === 'production' ? 'https://api.cashfree.com/pg' : 'https://sandbox.cashfree.com/pg');

async function cf(path: string, init: { method?: string; body?: unknown } = {}) {
  if (!cashfreeConfigured()) throw new ApiError(503, 'payments_not_configured', 'Online payments are not configured.');
  const r = await fetch(base() + path, {
    method: init.method ?? 'GET',
    headers: { 'x-client-id': process.env.CASHFREE_APP_ID!, 'x-client-secret': process.env.CASHFREE_SECRET_KEY!, 'x-api-version': '2023-08-01', 'Content-Type': 'application/json' },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, data: data as Record<string, any> };
}

/** Create (or re-open) the gateway order for one of our orders; returns the session id the client SDK needs. */
export async function createSession(o: { id: string; total: number; email: string; mobile: string; customerId: string; returnUrl: string; notifyUrl: string }) {
  const r = await cf('/orders', { method: 'POST', body: {
    order_id: o.id, order_amount: o.total, order_currency: 'INR',
    customer_details: { customer_id: o.customerId, customer_email: o.email, customer_phone: o.mobile },
    order_meta: { return_url: o.returnUrl, notify_url: o.notifyUrl },
  } });
  if (r.ok && r.data.payment_session_id) return r.data.payment_session_id as string;
  // The order already exists at the gateway (customer retrying): fetch its session instead.
  const again = await cf('/orders/' + encodeURIComponent(o.id));
  if (again.ok && again.data.payment_session_id && Number(again.data.order_amount) === o.total) return again.data.payment_session_id as string;
  throw new ApiError(502, 'gateway_error', 'The payment gateway could not start this payment.');
}

export type Settlement = { status: 'paid'; paymentId: string; amount: number; raw: unknown } | { status: 'pending' } | { status: 'closed' };

/** Ask the gateway (source of truth) what happened to an order. */
export async function fetchSettlement(orderId: string): Promise<Settlement> {
  const o = await cf('/orders/' + encodeURIComponent(orderId));
  if (!o.ok) throw new ApiError(502, 'gateway_error', 'Could not check the payment.');
  const st = String(o.data.order_status);
  if (st === 'PAID') {
    const p = await cf('/orders/' + encodeURIComponent(orderId) + '/payments');
    const ok = Array.isArray(p.data) ? (p.data as any[]).find((x) => x.payment_status === 'SUCCESS') : null;
    if (!ok) return { status: 'pending' };
    return { status: 'paid', paymentId: String(ok.cf_payment_id), amount: Number(ok.payment_amount), raw: { order_status: st, cf_payment_id: ok.cf_payment_id, payment_method: ok.payment_group } };
  }
  return st === 'EXPIRED' || st === 'TERMINATED' || st === 'TERMINATION_REQUESTED' ? { status: 'closed' } : { status: 'pending' };
}

/** Cashfree signs `timestamp + rawBody` with HMAC-SHA256 (base64) using the secret key. */
export function verifyWebhookSignature(rawBody: string, timestamp: string | undefined, signature: string | undefined, secret = process.env.CASHFREE_SECRET_KEY ?? ''): boolean {
  if (!secret || !timestamp || !signature) return false;
  const expected = createHmac('sha256', secret).update(timestamp + rawBody).digest();
  let given: Buffer; try { given = Buffer.from(signature, 'base64'); } catch { return false; }
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Ask Cashfree to refund part or all of a paid order. `refundId` must be unique per refund (makes retries safe). */
export async function createRefund(orderId: string, amount: number, refundId: string, note: string): Promise<{ ok: true; reference: string } | { ok: false; message: string }> {
  const r = await cf('/orders/' + encodeURIComponent(orderId) + '/refunds', { method: 'POST', body: { refund_amount: amount, refund_id: refundId, refund_note: note.slice(0, 100), refund_speed: 'STANDARD' } });
  if (r.ok && r.data.cf_refund_id) return { ok: true, reference: String(r.data.cf_refund_id) };
  // Same refund id already accepted earlier: treat as done (idempotent retry)
  if (String(r.data.code ?? '').includes('refund_id_already_exists')) return { ok: true, reference: refundId };
  return { ok: false, message: String(r.data.message ?? 'Cashfree refused the refund.') };
}
