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
import { exchangeToRefund, log, logOnce, moveReturn, readSettings, setOrderStep } from './core';
import type { Order, ReturnReq } from '../../src/site/store';

let running = false;
/** Run `fn` over `items` a few at a time (so a sale's worth of orders is worked through in parallel, without flooding the database or a courier API). Returns how many reported work done. */
async function each<T>(items: T[], fn: (x: T) => Promise<boolean | void>, size = 8): Promise<number> {
  let n = 0;
  for (let i = 0; i < items.length; i += size) n += (await Promise.all(items.slice(i, i + size).map(fn))).filter(Boolean).length;
  return n;
}
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
  const { data: rows } = await db.from('returns').select('id, user_id, order_id, data').eq('status', 'Requested').limit(200);
  return each(rows ?? [], async (row) => {
    const r = row.data as ReturnReq;
    if (r.needsReview) return;
    const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle();
    const item = ord?.data?.items?.[r.itemIndex ?? -1];
    const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
    const { count } = await db.from('returns').select('id', { count: 'exact', head: true }).eq('user_id', row.user_id).gte('created_at', since).neq('id', r.id);
    const why = reviewReason(r, item ? item.price * item.qty : null, count ?? 0, cfg);
    if (why) return flagReview(db, r, why);
    const a = await moveReturn(db, r.id, 'Approved');
    if ('http' in a) {
      if (a.error === 'invalid_transition' || a.error === 'changed') return;   // another run (or a person) already handled it
      return flagReview(db, r, a.message);
    }
    const p = await moveReturn(db, r.id, 'Pickup scheduled', { pickupDate: ist(1), pickupSlot: '9 am – 1 pm' });
    await log(db, r.id, 'Approved automatically', 'http' in p ? `Approved, but the pickup could not be scheduled: ${p.message}` : `Pickup booked for tomorrow, 9 am – 1 pm (${r.kind}, ${r.productName})`, 'http' in p ? 'review' : 'info');
    return true;
  });
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
  const { data: fresh } = await db.from('orders').select('id, data').eq('data->>step', '0').in('payment_status', ['simulated', 'cod', 'paid']).limit(100);
  if (fresh?.length) {
    const { data: have } = await db.from('shipments').select('order_id').eq('kind', 'delivery').in('order_id', fresh.map((o) => o.id));
    const done = new Set((have ?? []).map((h) => h.order_id));
    n += await each(fresh, async (row) => {
      if (done.has(row.id)) return;
      const b = await bookShipment(db, courier, 'delivery', row.data as Order, row.id, null);
      if (!b) return;
      await setOrderStep(db, row.id, 1, { awb: b.awb, courier: b.courier });   // packed and its tracking number, in one write
      await log(db, row.id, 'Order packed, courier booked', `AWB ${b.awb} (${b.courier})`); return true;
    });
  }
  // 3a. pickups for returns/exchanges whose pickup is scheduled (by the automation or by a person)
  const { data: sched } = await db.from('returns').select('id, order_id, data').eq('status', 'Pickup scheduled').limit(100);
  if (sched?.length) {
    const { data: have } = await db.from('shipments').select('return_id').eq('kind', 'pickup').in('return_id', sched.map((r) => r.id));
    const done = new Set((have ?? []).map((h) => h.return_id));
    n += await each(sched, async (row) => {
      if (done.has(row.id)) return;
      const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle(); if (!ord) return;
      const r = row.data as ReturnReq;
      const b = await bookShipment(db, courier, 'pickup', ord.data as Order, row.id, row.id, { pickupDate: r.pickupDate, pickupSlot: r.pickupSlot });
      if (!b) return;
      await patchReturn(db, row.id, { pickupAwb: b.awb } as Partial<ReturnReq>);
      await log(db, row.id, 'Pickup booked with courier', `AWB ${b.awb}, ${r.pickupDate} ${r.pickupSlot ?? ''}`); return true;
    });
  }
  // 3b. replacement parcels for exchanges that were packed
  const { data: packed } = await db.from('returns').select('id, order_id, data').eq('status', 'Replacement packed').limit(100);
  if (packed?.length) {
    const { data: have } = await db.from('shipments').select('return_id').eq('kind', 'replacement').in('return_id', packed.map((r) => r.id));
    const done = new Set((have ?? []).map((h) => h.return_id));
    n += await each(packed, async (row) => {
      if (done.has(row.id)) return;
      const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle(); if (!ord) return;
      const b = await bookShipment(db, courier, 'replacement', ord.data as Order, row.id, row.id);
      if (!b) return;
      await patchReturn(db, row.id, { awb: b.awb } as Partial<ReturnReq>);
      await log(db, row.id, 'Replacement parcel booked', `AWB ${b.awb}`); return true;
    });
  }
  // 4. progress: ask the courier about every parcel that is still moving
  if (courier.poll) {
    const { data: active } = await db.from('shipments').select('*').not('status', 'in', '(delivered,rto,failed)').order('id').limit(300);
    n += await each(((active ?? []) as ShipmentRow[]).filter((x) => x.courier === courier.name), async (s) => {
      const next = await courier.poll!(s);
      if (next) { await applyCourierEvent(db, s, next); return true; }
    }, 10);
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
          if (!('http' in p)) await log(db, rid, 'Replacement packed, stock swapped');
          else if (p.error === 'replacement_out_of_stock') {
            // the new size sold out after the courier collected the item: refund instead of leaving the customer waiting
            const why = `Your size ${m.ret.exchangeTo?.size ?? ''} ran out of stock, so we are refunding this item instead.`;
            const c = await exchangeToRefund(db, rid, why);
            if ('http' in c) await log(db, rid, 'Could not pack replacement', c.message, 'review');
            else { await log(db, rid, 'Exchange changed to a refund', 'Replacement size out of stock after pickup'); await autoRefund(db, cfg, rid); }
          } else await log(db, rid, 'Could not pack replacement', p.message, 'review');
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

/**
 * Pay one refund (return or cancellation) when the settings and the payment method allow it.
 * The refund is claimed first, so two servers can never pay it twice, and the gateway call uses a fixed refund id (RF<id>)
 * so even a repeat after a crash is the same refund at Cashfree. A failed attempt releases the claim and is retried by the sweep.
 */
async function payRefund(db: SupabaseClient, rf: { id: number; order_id: string; amount: number; return_id: string | null }, quiet = false): Promise<boolean> {
  const subject = rf.return_id ?? rf.order_id;
  const { data: ord } = await db.from('orders').select('data, payment_status').eq('id', rf.order_id).maybeSingle();
  if (!ord) return false;
  if (ord.data?.payment === 'cod') { if (!quiet) await logOnce(db, subject, 'Refund needs a person', `₹${rf.amount}: cash-on-delivery order, ask the customer for UPI or bank details`, 'review'); return false; }
  const simulated = ord.payment_status === 'simulated';
  if (!simulated && !cashfreeConfigured()) { if (!quiet) await logOnce(db, subject, 'Refund needs a person', `₹${rf.amount}: Cashfree is not configured`, 'review'); return false; }
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: claimed } = await db.from('refunds').update({ processed_at: new Date().toISOString() }).eq('id', rf.id).eq('status', 'Pending').or(`processed_at.is.null,processed_at.lt.${stale}`).select('id');
  if (!claimed?.length) return false;   // someone else is paying it, or it is already paid
  const release = () => db.from('refunds').update({ processed_at: null }).eq('id', rf.id).eq('status', 'Pending');
  // never refund more than was paid for the order
  const { data: paidBack } = await db.from('refunds').select('amount').eq('order_id', rf.order_id).eq('status', 'Refunded');
  const already = (paidBack ?? []).reduce((n, x) => n + x.amount, 0);
  if (already + rf.amount > (ord.data?.total ?? 0)) { await release(); await logOnce(db, subject, 'Refund needs a person', `₹${rf.amount} would take refunds above what the customer paid (₹${ord.data?.total})`, 'review'); return false; }
  let reference = 'SIMULATED', note = 'payments are simulated, no real money moved';
  if (!simulated) {
    const res = await createRefund(rf.order_id, rf.amount, `RF${rf.id}`, rf.return_id ? `Return ${rf.return_id}` : 'Order cancelled');
    if (!('reference' in res)) { await release(); await log(db, subject, 'Refund failed', `₹${rf.amount}: ${res.message}. It will be retried.`, 'error'); return false; }
    reference = res.reference; note = 'through Cashfree';
  }
  const { data: done } = await db.from('refunds').update({ status: 'Refunded', reference, processed_at: new Date().toISOString() }).eq('id', rf.id).eq('status', 'Pending').select('id');
  if (done?.length) await log(db, subject, 'Refund paid', `₹${rf.amount} (${note})`);
  return !!done?.length;
}

