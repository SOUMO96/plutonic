import { RETURN_WINDOW_DAYS } from './catalog.js';
import type { Order, ReturnReq } from './store';

/**
 * Return / exchange rules shared by the admin API (server) and the browser demo store.
 * (In the live database the same checks run inside `create_return()`.)
 *
 *  Return:   Requested > Approved > Pickup scheduled > Picked up > Completed (refund issued)
 *  Exchange: Requested > Approved > Pickup scheduled > Picked up > Replacement packed > Replacement shipped
 *            > Replacement out for delivery > Completed (replacement delivered)
 *  A request can be Rejected until the piece has been picked up.
 *
 *  Per ORDER: only one request can be open at a time (so there is only ever one journey to show).
 *  Per item: exactly one OPEN request at a time. An item can be EXCHANGED ONCE (size only, same colour);
 *  after that it can only be RETURNED; after a return the customer places a new order.
 */
type Status = ReturnReq['status'];
const DAY = 86_400_000;
export const PICKUP_SLOTS = ['9 am – 1 pm', '2 pm – 6 pm'] as const;
export const RETURN_REASONS = ['Too big', 'Too small', 'Not as expected', 'Changed my mind', 'Faulty or damaged'];

export const RETURN_FLOW: Status[] = ['Requested', 'Approved', 'Pickup scheduled', 'Picked up', 'Completed'];
export const EXCHANGE_FLOW: Status[] = ['Requested', 'Approved', 'Pickup scheduled', 'Picked up', 'Replacement packed', 'Replacement shipped', 'Replacement out for delivery', 'Completed'];
export const flowFor = (kind: ReturnReq['kind']) => (kind === 'exchange' ? EXCHANGE_FLOW : RETURN_FLOW);

export function nextStatuses(r: Pick<ReturnReq, 'status' | 'kind'>): Status[] {
  switch (r.status) {
    case 'Requested': return ['Approved', 'Rejected'];
    case 'Approved': return ['Pickup scheduled', 'Rejected'];
    case 'Pickup scheduled': return ['Picked up', 'Rejected'];
    case 'Picked up': return r.kind === 'exchange' ? ['Replacement packed'] : ['Completed'];
    case 'Replacement packed': return ['Replacement shipped'];
    case 'Replacement shipped': return ['Replacement out for delivery'];
    case 'Replacement out for delivery': return ['Completed'];
    default: return [];
  }
}
export const isFinished = (r: Pick<ReturnReq, 'status'>) => r.status === 'Completed' || r.status === 'Rejected';
export const isOpen = (r: Pick<ReturnReq, 'status'>) => !isFinished(r);

/** Wording shown to customers (and admins) for each step. */
export function stepLabel(kind: ReturnReq['kind'], s: Status): string {
  switch (s) {
    case 'Requested': return kind === 'exchange' ? 'Exchange requested' : 'Return requested';
    case 'Replacement out for delivery': return 'Out for delivery';
    case 'Completed': return kind === 'return' ? 'Refund issued' : 'Replacement delivered';
    default: return s;
  }
}
/** Admin button text for moving a request to this step. */
export function actionLabel(kind: ReturnReq['kind'], s: Status): string {
  switch (s) {
    case 'Approved': return 'Approve';
    case 'Pickup scheduled': return 'Schedule pickup';
    case 'Picked up': return 'Mark picked up';
    case 'Replacement packed': return 'Pack replacement (swaps stock)';
    case 'Replacement shipped': return 'Mark replacement shipped';
    case 'Replacement out for delivery': return 'Out for delivery';
    case 'Completed': return kind === 'return' ? 'Complete · record refund' : 'Mark replacement delivered';
    case 'Rejected': return 'Reject';
    default: return s;
  }
}

/** Price of the item minus its share of any coupon discount. */
export function refundForItem(o: Order, index: number): number {
  const it = o.items[index]; if (!it) return 0;
  const line = it.price * it.qty;
  return line - (o.subtotal > 0 ? Math.round((o.discount * line) / o.subtotal) : 0);
}

export const deliveredAt = (o: Order) => o.history[4] ?? o.createdAt;
export const completedAt = (r: ReturnReq) => r.history?.find((h) => h.status === 'Completed')?.at;

export type ItemState = {
  /** The request currently in progress for this item, if any. */
  open?: ReturnReq;
  returned?: ReturnReq;
  exchanged?: ReturnReq;
  canReturn: boolean;
  canExchange: boolean;
  /** Short explanation shown when an action is not available. */
  note?: string;
  windowEndsAt: number;
};

