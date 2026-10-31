import { useEffect, useState } from 'react';
import { COD_FEE, EXPRESS_FEE, inr } from '../catalog';
import { go, Link, type Route } from '../router';
import { useStore, type Address, type Order } from '../store';
import { LOGO, Photo } from '../ui';
import { payConfig, payWithCashfree, verifyPayment } from '../payments';

const STATES = ['Karnataka', 'Maharashtra', 'Delhi', 'Tamil Nadu', 'Telangana', 'Gujarat', 'West Bengal', 'Uttar Pradesh', 'Rajasthan', 'Kerala'];
const eta = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
type Pay = Order['payment'];

export default function Checkout() {
  const { cart, product, price, user, addresses, placeOrder, coupon, say, live } = useStore();
  const [gw, setGw] = useState(false);
  useEffect(() => { if (live) void payConfig().then((c) => setGw(c.cashfree)); }, [live]);
  // Orders need an account: send visitors to log in / sign up, then bring them back here with their bag intact.
  const { authReady } = useStore();
  useEffect(() => { if (authReady && !user) { say('Please log in or sign up to place your order.'); go('/account?next=' + encodeURIComponent('/checkout')); } }, [authReady, user, say]);
  const [email, setEmail] = useState(user?.email ?? '');
  const [mobile, setMobile] = useState(user?.mobile ?? '');
  const [saved, setSaved] = useState(addresses[0]?.id ?? 'new');
  const [a, setA] = useState({ name: user ? `${user.firstName} ${user.lastName}`.trim() : '', mobile: user?.mobile ?? '', line1: '', line2: '', landmark: '', pin: '', city: '', state: '' });
  const [delivery, setDelivery] = useState<'standard' | 'express'>('standard');
  const [pay, setPay] = useState<Pay>('upi');
  const [failure, setFailure] = useState('');
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const pr = price(delivery, pay);
  const lines = cart.map((l) => ({ l, p: product(l.productId) })).filter((x) => x.p);

  if (!lines.length) return <div className="pl-wrap empty-page"><span className="lbl muted">Checkout</span><h1 className="h2">Your bag is empty.</h1><Link className="btn btn--dark" to="/shop">Browse pieces</Link></div>;

  const submit = () => {
    const e: Record<string, string> = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = 'Enter a valid email address.';
    if (!/^[6-9]\d{9}$/.test(mobile)) e.mobile = 'Enter a 10-digit mobile number.';
    const useSaved = saved !== 'new' && addresses.find((x) => x.id === saved);
    if (!useSaved) {
      if (a.name.trim().length < 2) e.name = 'Enter your full name.';
      if (!/^[6-9]\d{9}$/.test(a.mobile)) e.amobile = 'Enter a 10-digit mobile number.';
      if (a.line1.trim().length < 3) e.line1 = 'Enter your flat, house or building.';
      if (!/^[1-9]\d{5}$/.test(a.pin)) e.pin = 'Enter a 6-digit PIN code.';
      if (!a.city.trim()) e.city = 'Enter your city.';
      if (!a.state) e.state = 'Select your state.';
    }
    setErrs(e);
    if (Object.keys(e).length) { say('Please fix the highlighted fields.'); document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const address: Address = useSaved ? (useSaved as Address) : { id: 'new', label: 'Home', ...a };
    setBusy(true);
    setFailure('');
    if (gw && pay !== 'cod') {
      // Real payment: create the order (held as pending), then hand over to Cashfree's hosted page.
      void (async () => {
        const r = await placeOrder({ delivery, payment: pay, address, email, mobile });
        if ('error' in r) { setBusy(false); setFailure(r.error); return; }
        const p = await payWithCashfree(r.id, email);
        if (!p.ok) { setBusy(false); say(p.message ?? 'Payment could not start.'); go('/order/' + r.id); }
      })();
      return;
    }
    window.setTimeout(async () => {
      const r = await placeOrder({ delivery, payment: pay, address, email, mobile });
      setBusy(false);
      if ('error' in r) { setFailure(r.error); return; }
      go('/order/' + r.id);
    }, 700);
  };

  const err = (k: string) => errs[k] ? <span className="err small" role="alert">{errs[k]}</span> : null;
  const inv = (k: string) => ({ 'aria-invalid': errs[k] ? true : undefined } as const);

  if (!user) return <div className="pl-wrap" style={{ minHeight: '60vh' }} aria-busy="true" />;
  return (
    <div className="checkout">
      <header className="co-head"><div className="pl-wrap co-head-in"><Link to="/" aria-label="PLUTONIC home"><img src={LOGO} alt="PLUTONIC" height={52} /></Link><span className="lbl">Secure checkout</span></div></header>
      <div className="pl-wrap co-grid">
        <div className="co-form">
          <section><h2 className="h3">Contact</h2>
            {user ? <p className="muted small">Signed in as {user.email}. <Link to="/account" className="ulink">Not you?</Link></p> : <p className="muted small">Have an account? <Link to="/account" className="ulink">Sign in</Link></p>}
            <div className="fgrid"><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" {...inv('email')} />{err('email')}</label>
              <label>Mobile number<input inputMode="numeric" maxLength={10} value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ''))} autoComplete="tel-national" {...inv('mobile')} />{err('mobile')}</label></div>
          </section>

          <section><h2 className="h3">Shipping address</h2>
            {addresses.length > 0 && <div className="opts">{addresses.map((x) => <label key={x.id} className="opt-row"><input type="radio" name="addr" checked={saved === x.id} onChange={() => setSaved(x.id)} /><span><b>{x.label}</b><small>{x.name}, {x.line1}, {x.city} {x.pin}, {x.state}</small></span></label>)}<label className="opt-row"><input type="radio" name="addr" checked={saved === 'new'} onChange={() => setSaved('new')} /><span><b>New address</b></span></label></div>}
            {saved === 'new' && (
              <div className="fgrid">
                <label>Full name<input value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} autoComplete="name" {...inv('name')} />{err('name')}</label>
                <label>Mobile number<input inputMode="numeric" maxLength={10} value={a.mobile} onChange={(e) => setA({ ...a, mobile: e.target.value.replace(/\D/g, '') })} {...inv('amobile')} />{err('amobile')}</label>
                <label className="span2">Flat, house, building<input value={a.line1} onChange={(e) => setA({ ...a, line1: e.target.value })} autoComplete="address-line1" {...inv('line1')} />{err('line1')}</label>
                <label>Area, street<input value={a.line2} onChange={(e) => setA({ ...a, line2: e.target.value })} autoComplete="address-line2" /></label>
                <label>Landmark (optional)<input value={a.landmark} onChange={(e) => setA({ ...a, landmark: e.target.value })} /></label>
                <label>PIN code<input inputMode="numeric" maxLength={6} value={a.pin} onChange={(e) => setA({ ...a, pin: e.target.value.replace(/\D/g, '') })} autoComplete="postal-code" {...inv('pin')} />{err('pin')}</label>
                <label>City<input value={a.city} onChange={(e) => setA({ ...a, city: e.target.value })} autoComplete="address-level2" {...inv('city')} />{err('city')}</label>
                <label>State<select value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })} {...inv('state')}><option value="">Select state</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select>{err('state')}</label>
              </div>
            )}
          </section>

          <section><h2 className="h3">Delivery</h2>
            <div className="opts">
              <label className="opt-row"><input type="radio" name="del" checked={delivery === 'standard'} onChange={() => setDelivery('standard')} /><span><b>Standard</b><small>Arrives by {eta(5)}</small></span><span>{price('standard', pay).shipping === 0 ? 'Complimentary' : inr(price('standard', pay).shipping)}</span></label>
              <label className="opt-row"><input type="radio" name="del" checked={delivery === 'express'} onChange={() => setDelivery('express')} /><span><b>Express</b><small>Arrives by {eta(2)} · select cities</small></span><span>{inr(EXPRESS_FEE)}</span></label>
            </div>
          </section>

          <section><h2 className="h3">Payment</h2>
            {gw && pay !== 'cod'
              ? <p className="note" role="note">You will be taken to Cashfree’s secure page to pay. PLUTONIC never sees or stores your card, UPI or bank details.</p>
              : <p className="note" role="note"><b>Simulated payment.</b> No card, UPI or bank details are requested, sent or stored, and nothing is charged. This preview does not take real payments.</p>}
            <div className="opts">
              {([['upi', 'UPI', 'Any UPI app · instant confirmation'], ['card', 'Credit or debit card', 'Visa · Mastercard · RuPay · Amex'], ['netbanking', 'Net banking', 'All major banks'], ['cod', 'Cash on Delivery', `Pay at your door · ${inr(COD_FEE)} handling`]] as const).map(([k, t, d]) => (
                <label key={k} className="opt-row"><input type="radio" name="pay" checked={pay === k} onChange={() => setPay(k)} /><span><b>{t}</b><small>{d}</small></span></label>
              ))}
            </div>
            
          </section>
        </div>

        <aside className="summary co-sum" aria-label="Order summary">
          <span className="lbl muted">Order summary · {cart.reduce((n, l) => n + l.qty, 0)} items</span>
          <ul className="co-items">{lines.map(({ l, p }) => <li key={l.key}><Photo p={p!} ratio="4 / 5" colourId={l.colourId} /><span><b>{p!.name}</b><small className="muted">{p!.colours.find((c) => c.id === l.colourId)?.name} · {l.size} · Qty {l.qty}</small></span><span>{inr(p!.price * l.qty)}</span></li>)}</ul>
          <dl className="sum">
            <div><dt>Subtotal</dt><dd>{inr(pr.subtotal)}</dd></div>
            {pr.discount > 0 && <div><dt>Promo {coupon?.code}</dt><dd className="ok">− {inr(pr.discount)}</dd></div>}
            <div><dt>Shipping · {delivery === 'standard' ? 'Standard' : 'Express'}</dt><dd>{pr.shipping === 0 ? 'Complimentary' : inr(pr.shipping)}</dd></div>
            {pr.codFee > 0 && <div><dt>Cash on Delivery</dt><dd>{inr(pr.codFee)}</dd></div>}
            <div><dt>Tax (GST)</dt><dd className="muted">Included</dd></div>
          </dl>
          <div className="sum-total"><b>To pay</b><b>{inr(pr.total)}</b></div>
          {failure && <p className="err" role="alert">{failure}</p>}
          <button type="button" className="btn btn--dark btn--block btn--lg" onClick={submit} disabled={busy}>{busy ? (gw && pay !== 'cod' ? 'Opening secure payment…' : 'Placing order…') : (gw && pay !== 'cod' ? `Pay ${inr(pr.total)}` : `Place order · ${inr(pr.total)}`)}</button>
          <span className="muted small center">By placing your order you agree to our <Link to="/support" className="ulink">Terms</Link> and <Link to="/support" className="ulink">Privacy Policy</Link>. 14-day exchanges and returns on unworn pieces.</span>
        </aside>
      </div>
    </div>
  );
}

