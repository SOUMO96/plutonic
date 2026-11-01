import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Heart, Menu, Search, ShoppingBag, Star, User, X } from 'lucide-react';
import { discountPercent, FREE_SHIPPING_ABOVE, inr, RETURN_WINDOW_DAYS, sizeStock, totalStock, type Product } from './catalog';
import { go, Link, useRoute } from './router';
import { GarmentArt, garmentFor } from './garments';
import { useStore } from './store';

export const LOGO = '/plutonic-logo-transparent.svg';

function lum(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

const VIEW_LABEL = ['Front', 'Back', 'Detail · upper', 'Detail · lower'];

/**
 * Product photograph when one exists for the selected colour; otherwise an original garment
 * illustration drawn in that colour (clearly labelled), never an unrelated photograph.
 */
export function Photo({ p, index = 0, ratio = '4 / 5', priority = false, className = '', colourId, children }: {
  p: Product; index?: number; ratio?: string; priority?: boolean; className?: string; colourId?: string; children?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const colour = p.colours.find((c) => c.id === colourId) ?? p.colours[0];
  const src = p.images[index] ?? (index > 0 ? undefined : p.images[0]);
  const photoMatches = !p.imageColour || p.imageColour === colour.id;
  const showImg = !!src && !failed && photoMatches;
  const l = lum(colour.hex);
  const bg = l < 0.35 ? '#CFCAC0' : '#2C2C2B';
  return (
    <div className={'ph ' + className} style={{ aspectRatio: ratio, background: showImg ? p.tone : bg }}>
      {showImg ? (
        <img src={src} alt={`${p.name}, ${p.shots[index] ?? 'product photograph'}`} loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'} decoding="async" onError={() => setFailed(true)} />
      ) : (
        <>
          <GarmentArt kind={garmentFor(p.category)} colour={colour.hex} view={index} />
          <span className="ph-cap" style={{ color: l < 0.35 ? '#5E5C58' : '#85837E' }}>Illustration · {(VIEW_LABEL[index] ?? 'View').toLowerCase()} · {colour.name}</span>
        </>
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
  const firstAvailable = p.colours.find((c) => p.sizes.some((s) => sizeStock(p, c.id, s) > 0))?.id ?? p.colours[0].id;
  const [colourId, setColourId] = useState(firstAvailable);
  const colour = p.colours.find((c) => c.id === colourId) ?? p.colours[0];
  return (
    <article className="card">
      <Link to={`/product/${p.id}`} className="card-link" aria-label={`${p.name}, ${inr(p.price)}`}>
        <Photo p={p} ratio={ratio} priority={priority} colourId={colourId}>
          {out ? <span className="badge badge--out">Sold out</span> : p.isNew ? <span className="badge">New</span> : tag ? <span className="badge">{tag}</span> : null}
        </Photo>
      </Link>
      <WishButton id={p.id} name={p.name} />
      {showQuick && !out && (
        <div className="quick" role="group" aria-label={`Quick add ${p.name}`}>
          <div className="quick-row"><span className="lbl">Colour · <b>{colour.name}</b></span>
            <span className="quick-sw">{p.colours.map((c) => <button key={c.id} type="button" aria-label={c.name} aria-pressed={c.id === colourId} className={c.id === colourId ? 'on' : ''} style={{ ['--sw' as string]: c.hex } as React.CSSProperties} onClick={() => setColourId(c.id)} />)}</span></div>
          <span className="lbl">Quick add · size</span>
          <div className="quick-sizes">
            {p.sizes.map((s) => {
              const n = sizeStock(p, colourId, s);
              return <button key={s} type="button" className={n <= 0 ? 'sold' : undefined} title={n <= 0 ? 'Out of stock' : undefined} onClick={() => { if (n <= 0) { say(`Size ${s} is out of stock in ${colour.name}. Open the piece to save it to your wishlist.`); return; } const r = addToCart(p, colourId, s, 1); say(r.ok ? `${p.name} · ${colour.name} · ${s} added to your bag` : r.message); }}>{s}</button>;
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

const NAV = [{ to: '/men', label: 'Men' }, { to: '/women', label: 'Women' }, { to: '/shop?new=1', label: 'New arrivals' }, { to: '/shop', label: 'Shop all' }];

/** Compact header search: opens in place, focuses itself, Enter opens results, Escape or an outside click closes it. */
function HeaderSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { products } = useStore();
  const route = useRoute();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setQ(route.path === '/shop' ? route.query.get('q') ?? '' : '');
    window.setTimeout(() => ref.current?.focus(), 30);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const click = (e: MouseEvent) => { const t = e.target as Node; if (box.current && !box.current.contains(t) && !(t as HTMLElement).closest?.('[data-search-toggle]')) onClose(); };
    window.addEventListener('keydown', key); document.addEventListener('mousedown', click);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('mousedown', click); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return products.filter((p) => [p.name, p.type, p.category, p.gender === 'men' ? 'men mens' : 'women womens', p.detail, p.fabric].join(' ').toLowerCase().includes(t));
  }, [q, products]);
  const submit = () => { const t = q.trim(); if (t) { go('/shop?q=' + encodeURIComponent(t)); onClose(); } };
  return (
    <div ref={box} className={'searchbar' + (open ? ' open' : '')} role="search" aria-hidden={!open}>
      <div className="pl-wrap searchbar-in">
        <Search size={18} strokeWidth={1.4} aria-hidden="true" />
        <input ref={ref} value={q} tabIndex={open ? 0 : -1} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="Search pieces, e.g. leggings, hoodie, men" aria-label="Search pieces" enterKeyHint="search" />
        <button type="button" className="ico" tabIndex={open ? 0 : -1} onClick={onClose} aria-label="Close search"><X size={18} strokeWidth={1.4} /></button>
      </div>
      {open && q.trim() && (
        <div className="pl-wrap searchbar-res">
          {results.length === 0 && <p className="muted small" role="status">No pieces match “{q.trim()}”. Try “tee”, “short” or “bra”, or <Link to="/shop" onClick={onClose} className="ulink">browse everything</Link>.</p>}
          {results.slice(0, 5).map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="result" onClick={onClose}>
              <Photo p={p} ratio="4 / 5" className="result-img" /><span><b>{p.name}</b><small>{p.gender === 'men' ? 'Men' : 'Women'} · {p.category}</small></span><span>{inr(p.price)}</span>
            </Link>
          ))}
          {results.length > 0 && <button type="button" className="btn btn--ghost btn--sm" onClick={submit}>See all {results.length} result{results.length > 1 ? 's' : ''}</button>}
        </div>
      )}
    </div>
  );
}

function MobileMenu({ onClose }: { onClose: () => void }) {
  const { user, cartCount, wishlist } = useStore();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k); document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  const items = [...NAV, { to: '/wishlist', label: `Wishlist (${wishlist.length})` }, { to: '/cart', label: `Bag (${cartCount})` }, { to: '/account', label: user ? 'My account' : 'Sign in' }, { to: '/tracking', label: 'Track an order' }, { to: '/about', label: 'About' }, { to: '/support', label: 'Support' }];
  return (
    <div className={'drawer' + (shown ? ' open' : '')} role="dialog" aria-modal="true" aria-label="Menu">
      <div className="drawer-head"><img src={LOGO} alt="PLUTONIC" height={44} /><button type="button" className="ico" onClick={onClose} aria-label="Close menu"><X size={22} strokeWidth={1.4} /></button></div>
      <nav className="drawer-nav" aria-label="Mobile">
        {items.map((i, n) => <Link key={i.to + n} to={i.to} onClick={onClose} style={{ ['--i' as string]: n } as React.CSSProperties}>{i.label}</Link>)}
      </nav>
    </div>
  );
}

export function Header() {
  const { cartCount, wishlist } = useStore();
  const route = useRoute();
  const [search, setSearch] = useState(false);
  const [menu, setMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const on = () => setScrolled(window.scrollY > 8); on(); window.addEventListener('scroll', on, { passive: true }); return () => window.removeEventListener('scroll', on); }, []);
  const active = (to: string) => {
    const [path, qs] = to.split('?');
    if (path !== route.path) return false;
    if (path === '/shop') return qs ? route.query.get('new') === '1' : route.query.get('new') !== '1';
    return true;
  };
  return (
    <>
      <div className="announce" role="note">Complimentary delivery on orders above {inr(FREE_SHIPPING_ABOVE)} · {RETURN_WINDOW_DAYS}-day exchanges</div>
      <header className={'hdr' + (scrolled ? ' scrolled' : '')}>
        <div className="pl-wrap hdr-in">
          <button type="button" className="ico hdr-burger" onClick={() => setMenu(true)} aria-label="Open menu"><Menu size={22} strokeWidth={1.4} /></button>
          <nav aria-label="Primary" className="hdr-nav">
            {NAV.map((n) => <Link key={n.to} className="lbl" to={n.to} aria-current={active(n.to) ? 'page' : undefined}>{n.label}</Link>)}
          </nav>
          <Link to="/" className="hdr-logo" aria-label="PLUTONIC home"><img src={LOGO} alt="PLUTONIC" /></Link>
          <div className="hdr-actions">
            <button type="button" className="ico" data-search-toggle onClick={() => setSearch((s) => !s)} aria-label="Search" aria-expanded={search}><Search size={20} strokeWidth={1.4} /></button>
            <Link className="ico hdr-hide" to="/account" aria-label="Account"><User size={20} strokeWidth={1.4} /></Link>
            <Link className="ico hdr-hide" to="/wishlist" aria-label={`Wishlist, ${wishlist.length} saved`}><Heart size={20} strokeWidth={1.4} />{wishlist.length > 0 && <i className="dot" />}</Link>
            <Link className="ico" to="/cart" aria-label={`Bag, ${cartCount} items`}><ShoppingBag size={20} strokeWidth={1.4} />{cartCount > 0 && <i key={cartCount} className="count bump">{cartCount}</i>}</Link>
          </div>
        </div>
        <HeaderSearch open={search} onClose={() => setSearch(false)} />
      </header>
      {menu && <MobileMenu onClose={() => setMenu(false)} />}
    </>
  );
}

export function Footer({ onReplayIntro }: { onReplayIntro?: () => void }) {
  return (
    <footer className="ftr">
      <div className="pl-wrap ftr-in">
        <img src={LOGO} alt="PLUTONIC" className="ftr-logo" />
        <div className="ftr-cols">
          <div><span className="lbl">Shop</span><Link to="/men">Men</Link><Link to="/women">Women</Link><Link to="/shop?new=1">New arrivals</Link><Link to="/shop">Shop all</Link><Link to="/wishlist">Wishlist</Link></div>
          <div><span className="lbl">Help</span><Link to="/tracking">Track an order</Link><Link to="/account?tab=orders">Returns &amp; exchanges</Link><Link to="/support">Shipping</Link><Link to="/support">Contact us</Link></div>
          <div><span className="lbl">PLUTONIC</span><Link to="/about">Our story</Link><Link to="/support">Size guide</Link><Link to="/support">Privacy</Link><Link to="/support">Terms</Link>{onReplayIntro && <button type="button" className="linkbtn" onClick={onReplayIntro}>Replay the welcome film</button>}</div>
        </div>
        <div className="ftr-base"><span>© PLUTONIC. Beyond the ordinary.</span><span>India · ₹ INR · English</span></div>
        <p className="ftr-demo">Demonstration storefront: products, prices and stock are sample data, and payments and orders are simulated.</p>
      </div>
    </footer>
  );
}

export function Toast() {
  const { toast } = useStore();
  return toast ? <div key={toast} className="toast" role="status" aria-live="polite">{toast}</div> : null;
}

export function Crumbs({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((i, n) => <span key={i.label}>{i.to ? <Link to={i.to}>{i.label}</Link> : <span aria-current="page">{i.label}</span>}{n < items.length - 1 && <i> / </i>}</span>)}
    </nav>
  );
}
