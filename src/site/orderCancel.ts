import type { Order, OrderItem } from './store';

/**
 * Order cancellation rules, shared by the admin API (server) and the browser demo store so both
 * behave identically. Pure functions: they return the new order and the items to put back in stock.
 *
 * - Whole order: allowed until it is delivered (steps 0-3). Everything not already cancelled is restocked.
 * - Single item: allowed until delivery. If it was the last open item the whole order is cancelled.
 * - Refunds: money is only due for online orders that were paid (or simulated-paid). Pay-on-delivery
 *   orders have taken no money, so nothing is due. Each cancelled item refunds its price minus its
 *   share of any coupon discount; shipping and fees are refunded only when the whole order is cancelled.
 *   The refund itself is processed by an administrator; `refundDue` is the record of what is owed.
 */
export const isOnline = (o: Pick<Order, 'payment' | 'paymentStatus'>) => o.payment !== 'cod' && (o.paymentStatus === undefined || o.paymentStatus === 'simulated' || o.paymentStatus === 'paid');

export type Cancelled = { order: Order; restock: OrderItem[]; whole: boolean };

const open = (o: Order) => o.items.filter((i) => !i.cancelled);
/** Customers can cancel until the parcel ships (confirmed or packed). The admin can still cancel until delivery. */
export const CUSTOMER_CANCEL_BEFORE = 2;
const canCancel = (o: Order, by: 'admin' | 'customer' = 'admin') => o.step >= 0 && o.step < (by === 'customer' ? CUSTOMER_CANCEL_BEFORE : 4);

export function cancelWhole(o: Order, reason: string, by: 'admin' | 'customer' = 'admin'): Cancelled | null {
  if (!canCancel(o, by)) return null;
  const restock = open(o);
  return {
    whole: true, restock,
    order: { ...o, step: -1, items: o.items.map((i) => (i.cancelled ? i : { ...i, cancelled: true })), cancelReason: reason, cancelledBy: by, refundDue: isOnline(o) ? o.total : 0, history: [...o.history, Date.now()] },
  };
}

export function cancelItem(o: Order, index: number, reason: string, by: 'admin' | 'customer' = 'admin'): Cancelled | null {
  if (!canCancel(o, by) || !Number.isInteger(index) || index < 0 || index >= o.items.length || o.items[index].cancelled) return null;
  if (open(o).length === 1) return cancelWhole(o, reason, by);    // last open item: the order is cancelled
  const it = o.items[index];
  const line = it.price * it.qty;
  const share = o.subtotal > 0 ? Math.round((o.discount * line) / o.subtotal) : 0;
  const refund = isOnline(o) ? line - share : 0;
  return {
    whole: false, restock: [it],
    order: { ...o, items: o.items.map((x, n) => (n === index ? { ...x, cancelled: true, cancelReason: reason } : x)), refundDue: (o.refundDue ?? 0) + refund, cancelledBy: by },
  };
}

/** What cancelling one item would refund (for the confirmation dialog). */
export function itemRefund(o: Order, index: number): number {
  const it = o.items[index]; if (!it || !isOnline(o)) return 0;
  const line = it.price * it.qty;
  return line - (o.subtotal > 0 ? Math.round((o.discount * line) / o.subtotal) : 0);
}
