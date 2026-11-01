import { useEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, X, ZoomIn } from 'lucide-react';
import { discountPercent, inr, RETURN_WINDOW_DAYS, sizeStock, FREE_SHIPPING_ABOVE, type Product as P } from '../catalog';
import { go, Link, type Route } from '../router';
import { useStore } from '../store';
import { Crumbs, Photo, PriceTag, ProductCard, Stars, WishButton } from '../ui';

const SAMPLE_REVIEWS = [
  { name: 'Aarav M.', size: 'M', text: 'Holds its shape after washing and feels substantial without being heavy. Fits as described.', fit: 'True to size', rating: 5 },
  { name: 'Ishita R.', size: 'S', text: 'Quiet, clean finish and no visible branding. I reach for it before anything else in my kit.', fit: 'True to size', rating: 5 },
  { name: 'Kabir S.', size: 'L', text: 'Great fabric. I sized up one for a looser drape and it works well.', fit: 'Runs small', rating: 4 },
];

const GUIDE: Record<'men' | 'women', string[][]> = {
  men: [['Size', 'Chest (cm)', 'Waist (cm)'], ['S', '92–97', '76–81'], ['M', '97–102', '81–86'], ['L', '102–107', '86–91'], ['XL', '107–112', '91–96'], ['XXL', '112–118', '96–102']],
  women: [['Size', 'Bust (cm)', 'Waist (cm)', 'Hip (cm)'], ['XS', '78–82', '60–64', '86–90'], ['S', '82–86', '64–68', '90–94'], ['M', '86–90', '68–72', '94–98'], ['L', '90–95', '72–77', '98–103'], ['XL', '95–100', '77–82', '103–108'], ['XXL', '100–106', '82–88', '108–114']],
};

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return <details className="acc" open={open}><summary>{title}<span aria-hidden="true">+</span></summary><div className="acc-body">{children}</div></details>;
}

export default function Product({ route }: { route: Route }) {
  const { product, products, addToCart, cart, say, reviews, addReview, user } = useStore();
  const p = product(route.seg[1] ?? '');
  if (!p || !p.active) return <div className="pl-wrap empty"><span className="lbl muted">Not found</span><h1 className="h2">We couldn’t find that piece.</h1><Link className="btn btn--dark" to="/shop">Browse all pieces</Link></div>;
  return <Detail key={p.id} p={p} route={route} products={products} cartHas={(k) => cart.find((l) => l.key === k)?.qty ?? 0} addToCart={addToCart} say={say} reviews={reviews} addReview={addReview} signedName={user?.firstName} />;
}