/** Pay the refund for a completed return straight away. */
async function autoRefund(db: SupabaseClient, cfg: Record<string, string>, returnId: string) {
  if (cfg.auto_refund !== 'on') { await logOnce(db, returnId, 'Refund waiting', 'Automatic refunds are switched off', 'review'); return; }
  const { data: rf } = await db.from('refunds').select('id, order_id, amount, return_id').eq('return_id', returnId).eq('status', 'Pending').maybeSingle();
  if (rf) await payRefund(db, rf);
}

/** Retry every refund that is still waiting (cancelled orders, failed gateway calls, refunds from before auto-refund was on). */
async function refundSweep(db: SupabaseClient, cfg: Record<string, string>): Promise<number> {
  if (cfg.auto_refund !== 'on') return 0;
  const { data: rows } = await db.from('refunds').select('id, order_id, amount, return_id').eq('status', 'Pending').order('id').limit(100);
  return each(rows ?? [], (rf) => payRefund(db, rf, true), 5);
}

const lastActivity = (r: ReturnReq) => Math.max(r.createdAt ?? 0, ...(r.history ?? []).map((h) => h.at));

/**
 * Housekeeping so nothing sits forgotten:
 *  - an approved request that nobody scheduled gets tomorrow's pickup after 15 minutes;
 *  - any open request with no movement for 24 hours is flagged for a person once.
 */
