import { useState } from 'react';
import { Check } from 'lucide-react';
import { inr, sizeStock } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order } from '../store';
import { Photo, ProductCard } from '../ui';
import { buildJourney } from '../journeys';
import { parseW } from '../wishlist';
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

/** Wishlist: each entry is a specific piece (colour and size). Older entries without them ask for both here. */
export function Wishlist() {
  const { wishlist, product, toggleWish, addToCart, say, notifyMe, notified } = useStore();
  const [picks, setPicks] = useState<Record<string, { c?: string; s?: string }>>({});
  const entries = wishlist.map((key) => ({ key, ...parseW(key) })).map((e) => ({ ...e, p: product(e.productId) })).filter((e) => e.p && e.p.active);
  return (
    <div className="pl-wrap wish-page">
      <div className="page-head"><h1 className="h1">Wishlist</h1><span className="muted">{entries.length} saved</span></div>
      <p className="muted">Pieces you saved, in the colour and size you chose.</p>
      {entries.length === 0 ? (
        <div className="empty"><h2 className="h3">Nothing saved yet.</h2><p className="muted">Choose a colour and size on any piece and tap “Add to wishlist”.</p><Link className="btn btn--dark" to="/shop?new=1">Browse new arrivals</Link></div>
      ) : (
        <div className="wl-grid">
          {entries.map(({ key, p, colourId, size }) => {
            const prod = p!;
            const pick = picks[key] ?? {};
            const anyColour = prod.colours.find((c) => prod.sizes.some((x) => sizeStock(prod, c.id, x) > 0)) ?? prod.colours[0];
            const cId = colourId ?? pick.c ?? anyColour.id;
            const colour = prod.colours.find((c) => c.id === cId) ?? anyColour;
            const sz = size ?? pick.s ?? '';
            const known = !!(colourId && size);
            const stock = sz ? sizeStock(prod, colour.id, sz) : 0;
            return (
              <article key={key} className="wl-card">
                <div className="wl-photo"><Link to={`/product/${prod.id}?c=${colour.id}`}><Photo p={prod} ratio="4 / 5" colourId={colour.id} /></Link>
                  <button type="button" className="wl-x" aria-label={`Remove ${prod.name} from wishlist`} onClick={() => { toggleWish(key); say('Removed from wishlist'); }}>×</button></div>
                <Link to={`/product/${prod.id}?c=${colour.id}`} className="wl-title"><span>{prod.name}</span><b>{inr(prod.price)}</b></Link>
                {known ? (
                  <>
                    <span className="wl-variant"><i style={{ background: colour.hex }} aria-hidden="true" />{colour.name} · {size}</span>
                    {stock > 0
                      ? <button type="button" className="btn btn--dark btn--sm btn--block" onClick={() => { const r = addToCart(prod, colour.id, size!, 1); say(r.ok ? `${prod.name} · ${colour.name} · ${size} added to your bag` : r.message); if (r.ok) toggleWish(key); }}>Move to bag</button>
                      : <><span className="stock out">Out of stock in size {size}</span><button type="button" className="btn btn--ghost btn--sm btn--block" disabled={notified.includes(prod.id)} onClick={() => notifyMe(prod.id)}>{notified.includes(prod.id) ? 'We’ll notify you ✓' : 'Notify me'}</button></>}
                  </>
                ) : (
                  <div className="wl-pick">
                    <label>Colour<select value={colour.id} onChange={(e) => setPicks({ ...picks, [key]: { c: e.target.value, s: '' } })}>{prod.colours.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label>Size<select value={sz} onChange={(e) => setPicks({ ...picks, [key]: { ...pick, c: colour.id, s: e.target.value } })}><option value="">Select size</option>{prod.sizes.map((x) => <option key={x} value={x}>{x}{sizeStock(prod, colour.id, x) <= 0 ? ' (out of stock)' : ''}</option>)}</select></label>
                    {sz && stock <= 0 && <span className="stock out">Out of stock in size {sz}</span>}
                    {sz && stock <= 0
                      ? <button type="button" className="btn btn--ghost btn--sm btn--block" disabled={notified.includes(prod.id)} onClick={() => notifyMe(prod.id)}>{notified.includes(prod.id) ? 'We’ll notify you ✓' : 'Notify me'}</button>
                      : <button type="button" className="btn btn--dark btn--sm btn--block" onClick={() => { if (!sz) { say('Choose a size first.'); return; } const r = addToCart(prod, colour.id, sz, 1); say(r.ok ? `${prod.name} · ${colour.name} · ${sz} added to your bag` : r.message); if (r.ok) toggleWish(key); }}>Move to bag</button>}
                  </div>
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
