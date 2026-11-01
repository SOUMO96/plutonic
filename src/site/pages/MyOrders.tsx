import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { inr, RETURN_WINDOW_DAYS, sizeStock } from '../catalog';
import { Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order, type ReturnReq } from '../store';
import { CUSTOMER_CANCEL_BEFORE } from '../orderCancel';
import { currentPiece, itemState, RETURN_REASONS } from '../returnRules';
import { buildJourney } from '../journeys';
import { Tracker } from '../Tracker';
import { Photo } from '../ui';

const DAY = 86_400_000;
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const longDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

/** "Arriving by Fri 6 Nov" / "Delivered Tue 3 Nov" / "Cancelled". Standard delivery is 5 days, express 2. */
export function deliveryLine(o: Order): string {
  if (o.step < 0) return 'Cancelled';
  if (o.step === 4) return `Delivered ${day(o.history[4] ?? o.createdAt)}`;
  return `Arriving by ${day(o.createdAt + (o.delivery === 'express' ? 2 : 5) * DAY)}`;
}
/** The one plain line that says where an order stands (an open return or exchange wins over "Delivered"). */
/** The short status chip: an open return or exchange wins over "Delivered". */
export const pillOf = (o: Order, returns: ReturnReq[]) => { const r = o.step >= 0 && returns.find((x) => x.orderId === o.id && x.status !== 'Completed' && x.status !== 'Rejected'); return r ? (r.kind === 'exchange' ? 'Exchange' : 'Return') : statusOf(o); };
export function orderLine(o: Order, returns: ReturnReq[]): string {
  if (o.step < 0) return 'Cancelled';
  const open = returns.find((r) => r.orderId === o.id && r.status !== 'Completed' && r.status !== 'Rejected');
  return open ? `${open.kind === 'exchange' ? 'Exchange' : 'Return'} in progress` : deliveryLine(o);
}
const statusOf = (o: Order) => (o.step < 0 ? 'Cancelled' : o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step]);

/** One calm line for the total; the full bill (every line adding up) is one tap away. */
export function OrderSummary({ o }: { o: Order }) {
  const pay = o.payment === 'cod' ? 'Pay on delivery' : o.payment === 'upi' ? 'UPI' : o.payment === 'card' ? 'Card' : 'Net banking';
  const n = o.items.reduce((c, i) => c + i.qty, 0);
  return (
    <section className="osum" aria-label="Payment">
      <div className="osum-total"><span>{o.payment === 'cod' ? 'Total to pay on delivery' : 'Total paid'}</span><b>{inr(o.total)}</b></div>
      <p className="muted small">{pay}{o.paymentStatus === 'paid' ? ' · payment received' : ''}</p>
      <details className="bill">
        <summary>View bill</summary>
        <dl className="sum">
          <div><dt>Items ({n})</dt><dd>{inr(o.subtotal)}</dd></div>
          {o.discount > 0 && <div><dt>Discount{o.couponCode ? ` (${o.couponCode})` : ''}</dt><dd>− {inr(o.discount)}</dd></div>}
          <div><dt>Delivery · {o.delivery === 'express' ? 'Express' : 'Standard'}</dt><dd>{o.shipping === 0 ? 'Free' : inr(o.shipping)}</dd></div>
          {o.codFee > 0 && <div><dt>Cash on delivery fee</dt><dd>{inr(o.codFee)}</dd></div>}
        </dl>
        <div className="sum-total"><b>Total</b><b>{inr(o.total)}</b></div>
        <p className="muted small">Prices include GST.{(o.refundDue ?? 0) > 0 ? ` Refund for cancelled items: ${inr(o.refundDue ?? 0)}.` : ''}</p>
      </details>
    </section>
  );
}

