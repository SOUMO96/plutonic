import { useState } from 'react';
import { Check } from 'lucide-react';
import { inr, sizeStock } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order } from '../store';
import { Photo, ProductCard } from '../ui';
import { buildJourney } from '../journeys';
import { Tracker } from '../Tracker';

const DAY = 86_400_000;
const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Order tracking. */
export function Tracking({ route }: { route: Route }) {
  const { orders, cancelOrder, say, live, lookupOrder, user, returns, refunds } = useStore();
  const [q, setQ] = useState(route.seg[1] ?? '');
  const [mail, setMail] = useState('');
  const [looked, setLooked] = useState<'idle' | 'busy' | 'none'>('idle');
  const o = orders.find((x) => x.id.toLowerCase() === (route.seg[1] ?? '').toLowerCase());
  const ref = (v: string) => v.trim().replace(/^#/, '').toUpperCase();
  return (
    <div className="pl-wrap track">
      <div className="page-head"><span className="lbl muted">Order tracking</span></div>
      <form className="field-row track-form" onSubmit={(e) => { e.preventDefault(); if (ref(q)) go('/tracking/' + ref(q)); }}>
        <label className="sr" htmlFor="ord">Order number</label><input id="ord" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order number, e.g. PL-10231" /><button className="btn btn--dark" type="submit">Track</button>
      </form>
      {!route.seg[1] && <p className="muted">Enter an order number from your confirmation, or open one from <Link to="/account?tab=orders" className="ulink">your account</Link>. {live ? '' : 'Sample orders: PL-10231, PL-10230.'}</p>}
      {route.seg[1] && !o && live && (
        <form className="field-row track-form" onSubmit={(e) => { e.preventDefault(); setLooked('busy'); void lookupOrder(ref(route.seg[1]), mail).then((r) => setLooked(r ? 'idle' : 'none')); }}>
          <label className="sr" htmlFor="ord-mail">Email used at checkout</label>
          <input id="ord-mail" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder={user ? 'Email used at checkout' : 'Email used at checkout, to confirm it is yours'} required />
          <button className="btn btn--dark" type="submit" disabled={looked === 'busy'}>{looked === 'busy' ? 'Looking…' : 'Find my order'}</button>
        </form>
      )}
      {route.seg[1] && !o && (!live || looked === 'none') && <p className="err" role="alert">We couldn’t find an order called “{route.seg[1]}”{live ? ' for that email' : ''}.</p>}
      {o && (
        <div className="track-grid">
          <section>
            <h1 className="h1">{o.step < 0 ? 'Cancelled' : o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step]}</h1>
            <p className="muted">Order #{o.id} · Placed {when(o.createdAt)}{o.sample ? ' · sample order' : ''}</p>
            <Tracker journey={buildJourney(o, returns, refunds)} />
            <div className="row-gap">{o.step >= 0 && o.step < 3 && <button type="button" className="btn btn--ghost btn--sm" onClick={() => { cancelOrder(o.id); say('Order cancelled'); }}>Cancel order</button>}<Link to="/support" className="lbl ulink">Need help with this order?</Link></div>
          </section>
          <aside className="summary"><span className="lbl muted">In this order</span>
            <ul className="co-items">{o.items.map((i) => <li key={i.productId + i.size + i.colourName} className={i.cancelled ? 'is-cancelled' : undefined}><span><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span>{inr(i.price * i.qty)}</span></li>)}</ul>
            {o.refundDue ? <p className="note" role="note">A refund of {inr(o.refundDue)} is due for cancelled items{o.cancelReason ? ` (${o.cancelReason})` : ''} and will be returned to your original payment method.</p> : null}
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
                <Link to={`/product/${p!.id}`}><Photo p={p!} ratio="4 / 5" colourId={colour?.id}>{sold && <span className="badge badge--out">Sold out</span>}</Photo></Link>
                <button type="button" className="wish on" aria-label={`Remove ${p!.name} from wishlist`} onClick={() => toggleWish(p!.id)}>×</button>
                <Link to={`/product/${p!.id}`} className="card-meta"><span className="card-top"><span className="card-n">{p!.name}</span><b>{inr(p!.price)}</b></span></Link>
                {sold ? <button type="button" className="btn btn--ghost btn--sm btn--block" disabled={notified.includes(p!.id)} onClick={() => notifyMe(p!.id)}>{notified.includes(p!.id) ? 'We’ll notify you' : 'Notify me'}</button> : (
                  <div className="wish-act wish-act--col"><label className="sr" htmlFor={'cl' + p!.id}>Colour</label>
                    <select id={'cl' + p!.id} value={colour!.id} onChange={(e) => { const nc = e.target.value; setCols({ ...cols, [p!.id]: nc }); setSizes({ ...sizes, [p!.id]: sel && sizeStock(p!, nc, sel) > 0 ? sel : '' }); }}>{p!.colours.filter((c) => p!.sizes.some((s) => sizeStock(p!, c.id, s) > 0)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
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

export { ProductCard };
