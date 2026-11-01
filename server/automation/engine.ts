/**
 * The automation. `tick()` is idempotent and safe to run as often as you like (every few seconds in
 * development, every minute from a scheduler in production, and straight after a customer acts).
 *
 *   1. Returns/exchanges that pass the rules are approved and a pickup is booked. Others are flagged for a person.
 *   2. Paid / COD orders get a courier booking and move to "Packed".
 *   3. Pickups and replacement parcels get a courier booking.
 *   4. Courier updates (polled here, or pushed to the webhook) move orders, returns and exchanges forward,
 *      swap stock, and pay refunds when a returned item reaches the warehouse.
 *
 * Everything it does is written to automation_log, and the same rules (returnRules.ts, core.ts) are used
 * as when a person presses the buttons in the admin.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { activeCourier, type Courier, type CourierStatus, type ShipmentKind, type ShipmentRow } from '../courier';
import { cashfreeConfigured, createRefund } from '../v1/cashfree';
import { serviceClient } from '../v1/lib';
import { log, moveReturn, readSettings, setOrderStep } from './core';
import type { Order, ReturnReq } from '../../src/site/store';

let running = false;
const ist = (days = 0) => new Date(Date.now() + 5.5 * 3_600_000 + days * 86_400_000).toISOString().slice(0, 10);

async function patchOrder(db: SupabaseClient, id: string, patch: Partial<Order> & Record<string, unknown>) {
  const { data } = await db.from('orders').select('data').eq('id', id).maybeSingle();
  if (data) await db.from('orders').update({ data: { ...data.data, ...patch } }).eq('id', id);
}
/** Flag a request for a person exactly once (safe if two servers run at the same moment). */
async function flagReview(db: SupabaseClient, r: ReturnReq, why: string): Promise<boolean> {
  const { data: row } = await db.from('returns').select('data').eq('id', r.id).maybeSingle();
  if (!row) return false;
  const { data: done } = await db.from('returns').update({ data: { ...row.data, needsReview: true, reviewReason: why } }).eq('id', r.id).eq('status', 'Requested').is('data->>needsReview', null).select('id');
  if (!done?.length) return false;
  await log(db, r.id, 'Needs your review', why, 'review');
  return true;
}
async function patchReturn(db: SupabaseClient, id: string, patch: Partial<ReturnReq>) {
  const { data } = await db.from('returns').select('data').eq('id', id).maybeSingle();
  if (data) await db.from('returns').update({ data: { ...data.data, ...patch } }).eq('id', id);
}

/** Why a request must wait for a person (empty = safe to approve automatically). */
export function reviewReason(r: ReturnReq, itemValue: number | null, recentRequests: number, cfg: Record<string, string>): string {
  if (itemValue === null) return 'The item could not be found on the order.';
  if (r.reason === 'Faulty or damaged') return 'Reason is "Faulty or damaged", so someone should look at it.';
  if (itemValue > Number(cfg.auto_approve_max_value)) return `Item value ₹${itemValue} is above the auto-approve limit of ₹${cfg.auto_approve_max_value}.`;
  if (recentRequests >= Number(cfg.auto_approve_max_requests)) return `The customer already made ${recentRequests} requests in the last 90 days.`;
  return '';
}

async function approvals(db: SupabaseClient, cfg: Record<string, string>): Promise<number> {
  if (cfg.auto_approve_returns !== 'on') return 0;
  const { data: rows } = await db.from('returns').select('id, user_id, order_id, data').eq('status', 'Requested').limit(50);
  let n = 0;
  for (const row of rows ?? []) {
    const r = row.data as ReturnReq;
    if (r.needsReview) continue;
    const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle();
    const item = ord?.data?.items?.[r.itemIndex ?? -1];
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { count } = await db.from('returns').select('id', { count: 'exact', head: true }).eq('user_id', row.user_id).gte('created_at', since).neq('id', r.id);
    const why = reviewReason(r, item ? item.price * item.qty : null, count ?? 0, cfg);
    if (why) { if (await flagReview(db, r, why)) n++; continue; }
    const a = await moveReturn(db, r.id, 'Approved');
    if ('http' in a) {
      if (a.error === 'invalid_transition' || a.error === 'changed') continue;   // another run (or a person) already handled it
      if (await flagReview(db, r, a.message)) n++;
      continue;
    }
    const p = await moveReturn(db, r.id, 'Pickup scheduled', { pickupDate: ist(1), pickupSlot: '9 am – 1 pm' });
    await log(db, r.id, 'Approved automatically', 'http' in p ? `Approved, but the pickup could not be scheduled: ${p.message}` : `Pickup booked for tomorrow, 9 am – 1 pm (${r.kind}, ${r.productName})`, 'http' in p ? 'review' : 'info');
    n++;
  }
  return n;
}

