import { RETURN_WINDOW_DAYS } from './catalog';
import type { Order, ReturnReq } from './store';

/**
 * Return / exchange rules shared by the admin API (server) and the browser demo store.
 * (In the live database the same checks run inside `create_return()`.)
 *
 * Lifecycle: Requested -> Approved -> Pickup scheduled -> Picked up -> Completed. Rejected is allowed
 * before pickup. Each step is recorded with a timestamp so the customer can follow it on their order.
 */
export const NEXT_STATUS: Record<ReturnReq['status'], ReturnReq['status'][]> = {
  Requested: ['Approved', 'Rejected'],
  Approved: ['Pickup scheduled', 'Rejected'],
  'Pickup scheduled': ['Picked up', 'Rejected'],
  'Picked up': ['Completed'],
  Completed: [],
  Rejected: [],
};
export const PICKUP_SLOTS = ['9 am – 1 pm', '2 pm – 6 pm'] as const;
export const RETURN_REASONS = ['Too big', 'Too small', 'Not as expected', 'Changed my mind', 'Faulty or damaged'];
const DAY = 86_400_000;

export const isOpen = (r: ReturnReq) => r.status !== 'Rejected' && r.status !== 'Completed';

/** Price of the item minus its share of any coupon discount. */
export function refundForItem(o: Order, index: number): number {
  const it = o.items[index]; if (!it) return 0;
  const line = it.price * it.qty;
  return line - (o.subtotal > 0 ? Math.round((o.discount * line) / o.subtotal) : 0);
}

export const deliveredAt = (o: Order) => o.history[4] ?? o.createdAt;
export const returnWindowOpen = (o: Order, now = Date.now()) => o.step === 4 && now - deliveredAt(o) <= RETURN_WINDOW_DAYS * DAY;

/** Why a new request for this item must be refused (null = allowed). One open request per item. */
export function requestError(o: Order, itemIndex: number, returns: ReturnReq[], now = Date.now()): string | null {
  if (o.step !== 4) return 'Only delivered orders can be returned or exchanged.';
  if (!returnWindowOpen(o, now)) return `The ${RETURN_WINDOW_DAYS}-day return window for this order has closed.`;
  const it = o.items[itemIndex];
  if (!it || it.cancelled) return 'That item cannot be returned or exchanged.';
  if (returns.some((r) => r.orderId === o.id && r.itemIndex === itemIndex && r.status !== 'Rejected')) return 'A request for this item has already been sent. You can follow it on your order.';
  return null;
}

/** The request already covering an item (open or finished), if any. */
export const requestFor = (o: Order, itemIndex: number, returns: ReturnReq[]) => returns.find((r) => r.orderId === o.id && r.itemIndex === itemIndex && r.status !== 'Rejected');

export function pickupDateError(date: string | undefined, now = Date.now()): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Choose a pickup date.';
  const t = Date.parse(date + 'T00:00:00');
  if (Number.isNaN(t)) return 'Choose a valid pickup date.';
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (t < today.getTime()) return 'The pickup date cannot be in the past.';
  if (t > today.getTime() + 14 * DAY) return 'Pick a date within the next 14 days.';
  return null;
}

export type Update = { pickupDate?: string; pickupSlot?: string; note?: string };

/** Apply an admin status change. Returns the updated request, or an error message. */
export function applyUpdate(r: ReturnReq, status: ReturnReq['status'], u: Update, now = Date.now()): { ok: true; ret: ReturnReq } | { ok: false; error: string } {
  if (!NEXT_STATUS[r.status]?.includes(status)) return { ok: false, error: `A request that is “${r.status}” cannot move to “${status}”.` };
  let next: ReturnReq = { ...r, status, history: [...(r.history ?? [{ status: 'Requested', at: r.createdAt }]), { status, at: now }] };
  if (u.note?.trim()) next = { ...next, adminNote: u.note.trim().slice(0, 300) };
  if (status === 'Pickup scheduled') {
    const bad = pickupDateError(u.pickupDate, now); if (bad) return { ok: false, error: bad };
    if (!PICKUP_SLOTS.includes(u.pickupSlot as (typeof PICKUP_SLOTS)[number])) return { ok: false, error: 'Choose a pickup time slot.' };
    next = { ...next, pickupDate: u.pickupDate, pickupSlot: u.pickupSlot };
  }
  if (status === 'Rejected' && !u.note?.trim()) return { ok: false, error: 'Add a short reason so the customer knows why.' };
  return { ok: true, ret: next };
}

/** Customer-facing steps for the timeline. */
export const stepsFor = (kind: ReturnReq['kind']) => (kind === 'return'
  ? ['Requested', 'Approved', 'Pickup scheduled', 'Picked up', 'Completed'] as const
  : ['Requested', 'Approved', 'Pickup scheduled', 'Picked up', 'Completed'] as const);
export const stepLabel = (kind: ReturnReq['kind'], s: string) => (s === 'Completed' ? (kind === 'return' ? 'Refund issued' : 'Replacement sent') : s);
