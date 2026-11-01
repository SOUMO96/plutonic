import { useEffect, useState } from 'react';
import { ArrowLeftRight, ChevronRight, ChevronUp } from 'lucide-react';
import { inr, RETURN_WINDOW_DAYS, sizeStock } from '../catalog';
import { Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order, type ReturnReq } from '../store';
import { CUSTOMER_CANCEL_BEFORE } from '../orderCancel';
import { currentPiece, isOpen, itemState, refundForItem, RETURN_REASONS } from '../returnRules';
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

/**
 * ONE order-level section: a button that opens, in place, a single Return / Exchange request for any number of eligible items.
 * One action for the whole request (return OR exchange, never both); a checkbox at the end of each eligible row; in Exchange mode
 * each chosen item gets its own replacement-size picker (same sizes and stock rules as before). The server enforces every rule again.
 */
function ReturnExchange({ order, open, setOpen }: { order: Order; open: boolean; setOpen: (v: boolean) => void }) {
  const { returns, product, createReturnBatch, say } = useStore();
  const [kind, setKind] = useState<'return' | 'exchange'>('return');
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [sizes, setSizes] = useState<Record<number, string>>({});
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [note, setNote] = useState('');
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const states = order.items.map((_, n) => itemState(order, n, returns));
  const eligible = (n: number) => !order.items[n].cancelled && (kind === 'return' ? states[n].canReturn : states[n].canExchange);
  const anyEligible = order.items.some((_, n) => !order.items[n].cancelled && states[n].canReturn);
  const chosen = order.items.map((_, n) => n).filter((n) => picked[n] && eligible(n));
  const piece = (n: number) => currentPiece(order, n, returns);
  /** Replacement sizes in stock for one item, leaving room for other chosen items that want the same size. */
  const optionsFor = (n: number) => {
    const it = order.items[n]; const p = product(it.productId); const pc = piece(n);
    if (!p) return [] as string[];
    return p.sizes.filter((sz) => {
      if (sz === pc.size) return false;
      const wanted = chosen.filter((m) => m !== n && order.items[m].productId === it.productId && piece(m).colourId === pc.colourId && sizes[m] === sz).reduce((t, m) => t + order.items[m].qty, 0);
      return sizeStock(p, pc.colourId, sz) >= it.qty + wanted;
    });
  };
  /** The natural size change for the reason (too big -> one size down, too small -> one size up). The customer can always change it. */
  const suggest = (n: number): string => {
    const p = product(order.items[n].productId); if (!p) return '';
    const at = p.sizes.indexOf(piece(n).size);
    const want = reason === 'Too big' ? p.sizes[at - 1] : reason === 'Too small' ? p.sizes[at + 1] : undefined;
    return want && optionsFor(n).includes(want) ? want : '';
  };
  useEffect(() => {   // reason changed: re-suggest for every chosen item
    if (kind !== 'exchange') return;
    setSizes((cur) => { const next = { ...cur }; for (const n of chosen) { const w = suggest(n); if (w) next[n] = w; } return next; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason, kind]);
  useEffect(() => {   // an item was just chosen: fill in a suggestion only where nothing is picked yet
    if (kind !== 'exchange') return;
    setSizes((cur) => { const next = { ...cur }; for (const n of chosen) if (!next[n]) { const w = suggest(n); if (w) next[n] = w; } return next; });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked]);
  const reset = () => { setPicked({}); setSizes({}); setNote(''); setReview(false); setError(''); setReason(RETURN_REASONS[0]); };
  const switchKind = (k: 'return' | 'exchange') => { setKind(k); setReview(false); setError(''); setPicked((cur) => Object.fromEntries(Object.entries(cur).filter(([n]) => (k === 'return' ? states[+n].canReturn : states[+n].canExchange)))); };

  const check = (): string => {
    if (!chosen.length) return 'Select at least one item.';
    if (reason.trim().length < 2) return 'Choose a reason.';
    if (kind === 'exchange') for (const n of chosen) if (!sizes[n] || !optionsFor(n).includes(sizes[n])) return `Choose the replacement size for ${order.items[n].name}.`;
    return '';
  };
  const submit = async () => {
    const bad = check(); if (bad) { setError(bad); setReview(false); return; }
    setBusy(true); setError('');
    const r = await createReturnBatch({ orderId: order.id, kind, reason, note, items: chosen.map((n) => ({ itemIndex: n, exchangeSize: kind === 'exchange' ? sizes[n] : undefined })) });
    setBusy(false);
    if (!r.ok) { setError(r.message); setReview(false); return; }
    say('Request sent. Please wait for our response.'); reset(); setOpen(false);   // the tracker above now shows it and updates by itself
  };

  if (order.step !== 4) return null;   // (after every hook above, so the number of hooks never changes between renders)
  if (!anyEligible) {
    const why = states.map((st) => st.note).find(Boolean);
    return why ? <p className="muted small rx-none">{why}</p> : null;
  }
  const refundTotal = chosen.reduce((t, n) => t + refundForItem(order, n), 0);
  return (
    <section className="rx" aria-label="Return or exchange">
      <button type="button" className="rx-btn" aria-expanded={open} aria-controls={'rx-' + order.id} onClick={() => setOpen(!open)}>
        <ArrowLeftRight size={18} strokeWidth={1.6} aria-hidden="true" /><span>Return / Exchange Items</span>{open ? <ChevronUp size={18} strokeWidth={1.6} aria-hidden="true" /> : <ChevronRight size={18} strokeWidth={1.6} aria-hidden="true" />}
      </button>
      <div id={'rx-' + order.id} className={'rx-wrap' + (open ? ' open' : '')} aria-hidden={!open}>
        <div className="rx-inner">
          <div className="rx-panel">
            <h3 className="rx-title"><ArrowLeftRight size={16} strokeWidth={1.6} aria-hidden="true" /> Return / Exchange Items</h3>
            <p className="muted small">Choose one action and select the items you want to process. Free pickup from {order.address.line1}, {order.address.city}. Items must be unworn, with tags.</p>
            {!review ? <>
              <div className="rx-seg" role="radiogroup" aria-label="Action">
                <button type="button" role="radio" aria-checked={kind === 'return'} className={kind === 'return' ? 'on' : ''} onClick={() => switchKind('return')}>Return</button>
                <button type="button" role="radio" aria-checked={kind === 'exchange'} className={kind === 'exchange' ? 'on' : ''} onClick={() => switchKind('exchange')}>Exchange</button>
              </div>
              <ul className="rx-items">
                {order.items.map((it, n) => {
                  const p = product(it.productId); const st = states[n]; const ok = eligible(n); const pc = piece(n);
                  const why = it.cancelled ? 'Cancelled' : st.open ? `Request ${st.open.id} is in progress.` : ok ? '' : (kind === 'exchange' && st.canReturn ? 'Already exchanged once, so this item can only be returned.' : st.note ?? 'Not available for this action.');
                  return (
                    <li key={n} className={(ok ? '' : 'is-off ') + (picked[n] && ok ? 'is-picked' : '')}>
                      <label className="rx-row">
                        {p && <span className="item-thumb"><Photo p={p} ratio="4 / 5" colourId={it.colourId} /></span>}
                        <span className="oitem-text"><b>{it.name}</b><small className="muted">{pc.colourName} · {pc.size} · Qty {it.qty}</small>{why && <small className="rx-why">{why}</small>}</span>
                        <span className="oitem-price">{inr(it.price * it.qty)}</span>
                        <input type="checkbox" className="rx-check" disabled={!ok} checked={!!picked[n] && ok} onChange={(e) => { setPicked({ ...picked, [n]: e.target.checked }); setError(''); }} aria-label={`Select ${it.name}`} />
                      </label>
                      {kind === 'exchange' && picked[n] && ok && (() => { const opts = optionsFor(n); return (
                        <div className="rx-size">
                          <span className="muted small">Original size: <b>{pc.size}</b></span>
                          <label>Replacement size
                            <select value={sizes[n] ?? ''} onChange={(e) => { setSizes({ ...sizes, [n]: e.target.value }); setError(''); }} disabled={!opts.length} aria-label={`Replacement size for ${it.name}`}>
                              <option value="">{opts.length ? 'Select size' : 'None in stock'}</option>{opts.map((sz) => <option key={sz} value={sz}>{sz}</option>)}
                            </select>
                          </label>
                          {!opts.length && <small className="rx-why">No other size is in stock right now. You can return this item instead.</small>}
                        </div>); })()}
                    </li>
                  );
                })}
              </ul>
              <label className="rx-reason"><span>{kind === 'return' ? 'Return reason' : 'Reason'}</span>
                <select value={reason} onChange={(e) => setReason(e.target.value)}>{RETURN_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
              {error && <p className="err" role="alert">{error}</p>}
              <div className="rx-foot"><span className="muted small">{chosen.length ? `${chosen.length} item${chosen.length > 1 ? 's' : ''} selected` : 'No items selected'}</span>
                <button type="button" className="rx-go" onClick={() => { const bad = check(); if (bad) { setError(bad); return; } setError(''); setReview(true); }}>Continue →</button></div>
            </> : <>
              <div className="rx-review" role="group" aria-label="Review your request">
                <p><b>{kind === 'return' ? 'Return' : 'Exchange'}</b> · {chosen.length} item{chosen.length > 1 ? 's' : ''} · reason: {reason}</p>
                <ul>{chosen.map((n) => <li key={n}><span>{order.items[n].name}</span><span>{kind === 'exchange' ? `${piece(n).size} → ${sizes[n]}` : inr(refundForItem(order, n))}</span></li>)}</ul>
                {kind === 'return' ? <p className="rx-sum"><span>Refund to your original payment method</span><b>{inr(refundTotal)}</b></p> : <p className="muted small">Your replacements ship at no cost after we receive the original pieces. Each item can be exchanged once.</p>}
                <label>Anything else? (optional)<textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              </div>
              {error && <p className="err" role="alert">{error}</p>}
              <div className="rx-foot"><button type="button" className="linkbtn small" onClick={() => setReview(false)} disabled={busy}>← Back</button>
                <button type="button" className="rx-go" onClick={() => void submit()} disabled={busy}>{busy ? 'Sending…' : 'Confirm pickup request'}</button></div>
            </>}
          </div>
        </div>
      </div>
    </section>
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
  const orderRefunds = refunds.filter((x) => x.orderId === o.id);
  const [rxOpen, setRxOpen] = useState(false);
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
          <ul className={'oitems' + (rxOpen ? ' is-hidden' : '')}>
            {o.items.map((i, n) => {
              const p = product(i.productId); const st = itemState(o, n, returns);
              const declined = !st.open ? returns.filter((r) => r.orderId === o.id && r.itemIndex === n && r.status === 'Rejected').sort((a, b) => b.createdAt - a.createdAt)[0] : undefined;
              const stale = declined && returns.some((r) => r.orderId === o.id && r.itemIndex === n && r.createdAt > declined.createdAt);
              return (
                <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}>
                  <div className="oitem-row">{p && <span className="item-thumb"><Photo p={p} ratio="4 / 5" colourId={i.colourId} /></span>}<span className="oitem-text"><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span className="oitem-price">{inr(i.price * i.qty)}</span></div>
                  {st.open && <p className="req-note" role="status">{requestNote(st.open)}</p>}
                  {declined && !stale && <p className="req-note req-note--bad">Your earlier request was declined{declined.adminNote ? `: ${declined.adminNote}` : '.'}</p>}
                  {!i.cancelled && o.step === 4 && !st.open && st.note && <span className="muted small">{st.note}</span>}
                </li>
              );
            })}
          </ul>
          <ReturnExchange order={o} open={rxOpen} setOpen={setRxOpen} />
          <OrderSummary o={o} />
          {orderRefunds.map((x) => <p key={x.id} className="muted small oref">Refund of {inr(x.amount)}{x.returnId ? ' for a returned item' : ' for cancelled items'} · {x.status === 'Refunded' ? 'sent' + (x.reference && x.reference !== 'SIMULATED' ? ` (ref ${x.reference})` : '') : 'being processed'}</p>)}
          {orderRefunds.length > 0 && o.items.some((i) => !i.cancelled) && <p className="muted small oref">The other items in this order stay with you.</p>}
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
  const { orders, refreshAccount, watchAccount, user } = useStore();
  const focus = route.query.get('order');
  // Keep this page in step with the server: when the admin approves, schedules or ships, it shows here by itself
  // (live push from the database, with a slower check as backup).
  useEffect(() => {
    void refreshAccount();
    // Live push does the instant updates; this slower check (randomised so thousands of open pages never ask at the same moment)
    // is only the safety net, and it pauses while the tab is hidden.
    let timer = 0;
    const loop = () => { timer = window.setTimeout(() => { if (!document.hidden) void refreshAccount(); loop(); }, 12_000 + Math.random() * 8_000); };
    const onVisible = () => { if (!document.hidden) void refreshAccount(); };
    loop(); document.addEventListener('visibilitychange', onVisible);
    const stopWatching = watchAccount();
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); stopWatching(); };
  }, [refreshAccount, watchAccount, user?.email]);
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