/** What a customer may do with one item right now. */
export function itemState(o: Order, itemIndex: number, returns: ReturnReq[], now = Date.now()): ItemState {
  const mine = returns.filter((r) => r.orderId === o.id && r.itemIndex === itemIndex);
  const open = mine.find(isOpen);
  const returned = mine.find((r) => r.kind === 'return' && r.status === 'Completed');
  const exchanged = mine.find((r) => r.kind === 'exchange' && r.status === 'Completed');
  // The 14 days run from delivery, or from the day a replacement was delivered.
  const windowEndsAt = Math.max(deliveredAt(o), exchanged ? completedAt(exchanged) ?? 0 : 0) + RETURN_WINDOW_DAYS * DAY;
  const it = o.items[itemIndex];
  const base = { open, returned, exchanged, windowEndsAt };
  if (!it || it.cancelled) return { ...base, canReturn: false, canExchange: false };
  if (o.step !== 4) return { ...base, canReturn: false, canExchange: false };
  // Only one return/exchange may be in progress on an order. Finish (or have it declined) before starting another.
  const otherOpen = returns.find((r) => r.orderId === o.id && r.itemIndex !== itemIndex && isOpen(r));
  if (otherOpen && !open) return { ...base, canReturn: false, canExchange: false, note: `Request ${otherOpen.id} is still in progress. You can start another once it finishes.` };
  if (returned) return { ...base, canReturn: false, canExchange: false, note: 'Returned. Please place a new order if you would like it again.' };
  if (open) return { ...base, canReturn: false, canExchange: false };
  if (now > windowEndsAt) return { ...base, canReturn: false, canExchange: false, note: 'Return window closed' };
  if (exchanged) return { ...base, canReturn: true, canExchange: false, note: 'Already exchanged once, so this item can now only be returned.' };
  return { ...base, canReturn: true, canExchange: true };
}

/** Why a new request for this item must be refused (null = allowed). */
export function requestError(o: Order, itemIndex: number, returns: ReturnReq[], kind: ReturnReq['kind'], now = Date.now()): string | null {
  if (o.step !== 4) return 'Only delivered orders can be returned or exchanged.';
  const st = itemState(o, itemIndex, returns, now);
  if (st.open) return 'A request for this item is already in progress. You can follow it on your order.';
  if (returns.some((r) => r.orderId === o.id && isOpen(r))) return 'Another request on this order is in progress. You can start a new one when it is finished.';
  if (st.returned) return 'This item has already been returned. Please place a new order.';
  if (!st.canReturn) return st.note ?? 'That item cannot be returned or exchanged.';
  if (kind === 'exchange' && !st.canExchange) return 'This item has already been exchanged once. It can only be returned now. After a return, please place a new order.';
  return null;
}

/** The size/colour the customer currently holds for an item (the original, or the replacement after an exchange). */
export function currentPiece(o: Order, itemIndex: number, returns: ReturnReq[]): { colourId: string; colourName: string; size: string } {
  const it = o.items[itemIndex];
  const ex = returns.filter((r) => r.orderId === o.id && r.itemIndex === itemIndex && r.kind === 'exchange' && r.status === 'Completed').sort((a, b) => b.createdAt - a.createdAt)[0];
  return ex?.exchangeTo ?? { colourId: it.colourId, colourName: it.colourName, size: it.size };
}

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
export function applyUpdate(r: ReturnReq, status: Status, u: Update, now = Date.now()): { ok: true; ret: ReturnReq } | { ok: false; error: string } {
  if (!nextStatuses(r).includes(status)) return { ok: false, error: `A request that is “${r.status}” cannot move to “${status}”.` };
  const prior = r.history ?? [{ status: 'Requested' as Status, at: r.createdAt }];
  now = Math.max(now, prior[prior.length - 1]?.at ?? 0);   // timestamps never run backwards (clock differences)
  let next: ReturnReq = { ...r, status, history: [...prior, { status, at: now }] };
  if (u.note?.trim()) next = { ...next, adminNote: u.note.trim().slice(0, 300) };
  if (status === 'Pickup scheduled') {
    const bad = pickupDateError(u.pickupDate, now); if (bad) return { ok: false, error: bad };
    if (!PICKUP_SLOTS.includes(u.pickupSlot as (typeof PICKUP_SLOTS)[number])) return { ok: false, error: 'Choose a pickup time slot.' };
    next = { ...next, pickupDate: u.pickupDate, pickupSlot: u.pickupSlot };
  }
  if (status === 'Rejected' && !u.note?.trim()) return { ok: false, error: 'Add a short reason so the customer knows why.' };
  return { ok: true, ret: next };
}

