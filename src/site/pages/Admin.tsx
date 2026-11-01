import { useEffect, useMemo, useState } from 'react';
import { CATEGORIES, COLOURS, inr, totalStock, type Gender, type Product } from '../catalog';
import { Link } from '../router';
import { ORDER_STEPS, useStore, type Coupon, type Order, type ReturnReq } from '../store';
import { actionLabel, nextStatuses, PICKUP_SLOTS, stepLabel } from '../returnRules';
import { isOnline, itemRefund } from '../orderCancel';
import { LOGO, Photo } from '../ui';
import { adminSignOut } from './AdminAccess';

const SECTIONS = ['Overview', 'Orders', 'Products', 'Inventory', 'Categories', 'Customers', 'Coupons', 'Banners', 'Returns', 'Refunds', 'Reviews', 'Analytics'] as const;
type Section = (typeof SECTIONS)[number];
const ALL_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Resize an uploaded photo in the browser so it fits in local storage. */
function fileToDataUrl(file: File, max = 1100): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/webp', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
    img.src = url;
  });
}

function blank(gender: Gender): Product {
  return { id: 'x' + Date.now().toString(36), name: '', type: '', gender, category: CATEGORIES[gender][0], detail: '', description: '', features: [], fabric: '', fit: '', images: [], shots: ['Packshot · front', 'Packshot · back'], tone: '#292929', originalPrice: 0, price: 0, colours: [COLOURS.onyx], sizes: ['S', 'M', 'L'], stock: {}, rating: 0, reviewCount: 0, isNew: true, bestseller: false, active: true };
}