async function bookShipment(db: SupabaseClient, courier: Courier, kind: ShipmentKind, order: Order, ref: string, returnId: string | null, extra: { pickupDate?: string; pickupSlot?: string } = {}) {
  const items = order.items.filter((i) => !i.cancelled).map((i) => ({ name: i.name, size: i.size, qty: i.qty }));
  const b = await courier.book({ kind, order, ref, items, ...extra });
  const { error } = await db.from('shipments').insert({ awb: b.awb, courier: b.courier, kind, order_id: order.id, return_id: returnId, status: 'booked', events: [{ status: 'booked', at: Date.now() }] });
  if (error) return null;   // another run booked it first (unique index): fine
  return b;
}

async function couriers(db: SupabaseClient, courier: Courier): Promise<number> {
  let n = 0;
  // 2. forward deliveries for paid / cash-on-delivery orders
  const { data: fresh } = await db.from('orders').select('id, data').eq('data->>step', '0').in('payment_status', ['simulated', 'cod', 'paid']).limit(25);
  if (fresh?.length) {
    const { data: have } = await db.from('shipments').select('order_id').eq('kind', 'delivery').in('order_id', fresh.map((o) => o.id));
    const done = new Set((have ?? []).map((h) => h.order_id));
    for (const row of fresh) {
      if (done.has(row.id)) continue;
      const b = await bookShipment(db, courier, 'delivery', row.data as Order, row.id, null);
      if (!b) continue;
      await setOrderStep(db, row.id, 1);
      await patchOrder(db, row.id, { awb: b.awb, courier: b.courier });
      await log(db, row.id, 'Order packed, courier booked', `AWB ${b.awb} (${b.courier})`); n++;
    }
  }
  // 3a. pickups for returns/exchanges whose pickup is scheduled (by the automation or by a person)
  const { data: sched } = await db.from('returns').select('id, order_id, data').eq('status', 'Pickup scheduled').limit(25);
  if (sched?.length) {
    const { data: have } = await db.from('shipments').select('return_id').eq('kind', 'pickup').in('return_id', sched.map((r) => r.id));
    const done = new Set((have ?? []).map((h) => h.return_id));
    for (const row of sched) {
      if (done.has(row.id)) continue;
      const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle(); if (!ord) continue;
      const r = row.data as ReturnReq;
      const b = await bookShipment(db, courier, 'pickup', ord.data as Order, row.id, row.id, { pickupDate: r.pickupDate, pickupSlot: r.pickupSlot });
      if (!b) continue;
      await patchReturn(db, row.id, { pickupAwb: b.awb } as Partial<ReturnReq>);
      await log(db, row.id, 'Pickup booked with courier', `AWB ${b.awb}, ${r.pickupDate} ${r.pickupSlot ?? ''}`); n++;
    }
  }
  // 3b. replacement parcels for exchanges that were packed
  const { data: packed } = await db.from('returns').select('id, order_id, data').eq('status', 'Replacement packed').limit(25);
  if (packed?.length) {
    const { data: have } = await db.from('shipments').select('return_id').eq('kind', 'replacement').in('return_id', packed.map((r) => r.id));
    const done = new Set((have ?? []).map((h) => h.return_id));
    for (const row of packed) {
      if (done.has(row.id)) continue;
      const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle(); if (!ord) continue;
      const b = await bookShipment(db, courier, 'replacement', ord.data as Order, row.id, row.id);
      if (!b) continue;
      await patchReturn(db, row.id, { awb: b.awb } as Partial<ReturnReq>);
      await log(db, row.id, 'Replacement parcel booked', `AWB ${b.awb}`); n++;
    }
  }
  // 4. progress: ask the courier about every parcel that is still moving
  if (courier.poll) {
    const { data: active } = await db.from('shipments').select('*').not('status', 'in', '(delivered,rto,failed)').order('id').limit(100);
    for (const s of (active ?? []) as ShipmentRow[]) {
      if (s.courier !== courier.name) continue;
      const next = await courier.poll(s);
      if (next) { await applyCourierEvent(db, s, next); n++; }
    }
  }
  return n;
}

