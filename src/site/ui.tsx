import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Heart, Menu, Search, ShoppingBag, Star, User, X } from 'lucide-react';
import { discountPercent, FREE_SHIPPING_ABOVE, inr, RETURN_WINDOW_DAYS, sizeStock, totalStock, type Product } from './catalog';
import { go, Link } from './router';
import { useStore } from './store';

export const LOGO = '/plutonic-logo-transparent.svg';

function isDark(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) < 140;
}

/** Product photograph, or the approved design's tonal placeholder when none exists yet. */
export function Photo({ p, index = 0, ratio = '4 / 5', priority = false, className = '', children }: {
  p: Product; index?: number; ratio?: string; priority?: boolean; className?: string; children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const src = p.images[index] ?? (index > 0 ? undefined : p.images[0]);
  const tone = p.tone;
  const showImg = src && !failed;
  return (
    <div className={'ph ' + className} style={{ aspectRatio: ratio, background: tone }}>
      {showImg ? (
        <img src={src} alt={`${p.name}, ${p.shots[index] ?? 'product photograph'}`} loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="ph-cap" style={{ color: isDark(tone) ? '#85837E' : '#2B2A28' }}>{p.shots[index] ?? 'Packshot'}</span>
      )}
      {children}
    </div>
  );
}

export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} strokeWidth={1.4} fill={i <= Math.round(value) ? 'currentColor' : 'none'} aria-hidden="true" />)}
    </span>
  );
}

export function PriceTag({ p }: { p: Product }) {
  const off = discountPercent(p);
  return (
    <span className="price">
      <b>{inr(p.price)}</b>
      {off > 0 && <><s>{inr(p.originalPrice)}</s><em>{off}% off</em></>}
    </span>
  );
}

export function WishButton({ id, name }: { id: string; name: string }) {
  const { isWished, toggleWish, say } = useStore();
  const on = isWished(id);
  return (
    <button type="button" className={'wish' + (on ? ' on' : '')} aria-pressed={on} aria-label={(on ? 'Remove from wishlist: ' : 'Save to wishlist: ') + name}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleWish(id); say(on ? 'Removed from wishlist' : 'Saved to wishlist'); }}>
      <Heart size={18} strokeWidth={1.4} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export function ProductCard({ p, ratio = '4 / 5', priority = false, showQuick = true, tag }: { p: Product; ratio?: string; priority?: boolean; showQuick?: boolean; tag?: string }) {
  const { addToCart, say } = useStore();
  const out = totalStock(p) === 0;
  const colourId = p.colours.find((c) => p.sizes.some((s) => sizeStock(p, c.id, s) > 0))?.id ?? p.colours[0].id;
  return (
    <article className="card">
      <Link to={`/product/${p.id}`} className="card-link" aria-label={`${p.name}, ${inr(p.price)}`}>
        <Photo p={p} ratio={ratio} priority={priority}>
          {out ? <span className="badge badge--out">Sold out</span> : p.isNew ? <span className="badge">New</span> : tag ? <span className="badge">{tag}</span> : null}
        </Photo>
      </Link>
      <WishButton id={p.id} name={p.name} />
      {showQuick && !out && (
        <div className="quick" role="group" aria-label={`Quick add ${p.name}`}>
          <span className="lbl">Quick add</span>
          <div>
            {p.sizes.map((s) => {
              const n = sizeStock(p, colourId, s);
              return <button key={s} type="button" disabled={n <= 0} onClick={() => { const r = addToCart(p, colourId, s, 1); say(r.message); }}>{s}</button>;
            })}
          </div>
        </div>
      )}
      <Link to={`/product/${p.id}`} className="card-meta">
        <span className="card-top"><span className="card-n">{p.name}</span><PriceTag p={p} /></span>
        <span className="card-d">{p.detail} · {p.colours.length} colour{p.colours.length > 1 ? 's' : ''}</span>
      </Link>
    </article>
  );
}

const NAV = [{ to: '/men', label: 'Men' }, { to: '/women', label: 'Women' }, { to: '/shop?sort=new', label: 'New arrivals' }, { to: '/about', label: 'About' }];