function ProductEditor({ initial, onClose }: { initial: Product; onClose: () => void }) {
  const { saveProduct, createProduct, allProducts, say } = useStore();
  const exists = allProducts.some((p) => p.id === initial.id);
  const [p, setP] = useState<Product>(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => ({ ...x, [k]: v }));
  const toggleColour = (id: string) => set('colours', p.colours.some((c) => c.id === id) ? p.colours.filter((c) => c.id !== id) : [...p.colours, COLOURS[id]]);
  const toggleSize = (s: string) => set('sizes', p.sizes.includes(s) ? p.sizes.filter((x) => x !== s) : ALL_SIZES.filter((x) => p.sizes.includes(x) || x === s));
  const save = () => {
    if (p.name.trim().length < 2) return setErr('Give the product a name.');
    if (!(p.price > 0)) return setErr('Enter a selling price above zero.');
    if (p.originalPrice < p.price) return setErr('Original price cannot be lower than the selling price.');
    if (!p.colours.length || !p.sizes.length) return setErr('Choose at least one colour and one size.');
    setErr('');
    const clean = { ...p, originalPrice: p.originalPrice || p.price };
    (exists ? saveProduct : createProduct)(clean);
    say(exists ? 'Product updated' : 'Product added. It is now live on the storefront.');
    onClose();
  };
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={exists ? 'Edit product' : 'Add product'}>
      <div className="modal-card modal-card--wide">
        <div className="sheet-head"><span className="lbl">{exists ? 'Edit product' : 'Add product'}</span><button className="ico" type="button" onClick={onClose} aria-label="Close">×</button></div>
        <div className="fgrid">
          <label>Name<input value={p.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label>Product type<input value={p.type} onChange={(e) => set('type', e.target.value)} placeholder="e.g. Men's Performance Gym Shorts" /></label>
          <label>Collection<select value={p.gender} onChange={(e) => { const g = e.target.value as Gender; setP({ ...p, gender: g, category: CATEGORIES[g][0] }); }}><option value="men">Men</option><option value="women">Women</option></select></label>
          <label>Category<select value={p.category} onChange={(e) => set('category', e.target.value)}>{CATEGORIES[p.gender].map((c) => <option key={c}>{c}</option>)}</select></label>
          <label>Selling price (₹)<input type="number" min={0} value={p.price || ''} onChange={(e) => set('price', Number(e.target.value))} /></label>
          <label>Original price (₹)<input type="number" min={0} value={p.originalPrice || ''} onChange={(e) => set('originalPrice', Number(e.target.value))} /></label>
          <label className="span2">Short detail<input value={p.detail} onChange={(e) => set('detail', e.target.value)} placeholder="e.g. 240 gsm cotton" /></label>
          <label className="span2">Description<textarea rows={3} value={p.description} onChange={(e) => set('description', e.target.value)} /></label>
          <label>Fabric<input value={p.fabric} onChange={(e) => set('fabric', e.target.value)} /></label>
          <label>Fit<input value={p.fit} onChange={(e) => set('fit', e.target.value)} /></label>
          <label className="span2">Features (one per line)<textarea rows={3} value={p.features.join('\n')} onChange={(e) => set('features', e.target.value.split('\n').filter(Boolean))} /></label>
        </div>
        <fieldset className="inline"><legend className="lbl">Colours</legend>{Object.values(COLOURS).map((c) => <label key={c.id} className="check"><input type="checkbox" checked={p.colours.some((x) => x.id === c.id)} onChange={() => toggleColour(c.id)} /><i className="sw" style={{ background: c.hex }} />{c.name}</label>)}</fieldset>
        <fieldset className="inline"><legend className="lbl">Sizes</legend>{ALL_SIZES.map((s) => <label key={s} className="check"><input type="checkbox" checked={p.sizes.includes(s)} onChange={() => toggleSize(s)} />{s}</label>)}</fieldset>
        <fieldset><legend className="lbl">Stock by colour and size</legend>
          <div className="stock-grid" style={{ gridTemplateColumns: `120px repeat(${p.sizes.length}, 1fr)` }}>
            <span />{p.sizes.map((s) => <b key={s} className="lbl">{s}</b>)}
            {p.colours.map((c) => [<span key={c.id} className="small">{c.name}</span>, ...p.sizes.map((s) => <input key={c.id + s} type="number" min={0} aria-label={`Stock ${c.name} ${s}`} value={p.stock[`${c.id}:${s}`] ?? 0} onChange={(e) => set('stock', { ...p.stock, [`${c.id}:${s}`]: Math.max(0, Number(e.target.value)) })} />)])}
          </div></fieldset>
        <fieldset><legend className="lbl">Photographs</legend>
          <div className="img-edit">
            {p.images.map((src, i) => <div key={i} className="img-thumb"><img src={src} alt={`Photo ${i + 1}`} /><button type="button" className="linkbtn" onClick={() => set('images', p.images.filter((_, n) => n !== i))}>Remove</button></div>)}
            <label className="btn btn--ghost btn--sm upload">Upload photo<input type="file" accept="image/*" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { const u = await fileToDataUrl(f); set('images', [...p.images, u]); } catch { say('Could not read that image.'); } e.target.value = ''; }} /></label>
          </div>
          <label>Or add an image path / URL<input placeholder="/images/products/men/my-product-front.webp" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const v = e.currentTarget.value.trim(); if (v) { set('images', [...p.images, v]); e.currentTarget.value = ''; } } }} /></label>
          <span className="muted small">Uploads are resized and stored in this browser for the demo. For production, place files in public/images/products/ and list them in the catalogue.</span></fieldset>
        <div className="row-gap"><label className="check"><input type="checkbox" checked={p.isNew} onChange={(e) => set('isNew', e.target.checked)} />New arrival</label><label className="check"><input type="checkbox" checked={p.bestseller} onChange={(e) => set('bestseller', e.target.checked)} />Bestseller</label><label className="check"><input type="checkbox" checked={p.active} onChange={(e) => set('active', e.target.checked)} />Visible on storefront</label></div>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="row-gap"><button className="btn btn--dark" type="button" onClick={save}>{exists ? 'Save changes' : 'Add product'}</button><button className="btn btn--ghost" type="button" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  );
}

function Bars({ data, unit = '' }: { data: [string, number][]; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d[1]));
  return <div className="bars">{data.map(([k, v]) => <div key={k}><span className="small">{k}</span><i style={{ width: `${(v / max) * 100}%` }} /><b className="small">{unit}{v.toLocaleString('en-IN')}</b></div>)}</div>;
}



const fmt = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };

/** One return / exchange request with the actions that make sense for its current step. */
function ReturnCard({ r }: { r: ReturnReq }) {
  const s = useStore();
  const o = s.orders.find((x) => x.id === r.orderId);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(todayISO());
  const [slot, setSlot] = useState<string>(PICKUP_SLOTS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const go_ = async (status: ReturnReq['status']) => {
    setBusy(true); setMsg('');
    const res = await s.updateReturn(r.id, status, { note, pickupDate: date, pickupSlot: slot });
    setBusy(false);
    if (!res.ok) setMsg(res.message); else setNote('');
  };
  const next = nextStatuses(r);
  return (
    <div className="rcard">
      <div className="rcard-top">
        <div><b>Order #{r.orderId} · {r.kind === 'exchange' ? 'Exchange' : 'Return'} {r.id}</b><span className="muted small">{r.productName} · {r.variant}{r.qty ? ` · Qty ${r.qty}` : ''}{o ? ` · ${o.address.name}, ${o.address.city}` : ''}</span></div>
        <span className={'status' + (r.status === 'Rejected' ? ' status--bad' : r.status === 'Requested' ? ' status--info' : '')}>{r.status}</span>
      </div>
      <p className="small">Reason: <b>{r.reason}</b>{r.note ? ` · “${r.note}”` : ''}</p>
      {r.kind === 'exchange' && r.exchangeTo && <p className="small">Customer wants size <b>{r.exchangeTo.size}</b> instead of <b>{r.piece?.size ?? r.variant}</b> (same colour: {r.exchangeTo.colourName}). One exchange per item.</p>}
      {r.kind === 'return' && <p className="small">Refund when completed: <b>{inr(r.refundAmount ?? 0)}</b>{o?.payment === 'cod' ? ' · cash on delivery: ask for UPI/bank details' : ''}</p>}
      {r.pickupDate && <p className="small">Pickup: <b>{new Date(r.pickupDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}, {r.pickupSlot}</b></p>}
      <ol className="rcard-hist">{(r.history ?? []).map((h, i) => <li key={i}><b>{stepLabel(r.kind, h.status)}</b> <span className="muted small">{fmt(h.at)}</span></li>)}</ol>
      {next.length > 0 && (
        <div className="rcard-act">
          {next.includes('Pickup scheduled') && <div className="row-gap"><label className="small">Pickup date<input type="date" value={date} min={todayISO()} onChange={(e) => setDate(e.target.value)} /></label><label className="small">Time slot<select value={slot} onChange={(e) => setSlot(e.target.value)}>{PICKUP_SLOTS.map((x) => <option key={x}>{x}</option>)}</select></label></div>}
          <label className="small">Message to the customer {next.includes('Rejected') ? '(required to reject)' : '(optional)'}<input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Shown on their order" /></label>
          <div className="row-gap">
            {next.filter((x) => x !== 'Rejected').map((x) => (
              <button key={x} type="button" className="btn btn--dark btn--sm" disabled={busy} onClick={() => {
                if (x === 'Completed' && r.kind === 'return' && !window.confirm(`Item received. This puts it back in stock and records a refund of ${inr(r.refundAmount ?? 0)}. Continue?`)) return;
                if (x === 'Replacement packed' && !window.confirm('Packing the replacement swaps the stock: the returned size goes back in, the replacement size goes out. Continue?')) return;
                void go_(x);
              }}>{actionLabel(r.kind, x)}</button>
            ))}
            {next.includes('Rejected') && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => go_('Rejected')}>Reject</button>}
          </div>
          {msg && <p className="err small" role="alert">{msg}</p>}
        </div>
      )}
    </div>
  );
}

function ReturnsPanel() {
  const s = useStore();
  const [f, setF] = useState<'open' | 'all' | 'done'>('open');
  const list = [...s.returns].sort((a, b) => b.createdAt - a.createdAt).filter((r) => (f === 'all' ? true : f === 'open' ? r.status !== 'Completed' && r.status !== 'Rejected' : r.status === 'Completed' || r.status === 'Rejected'));
  return (
    <section className="panel">
      <div className="seg" role="tablist" aria-label="Show">{([['open', 'Needs action'], ['done', 'Finished'], ['all', 'All']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
      {list.length === 0 && <p className="muted">Nothing here.</p>}
      {list.map((r) => <ReturnCard key={r.id} r={r} />)}
      <p className="muted small">Returns: Requested, Approved, Pickup scheduled, Picked up, Completed (refund recorded). Exchanges: after pickup, the replacement gets its own steps: packed (stock swaps), shipped, out for delivery, delivered. Customers see every step, the pickup date and your message on the same order tracking. An item can be exchanged once; after that it can only be returned.</p>
    </section>
  );
}

/** Everything owed back to customers (cancellations and completed returns) and whether it has been paid out. */
function RefundsPanel() {
  const s = useStore();
  const [f, setF] = useState<'Pending' | 'Refunded' | 'all'>('Pending');
  const [refs, setRefs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const list = [...s.refunds].sort((a, b) => b.createdAt - a.createdAt).filter((x) => f === 'all' || x.status === f);
  const pending = s.refunds.filter((x) => x.status === 'Pending');
  const owed = pending.reduce((n, x) => n + x.amount, 0);
  const paid = s.refunds.filter((x) => x.status === 'Refunded').reduce((n, x) => n + x.amount, 0);
  return (
    <section className="panel">
      <div className="kpis"><div><span className="lbl muted">Still to refund</span><b>{inr(owed)}</b></div><div><span className="lbl muted">Pending</span><b>{pending.length}</b></div><div><span className="lbl muted">Refunded so far</span><b>{inr(paid)}</b></div></div>
      <div className="seg" role="tablist" aria-label="Show">{([['Pending', 'To refund'], ['Refunded', 'Refunded'], ['all', 'All']] as const).map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={f === k} onClick={() => setF(k)}>{l}</button>)}</div>
      {list.length === 0 && <p className="muted">No refunds here.</p>}
      {list.length > 0 && <div className="table-wrap"><table className="tbl tbl--rows"><thead><tr><th>Date</th><th>Order</th><th>Why</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>
        {list.map((x) => { const key = String(x.id); const o = s.orders.find((y) => y.id === x.orderId); return (
          <tr key={key}><td>{fmt(x.createdAt)}</td><td><b>#{x.orderId}</b>{o && <small className="muted"> {o.address.name}</small>}</td>
            <td>{x.source === 'cancellation' ? 'Cancelled order or item' : 'Returned item'}{x.note && <small className="muted"> · {x.note}</small>}</td>
            <td>{inr(x.amount)}</td><td>{x.status}{x.status === 'Refunded' && <small className="muted"> {x.processedAt ? fmt(x.processedAt) : ''}{x.reference ? ' · ref ' + x.reference : ''}</small>}</td>
            <td>{x.status === 'Pending' && <span className="row-gap"><input aria-label="Payment reference" placeholder="UTR / reference" value={refs[key] ?? ''} maxLength={80} onChange={(e) => setRefs({ ...refs, [key]: e.target.value })} /><button type="button" className="btn btn--dark btn--sm" disabled={busy === key} onClick={async () => { if (!window.confirm(`Mark ${inr(x.amount)} for order #${x.orderId} as refunded? Do this after the money has actually been sent.`)) return; setBusy(key); await s.markRefunded(x.id, refs[key] ?? ''); setBusy(null); }}>Mark refunded</button></span>}</td></tr>); })}
      </tbody></table></div>}
      <p className="muted small">This page is the record of what you owe customers. Send the money from Cashfree or your bank, then press <b>Mark refunded</b> and add the payment reference. Online orders are refunded to the original payment method; for cash-on-delivery returns, ask the customer for UPI or bank details first.</p>
    </section>
  );
}

const CANCEL_REASONS = ['Item out of stock or damaged', 'Customer asked to cancel', 'Payment problem', 'Address or delivery problem', 'Other'];

/** Cancel a whole order, or one item of it. Stock goes back on the shelf; refunds due are recorded on the order. */
function CancelDialog({ order: o, onClose }: { order: Order; onClose: () => void }) {
  const s = useStore();
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const why = note.trim() ? `${reason}: ${note.trim()}` : reason;
  const open = o.items.map((i, n) => ({ i, n })).filter((x) => !x.i.cancelled);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const act = async (message: string, fn: () => Promise<boolean>) => { if (!window.confirm(message)) return; setBusy(true); await fn(); setBusy(false); };
  const online = isOnline(o);
  return (
    <div className="cdlg-back" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cdlg" role="dialog" aria-modal="true" aria-labelledby="cdlg-h">
        <div className="row-between"><h2 id="cdlg-h" className="h3">Cancel order #{o.id}</h2><button type="button" className="linkbtn" onClick={onClose}>Close</button></div>
        <p className="muted small">{o.address.name} · {inr(o.total)} · {o.payment === 'cod' ? 'Pay on delivery (nothing was charged, no refund needed)' : online ? 'Paid online: cancelled items create a refund due' : 'Payment not completed (nothing to refund)'}</p>
        <label>Reason<select value={reason} onChange={(e) => setReason(e.target.value)}>{CANCEL_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
        <label>Note (optional)<input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} placeholder="Shown to the customer on their order" /></label>
        <h3 className="lbl">Cancel one item</h3>
        <ul className="cdlg-items">
          {o.items.map((i, n) => (
            <li key={n} className={i.cancelled ? 'is-cancelled' : undefined}>
              <span><b>{i.name}</b><small className="muted">{i.colourName} · {i.size} · Qty {i.qty} · {inr(i.price * i.qty)}{i.cancelled ? ' · Cancelled' : ''}</small></span>
              {!i.cancelled && <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => act(open.length === 1 ? `This is the last open item, so the whole order #${o.id} will be cancelled. Continue?` : `Cancel “${i.name}” (${i.size}) only?${online ? ` A refund of ${inr(itemRefund(o, n))} will be recorded.` : ''} Its stock is returned.`, () => s.adminCancelItem(o.id, n, why))}>{open.length === 1 ? 'Cancel (whole order)' : 'Cancel this item'}</button>}
            </li>
          ))}
        </ul>
        <div className="cdlg-foot">
          <button type="button" className="btn btn--dark" disabled={busy} onClick={() => act(`Cancel the WHOLE order #${o.id}? All remaining items are returned to stock${online ? ` and a refund of ${inr(o.total)} is recorded` : ''}.`, () => s.adminCancelOrder(o.id, why))}>{busy ? 'Cancelling…' : 'Cancel the whole order'}</button>
          <span className="muted small">{online ? `Refund due: ${inr(o.total - (o.refundDue ?? 0))} still to be recorded for the open items.` : ''}</span>
        </div>
      </div>
    </div>
  );
}

export default function Admin() {
  const s = useStore();
  const { enterAdmin, leaveAdmin } = s;
  useEffect(() => { void enterAdmin(); return () => leaveAdmin(); }, [enterAdmin, leaveAdmin]);
  // New customer activity (orders, return requests) shows up without reloading the page.
  const { refreshAdmin } = s;
  useEffect(() => {
    const tick = () => { if (!document.hidden) void refreshAdmin(); };
    const t = window.setInterval(tick, 20_000); document.addEventListener('visibilitychange', tick);
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [refreshAdmin]);
  const [sec, setSec] = useState<Section>('Overview');
  const [cancelFor, setCancelFor] = useState<string | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [filter, setFilter] = useState('');
  const [cp, setCp] = useState<Coupon>({ code: '', kind: 'percent', value: 10, minSubtotal: 0, active: true, label: '' });
  const revenue = s.orders.filter((o) => o.step >= 0).reduce((a, o) => a + o.total, 0);
  const units = s.orders.filter((o) => o.step >= 0).reduce((a, o) => a + o.items.reduce((n, i) => n + i.qty, 0), 0);
  const low = s.allProducts.flatMap((p) => Object.entries(p.stock).filter(([, n]) => n > 0 && n < 5).map(([k, n]) => ({ p, k, n })));
  const byGender = useMemo(() => { const m: Record<string, number> = { Women: 0, Men: 0 }; s.orders.filter((o) => o.step >= 0).forEach((o) => o.items.forEach((i) => { const p = s.product(i.productId); m[p?.gender === 'men' ? 'Men' : 'Women'] += i.price * i.qty; })); return Object.entries(m) as [string, number][]; }, [s.orders, s.product]);
  const byColour = useMemo(() => { const m: Record<string, number> = {}; s.allProducts.forEach((p) => Object.entries(p.stock).forEach(([k, n]) => { const c = COLOURS[k.split(':')[0]]?.name ?? k; m[c] = (m[c] ?? 0) + n; })); return Object.entries(m) as [string, number][]; }, [s.allProducts]);
  const customers = useMemo(() => { const m = new Map<string, { name: string; email: string; orders: number; spent: number }>(); s.orders.forEach((o) => { const k = o.email || o.mobile; const x = m.get(k) ?? { name: o.address.name, email: o.email, orders: 0, spent: 0 }; x.orders += 1; x.spent += o.total; m.set(k, x); }); return [...m.values()]; }, [s.orders]);
  const pendingReturns = s.returns.filter((r) => r.status === 'Requested').length;
  const pendingReviews = s.reviews.filter((r) => r.status === 'Pending').length;

  return (
    <div className="admin">
      <aside className="admin-side" aria-label="Admin">
        <Link to="/" className="admin-brand"><img src={LOGO} alt="PLUTONIC" height={40} /><span className="lbl">Admin</span></Link>
        <nav>{SECTIONS.map((x) => <button key={x} type="button" aria-current={sec === x ? 'page' : undefined} onClick={() => setSec(x)}>{x}{x === 'Returns' && pendingReturns > 0 && <i>{pendingReturns}</i>}{x === 'Refunds' && s.refunds.filter((y) => y.status === 'Pending').length > 0 && <i>{s.refunds.filter((y) => y.status === 'Pending').length}</i>}{x === 'Reviews' && pendingReviews > 0 && <i>{pendingReviews}</i>}</button>)}</nav>
        <Link to="/" className="lbl ulink small">← Back to store</Link>
        <button type="button" className="lbl ulink small admin-signout" onClick={() => { void adminSignOut(); }}>Sign out</button>
      </aside>
      <main className="admin-main">
        {s.adminStatus === 'loading' && <p className="note" role="status">Loading data from the database…</p>}
        {s.adminStatus === 'error' && <p className="note err" role="alert">The database could not be reached or is not configured on the server (SUPABASE_SERVICE_ROLE_KEY). Nothing here can be saved until that is fixed.</p>}
        <div className="admin-top"><div><h1 className="h2">{sec}</h1><span className="muted small">Access is verified by the server. Catalogue, orders and edits are demonstration data stored in this browser only.</span></div><button className="linkbtn" type="button" onClick={() => { void refreshAdmin(); s.say('Refreshed'); }}>Refresh</button>{sec === 'Products' && <button className="btn btn--dark" type="button" onClick={() => setEdit(blank('men'))}>Add product</button>}</div>

        {sec === 'Overview' && <>
          <details className="panel guide" open>
            <summary className="h3">How to use this dashboard</summary>
            <ol className="guide-list">
              <li><b>Orders</b> · place an order on the storefront, then open Orders and press “Mark packed”, “Mark shipped”… The customer sees each step on Track an order, and a Delivered order can be returned or exchanged.</li>
              <li><b>Products</b> · “Add product” (name, collection, category, prices, colours, sizes, stock per colour and size, photos). It appears on the storefront straight away. “Edit” changes anything; “Hide” removes it from the shop without deleting it.</li>
              <li><b>Inventory</b> · stock totals by size. Amber means fewer than 10 units. Change exact units in Products → Edit.</li>
              <li><b>Coupons</b> · create a code, then try it in the bag. Disable a code at any time.</li>
              <li><b>Returns and Reviews</b> · approve or reject customer requests; publish or hide reviews.</li>
            </ol>
            <p className="muted small">Signing in is verified by the server. The dashboard data itself is a demonstration: everything is stored in this browser only, so changes are not shared with other visitors or devices.</p>
          </details>
          <div className="kpis"><div><span className="lbl muted">Revenue</span><b>{inr(revenue)}</b></div><div><span className="lbl muted">Orders</span><b>{s.orders.length}</b></div><div><span className="lbl muted">Units sold</span><b>{units}</b></div><div><span className="lbl muted">Avg. order value</span><b>{inr(s.orders.length ? revenue / s.orders.length : 0)}</b></div><div><span className="lbl muted">Open returns</span><b>{pendingReturns}</b></div></div>
          <div className="cols"><section className="panel"><h2 className="h3">Revenue by collection</h2><Bars data={byGender} unit="₹ " /></section><section className="panel"><h2 className="h3">Inventory by colour · units</h2><Bars data={byColour} /></section></div>
          <section className="panel"><h2 className="h3">Low stock (under 5 units)</h2>{low.length === 0 ? <p className="muted">Nothing running low.</p> : <table className="tbl"><tbody>{low.slice(0, 8).map(({ p, k, n }) => <tr key={p.id + k}><td>{p.name}</td><td>{k.replace(':', ' · ')}</td><td>{n} left</td></tr>)}</tbody></table>}</section>
          <section className="panel"><h2 className="h3">Recent orders</h2><OrdersTable limit={5} /></section>
        </>}

        {sec === 'Orders' && <section className="panel"><OrdersTable /></section>}

        {sec === 'Products' && <section className="panel">
          <label className="inline-search">Search<input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search products" /></label>
          <div className="table-wrap"><table className="tbl tbl--rows"><thead><tr><th>Product</th><th>Collection</th><th>Price</th><th>Stock</th><th>Status</th><th /></tr></thead><tbody>
            {s.allProducts.filter((p) => !filter || (p.name + p.category).toLowerCase().includes(filter.toLowerCase())).map((p) => (
              <tr key={p.id}><td className="prod-cell"><span className="thumb"><Photo p={p} ratio="4 / 5" /></span><span><b>{p.name}</b><small className="muted">{p.category}</small></span></td><td>{p.gender === 'men' ? 'Men' : 'Women'}</td><td>{inr(p.price)}</td><td>{totalStock(p)}</td><td>{p.active ? 'Live' : 'Hidden'}</td>
                <td className="row-gap"><button className="linkbtn" type="button" onClick={() => setEdit(p)}>Edit</button>{p.active ? <button className="linkbtn muted" type="button" onClick={() => s.saveProduct({ ...p, active: false })}>Hide</button> : <button className="linkbtn" type="button" onClick={() => s.saveProduct({ ...p, active: true })}>Show</button>}</td></tr>))}
          </tbody></table></div></section>}

        {sec === 'Inventory' && <section className="panel"><div className="table-wrap"><table className="tbl tbl--rows"><thead><tr><th>Product</th>{ALL_SIZES.map((x) => <th key={x}>{x}</th>)}<th>Total</th></tr></thead><tbody>
          {s.allProducts.map((p) => <tr key={p.id}><td><b>{p.name}</b></td>{ALL_SIZES.map((sz) => { const n = p.colours.reduce((a, c) => a + (p.stock[`${c.id}:${sz}`] ?? 0), 0); return <td key={sz} className={p.sizes.includes(sz) && n < 10 ? 'warn' : ''}>{p.sizes.includes(sz) ? n : '–'}</td>; })}<td>{totalStock(p)}</td></tr>)}</tbody></table></div><p className="muted small">Amber = under 10 units across colours. Edit exact units per colour and size in Products → Edit.</p></section>}

        {sec === 'Categories' && <div className="cols">{(['men', 'women'] as Gender[]).map((g) => <section key={g} className="panel"><h2 className="h3">{g === 'men' ? 'Men' : 'Women'}</h2>{CATEGORIES[g].map((c) => <div key={c} className="order-row"><span>{c}</span><span className="muted small">{s.allProducts.filter((p) => p.gender === g && p.category === c).length} products</span></div>)}</section>)}</div>}

        {sec === 'Customers' && <section className="panel"><table className="tbl tbl--rows"><thead><tr><th>Customer</th><th>Email</th><th>Orders</th><th>Spent</th></tr></thead><tbody>{customers.map((c) => <tr key={c.email + c.name}><td>{c.name}</td><td>{c.email}</td><td>{c.orders}</td><td>{inr(c.spent)}</td></tr>)}</tbody></table></section>}

        {sec === 'Coupons' && <section className="panel">
          {s.coupons.map((c) => <div key={c.code} className="order-row"><div><b>{c.code} · {c.kind === 'percent' ? c.value + '%' : '₹ ' + c.value} off</b><span className="muted small">{c.label} · min {inr(c.minSubtotal)}</span></div><button className="linkbtn" type="button" onClick={() => s.saveCoupon({ ...c, active: !c.active })}>{c.active ? 'Active · disable' : 'Disabled · enable'}</button></div>)}
          <form className="fgrid" onSubmit={(e) => { e.preventDefault(); if (!/^[A-Z0-9]{4,16}$/.test(cp.code.toUpperCase())) { s.say('Code must be 4–16 letters or digits.'); return; } s.saveCoupon({ ...cp, code: cp.code.toUpperCase(), label: cp.label || (cp.kind === 'percent' ? cp.value + '% off' : '₹ ' + cp.value + ' off') }); setCp({ ...cp, code: '', label: '' }); s.say('Coupon saved'); }}>
            <label>Code<input value={cp.code} onChange={(e) => setCp({ ...cp, code: e.target.value })} /></label>
            <label>Type<select value={cp.kind} onChange={(e) => setCp({ ...cp, kind: e.target.value as Coupon['kind'] })}><option value="percent">Percent</option><option value="flat">Flat ₹</option></select></label>
            <label>Value<input type="number" min={1} value={cp.value} onChange={(e) => setCp({ ...cp, value: Number(e.target.value) })} /></label>
            <label>Minimum subtotal<input type="number" min={0} value={cp.minSubtotal} onChange={(e) => setCp({ ...cp, minSubtotal: Number(e.target.value) })} /></label>
            <button className="btn btn--dark btn--sm" type="submit">Create coupon</button></form></section>}

        {sec === 'Banners' && <section className="panel"><div className="order-row"><div><b>Home hero · The Quiet Hours</b><span className="muted small">Live · uses /images/banners/men-campaign-studio.webp and women-campaign-milan.webp</span></div></div><div className="order-row"><div><b>Announcement bar</b><span className="muted small">Delivery threshold and exchange window, from the catalogue constants</span></div></div><p className="muted small">Banner editing is read-only in this preview. Replace the files in public/images/banners/ to change the campaign imagery.</p></section>}

        {sec === 'Returns' && <ReturnsPanel />}
        {sec === 'Refunds' && <RefundsPanel />}

        {sec === 'Reviews' && <section className="panel">{s.reviews.length === 0 && <p className="muted">No customer reviews to moderate yet.</p>}{s.reviews.map((r) => <div key={r.id} className="order-row"><div><b>{s.product(r.productId)?.name} · {'★'.repeat(r.rating)}</b><span className="muted small">{r.name} · {r.status} — {r.text}</span></div><div className="row-gap"><button className="btn btn--dark btn--sm" type="button" onClick={() => s.setReviewStatus(r.id, 'Published')}>Publish</button><button className="btn btn--ghost btn--sm" type="button" onClick={() => s.setReviewStatus(r.id, 'Hidden')}>Hide</button></div></div>)}</section>}

        {sec === 'Analytics' && <div className="cols"><section className="panel"><h2 className="h3">Revenue by collection</h2><Bars data={byGender} unit="₹ " /></section><section className="panel"><h2 className="h3">Best sellers (units)</h2><Bars data={Object.entries(s.orders.flatMap((o) => o.items).reduce<Record<string, number>>((m, i) => ({ ...m, [i.name]: (m[i.name] ?? 0) + i.qty }), {})).sort((a, b) => b[1] - a[1]).slice(0, 6)} /></section></div>}
      </main>
      {edit && <ProductEditor initial={edit} onClose={() => setEdit(null)} />}
      {(() => { const o = cancelFor ? s.orders.find((x) => x.id === cancelFor) : undefined; return o && o.step >= 0 && o.step < 4 ? <CancelDialog order={o} onClose={() => setCancelFor(null)} /> : null; })()}
    </div>
  );

  function OrdersTable({ limit }: { limit?: number }) {
    return (
      <div className="table-wrap"><table className="tbl tbl--rows"><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Status</th><th /></tr></thead><tbody>
        {s.orders.slice(0, limit ?? 999).map((o) => <tr key={o.id}><td><b>#{o.id}</b></td><td>{o.address.name}</td><td>{o.items.reduce((n, i) => n + i.qty, 0)}</td><td>{inr(o.total)}</td><td>{o.step < 0 ? 'Cancelled' : ORDER_STEPS[o.step]}{o.step >= 0 && o.items.some((i) => i.cancelled) ? <small className="muted"> · {o.items.filter((i) => i.cancelled).length} item(s) cancelled</small> : null}{o.refundDue ? <small className="warn"> · refund due {inr(o.refundDue)}</small> : null}</td>
          <td className="row-gap">{o.step >= 0 && o.step < 4 && <button className="linkbtn" type="button" onClick={() => s.advanceOrder(o.id)}>Mark {ORDER_STEPS[o.step + 1].toLowerCase()}</button>}{o.step >= 0 && o.step < 4 && <button className="linkbtn danger" type="button" onClick={() => setCancelFor(o.id)}>Cancel…</button>}</td></tr>)}</tbody></table></div>
    );
  }
}
