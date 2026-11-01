import { useEffect, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { inr, RETURN_WINDOW_DAYS, sizeStock } from '../catalog';
import { Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order, type ReturnReq } from '../store';
import { currentPiece, flowFor, itemState, RETURN_REASONS, stepLabel } from '../returnRules';
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
const statusOf = (o: Order) => (o.step < 0 ? 'Cancelled' : o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step]);

/** The itemised bill: every line, discount, shipping and fees add up to the total. */
export function OrderBill({ o }: { o: Order }) {
  const open = o.items.filter((i) => !i.cancelled);
  return (
    <div className="bill" aria-label="Bill">
      <h3 className="lbl muted">Bill</h3>
      <table className="bill-lines"><thead><tr><th>Item</th><th>Price</th><th>Qty</th><th>Amount</th></tr></thead><tbody>
        {o.items.map((i, n) => <tr key={n} className={i.cancelled ? 'is-cancelled' : undefined}><td><b>{i.name}</b><small className="muted">{i.colourName} · {i.size}{i.cancelled ? ' · Cancelled' : ''}</small></td><td>{inr(i.price)}</td><td>{i.qty}</td><td>{inr(i.price * i.qty)}</td></tr>)}
      </tbody></table>
      <dl className="sum">
        <div><dt>Item total ({o.items.reduce((n, i) => n + i.qty, 0)} items)</dt><dd>{inr(o.subtotal)}</dd></div>
        {o.discount > 0 && <div><dt>Discount{o.couponCode ? ` (${o.couponCode})` : ''}</dt><dd>− {inr(o.discount)}</dd></div>}
        <div><dt>Delivery · {o.delivery === 'express' ? 'Express' : 'Standard'}</dt><dd>{o.shipping === 0 ? 'Free' : inr(o.shipping)}</dd></div>
        {o.codFee > 0 && <div><dt>Cash on delivery fee</dt><dd>{inr(o.codFee)}</dd></div>}
        <div><dt>Tax (GST)</dt><dd className="muted">Included in prices</dd></div>
      </dl>
      <div className="sum-total"><b>{o.payment === 'cod' ? 'Total to pay on delivery' : 'Total paid'}</b><b>{inr(o.total)}</b></div>
      <p className="muted small">Payment: {o.payment === 'cod' ? 'Pay on delivery' : o.payment === 'upi' ? 'UPI' : o.payment === 'card' ? 'Card' : 'Net banking'}{o.paymentStatus === 'paid' ? ' · received' : ''}{open.length < o.items.length ? ` · ${o.items.length - open.length} item(s) cancelled` : ''}</p>
      {(o.refundDue ?? 0) > 0 && <p className="note" role="note">Refund for cancelled items: {inr(o.refundDue ?? 0)}</p>}
    </div>
  );
}

/** One tracking for the whole order. Return and exchange steps continue on this same timeline after delivery. */
function OrderTracking({ o }: { o: Order }) {
  const { returns, refunds } = useStore();
  if (o.step < 0) return <p className="muted">This order was cancelled.{o.cancelReason ? ` Reason: ${o.cancelReason}.` : ''}{(o.refundDue ?? 0) > 0 ? ' A refund is being processed to the original payment method.' : ''}</p>;
  const reqs = returns.filter((r) => r.orderId === o.id).sort((a, b) => a.createdAt - b.createdAt);
  return (
    <ol className="timeline timeline--one">
      {ORDER_STEPS.map((s, i) => (
        <li key={s} className={i <= o.step ? 'done' : ''} aria-current={i === o.step && reqs.length === 0 ? 'step' : undefined}><span className="dotc">{i <= o.step && <Check size={12} strokeWidth={2} aria-hidden="true" />}</span>
          <b>{s}</b><span className="muted small">{i <= o.step ? when(o.history[i] ?? o.createdAt) : 'Pending'}{i === 1 && i <= o.step ? ' · Bengaluru warehouse' : ''}{i === 2 && i <= o.step ? ' · Courier AWB ' + o.id.replace(/\D/g, '') + '01' : ''}</span></li>
      ))}
      {reqs.map((r) => <RequestSteps key={r.id} r={r} refund={refunds.find((x) => x.returnId === r.id)} />)}
    </ol>
  );
}