function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { products } = useStore();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => [p.name, p.type, p.category, p.gender, p.detail].join(' ').toLowerCase().includes(t)).slice(0, 8);
  }, [q, products]);
  const submit = () => { if (q.trim()) { go('/shop?q=' + encodeURIComponent(q.trim())); onClose(); } };
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Search">
      <div className="overlay-bar pl-wrap">
        <Search size={20} strokeWidth={1.4} aria-hidden="true" />
        <input ref={ref} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Search pieces, e.g. leggings, hoodie" aria-label="Search pieces" />
        <button type="button" className="ico" onClick={onClose} aria-label="Close search"><X size={20} strokeWidth={1.4} /></button>
      </div>
      <div className="pl-wrap overlay-body">
        {q.trim() && !results.length && <p className="muted">No pieces match “{q}”. Try “tee”, “short” or “bra”.</p>}
        {results.map((p) => (
          <Link key={p.id} to={`/product/${p.id}`} className="result" onClick={onClose}>
            <Photo p={p} ratio="4 / 5" className="result-img" /><span><b>{p.name}</b><small>{p.gender === 'men' ? 'Men' : 'Women'} · {p.category}</small></span><span>{inr(p.price)}</span>
          </Link>
        ))}
        {q.trim() && results.length > 0 && <button type="button" className="btn btn--ghost" onClick={submit}>See all results</button>}
      </div>
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { user, cartCount, wishlist } = useStore();
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); document.body.style.overflow = 'hidden'; return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; }; }, [onClose]);
  const items = [...NAV, { to: '/wishlist', label: `Wishlist (${wishlist.length})` }, { to: '/cart', label: `Bag (${cartCount})` }, { to: '/account', label: user ? 'My account' : 'Sign in' }, { to: '/tracking', label: 'Track an order' }, { to: '/support', label: 'Support' }];
  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="drawer-head"><img src={LOGO} alt="PLUTONIC" height={44} /><button type="button" className="ico" onClick={onClose} aria-label="Close menu"><X size={22} strokeWidth={1.4} /></button></div>
      <nav className="drawer-nav" aria-label="Mobile">
        {items.map((i) => <Link key={i.to} to={i.to} onClick={onClose}>{i.label}</Link>)}
      </nav>
    </div>
  );
}

export function Header({ current }: { current?: string }) {
  const { cartCount, wishlist } = useStore();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="announce" role="note">Complimentary delivery on orders above {inr(FREE_SHIPPING_ABOVE)} · {RETURN_WINDOW_DAYS}-day exchanges</div>
      <header className="hdr">
        <div className="pl-wrap hdr-in">
          <button type="button" className="ico hdr-burger" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} strokeWidth={1.4} /></button>
          <nav aria-label="Primary" className="hdr-nav">
            {NAV.map((n) => <Link key={n.to} className="lbl" to={n.to} aria-current={current === n.to ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <Link to="/" className="hdr-logo" aria-label="PLUTONIC home"><img src={LOGO} alt="PLUTONIC" /></Link>
          <div className="hdr-actions">
            <button type="button" className="ico" onClick={() => setSearch(true)} aria-label="Search"><Search size={20} strokeWidth={1.4} /></button>
            <Link className="ico hdr-hide" to="/account" aria-label="Account"><User size={20} strokeWidth={1.4} /></Link>
            <Link className="ico hdr-hide" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved`}><Heart size={20} strokeWidth={1.4} />{wishlist.length > 0 && <i className="dot" />}</Link>
            <Link className="ico" to="/cart" aria-label={`Bag, ${cartCount} items`}><ShoppingBag size={20} strokeWidth={1.4} />{cartCount > 0 && <i className="count">{cartCount}</i>}</Link>
          </div>
        </div>
      </header>
      {search && <SearchOverlay onClose={() => setSearch(false)} />}
      {menu && <MobileMenu onClose={() => setMenu(false)} />}
    </>
  );
}

export function Footer({ onGateway }: { onGateway?: () => void }) {
  return (
    <footer className="ftr">
      <div className="pl-wrap ftr-in">
        <img src={LOGO} alt="PLUTONIC" className="ftr-logo" />
        <div className="ftr-cols">
          <div><span className="lbl">Shop</span><Link to="/men">Men</Link><Link to="/women">Women</Link><Link to="/shop?sort=new">New arrivals</Link><Link to="/wishlist">Wishlist</Link></div>
          <div><span className="lbl">Help</span><Link to="/tracking">Track an order</Link><Link to="/returns">Returns &amp; exchanges</Link><Link to="/support">Shipping</Link><Link to="/support">Contact us</Link></div>
          <div><span className="lbl">PLUTONIC</span><Link to="/about">Our story</Link><Link to="/support">Size guide</Link><Link to="/support">Privacy</Link><Link to="/support">Terms</Link>{onGateway && <button type="button" className="linkbtn" onClick={onGateway}>Choose a collection</button>}</div>
        </div>
        <div className="ftr-base"><span>© PLUTONIC. Beyond the ordinary.</span><span>India · ₹ INR · English</span></div>
        <p className="ftr-demo">Demonstration storefront: products, prices and stock are sample data, not live PLUTONIC inventory.</p>
      </div>
    </footer>
  );
}

export function Toast() {
  const { toast } = useStore();
  return toast ? <div className="toast" role="status" aria-live="polite">{toast}</div> : null;
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((i, n) => <span key={i.label}>{i.to ? <Link to={i.to}>{i.label}</Link> : <span aria-current="page">{i.label}</span>}{n < items.length - 1 && <i> / </i>}</span>)}
    </nav>
  );
}