/** One selected item inside a multi-item request. */
export type BatchItem = { itemIndex: number; exchangeSize?: string; reason?: string };
export type BatchInput = { orderId: string; kind: ReturnReq['kind']; reason?: string; note?: string; items: BatchItem[] };

/**
 * Check a whole request (ONE action, several items) and build the linked requests. All or nothing: the first problem refuses the lot.
 * The live database runs the same checks inside create_return_batch(); this is the browser-only demo's copy.
 */
export function buildBatch(
  o: Order, input: BatchInput, returns: ReturnReq[],
  ctx: { sizesOf: (productId: string) => string[] | null; stockOf: (productId: string, colourId: string, size: string) => number; nextId: (n: number) => string },
  now = Date.now(),
): { ok: true; requests: ReturnReq[] } | { ok: false; error: string } {
  if (input.kind !== 'return' && input.kind !== 'exchange') return { ok: false, error: 'Choose return or exchange.' };
  if (o.step !== 4) return { ok: false, error: 'Only delivered orders can be returned or exchanged.' };
  if (!input.items.length) return { ok: false, error: 'Select the items you want to return or exchange.' };
  if (new Set(input.items.map((i) => i.itemIndex)).size !== input.items.length) return { ok: false, error: 'Each item can only be selected once.' };
  const open = returns.find((r) => r.orderId === o.id && isOpen(r));
  if (open) return { ok: false, error: 'Another request on this order is in progress. You can start a new one when it is finished.' };
  const batchId = 'B-' + Math.random().toString(16).slice(2, 10);
  const need: Record<string, number> = {};
  const out: ReturnReq[] = [];
  for (const [n, bi] of input.items.entries()) {
    if ((bi as { kind?: string }).kind && (bi as { kind?: string }).kind !== input.kind) return { ok: false, error: 'A request can be either a return or an exchange, not both. Please send them separately.' };
    const it = o.items[bi.itemIndex]; const name = it?.name ?? 'That item';
    if (!it || it.cancelled) return { ok: false, error: 'That item cannot be returned or exchanged.' };
    const reason = (bi.reason ?? input.reason ?? '').trim();
    if (reason.length < 2) return { ok: false, error: 'Choose a reason.' };
    const st = itemState(o, bi.itemIndex, returns, now);
    if (st.returned) return { ok: false, error: `${name} has already been returned. Please place a new order.` };
    if (!st.canReturn) return { ok: false, error: st.note ?? `${name} cannot be returned or exchanged.` };
    if (input.kind === 'exchange' && !st.canExchange) return { ok: false, error: `${name} has already been exchanged once. It can only be returned now.` };
    const piece = currentPiece(o, bi.itemIndex, returns);
    let exchangeTo: ReturnReq['exchangeTo']; let refundAmount = 0;
    if (input.kind === 'exchange') {
      const size = (bi.exchangeSize ?? '').trim();
      if (!size) return { ok: false, error: `Choose the size you want instead for ${name}.` };
      if (size === piece.size) return { ok: false, error: `Choose a different size for ${name}.` };
      const sizes = ctx.sizesOf(it.productId);
      if (!sizes) return { ok: false, error: `${name} is no longer available for exchange. Please request a return instead.` };
      if (!sizes.includes(size)) return { ok: false, error: `That size does not exist for ${name}.` };
      const key = `${it.productId}:${piece.colourId}:${size}`;
      need[key] = (need[key] ?? 0) + it.qty;
      if (ctx.stockOf(it.productId, piece.colourId, size) < need[key]) return { ok: false, error: `Size ${size} of ${name} is not in stock right now. Choose another size, or request a return.` };
      exchangeTo = { colourId: piece.colourId, colourName: piece.colourName, size };   // same colour only
    } else refundAmount = refundForItem(o, bi.itemIndex);
    out.push({
      id: ctx.nextId(n), orderId: o.id, itemIndex: bi.itemIndex, productId: it.productId, productName: it.name, variant: `${piece.colourName} · ${piece.size}`, piece, qty: it.qty,
      kind: input.kind, reason, note: (input.note ?? '').slice(0, 1000), exchangeTo, refundAmount, status: 'Requested', createdAt: now,
      batchId, batchSize: input.items.length, history: [{ status: 'Requested', at: now }],
    });
  }
  return { ok: true, requests: out };
}

/** The requests that were sent together with this one (itself included), oldest first. */
export const batchMembers = (returns: ReturnReq[], r: ReturnReq): ReturnReq[] =>
  r.batchId ? returns.filter((x) => x.orderId === r.orderId && x.batchId === r.batchId).sort((a, b) => a.itemIndex! - b.itemIndex!) : [r];