function RequestSteps({ r, refund }: { r: ReturnReq; refund?: { amount: number; status: string; reference?: string } }) {
  const hist = r.history ?? [{ status: 'Requested' as const, at: r.createdAt }];
  const at = (s: string) => hist.find((h) => h.status === s)?.at;
  const flow = flowFor(r.kind);
  const rejected = r.status === 'Rejected';
  // how far this request got (a rejected one stops at the last step it reached)
  const reached = rejected ? Math.max(...hist.filter((h) => h.status !== 'Rejected').map((h) => flow.indexOf(h.status)), 0) : flow.indexOf(r.status);
  const title = `${r.kind === 'exchange' ? 'Exchange' : 'Return'} · ${r.productName} (${r.variant})${r.kind === 'exchange' && r.exchangeTo ? ` → size ${r.exchangeTo.size}` : ''}`;
  const detail = (s: ReturnReq['status'], done: boolean) => {
    if (!done) return 'Pending';
    const t = at(s); const stamp = t ? when(t) : '';
    if (s === 'Pickup scheduled' && r.pickupDate) return `${stamp} · pickup ${longDay(r.pickupDate)}, ${r.pickupSlot ?? ''}`;
    if (s === 'Replacement shipped') return `${stamp} · Courier AWB ${r.id.replace(/\D/g, '')}02`;
    if (s === 'Completed' && r.kind === 'return') return `${stamp}${refund ? ` · refund ${inr(refund.amount)} ${refund.status === 'Refunded' ? `sent${refund.reference ? ` (ref ${refund.reference})` : ''}` : 'being processed (5–7 working days)'}` : ''}`;
    return stamp;
  };
  return (
    <>
      <li className="tl-group"><b>{title}</b>{r.adminNote && <span className="muted small">Message from PLUTONIC: {r.adminNote}</span>}</li>
      {flow.map((s, i) => {
        const done = i <= reached && (!rejected || i === 0 || !!at(s));
        return <li key={r.id + s} className={'tl-sub' + (done ? ' done' : '')} aria-current={!rejected && i === reached && r.status !== 'Completed' ? 'step' : undefined}><span className="dotc">{done && <Check size={12} strokeWidth={2} aria-hidden="true" />}</span><b>{stepLabel(r.kind, s)}</b><span className="muted small">{detail(s, done)}</span></li>;
      })}
      {rejected && <li className="tl-sub done rejected"><span className="dotc">×</span><b>Request declined</b><span className="muted small">{at('Rejected') ? when(at('Rejected')!) : ''}{r.adminNote ? ` · ${r.adminNote}` : ''}</span></li>}
    </>
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
    case 'Requested': return `Your ${what} request was sent. Please wait for our response.`;
    case 'Approved': return `Your ${what} was approved. We will book the pickup shortly.`;
    case 'Pickup scheduled': return r.pickupDate ? `Pickup booked for ${longDay(r.pickupDate)}, ${r.pickupSlot ?? ''}.` : 'Pickup booked.';
    case 'Picked up': return r.kind === 'exchange' ? 'We have your item and are preparing your replacement.' : 'We have your item. Your refund is being prepared.';
    default: return 'Your replacement is on its way. Follow it in the tracking.';
  }
}