/** Ask to return or exchange one item. Exchanges are size-only; the server enforces every rule. */
function RequestPanel({ order, index, canExchange, onClose }: { order: Order; index: number; canExchange: boolean; onClose: () => void }) {
  const { product, returns, createReturn, say } = useStore();
  const it = order.items[index]; const p = product(it.productId);
  const piece = currentPiece(order, index, returns);
  const [kind, setKind] = useState<'exchange' | 'return'>(canExchange ? 'exchange' : 'return');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [note, setNote] = useState('');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const sizes = (p?.sizes ?? []).filter((s) => s !== piece.size && sizeStock(p!, piece.colourId, s) >= it.qty);
  // Suggest the natural size change for the reason chosen; the customer can still change it.
  useEffect(() => {
    if (!p || kind !== 'exchange') return;
    const at = p.sizes.indexOf(piece.size);
    const want = reason === 'Too big' ? p.sizes[at - 1] : reason === 'Too small' ? p.sizes[at + 1] : undefined;
    if (want && sizes.includes(want)) setSize(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, kind]);
  return (
    <form className="req-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setError('');
      if (kind === 'exchange' && !size) { setError('Choose the size you want instead.'); return; }
      setBusy(true);
      const r = await createReturn({ orderId: order.id, itemIndex: index, kind, reason, note, exchangeSize: kind === 'exchange' ? size : undefined });
      setBusy(false);
      if (!r.ok) { setError(r.message); return; }
      say('Request sent. Please wait for our response.'); onClose();   // the order tracking now shows it and updates by itself
    }}>
      <h4 className="h3">{canExchange ? 'Return or exchange' : 'Return'} · {it.name}</h4>
      <p className="muted small">{piece.colourName} · {piece.size} · Qty {it.qty}. Unworn with tags. Free pickup from {order.address.line1}, {order.address.city}.</p>
      {canExchange ? <>
        <label className="opt-row"><input type="radio" name={'k' + index} checked={kind === 'exchange'} onChange={() => setKind('exchange')} /><span><b>Exchange for another size</b><small>Same colour, shipped at no cost. You can exchange an item once.</small></span></label>
        <label className="opt-row"><input type="radio" name={'k' + index} checked={kind === 'return'} onChange={() => setKind('return')} /><span><b>Return</b><small>Refund to your original payment method</small></span></label>
      </> : <p className="note" role="note">This item was already exchanged once, so it can only be returned. After a return you can place a new order.</p>}
      <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
      {kind === 'exchange' && (
        <label>Size you want instead<select value={size} onChange={(e) => setSize(e.target.value)} aria-invalid={error && !size ? true : undefined}><option value="">Select size</option>{sizes.map((s) => <option key={s}>{s}</option>)}</select>
          {sizes.length === 0 && <span className="muted small">No other size is in stock right now. You can return the item instead.</span>}</label>
      )}
      <label>Anything else? (optional)<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row-gap"><button className="btn btn--dark btn--sm" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Confirm pickup request'}</button><button className="btn btn--ghost btn--sm" type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
    </form>
  );
}

/** One-line status under an item while a request is in progress (the full steps are in the tracking). */
function requestNote(r: ReturnReq): string {
  const what = r.kind === 'exchange' ? 'exchange' : 'return';
  switch (r.status) {
    case 'Requested': return `Your ${what} request ${r.id} was sent. Please wait for our response.`;
    case 'Approved': return `Your ${what} request ${r.id} was approved. We will book the pickup shortly.`;
    case 'Pickup scheduled': return r.pickupDate ? `Pickup booked for ${longDay(r.pickupDate)}, ${r.pickupSlot ?? ''}.` : 'Pickup booked.';
    case 'Picked up': return r.kind === 'exchange' ? 'We have your item and are preparing your replacement.' : 'We have your item. Your refund is being prepared.';
    default: return 'Your replacement is on its way.';
  }
}

