import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { inr, RETURN_WINDOW_DAYS, sizeStock } from '../catalog';
import { Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order, type ReturnReq } from '../store';
import { deliveredAt, RETURN_REASONS, requestFor, returnWindowOpen, stepLabel, stepsFor } from '../returnRules';
import { OrderTimeline } from './Orders';

const DAY = 86_400_000;
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const pickupText = (r: ReturnReq) => (r.pickupDate ? `${new Date(r.pickupDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}, ${r.pickupSlot ?? ''}` : '');

/** Where a return / exchange request stands, step by step, with dates. */
export function ReturnTimeline({ r }: { r: ReturnReq }) {
  const { refunds } = useStore();
  const hist = r.history ?? [{ status: 'Requested' as const, at: r.createdAt }];
  const at = (s: string) => hist.find((h) => h.status === s)?.at;
  const rejected = r.status === 'Rejected';
  const steps = stepsFor(r.kind);
  const idx = steps.indexOf(r.status as (typeof steps)[number]);
  const refund = refunds.find((x) => x.returnId === r.id);
  const label = r.kind === 'exchange' ? 'Exchange' : 'Return';
  return (
    <div className="rtl">
      <div className="rtl-head"><b>{label} request {r.id}</b><span className={'status' + (rejected ? ' status--bad' : '')}>{rejected ? 'Rejected' : r.status === 'Requested' ? 'Waiting for our response' : r.status}</span></div>
      <p className="muted small">{r.reason}{r.kind === 'exchange' && r.exchangeTo ? ` · exchange to ${r.exchangeTo.colourName} · ${r.exchangeTo.size}` : ''}</p>
      <ol className="timeline">
        {steps.map((s, i) => {
          const done = !rejected && i <= idx; const t = at(s);
          const detail = s === 'Requested' ? (t ? when(t) : '')
            : s === 'Approved' ? (done && t ? when(t) : 'Pending')
            : s === 'Pickup scheduled' ? (done && r.pickupDate ? `Pickup on ${pickupText(r)}` : 'Pending')
            : s === 'Picked up' ? (done && t ? when(t) : 'Pending')
            : (done && t ? when(t) : 'Pending');
          return <li key={s} className={done ? 'done' : ''} aria-current={!rejected && i === idx ? 'step' : undefined}><span className="dotc">{done ? '✓' : ''}</span><b>{stepLabel(r.kind, s)}</b><span className="muted small">{detail}</span></li>;
        })}
        {rejected && <li className="done rejected"><span className="dotc">×</span><b>Rejected</b><span className="muted small">{hist.find((h) => h.status === 'Rejected') ? when(hist.find((h) => h.status === 'Rejected')!.at) : ''}</span></li>}
      </ol>
      {r.adminNote && <p className="note" role="note">Message from PLUTONIC: {r.adminNote}</p>}
      {r.status === 'Pickup scheduled' && <p className="note ok" role="status">Pickup is booked for {pickupText(r)}. Please keep the item unworn with tags, in its packaging.</p>}
      {r.kind === 'return' && r.status === 'Completed' && <p className="note ok" role="status">{refund ? (refund.status === 'Refunded' ? `Refund of ${inr(refund.amount)} has been sent${refund.reference ? ` (ref ${refund.reference})` : ''}.` : `Refund of ${inr(refund.amount)} is being processed. It reaches UPI and cards in 5–7 working days.`) : `Refund of ${inr(r.refundAmount ?? 0)} is being processed.`}</p>}
      {r.kind === 'exchange' && r.status === 'Completed' && r.exchangeTo && <p className="note ok" role="status">Your replacement ({r.exchangeTo.colourName} · {r.exchangeTo.size}) is on its way.</p>}
    </div>
  );
}