/** Apply one courier status to the shipment and to whatever it carries (order, return or exchange). */
export async function applyCourierEvent(db: SupabaseClient, s: ShipmentRow, status: CourierStatus, at = Date.now()) {
  if (s.status === status) return;
  const { data: upd } = await db.from('shipments').update({ status, events: [...s.events, { status, at }], updated_at: new Date(at).toISOString() }).eq('id', s.id).eq('status', s.status).select('id');
  if (!upd?.length) return;   // someone else already applied it
  const cfg = await readSettings(db);
  if (status === 'failed' || status === 'rto') {
    await patchOrder(db, s.order_id, { alert: `Courier reported "${status}" for AWB ${s.awb}` });
    await log(db, s.order_id, `Delivery problem (${status})`, `AWB ${s.awb}: needs your attention`, 'review'); return;
  }
  if (s.kind === 'delivery') {
    const step = status === 'picked_up' ? 2 : status === 'out_for_delivery' ? 3 : status === 'delivered' ? 4 : 0;
    if (step && (await setOrderStep(db, s.order_id, step))) await log(db, s.order_id, ['', '', 'Shipped', 'Out for delivery', 'Delivered'][step], `AWB ${s.awb}`);
    return;
  }
  const rid = s.return_id; if (!rid) return;
  if (s.kind === 'pickup') {
    if (status === 'picked_up') {
      const m = await moveReturn(db, rid, 'Picked up');
      if (!('http' in m)) {
        await log(db, rid, 'Item picked up', `AWB ${s.awb}`);
        if (m.ret.kind === 'exchange') {
          const p = await moveReturn(db, rid, 'Replacement packed');
          await log(db, rid, 'http' in p ? 'Could not pack replacement' : 'Replacement packed, stock swapped', 'http' in p ? p.message : undefined, 'http' in p ? 'review' : 'info');
        }
      }
    }
    if (status === 'delivered') {
      const cur = await db.from('returns').select('data').eq('id', rid).maybeSingle();
      if ((cur.data?.data as ReturnReq | undefined)?.kind === 'return') {
        await moveReturn(db, rid, 'Picked up');   // in case the pickup scan was missed
        const m = await moveReturn(db, rid, 'Completed');
        if (!('http' in m)) { await log(db, rid, 'Returned item received at warehouse', `AWB ${s.awb}`); await autoRefund(db, cfg, rid); }
      }
    }
    return;
  }
  // replacement parcel
  const map: Partial<Record<CourierStatus, ReturnReq['status']>> = { picked_up: 'Replacement shipped', out_for_delivery: 'Replacement out for delivery', delivered: 'Completed' };
  const to = map[status];
  if (to) { const m = await moveReturn(db, rid, to); if (!('http' in m)) await log(db, rid, to === 'Completed' ? 'Replacement delivered' : to, `AWB ${s.awb}`); }
}

/** Pay the refund for a completed return, when the settings and the payment method allow it. */
async function autoRefund(db: SupabaseClient, cfg: Record<string, string>, returnId: string) {
  if (cfg.auto_refund !== 'on') { await log(db, returnId, 'Refund waiting', 'Automatic refunds are switched off', 'review'); return; }
  const { data: rf } = await db.from('refunds').select('*').eq('return_id', returnId).eq('status', 'Pending').maybeSingle();
  if (!rf) return;
  const { data: ord } = await db.from('orders').select('data, payment_status').eq('id', rf.order_id).maybeSingle();
  const paid = async (reference: string, note: string) => {
    const { data: done } = await db.from('refunds').update({ status: 'Refunded', reference, processed_at: new Date().toISOString() }).eq('id', rf.id).eq('status', 'Pending').select('id');
    if (done?.length) await log(db, returnId, 'Refund paid', `₹${rf.amount} (${note})`);
  };
  if (ord?.data?.payment === 'cod') { await log(db, returnId, 'Refund needs a person', `₹${rf.amount}: cash-on-delivery order, ask the customer for UPI or bank details`, 'review'); return; }
  if (ord?.payment_status === 'simulated') { await paid('SIMULATED', 'payments are simulated, no real money moved'); return; }
  if (!cashfreeConfigured()) { await log(db, returnId, 'Refund needs a person', `₹${rf.amount}: Cashfree is not configured`, 'review'); return; }
  const res = await createRefund(rf.order_id, rf.amount, `RF${rf.id}`, `Return ${returnId}`);
  if ('reference' in res) await paid(res.reference, 'through Cashfree');
  else await log(db, returnId, 'Refund failed', `₹${rf.amount}: ${res.message}`, 'error');
}

/** Run everything that is due. Never throws: a failure is written to the log. */
export async function tick(): Promise<{ actions: number }> {
  if (running) return { actions: 0 };
  running = true;
  try {
    const db = serviceClient();
    const cfg = await readSettings(db);
    let actions = await approvals(db, cfg);
    const courier = activeCourier();
    if (courier && cfg.auto_courier === 'on') actions += await couriers(db, courier);
    return { actions };
  } catch (e) {
    try { await log(serviceClient(), 'automation', 'Error', String((e as Error).message ?? e).slice(0, 300), 'error'); } catch { /* nothing more to do */ }
    return { actions: 0 };
  } finally { running = false; }
}