async function watchdog(db: SupabaseClient, cfg: Record<string, string>): Promise<number> {
  let n = 0;
  const { data: open } = await db.from('returns').select('id, status, data').not('status', 'in', '(Completed,Rejected)').limit(200);
  for (const row of open ?? []) {
    const r = row.data as ReturnReq & { stuck?: boolean }; const idle = Date.now() - lastActivity(r);
    if (row.status === 'Approved' && !r.pickupDate && cfg.auto_approve_returns === 'on' && idle > 15 * 60_000) {
      const p = await moveReturn(db, row.id, 'Pickup scheduled', { pickupDate: ist(1), pickupSlot: '9 am – 1 pm' });
      if (!('http' in p)) { await log(db, row.id, 'Pickup scheduled automatically', 'It was approved but no pickup had been booked'); n++; }
      continue;
    }
    if (idle > 24 * 3_600_000 && !r.stuck && !(row.status === 'Requested' && r.needsReview)) {
      const { data: done } = await db.from('returns').update({ data: { ...r, stuck: true } }).eq('id', row.id).eq('status', row.status).select('id');
      if (done?.length) { await log(db, row.id, 'Stuck for over 24 hours', `Still "${row.status}" with no movement. It needs a person.`, 'review'); n++; }
    }
  }
  return n;
}

/** One pass over everything that is due. */
async function pass(db: SupabaseClient, cfg: Record<string, string>): Promise<number> {
  let actions = await approvals(db, cfg);
  const courier = activeCourier();
  if (courier && cfg.auto_courier === 'on') actions += await couriers(db, courier);
  actions += await refundSweep(db, cfg);
  actions += await watchdog(db, cfg);
  return actions;
}

/**
 * Run everything that is due. Never throws: a failure is written to the log.
 * Safe with any number of servers: a database lease lets only one work at a time (and if the database cannot grant one,
 * this server's own flag is the fallback). It keeps going while there is work, for up to ~25 seconds, so a sale's backlog is
 * drained in one go instead of a hundred orders a minute.
 */
export async function tick(): Promise<{ actions: number }> {
  if (running) return { actions: 0 };
  running = true;
  let db: SupabaseClient | null = null;
  try {
    db = serviceClient();
    const { data: got, error } = await db.rpc('acquire_lease', { p_name: 'tick', p_seconds: 40 });
    if (!error && got === false) return { actions: 0 };   // another server is already working
    const stop = Date.now() + (Number(process.env.AUTOMATION_BUDGET_MS) || (process.env.VERCEL ? 15_000 : 25_000));
    let total = 0, n = 0;
    // the switches are read again on every pass, so turning one off takes effect at once, even in the middle of a long run
    do { n = await pass(db, await readSettings(db)); total += n; } while (n > 0 && Date.now() < stop);
    return { actions: total };
  } catch (e) {
    try { await log(serviceClient(), 'automation', 'Error', String((e as Error).message ?? e).slice(0, 300), 'error'); } catch { /* nothing more to do */ }
    return { actions: 0 };
  } finally {
    running = false;
    if (db) { try { await db.rpc('release_lease', { p_name: 'tick' }); } catch { /* the lease simply expires */ } }
  }
}