/** Ask to return or exchange one item. Rules are enforced by the server; the form only guides. */
function RequestPanel({ order, index, onClose }: { order: Order; index: number; onClose: () => void }) {
  const { product, createReturn } = useStore();
  const it = order.items[index]; const p = product(it.productId);
  const [kind, setKind] = useState<'exchange' | 'return'>('exchange');
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [note, setNote] = useState('');
  const [colourId, setColourId] = useState(it.colourId);
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState<ReturnReq | null>(null);
  const colours = (p?.colours ?? []).filter((c) => c.id === it.colourId || p!.sizes.some((s) => sizeStock(p!, c.id, s) >= it.qty));
  const sizes = (p?.sizes ?? []).filter((s) => sizeStock(p!, colourId, s) >= it.qty && !(s === it.size && colourId === it.colourId));
  // Suggest the natural size change for the reason chosen, then leave it to the customer.
  useEffect(() => {
    if (!p || kind !== 'exchange') return;
    const order_ = p.sizes; const at = order_.indexOf(it.size);
    const want = reason === 'Too big' ? order_[at - 1] : reason === 'Too small' ? order_[at + 1] : undefined;
    if (want && sizes.includes(want)) setSize(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, kind, colourId]);
  useEffect(() => { if (size && !sizes.includes(size)) setSize(''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [colourId]);

  if (sent) return (
    <div className="req-sent" role="status">
      <h4 className="h3">Request sent. Please wait for our response.</h4>
      <p>We have received your {sent.kind === 'exchange' ? 'exchange' : 'return'} request <b>{sent.id}</b> for <b>{sent.productName}</b> ({sent.variant}){sent.exchangeTo ? `, to ${sent.exchangeTo.colourName} · ${sent.exchangeTo.size}` : ''}.</p>
      <ul className="req-next"><li>Our team reviews it within 1–2 working days.</li><li>Once approved we book a pickup and show the date here.</li><li>Every update appears on this order, under the item. No need to track it anywhere else.</li></ul>
      <button type="button" className="btn btn--dark btn--sm" onClick={onClose}>Done</button>
    </div>
  );
  return (
    <form className="req-form" noValidate onSubmit={async (e) => {
      e.preventDefault(); setError('');
      if (kind === 'exchange' && !size) { setError('Choose the size you want instead.'); return; }
      setBusy(true);
      const r = await createReturn({ orderId: order.id, itemIndex: index, kind, reason, note, exchangeSize: kind === 'exchange' ? size : undefined, exchangeColour: kind === 'exchange' ? colourId : undefined });
      setBusy(false);
      if (!r.ok) { setError(r.message); return; }
      setSent(r.request ?? null);
    }}>
      <h4 className="h3">Return or exchange · {it.name}</h4>
      <p className="muted small">{it.colourName} · {it.size} · Qty {it.qty}. Unworn with tags, within {RETURN_WINDOW_DAYS} days of delivery. Free pickup from {order.address.line1}, {order.address.city}.</p>
      <label className="opt-row"><input type="radio" name={'k' + index} checked={kind === 'exchange'} onChange={() => setKind('exchange')} /><span><b>Exchange</b><small>Another size or colour, shipped at no cost</small></span></label>
      <label className="opt-row"><input type="radio" name={'k' + index} checked={kind === 'return'} onChange={() => setKind('return')} /><span><b>Return</b><small>Refund to your original payment method</small></span></label>
      <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
      {kind === 'exchange' && (
        <div className="fgrid">
          {colours.length > 1 && <label>Colour<select value={colourId} onChange={(e) => setColourId(e.target.value)}>{colours.map((c) => <option key={c.id} value={c.id}>{c.name}{c.id === it.colourId ? ' (current)' : ''}</option>)}</select></label>}
          <label>Size you want instead<select value={size} onChange={(e) => setSize(e.target.value)} aria-invalid={error && !size ? true : undefined}><option value="">Select size</option>{sizes.map((s) => <option key={s}>{s}</option>)}</select>
            {sizes.length === 0 && <span className="muted small">No other size is in stock in this colour right now.</span>}</label>
        </div>
      )}
      <label>Anything else? (optional)<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {error && <p className="err" role="alert">{error}</p>}
      <div className="row-gap"><button className="btn btn--dark btn--sm" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Confirm pickup request'}</button><button className="btn btn--ghost btn--sm" type="button" onClick={onClose} disabled={busy}>Cancel</button></div>
    </form>
  );
}

function OrderCard({ o, defaultOpen }: { o: Order; defaultOpen: boolean }) {
  const { returns, refunds, cancelOrder } = useStore();
  const [open, setOpen] = useState(defaultOpen);
  const [req, setReq] = useState<number | null>(null);
  const mine = returns.filter((r) => r.orderId === o.id);
  const openReq = mine.filter((r) => r.status !== 'Completed' && r.status !== 'Rejected').length;
  const status = o.step < 0 ? 'Cancelled' : o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step];
  const orderRefunds = refunds.filter((x) => x.orderId === o.id);
  const canReturn = returnWindowOpen(o);
  return (
    <article className={'ocard' + (open ? ' open' : '')}>
      <button type="button" className="ocard-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><b>Order #{o.id}</b><small className="muted">{o.items.reduce((n, i) => n + i.qty, 0)} item{o.items.reduce((n, i) => n + i.qty, 0) > 1 ? 's' : ''} · {inr(o.total)} · {new Date(o.createdAt).toLocaleDateString('en-IN')}</small></span>
        <span className="ocard-state"><span className={'status' + (o.step < 0 ? ' status--bad' : '')}>{status}</span>{openReq > 0 && <span className="status status--info">{openReq} request{openReq > 1 ? 's' : ''} open</span>}<ChevronDown size={18} aria-hidden="true" /></span>
      </button>
      {open && (
        <div className="ocard-body">
          <div className="ocard-grid">
            <section>
              <h3 className="lbl muted">Tracking</h3>
              <OrderTimeline o={o} />
              {o.step >= 0 && o.step < 3 && <div className="row-gap"><button type="button" className="btn btn--ghost btn--sm" onClick={() => { if (window.confirm(`Cancel order #${o.id}? Your items are released${o.payment === 'cod' ? '.' : ' and a refund is recorded.'}`)) cancelOrder(o.id); }}>Cancel order</button><span className="muted small">You can cancel until the order ships.</span></div>}
              {o.step >= 3 && o.step < 4 && <p className="muted small">This order has shipped, so it can no longer be cancelled. You can return or exchange it after delivery.</p>}
            </section>
            <section>
              <h3 className="lbl muted">Items</h3>
              <ul className="oitems">
                {o.items.map((i, n) => {
                  const r = requestFor(o, n, returns);
                  return (
                    <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}>
                      <div className="oitem-row"><span><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span>{inr(i.price * i.qty)}</span></div>
                      {!i.cancelled && o.step === 4 && !r && canReturn && req !== n && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setReq(n)}>Return or exchange</button>}
                      {!i.cancelled && o.step === 4 && !r && !canReturn && <span className="muted small">Return window closed</span>}
                      {req === n && <RequestPanel order={o} index={n} onClose={() => setReq(null)} />}
                      {r && req !== n && <ReturnTimeline r={r} />}
                    </li>
                  );
                })}
              </ul>
              {o.step === 4 && canReturn && <p className="muted small">Return or exchange until {day(deliveredAt(o) + RETURN_WINDOW_DAYS * DAY)}.</p>}
              {orderRefunds.length > 0 && <div className="refund-box">{orderRefunds.map((x) => <p key={x.id} className="note" role="note">Refund {inr(x.amount)} · {x.source === 'cancellation' ? 'cancelled items' : 'returned item'} · <b>{x.status === 'Refunded' ? 'Sent' + (x.reference ? ` (ref ${x.reference})` : '') : 'Being processed'}</b></p>)}</div>}
              <dl className="sum"><div><dt>Total</dt><dd>{inr(o.total)}</dd></div><div><dt>Payment</dt><dd>{o.payment === 'cod' ? 'Pay on delivery' : 'Paid · ' + o.payment.toUpperCase()}</dd></div><div><dt>Shipping to</dt><dd>{o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}</dd></div></dl>
              <Link to="/support" className="lbl ulink small">Need help with this order?</Link>
            </section>
          </div>
        </div>
      )}
    </article>
  );
}

/** Everything about a customer's orders in one place: tracking, cancelling, returns, exchanges and refunds. */
export function MyOrders({ route }: { route: Route }) {
  const { orders } = useStore();
  const focus = route.query.get('order');
  const list = [...orders].sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return <section className="panel"><h2 className="h3">Orders</h2><p className="muted">No orders yet.</p><Link className="btn btn--dark btn--sm" to="/shop">Start shopping</Link></section>;
  return (
    <section className="panel"><h2 className="h3">Orders</h2>
      <p className="muted small">Open an order to see its tracking, cancel it, or return or exchange an item.</p>
      <div className="ocards">{list.map((o, i) => <OrderCard key={o.id} o={o} defaultOpen={focus ? o.id === focus : i === 0} />)}</div>
    </section>
  );
}