function OrderPage({ o }: { o: Order }) {
  const { returns, refunds, cancelOrder, product } = useStore();
  const [req, setReq] = useState<number | null>(null);
  const orderRefunds = refunds.filter((x) => x.orderId === o.id);
  return (
    <section className="panel opage">
      <Link to="/account?tab=orders" className="lbl ulink small">← All orders</Link>
      <div className="opage-head"><div><h2 className="h2">Order #{o.id}</h2><p className="muted">Placed {when(o.createdAt)} · {deliveryLine(o)}</p></div><span className={'status' + (o.step < 0 ? ' status--bad' : '')}>{statusOf(o)}</span></div>
      <div className="ocard-grid">
        <section>
          <h3 className="lbl muted">Tracking</h3>
          <OrderTracking o={o} />
          {o.step >= 0 && o.step < 3 && <div className="row-gap"><button type="button" className="btn btn--ghost btn--sm" onClick={() => { if (window.confirm(`Cancel order #${o.id}? Your items are released${o.payment === 'cod' ? '.' : ' and a refund is recorded.'}`)) cancelOrder(o.id); }}>Cancel order</button><span className="muted small">You can cancel until the order ships.</span></div>}
          {o.step === 3 && <p className="muted small">This order is out for delivery, so it can no longer be cancelled. You can return or exchange items after delivery.</p>}
        </section>
        <section>
          <h3 className="lbl muted">Items</h3>
          <ul className="oitems">
            {o.items.map((i, n) => {
              const p = product(i.productId); const st = itemState(o, n, returns);
              const declined = !st.open ? returns.filter((r) => r.orderId === o.id && r.itemIndex === n && r.status === 'Rejected').sort((a, b) => b.createdAt - a.createdAt)[0] : undefined;
              const stale = declined && returns.some((r) => r.orderId === o.id && r.itemIndex === n && r.createdAt > declined.createdAt);
              return (
                <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}>
                  <div className="oitem-row">{p && <span className="item-thumb"><Photo p={p} ratio="4 / 5" colourId={i.colourId} /></span>}<span className="oitem-text"><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small><small>{inr(i.price * i.qty)}</small></span></div>
                  {st.open && <p className="req-note" role="status">{requestNote(st.open)}</p>}
                  {declined && !stale && <p className="req-note req-note--bad">Your earlier request was declined{declined.adminNote ? `: ${declined.adminNote}` : '.'}</p>}
                  {!i.cancelled && o.step === 4 && st.canReturn && req !== n && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReq(n)}>{st.canExchange ? 'Return or exchange' : 'Return this item'}</button>}
                  {!i.cancelled && o.step === 4 && !st.open && st.note && req !== n && <span className="muted small">{st.note}</span>}
                  {req === n && <RequestPanel order={o} index={n} canExchange={st.canExchange} onClose={() => setReq(null)} />}
                </li>
              );
            })}
          </ul>
          {o.step === 4 && <p className="muted small">Return or exchange within {RETURN_WINDOW_DAYS} days of delivery.</p>}
          {orderRefunds.length > 0 && <div className="refund-box">{orderRefunds.map((x) => <p key={x.id} className="note" role="note">Refund {inr(x.amount)} · {x.source === 'cancellation' ? 'cancelled items' : 'returned item'} · <b>{x.status === 'Refunded' ? 'Sent' + (x.reference ? ` (ref ${x.reference})` : '') : 'Being processed'}</b></p>)}</div>}
          <OrderBill o={o} />
          <p className="muted small">Shipping to {o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}, {o.address.state}</p>
          <Link to="/support" className="lbl ulink small">Need help with this order?</Link>
        </section>
      </div>
    </section>
  );
}

/** A tappable summary of one order: photos, estimated delivery date, price. */
function OrderWidget({ o }: { o: Order }) {
  const { product } = useStore();
  const shown = o.items.slice(0, 3);
  const first = o.items[0];
  const count = o.items.reduce((n, i) => n + i.qty, 0);
  return (
    <Link to={`/account?tab=orders&order=${o.id}`} className="owidget" aria-label={`Order ${o.id}: ${first.name}, ${deliveryLine(o)}, ${inr(o.total)}`}>
      <span className="owidget-photos">{shown.map((i, n) => { const p = product(i.productId); return p ? <span key={n} className="owidget-ph"><Photo p={p} ratio="4 / 5" colourId={i.colourId} /></span> : null; })}</span>
      <span className="owidget-body">
        <b>{first.name}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''}</b>
        <small className="muted">Order #{o.id} · {count} item{count > 1 ? 's' : ''}</small>
        <span className={'owidget-eta' + (o.step < 0 ? ' bad' : '')}>{deliveryLine(o)}</span>
      </span>
      <span className="owidget-side"><b>{inr(o.total)}</b><span className={'status' + (o.step < 0 ? ' status--bad' : '')}>{statusOf(o)}</span></span>
      <ChevronRight size={18} aria-hidden="true" className="owidget-go" />
    </Link>
  );
}

/** Orders: a list of widgets; selecting one opens that order with its tracking, items and bill. */
export function MyOrders({ route }: { route: Route }) {
  const { orders, refreshAccount } = useStore();
  const focus = route.query.get('order');
  // Keep this page in step with the server: when the admin approves, schedules or ships, it shows here by itself.
  useEffect(() => {
    void refreshAccount();
    const tick = () => { if (!document.hidden) void refreshAccount(); };
    const t = window.setInterval(tick, 15_000); document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [refreshAccount]);
  const list = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  if (focus) {
    const o = orders.find((x) => x.id === focus);
    return o ? <OrderPage o={o} /> : <section className="panel"><p className="muted">We couldn’t find that order.</p><Link to="/account?tab=orders" className="btn btn--dark btn--sm">All orders</Link></section>;
  }
  if (!list.length) return <section className="panel"><h2 className="h3">Orders</h2><p className="muted">No orders yet.</p><Link className="btn btn--dark btn--sm" to="/shop">Start shopping</Link></section>;
  return (
    <section className="panel"><h2 className="h3">Orders</h2>
      <p className="muted small">Select an order to see its tracking and bill, cancel it, or return or exchange an item.</p>
      <div className="ocards">{list.map((o) => <OrderWidget key={o.id} o={o} />)}</div>
    </section>
  );
}
