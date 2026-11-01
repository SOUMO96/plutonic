import { useState } from 'react';
import { Check } from 'lucide-react';
import { inr, sizeStock } from '../catalog';
import { go, Link, type Route } from '../router';
import { ORDER_STEPS, useStore, type Order } from '../store';
import { Photo, ProductCard } from '../ui';
import { buildJourney } from '../journeys';
import { OrderSummary, orderLine } from './MyOrders';
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
        <div className="opage opage--cols">
          <header className="opage-head"><p className="muted small">Order {o.id} · placed {when(o.createdAt)}</p><h2 className="h3">{orderLine(o, returns)}</h2></header>
          <div className="ocard-grid">
          <section><Tracker journey={buildJourney(o, returns, refunds)} /></section>
          <section>
          <section className="opage-block" aria-label="Items">
            <ul className="oitems">{o.items.map((i, n) => <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}><div className="oitem-row"><span className="oitem-text"><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span className="oitem-price">{inr(i.price * i.qty)}</span></div></li>)}</ul>
          </section>
          <OrderSummary o={o} />
          <footer className="opage-foot"><p className="muted small">Delivering to {o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}</p>
            <div className="opage-links"><Link to="/support" className="ulink small">Need help with this order?</Link>{o.step >= 0 && o.step < 3 && <button type="button" className="linkbtn small" onClick={() => { cancelOrder(o.id); say('Order cancelled'); }}>Cancel order</button>}</div></footer>
          </section>
          </div>
        </div>
      )}
    </div>
  );
}

/** Wishlist: each entry is a specific piece (colour and size). Older entries without them ask for both here. */
export function Wishlist() {
  const { wishlist, product, toggleWish, addToCart, say, notifyMe, notified } = useStore();
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
            const anyColour = prod.colours.find((c) => prod.sizes.some((x) => sizeStock(prod, c.id, x) > 0)) ?? prod.colours[0];
            const cId = colourId ?? anyColour.id;
            const colour = prod.colours.find((c) => c.id === cId) ?? anyColour;
            const sz = size ?? '';
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
                  <>
                    <span className="muted small">No colour or size saved yet.</span>
                    <Link to={`/product/${prod.id}`} className="btn btn--dark btn--sm btn--block">Choose colour &amp; size</Link>
                  </>
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