function OrderPage({ o }: { o: Order }) {
  const { returns, refunds, cancelOrder, product } = useStore();
  const [req, setReq] = useState<number | null>(null);
  const orderRefunds = refunds.filter((x) => x.orderId === o.id);
  return (
    <section className="panel opage opage--cols">
      <Link to="/account?tab=orders" className="opage-back">← All orders</Link>
      <div className="opage-head"><div><span className="lbl muted">Order · placed {day(o.createdAt)}</span><h2 className="h2 opage-id">{o.id}</h2></div><span className={'ostatus' + (o.step < 0 ? ' ostatus--bad' : '')}>{pillOf(o, returns)}</span></div>
      <div className="ocard-grid">
        <section>
          <Tracker journey={buildJourney(o, returns, refunds)} />
          {o.step >= 0 && o.step < CUSTOMER_CANCEL_BEFORE && <div className="row-gap ocancel"><button type="button" className="linkbtn small" onClick={() => { if (window.confirm(`Cancel order ${o.id}? Your items are released${o.payment === 'cod' ? '.' : ' and a refund is recorded.'}`)) cancelOrder(o.id); }}>Cancel order</button></div>}
        </section>
        <section>
          <ul className="oitems">
            {o.items.map((i, n) => {
              const p = product(i.productId); const st = itemState(o, n, returns);
              const declined = !st.open ? returns.filter((r) => r.orderId === o.id && r.itemIndex === n && r.status === 'Rejected').sort((a, b) => b.createdAt - a.createdAt)[0] : undefined;
              const stale = declined && returns.some((r) => r.orderId === o.id && r.itemIndex === n && r.createdAt > declined.createdAt);
              return (
                <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}>
                  <div className="oitem-row">{p && <span className="item-thumb"><Photo p={p} ratio="4 / 5" colourId={i.colourId} /></span>}<span className="oitem-text"><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span className="oitem-price">{inr(i.price * i.qty)}</span></div>
                  {st.open && <p className="req-note" role="status">{requestNote(st.open)}</p>}
                  {declined && !stale && <p className="req-note req-note--bad">Your earlier request was declined{declined.adminNote ? `: ${declined.adminNote}` : '.'}</p>}
                  {!i.cancelled && o.step === 4 && st.canReturn && req !== n && <button type="button" className="linkbtn oitem-act" onClick={() => setReq(n)}>{st.canExchange ? 'Return or exchange' : 'Return this item'}</button>}
                  {!i.cancelled && o.step === 4 && !st.open && st.note && req !== n && <span className="muted small">{st.note}</span>}
                  {req === n && <RequestPanel order={o} index={n} canExchange={st.canExchange} onClose={() => setReq(null)} />}
                </li>
              );
            })}
          </ul>
          <OrderSummary o={o} />
          {orderRefunds.map((x) => <p key={x.id} className="muted small oref">Refund {inr(x.amount)} · {x.status === 'Refunded' ? 'sent' + (x.reference ? ` (ref ${x.reference})` : '') : 'being processed'}</p>)}
          <div className="ometa"><span className="lbl muted">Delivering to</span><p>{o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}, {o.address.state}</p></div>
          <Link to="/support" className="ulink small ohelp">Need help with this order?</Link>
        </section>
      </div>
    </section>
  );
}

/** One order as a quiet row: photo, name, one plain status line, price. */
function OrderWidget({ o }: { o: Order }) {
  const { product, returns } = useStore();
  const first = o.items[0]; const p = product(first.productId);
  const line = orderLine(o, returns);
  const more = o.items.length - 1;
  return (
    <Link to={`/account?tab=orders&order=${o.id}`} className="owidget" aria-label={`Order ${o.id}: ${first.name}, ${line}, ${inr(o.total)}`}>
      <span className="owidget-ph">{p && <Photo p={p} ratio="4 / 5" colourId={first.colourId} />}</span>
      <span className="owidget-body">
        <b>{first.name}{more > 0 ? ` + ${more} more` : ''}</b>
        <small className="muted">Order #{o.id}</small>
        <span className={'owidget-eta' + (o.step < 0 ? ' bad' : '')}>{line}</span>
      </span>
      <span className="owidget-side"><b>{inr(o.total)}</b><span className={'ostatus' + (o.step < 0 ? ' ostatus--bad' : '')}>{pillOf(o, returns)}</span></span>
      <ChevronRight size={16} aria-hidden="true" className="owidget-go" />
    </Link>
  );
}

/** Orders: a quiet list; select one to open it. */
export function MyOrders({ route }: { route: Route }) {
  const { orders, refreshAccount } = useStore();
  const focus = route.query.get('order');
  // Keep this page in step with the server: when the admin approves, schedules or ships, it shows here by itself
  // (live push from the database, with a 4-second check as backup).
  useEffect(() => {
    void refreshAccount();
    const tick = () => { if (!document.hidden) void refreshAccount(); };
    const t = window.setInterval(tick, 4_000); document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [refreshAccount]);
  const list = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  if (focus) {
    const o = orders.find((x) => x.id === focus);
    return o ? <OrderPage o={o} /> : <section className="opage"><p className="muted">We couldn’t find that order.</p><Link to="/account?tab=orders" className="ulink small">← All orders</Link></section>;
  }
  if (!list.length) return <section className="opage"><h2 className="h3">Orders</h2><p className="muted">No orders yet.</p><Link className="btn btn--dark btn--sm" to="/shop">Start shopping</Link></section>;
  return (
    <section className="opage"><h2 className="h3">Orders</h2>
      <div className="ocards">{list.map((o) => <OrderWidget key={o.id} o={o} />)}</div>
    </section>
  );
}