function Detail({ p, route, products, cartHas, addToCart, say, reviews, addReview, signedName }: {
  p: P; route: Route; products: P[]; cartHas: (k: string) => number; addToCart: ReturnType<typeof useStore>['addToCart']; say: (m: string) => void;
  reviews: ReturnType<typeof useStore>['reviews']; addReview: ReturnType<typeof useStore>['addReview']; signedName?: string;
}) {
  const [colourId, setColour] = useState(p.colours.find((c) => c.id === route.query.get('c'))?.id ?? p.colours[0].id);
  const [size, setSize] = useState('');
  const [qty, setQty] = useState(1);
  const [shot, setShot] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState('50% 50%');
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [guide, setGuide] = useState(false);
  const [error, setError] = useState('');
  const [sticky, setSticky] = useState(false);
  const [added, setAdded] = useState(false);
  const buyRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const shots = Math.max(p.shots.length, p.images.length, 1);
  const colour = p.colours.find((c) => c.id === colourId)!;
  const left = size ? sizeStock(p, colourId, size) : 0;
  const inBag = size ? cartHas(`${p.id}|${colourId}|${size}`) : 0;
  const stockText = !size ? 'Select a size' : left <= 0 ? 'Sold out in this size' : left <= 3 ? `Only ${left} left in ${size}` : 'In stock · ready to ship';
  const gallery = useMemo(() => Array.from({ length: shots }, (_, i) => i), [shots]);

  useEffect(() => {
    const el = buyRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setSticky(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el); return () => io.disconnect();
  }, []);

  const add = () => {
    if (!size) { setError('Please choose a size.'); return false; }
    const r = addToCart(p, colourId, size, qty);
    if (!r.ok) { setError(r.message); return false; }
    setError(''); say(`${p.name} · ${colour.name} · ${size}${qty > 1 ? ' × ' + qty : ''} added to your bag`); setAdded(true); window.setTimeout(() => setAdded(false), 1600); return true;
  };
  const checkPin = () => {
    if (!/^[1-8]\d{5}$/.test(pin)) { setPinMsg('Enter a valid 6-digit PIN code.'); return; }
    const d = new Date(Date.now() + 4 * 86_400_000);
    setPinMsg(`Delivery available. Arrives by ${d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}. Cash on delivery available.`);
  };

  const mine = reviews.filter((r) => r.productId === p.id && r.status === 'Published');
  const related = products.filter((x) => x.id !== p.id && x.gender === p.gender).slice(0, 4);
  const [rv, setRv] = useState({ name: signedName ?? '', rating: 5, text: '', open: false });

  return (
    <div className="pdp">
      <div className="pl-wrap"><Crumbs items={[{ label: 'Home', to: '/' }, { label: p.gender === 'men' ? 'Men' : 'Women', to: '/' + p.gender }, { label: p.category, to: `/shop?g=${p.gender}&cat=${encodeURIComponent(p.category)}` }, { label: p.name }]} /></div>
      <div className="pl-wrap pdp-grid">
        <div className="gal">
          <div className="gal-thumbs" role="tablist" aria-label="Product views">{gallery.map((i) => <button key={i} type="button" role="tab" aria-selected={shot === i} className={shot === i ? 'on' : ''} onClick={() => { setShot(i); stripRef.current?.children[i]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' }); }} aria-label={`View ${i + 1}: ${p.shots[i] ?? 'photograph'}`}><Photo p={p} index={i} ratio="4 / 5" colourId={colourId} /></button>)}</div>
          <div className="gal-main">
            <div ref={stripRef} className="gal-strip" onScroll={(e) => { const el = e.currentTarget; setShot(Math.round(el.scrollLeft / el.clientWidth)); }}>
              {gallery.map((i) => (
                <div key={i} className={'gal-slide' + (zoom && shot === i ? ' zoomed' : '')} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`); }} style={zoom && shot === i ? ({ ['--zoom-pos' as string]: pos } as React.CSSProperties) : undefined}>
                  <Photo p={p} index={i} ratio="4 / 5" priority={i === 0} colourId={colourId} />
                </div>
              ))}
            </div>
            <div className="gal-bar"><span className="lbl">{p.images[shot] && (!p.imageColour || p.imageColour === colourId) ? (p.shots[shot] ?? 'Photograph') : 'Illustrated preview · photography coming soon'}</span><span className="lbl">{String(shot + 1).padStart(2, '0')} / {String(shots).padStart(2, '0')}</span>
              <button type="button" className="lbl ulink gal-zoom" onClick={() => setZoom((z) => !z)} aria-pressed={zoom}><ZoomIn size={14} aria-hidden="true" /> {zoom ? 'Zoom out' : 'Zoom'}</button></div>
          </div>
        </div>

        <div className="buy">
          <span className="lbl muted">{p.category} · {p.detail}</span>
          <h1 className="h1">{p.name}</h1>
          <span className="muted small">{p.type}</span>
          <div className="buy-price"><PriceTag p={p} /><a className="rating" href="#reviews"><Stars value={p.rating} /> {p.rating.toFixed(1)} · {p.reviewCount + mine.length} reviews</a></div>
          <span className="muted small">Inclusive of all taxes{discountPercent(p) ? ` · You save ${inr(p.originalPrice - p.price)}` : ''} · Demonstration pricing</span>

          <div className="opt"><span className="lbl">Colour · <b>{colour.name}</b></span>
            <div className="swatches" role="radiogroup" aria-label="Colour">{p.colours.map((c) => <button key={c.id} type="button" role="radio" aria-checked={c.id === colourId} aria-label={c.name} className={c.id === colourId ? 'on' : ''} style={{ ['--sw' as string]: c.hex } as React.CSSProperties} onClick={() => { setColour(c.id); setError(''); if (size && sizeStock(p, c.id, size) <= 0) { setSize(''); setError(`Size ${size} is sold out in ${c.name}. Please choose another size.`); } }} />)}</div></div>

          <div className="opt"><div className="opt-head"><span className="lbl">Size</span><button type="button" className="lbl ulink" onClick={() => setGuide(true)}>Size guide</button></div>
            <div className="sizes" role="radiogroup" aria-label="Size">{p.sizes.map((s) => { const n = sizeStock(p, colourId, s); return <button key={s} type="button" role="radio" aria-checked={size === s} disabled={n <= 0} className={size === s ? 'on' : ''} onClick={() => { setSize(s); setError(''); setQty(1); }}>{s}{n <= 0 && <span className="sr"> sold out</span>}</button>; })}</div>
            <span className={'stock' + (size && left > 0 && left <= 3 ? ' low' : '')} role="status">{stockText}{inBag > 0 ? ` · ${inBag} in your bag` : ''}</span></div>

          <div className="buy-actions" ref={buyRef}>
            <div className="qty" role="group" aria-label="Quantity"><button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))}><Minus size={14} /></button><span>{qty}</span><button type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(Math.max(left, 1), qty + 1))}><Plus size={14} /></button></div>
            <button type="button" className={'btn btn--dark btn--wide' + (added ? ' is-added' : '')} onClick={add}>{size && left <= 0 ? 'Sold out' : added ? 'Added ✓' : 'Add to bag'}</button>
            <WishButton id={p.id} name={p.name} />
          </div>
          {error && <p className="err" role="alert">{error}</p>}
          <button type="button" className="btn btn--ghost btn--block" onClick={() => { if (add()) go('/checkout'); }}>Buy now</button>

          <div className="delivery"><span className="lbl">Delivery to</span>
            <div className="field-row"><input inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} placeholder="6-digit PIN code" aria-label="PIN code" /><button type="button" className="btn btn--ghost" onClick={checkPin}>Check</button></div>
            {pinMsg && <span className="small" role="status">{pinMsg}</span>}
            <span className="muted small">Complimentary delivery above {inr(FREE_SHIPPING_ABOVE)} · {RETURN_WINDOW_DAYS}-day exchanges on unworn pieces.</span></div>

          <div className="accs">
            <Section title="Description" open><p>{p.description}</p><ul className="ticks">{p.features.map((f) => <li key={f}>{f}</li>)}</ul></Section>
            <Section title="Fabric &amp; care"><p>{p.fabric}</p></Section>
            <Section title="Fit"><p>{p.fit}</p></Section>
            <Section title="Delivery &amp; returns"><p>Standard delivery takes 3–5 working days. Exchanges and returns are accepted within {RETURN_WINDOW_DAYS} days of delivery on unworn pieces with tags. Pickup from your door.</p></Section>
          </div>
        </div>
      </div>

      <section id="reviews" className="pl-wrap reviews">
        <div className="rev-sum"><span className="lbl">Reviews</span><b className="rev-big">{p.rating.toFixed(1)}</b><Stars value={p.rating} /><span className="muted small">From {p.reviewCount + mine.length} verified buyers</span>
          <button type="button" className="btn btn--ghost" onClick={() => setRv({ ...rv, open: !rv.open })}>Write a review</button></div>
        <div className="rev-list">
          {rv.open && (
            <form className="rev-form" onSubmit={(e) => { e.preventDefault(); if (!rv.name.trim() || rv.text.trim().length < 10) { say('Add your name and at least 10 characters.'); return; } addReview({ productId: p.id, name: rv.name.trim(), rating: rv.rating, text: rv.text.trim(), size: size || 'M', fit: 'True to size' }); setRv({ name: rv.name, rating: 5, text: '', open: false }); }}>
              <label>Name<input value={rv.name} onChange={(e) => setRv({ ...rv, name: e.target.value })} /></label>
              <label>Rating<select value={rv.rating} onChange={(e) => setRv({ ...rv, rating: Number(e.target.value) })}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} stars</option>)}</select></label>
              <label>Your review<textarea rows={3} value={rv.text} onChange={(e) => setRv({ ...rv, text: e.target.value })} placeholder="Fit, fabric and how it wears after washing." /></label>
              <button className="btn btn--dark" type="submit">Submit review</button>
            </form>
          )}
          {mine.map((r) => <article key={r.id} className="rev"><Stars value={r.rating} /><b>{r.name}</b><span className="muted small">Verified buyer · Size {r.size}</span><p>{r.text}</p></article>)}
          {SAMPLE_REVIEWS.map((r) => <article key={r.name} className="rev"><Stars value={r.rating} /><b>{r.name}</b><span className="muted small">Sample review · Size {r.size} · {colour.name} · {r.fit}</span><p>{r.text}</p></article>)}
        </div>
      </section>

      <section className="pl-wrap sec stack-40"><h2 className="h2">Complete the look</h2><div className="grid grid--4">{related.map((x) => <ProductCard key={x.id} p={x} />)}</div></section>

      <div className={'sticky-atc' + (sticky ? ' show' : '')} aria-hidden={!sticky}>
        <div><b>{p.name}</b><span className="muted small">{inr(p.price)}{size ? ` · ${size}` : ''}</span></div>
        <button type="button" className="btn btn--dark" tabIndex={sticky ? 0 : -1} onClick={() => { if (!size) { buyRef.current?.scrollIntoView({ behavior: 'smooth' }); setError('Please choose a size.'); } else add(); }}>{size ? 'Add to bag' : 'Select size'}</button>
      </div>

      {guide && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Size guide" onClick={() => setGuide(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head"><span className="lbl">Size guide · {p.gender === 'men' ? 'Men' : 'Women'}</span><button className="ico" type="button" onClick={() => setGuide(false)} aria-label="Close size guide"><X size={20} strokeWidth={1.4} /></button></div>
            <table className="tbl"><tbody>{GUIDE[p.gender].map((row, i) => <tr key={i}>{row.map((c, j) => (i === 0 ? <th key={j}>{c}</th> : <td key={j}>{c}</td>))}</tr>)}</tbody></table>
            <p className="muted small">Measurements are body measurements. Between sizes, take the larger for a relaxed fit.</p>
          </div>
        </div>
      )}
    </div>
  );
}
