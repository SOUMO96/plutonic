import { useState } from 'react';
import { Check } from 'lucide-react';
import { inr, RETURN_WINDOW_DAYS, sizeStock } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore } from '../store';
import { Photo, ProductCard } from '../ui';

const DAY = 86_400_000;
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Order tracking. */
export function Tracking({ route }: { route: Route }) {
  const { orders, cancelOrder, say } = useStore();
  const [q, setQ] = useState(route.seg[1] ?? '');
  const o = orders.find((x) => x.id.toLowerCase() === (route.seg[1] ?? '').toLowerCase());
  const ref = (v: string) => v.trim().replace(/^#/, '').toUpperCase();
  return (
    <div className="pl-wrap track">
      <div className="page-head"><span className="lbl muted">Order tracking</span></div>
      <form className="field-row track-form" onSubmit={(e) => { e.preventDefault(); if (ref(q)) go('/tracking/' + ref(q)); }}>
        <label className="sr" htmlFor="ord">Order number</label><input id="ord" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, e.g. PL-10231" /><button className="btn btn--dark" type="submit">Track</button>
      </form>
      {!route.seg[1] && <p className="muted">Enter an order number from your confirmation, or open one from <Link to="/account?tab=orders" className="ulink">your account</Link>. Sample orders: PL-10231, PL-10230.</p>}
      {route.seg[1] && !o && <p className="err" role="alert">We couldn’t find an order called “{route.seg[1]}”.</p>}
      {o && (
        <div className="track-grid">
          <section>
            <h1 className="h1">{o.step < 0 ? 'Cancelled' : o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step]}</h1>
            <p className="muted">Order #{o.id} · Placed {when(o.createdAt)}{o.sample ? ' · sample order' : ''}</p>
            {o.step >= 0 ? (
              <ol className="timeline">{ORDER_STEPS.map((s, i) => (
                <li key={s} className={i <= o.step ? 'done' : ''} aria-current={i === o.step ? 'step' : undefined}><span className="dotc">{i <= o.step && <Check size={12} strokeWidth={2} aria-hidden="true" />}</span>
                  <b>{s}</b><span className="muted small">{i <= o.step ? when(o.history[i] ?? o.createdAt) : 'Pending'}{i === 1 && i <= o.step ? ' · Bengaluru warehouse' : ''}{i === 2 && i <= o.step ? ' · Courier AWB ' + o.id.replace(/\D/g, '') + '01' : ''}</span></li>
              ))}</ol>
            ) : <p className="muted">This order was cancelled. Any payment will be refunded to the original method.</p>}
            <div className="row-gap">{o.step >= 0 && o.step < 3 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { cancelOrder(o.id); say('Order cancelled'); }}>Cancel order</button>}<Link to="/support" className="lbl ulink">Need help with this order?</Link></div>
          </section>
          <aside className="summary"><span className="lbl muted">In this order</span>
            <ul className="co-items">{o.items.map((i) => <li key={i.productId + i.size + i.colourName}><span><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}</small></span><span>{inr(i.price * i.qty)}</span></li>)}</ul>
            <div className="sum-total"><b>Total paid</b><b>{inr(o.total)}</b></div>
            <dl className="sum"><div><dt>Payment</dt><dd>{o.payment === 'cod' ? 'Pay on delivery' : 'Paid · ' + o.payment.toUpperCase()}</dd></div><div><dt>Delivery</dt><dd>{o.delivery === 'express' ? 'Express' : 'Standard'}</dd></div><div><dt>Shipping to</dt><dd>{o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}</dd></div></dl>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Wishlist. */
export function Wishlist() {
  const { wishlist, product, toggleWish, addToCart, say, notifyMe, notified } = useStore();
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const [cols, setCols] = useState<Record<string, string>>({});
  const items = wishlist.map((id) => product(id)).filter((p) => p && p.active);
  return (
    <div className="pl-wrap wish-page">
      <div className="page-head"><h1 className="h1">Wishlist</h1><span className="muted">{items.length} saved</span></div>
      <p className="muted">We’ll let you know if a saved size runs low or a price changes.</p>
      {items.length === 0 ? (
        <div className="empty"><h2 className="h3">Nothing saved yet.</h2><p className="muted">Tap the heart on any piece to keep it here.</p><Link className="btn btn--dark" to="/shop?new=1">Browse new arrivals</Link></div>
      ) : (
        <div className="grid grid--4">
          {items.map((p) => {
            const colour = p!.colours.find((c) => c.id === cols[p!.id] && p!.sizes.some((s) => sizeStock(p!, c.id, s) > 0)) ?? p!.colours.find((c) => p!.sizes.some((s) => sizeStock(p!, c.id, s) > 0));
            const sold = !colour;
            const sel = sizes[p!.id] ?? '';
            return (
              <article key={p!.id} className="card wish-card">
                <Link to={`/product/${p!.id}`}><Photo p={p!} ratio="4 / 5">{sold && <span className="badge badge--out">Sold out</span>}</Photo></Link>
                <button type="button" className="wish on" aria-label={`Remove ${p!.name} from wishlist`} onClick={() => toggleWish(p!.id)}>×</button>
                <Link to={`/product/${p!.id}`} className="card-meta"><span className="card-top"><span className="card-n">{p!.name}</span><b>{inr(p!.price)}</b></span></Link>
                {sold ? <button type="button" className="btn btn--ghost btn--sm btn--block" disabled={notified.includes(p!.id)} onClick={() => notifyMe(p!.id)}>{notified.includes(p!.id) ? 'We’ll notify you' : 'Notify me'}</button> : (
                  <div className="wish-act wish-act--col"><label className="sr" htmlFor={'cl' + p!.id}>Colour</label>
                    <select id={'cl' + p!.id} value={colour!.id} onChange={(e) => { setCols({ ...cols, [p!.id]: e.target.value }); setSizes({ ...sizes, [p!.id]: '' }); }}>{p!.colours.filter((c) => p!.sizes.some((s) => sizeStock(p!, c.id, s) > 0)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                    <label className="sr" htmlFor={'sz' + p!.id}>Size</label>
                    <select id={'sz' + p!.id} value={sel} onChange={(e) => setSizes({ ...sizes, [p!.id]: e.target.value })}><option value="">Select size</option>{p!.sizes.filter((s) => sizeStock(p!, colour!.id, s) > 0).map((s) => <option key={s}>{s}</option>)}</select>
                    <button type="button" className="btn btn--dark btn--sm" onClick={() => { if (!sel) { say('Choose a size first.'); return; } const r = addToCart(p!, colour!.id, sel, 1); say(r.ok ? `${p!.name} · ${colour!.name} · ${sel} added to your bag` : r.message); if (r.ok) toggleWish(p!.id); }}>Move to bag</button></div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Returns and exchanges: a five-step request. */
export function Returns() {
  const { orders, returns, createReturn, product, products } = useStore();
  const eligible = (o: (typeof orders)[number]) => o.step === 4 && Date.now() - (o.history[4] ?? o.createdAt) < RETURN_WINDOW_DAYS * DAY;
  const delivered = orders.filter((o) => o.step === 4);
  const [orderId, setOrderId] = useState(delivered.find(eligible)?.id ?? '');
  const o = orders.find((x) => x.id === orderId);
  const [idx, setIdx] = useState(0);
  const [kind, setKind] = useState<'exchange' | 'return'>('exchange');
  const [reason, setReason] = useState('Too big');
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const item = o?.items[idx];
  const steps = ['Order', 'Item', 'Return or exchange', 'Pickup', 'Confirm'];
  const stepNo = done ? 5 : !o ? 1 : 3;
  return (
    <div className="pl-wrap returns">
      <div className="page-head"><span className="lbl muted">Returns &amp; exchanges</span><h1 className="h1">Not quite right? We’ll make it simple.</h1><p className="muted">Unworn pieces with tags, within {RETURN_WINDOW_DAYS} days of delivery. Pickup from your door.</p></div>
      <ol className="steps" aria-label="Progress">{steps.map((s, i) => <li key={s} className={i < stepNo ? 'on' : ''} aria-current={i + 1 === stepNo ? 'step' : undefined}><span>{i + 1}</span>{s}</li>)}</ol>
      <div className="ret-grid">
        <form className="stack-24" onSubmit={(e) => { e.preventDefault(); if (!o || !item) return; createReturn({ orderId: o.id, productName: item.name, variant: `${item.colourName} · ${item.size}`, kind, reason, note }); setDone(true); }}>
          <section><h2 className="h3">Order</h2>
            {delivered.length === 0 && <p className="muted">No delivered orders yet. In the admin dashboard, advance an order to “Delivered” to try this flow. Sample order PL-10230 is already delivered.</p>}
            {delivered.map((x) => <label key={x.id} className={'opt-row' + (eligible(x) ? '' : ' off')}><input type="radio" name="o" disabled={!eligible(x)} checked={orderId === x.id} onChange={() => { setOrderId(x.id); setIdx(0); setDone(false); }} /><span><b>#{x.id}</b><small>Delivered {new Date(x.history[4] ?? x.createdAt).toLocaleDateString('en-IN')} · {x.items.length} item{x.items.length > 1 ? 's' : ''}</small></span><span className="muted small">{eligible(x) ? 'Eligible' : 'Window closed'}</span></label>)}</section>
          {o && <>
            <section><h2 className="h3">Item</h2>{o.items.map((i, n) => { const p = product(i.productId); return <label key={n} className="opt-row"><input type="radio" name="i" checked={idx === n} onChange={() => setIdx(n)} /><span><b>{i.name}</b><small>{i.colourName} · {i.size} · {inr(i.price)}</small></span>{p && <span className="ret-thumb"><Photo p={p} ratio="4 / 5" /></span>}</label>; })}</section>
            <section><h2 className="h3">Return or exchange</h2>
              <label className="opt-row"><input type="radio" name="k" checked={kind === 'exchange'} onChange={() => setKind('exchange')} /><span><b>Exchange</b><small>Another size or colour, shipped at no cost</small></span></label>
              <label className="opt-row"><input type="radio" name="k" checked={kind === 'return'} onChange={() => setKind('return')} /><span><b>Return</b><small>Refund to original payment method</small></span></label>
              <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{['Too big', 'Too small', 'Not as expected', 'Changed my mind', 'Faulty or damaged'].map((r) => <option key={r}>{r}</option>)}</select></label>
              <label>Anything else? (optional)<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <button className="btn btn--dark" type="submit">Continue to pickup</button></section></>}
          {done && <p className="note ok" role="status">Request received. We’ll schedule a pickup within 1–2 working days and confirm by WhatsApp and email.</p>}
        </form>
        <aside className="summary"><span className="lbl muted">Your requests</span>
          {returns.length === 0 && <p className="muted small">No requests yet.</p>}
          {returns.map((r) => <div key={r.id} className="order-row"><div><b>{r.kind === 'exchange' ? 'Exchange' : 'Return'} · {r.productName}</b><span className="muted small">{r.variant} · {r.reason} · #{r.orderId}</span></div><span className="status">{r.status}</span></div>)}
          <p className="muted small">Refunds reach UPI and cards in 5–7 working days, depending on your bank.</p><Link className="lbl ulink" to="/support">Read the full return policy</Link>
          {products.length > 0 && <span className="sr">{products.length}</span>}
        </aside>
      </div>
    </div>
  );
}

export { ProductCard };