export function Confirmation({ route }: { route: Route }) {
  const { orders, lookupOrder, live } = useStore();
  const o = orders.find((x) => x.id === route.seg[1]);
  const [retrying, setRetrying] = useState(false);
  const oid = o?.id, oemail = o?.email, pend = o?.paymentStatus === 'pending';
  // Returning from the payment page (or reopening a pending order): let the server settle with the gateway, then refresh.
  useEffect(() => {
    if (!live || !oid || !oemail || !(pend || route.query.get('cf'))) return;
    let live2 = true;
    void verifyPayment(oid).then(() => live2 && lookupOrder(oid, oemail));
    return () => { live2 = false; };
  }, [live, oid, oemail, pend, route.query, lookupOrder]);
  if (o && live && o.paymentStatus === 'pending') return (
    <div className="pl-wrap confirm"><span className="lbl muted">Order #{o.id}</span><h1 className="h1">Waiting for your payment</h1>
      <p className="body">We have reserved your items for 30 minutes. If you have already paid, this page updates in a moment. Otherwise you can pay now.</p>
      <div className="row-gap"><button className="btn btn--dark" type="button" disabled={retrying} onClick={() => { setRetrying(true); void payWithCashfree(o.id, o.email).then((r) => { if (!r.ok) setRetrying(false); }); }}>{retrying ? 'Opening…' : `Pay ${inr(o.total)}`}</button><Link className="btn btn--ghost" to="/shop">Continue shopping</Link></div></div>
  );
  if (o && o.paymentStatus === 'failed') return (
    <div className="pl-wrap confirm"><span className="lbl muted">Order #{o.id}</span><h1 className="h1">Payment not completed</h1>
      <p className="body">The payment did not go through, so this order was cancelled and nothing was charged. Your items are back in stock. You can try again from your bag.</p>
      <div className="row-gap"><Link className="btn btn--dark" to="/cart">Back to bag</Link></div></div>
  );
  if (!o) return <div className="pl-wrap empty-page"><h1 className="h2">We couldn’t find that order.</h1><Link className="btn btn--dark" to="/">Home</Link></div>;
  return (
    <div className="pl-wrap confirm">
      <span className="check-draw" aria-hidden="true"><svg viewBox="0 0 52 52" width="56" height="56" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="26" cy="26" r="24" /><path d="M15 27l8 8 15-17" /></svg></span><span className="lbl muted">Order confirmed · demonstration</span><h1 className="h1">Thank you.</h1>
      <p className="body">Your order <b>#{o.id}</b> is confirmed.{o.paymentStatus === 'paid' ? ' Payment received.' : ''}{o.paymentStatus === 'paid' || o.paymentStatus === 'cod' ? '' : ` A confirmation has been sent to ${o.email}. This is a demonstration order: the payment was simulated, and nothing was charged, packed or shipped.`}</p>
      <div className="confirm-card">
        <ul className="co-items">{o.items.map((i) => <li key={i.productId + i.size + i.colourId} className={i.cancelled ? 'is-cancelled' : undefined}><span><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty}{i.cancelled ? ' · Cancelled' : ''}</small></span><span>{inr(i.price * i.qty)}</span></li>)}</ul>
        <div className="sum-total"><b>{o.payment === 'cod' ? 'Total to pay' : 'Total paid'}</b><b>{inr(o.total)}</b></div>
        <p className="muted small">Shipping to {o.address.name}, {o.address.line1}, {o.address.city} {o.address.pin}, {o.address.state} · {o.payment === 'cod' ? 'Pay on delivery' : 'Payment confirmed'}</p>
      </div>
      <div className="row-gap"><Link className="btn btn--dark" to={'/tracking/' + o.id}>Track order</Link><Link className="btn btn--ghost" to="/shop">Continue shopping</Link></div>
    </div>
  );
}
