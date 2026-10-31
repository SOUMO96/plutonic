import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { FREE_SHIPPING_ABOVE, inr, sizeStock } from '../catalog';
import { Link } from '../router';
import { useStore } from '../store';
import { Photo } from '../ui';

export default function Cart() {
  const { cart, product, setQty, removeLine, changeVariant, moveToWishlist, price, coupon, applyCoupon, removeCoupon, cartCount, say } = useStore();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const pr = price();
  const lines = cart.map((l) => ({ l, p: product(l.productId) })).filter((x) => x.p);

  if (!lines.length) {
    return (
      <div className="pl-wrap empty-page">
        <span className="lbl muted">Your bag</span><h1 className="h2">Your bag is empty.</h1><p className="muted">Saved pieces wait for you in your wishlist.</p>
        <div className="row-gap"><Link className="btn btn--dark" to="/women">Shop women</Link><Link className="btn btn--ghost" to="/men">Shop men</Link></div>
      </div>
    );
  }
  const remaining = FREE_SHIPPING_ABOVE - (pr.subtotal - pr.discount);

  return (
    <div className="pl-wrap cart">
      <div className="page-head"><h1 className="h1">Your bag</h1><span className="muted">{cartCount} item{cartCount === 1 ? '' : 's'}</span></div>
      <div className="cart-grid">
        <div className="cart-lines">
          {remaining > 0 ? <p className="note">Add {inr(remaining)} more for complimentary delivery.</p> : <p className="note ok">You have complimentary delivery.</p>}
          {lines.map(({ l, p }) => {
                        const have = sizeStock(p!, l.colourId, l.size);
            return (
              <article key={l.key} className="line">
                <Link to={`/product/${p!.id}`} className="line-img" aria-label={p!.name}><Photo p={p!} ratio="4 / 5" colourId={l.colourId} /></Link>
                <div className="line-body">
                  <div className="line-top"><div><Link to={`/product/${p!.id}`} className="line-name">{p!.name}</Link><span className="line-var">
                    <label><span className="sr">Colour for {p!.name}</span><select value={l.colourId} onChange={(e) => { const r = changeVariant(l.key, e.target.value, l.size); if (r.message) say(r.message); }}>{p!.colours.map((x) => <option key={x.id} value={x.id} disabled={p!.sizes.every((z) => sizeStock(p!, x.id, z) === 0)}>{x.name}</option>)}</select></label>
                    <label><span className="sr">Size for {p!.name}</span><select value={l.size} onChange={(e) => { const r = changeVariant(l.key, l.colourId, e.target.value); if (r.message) say(r.message); }}>{p!.sizes.map((z) => <option key={z} value={z} disabled={sizeStock(p!, l.colourId, z) === 0}>{z}{sizeStock(p!, l.colourId, z) === 0 ? ' (sold out)' : ''}</option>)}</select></label>
                  </span>{have <= 3 && <span className="warn small">Only {have} left in {l.size}</span>}{l.qty > 1 && <span className="muted small">{inr(p!.price)} each</span>}</div><b>{inr(p!.price * l.qty)}</b></div>
                  <div className="line-bot">
                    <div className="qty" role="group" aria-label={`Quantity, ${p!.name}`}><button type="button" aria-label={`Decrease quantity, ${p!.name}`} onClick={() => setQty(l.key, l.qty - 1)} disabled={l.qty <= 1}><Minus size={14} /></button><span>{l.qty}</span><button type="button" aria-label={`Increase quantity, ${p!.name}`} onClick={() => setQty(l.key, l.qty + 1)} disabled={l.qty >= have}><Plus size={14} /></button></div>
                    <div className="row-gap"><button type="button" className="linkbtn" onClick={() => { moveToWishlist(l.key); say('Moved to wishlist'); }}>Move to wishlist</button><button type="button" className="linkbtn muted" onClick={() => removeLine(l.key)}>Remove</button></div>
                  </div>
                </div>
              </article>
            );
          })}
          <div className="cart-foot"><Link className="lbl ulink" to="/shop">Continue shopping</Link><span className="muted small">Items in your bag are not reserved until you check out.</span></div>
        </div>

        <aside className="summary" aria-label="Order summary">
          <span className="lbl muted">Order summary</span>
          <form className="promo" onSubmit={(e) => { e.preventDefault(); const r = applyCoupon(code); setMsg({ ok: r.ok, text: r.message }); if (r.ok) setCode(''); }}>
            <label htmlFor="coupon">Promo code</label>
            <div className="field-row"><input id="coupon" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. WELCOME10" autoCapitalize="characters" /><button className="btn btn--dark btn--sm" type="submit">Apply</button></div>
            {coupon ? <span className="ok small" role="status">{coupon.code} applied · {coupon.label} <button type="button" className="linkbtn" onClick={() => { removeCoupon(); setMsg(null); }}>Remove</button></span> : msg && <span className={(msg.ok ? 'ok' : 'err') + ' small'} role="status">{msg.text}</span>}
          </form>
          <dl className="sum">
            <div><dt>Subtotal</dt><dd>{inr(pr.subtotal)}</dd></div>
            {pr.discount > 0 && <div><dt>Discount</dt><dd className="ok">− {inr(pr.discount)}</dd></div>}
            <div><dt>Shipping</dt><dd>{pr.shipping === 0 ? 'Complimentary' : inr(pr.shipping)}</dd></div>
            <div><dt>Tax (GST)</dt><dd className="muted">Included</dd></div>
          </dl>
          <div className="sum-total"><b>Total</b><b>{inr(pr.total)}</b></div>
          <Link to="/checkout" className="btn btn--dark btn--block btn--lg">Checkout securely</Link>
          <span className="muted small center">UPI · Cards · Net banking · Cash on Delivery</span>
        </aside>
      </div>
    </div>
  );
}
