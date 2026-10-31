import { useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { CATEGORIES, COLOURS, inr, sizeStock, totalStock, type Product } from '../catalog';
import { go, Link, recallKey, rememberKey, type Route } from '../router';
import { useStore } from '../store';
import { Crumbs, Photo, ProductCard } from '../ui';

type F = { isnew: boolean; g: string; cat: string[]; size: string[]; colour: string[]; fabric: string[]; price: string[]; q: string; sort: string };
const PRICE: Record<string, [number, number, string]> = { u2: [0, 1999, 'Under ₹ 2,000'], m: [2000, 3000, '₹ 2,000 – 3,000'], a3: [3001, 1e9, 'Above ₹ 3,000'] };
const PAGE = 8;

function parse(q: URLSearchParams): F {
  const many = (k: string) => (q.get(k) ?? '').split(',').filter(Boolean);
  return { isnew: q.get('new') === '1', g: q.get('g') ?? '', cat: many('cat'), size: many('size'), colour: many('colour'), fabric: many('fabric'), price: many('price'), q: q.get('q') ?? '', sort: q.get('sort') ?? 'featured' };
}
function toHash(f: F) {
  const p = new URLSearchParams();
  if (f.isnew) p.set('new', '1');
  if (f.g) p.set('g', f.g);
  (['cat', 'size', 'colour', 'fabric', 'price'] as const).forEach((k) => f[k].length && p.set(k, f[k].join(',')));
  if (f.q) p.set('q', f.q);
  if (f.sort !== 'featured') p.set('sort', f.sort);
  const s = p.toString();
  return '/shop' + (s ? '?' + s : '');
}

function Filters({ f, set, all, onClear }: { f: F; set: (n: Partial<F>) => void; all: Product[]; onClear: () => void }) {
  const toggle = (k: 'cat' | 'size' | 'colour' | 'fabric' | 'price', v: string) => set({ [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] } as Partial<F>);
  const cats = f.g ? CATEGORIES[f.g as 'men' | 'women'] : [...new Set(all.map((p) => p.category))];
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const fabrics = [...new Set(all.map((p) => p.fabricGroup).filter(Boolean))] as string[];
  return (
    <div className="filters">
      <fieldset><legend className="lbl">Collection</legend>{[['', 'All'], ['men', 'Men'], ['women', 'Women']].map(([v, l]) => <label key={v} className="check"><input type="radio" name="g" checked={f.g === v} onChange={() => set({ g: v, cat: [] })} />{l}</label>)}</fieldset>
      <fieldset><legend className="lbl">Category</legend>{cats.map((c) => <label key={c} className="check"><input type="checkbox" checked={f.cat.includes(c)} onChange={() => toggle('cat', c)} />{c}</label>)}</fieldset>
      <fieldset><legend className="lbl">Size</legend><div className="chips">{sizes.map((s) => <button key={s} type="button" className={'chip' + (f.size.includes(s) ? ' on' : '')} aria-pressed={f.size.includes(s)} onClick={() => toggle('size', s)}>{s}</button>)}</div></fieldset>
      <fieldset><legend className="lbl">Colour</legend>{Object.values(COLOURS).map((c) => <label key={c.id} className="check"><input type="checkbox" checked={f.colour.includes(c.id)} onChange={() => toggle('colour', c.id)} /><i className="sw" style={{ background: c.hex }} />{c.name}</label>)}</fieldset>
      {fabrics.length > 0 && <fieldset><legend className="lbl">Fabric</legend>{fabrics.map((x) => <label key={x} className="check"><input type="checkbox" checked={f.fabric.includes(x)} onChange={() => toggle('fabric', x)} />{x}</label>)}</fieldset>}
      <fieldset><legend className="lbl">Price</legend>{Object.entries(PRICE).map(([k, v]) => <label key={k} className="check"><input type="checkbox" checked={f.price.includes(k)} onChange={() => toggle('price', k)} />{v[2]}</label>)}</fieldset>
      <button type="button" className="linkbtn" onClick={onClear}>Clear all</button>
    </div>
  );
}

export default function Listing({ route }: { route: Route }) {
  const { products, notifyMe, notified } = useStore();
  const f = useMemo(() => parse(route.query), [route.query]);
  // The URL is the single source of truth for filters; "Load more" depth is remembered per URL for back navigation.
  const [limit, setLimit] = useState(() => Math.max(PAGE, Number(recallKey('pl-limit')) || PAGE));
  const lastQuery = useRef(route.query.toString());
  const [sheet, setSheet] = useState(false);
  useEffect(() => { const q = route.query.toString(); if (q === lastQuery.current) return; lastQuery.current = q; setLimit(PAGE); }, [route.query]);
  useEffect(() => { rememberKey('pl-limit', String(limit)); }, [limit, route.query]);
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [sheet]);
  const set = (n: Partial<F>) => go(toHash({ ...f, ...n }));

  const base = products.filter((p) => !f.g || p.gender === f.g);
  const list = useMemo(() => {
    const t = f.q.trim().toLowerCase();
    let r = products.filter((p) => {
      if (f.g && p.gender !== f.g) return false;
      if (f.isnew && !p.isNew) return false;
      if (f.cat.length && !f.cat.includes(p.category)) return false;
      if (f.size.length && !f.size.some((s) => p.colours.some((c) => sizeStock(p, c.id, s) > 0))) return false;
      if (f.colour.length && !f.colour.some((c) => p.colours.some((x) => x.id === c))) return false;
      if (f.fabric.length && !(p.fabricGroup && f.fabric.includes(p.fabricGroup))) return false;
      if (f.price.length && !f.price.some((k) => p.price >= PRICE[k][0] && p.price <= PRICE[k][1])) return false;
      if (t && ![p.name, p.type, p.category, p.gender, p.detail].join(' ').toLowerCase().includes(t)) return false;
      return true;
    });
    r = [...r];
    if (f.sort === 'new') r.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    else if (f.sort === 'low') r.sort((a, b) => a.price - b.price);
    else if (f.sort === 'high') r.sort((a, b) => b.price - a.price);
    else if (f.sort === 'best') r.sort((a, b) => Number(b.bestseller) - Number(a.bestseller) || b.reviewCount - a.reviewCount);
    return r;
  }, [products, f]);

  const title = f.q ? `Results for “${f.q}”` : f.isnew ? 'New arrivals' : f.cat.length === 1 ? f.cat[0] : f.g === 'men' ? 'Men' : f.g === 'women' ? 'Women' : f.sort === 'new' ? 'New arrivals' : 'All pieces';
  const chips: [string, () => void][] = [
    ...f.cat.map((c): [string, () => void] => [c, () => set({ cat: f.cat.filter((x) => x !== c) })]),
    ...f.size.map((c): [string, () => void] => ['Size ' + c, () => set({ size: f.size.filter((x) => x !== c) })]),
    ...f.colour.map((c): [string, () => void] => [COLOURS[c]?.name ?? c, () => set({ colour: f.colour.filter((x) => x !== c) })]),
    ...f.fabric.map((c): [string, () => void] => [c, () => set({ fabric: f.fabric.filter((x) => x !== c) })]),
    ...f.price.map((c): [string, () => void] => [PRICE[c][2], () => set({ price: f.price.filter((x) => x !== c) })]),
  ];
  const clear = () => go('/shop' + (f.g ? '?g=' + f.g : f.isnew ? '?new=1' : ''));
  const shown = list.slice(0, limit);

  return (
    <div className="pl-wrap listing">
      <Crumbs items={[{ label: 'Home', to: '/' }, ...(f.g ? [{ label: f.g === 'men' ? 'Men' : 'Women', to: '/' + f.g }] : []), { label: title }]} />
      <div className="list-head">
        <h1 className="h1">{title}</h1><span className="muted">{list.length} product{list.length === 1 ? '' : 's'}</span>
        <div className="list-tools">
          <button type="button" className="btn btn--ghost list-filter-btn" onClick={() => setSheet(true)}><SlidersHorizontal size={16} strokeWidth={1.4} aria-hidden="true" /> Filters{chips.length ? ` (${chips.length})` : ''}</button>
          <label className="sortl"><span className="lbl">Sort</span><select value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="Sort products">
            <option value="featured">Featured</option><option value="new">New arrivals</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="best">Bestselling</option></select></label>
        </div>
      </div>
      {chips.length > 0 && <div className="active-chips">{chips.map(([l, rm]) => <button key={l} type="button" className="chip on" onClick={rm}>{l} <X size={12} aria-hidden="true" /><span className="sr">remove</span></button>)}<button type="button" className="linkbtn" onClick={clear}>Clear all</button></div>}
      <div className="list-body">
        <aside className="list-side" aria-label="Filters"><Filters f={f} set={set} all={base} onClear={clear} /></aside>
        <div>
          {shown.length > 0 ? (
            <div className="grid grid--3 grid--list">
              {shown.map((p, i) => totalStock(p) === 0 ? (
                <article key={p.id} className="card"><Link to={`/product/${p.id}`}><Photo p={p} ratio="3 / 4"><span className="badge badge--out">Sold out</span></Photo></Link><span className="card-top"><span className="card-n">{p.name}</span></span>
                  <button type="button" className="btn btn--ghost btn--sm" disabled={notified.includes(p.id)} onClick={() => notifyMe(p.id)}>{notified.includes(p.id) ? 'We’ll notify you' : 'Notify me when back'}</button></article>
              ) : <ProductCard key={p.id} p={p} ratio="3 / 4" priority={i < 3} />)}
            </div>
          ) : (
            <div className="empty"><span className="lbl muted">{f.q ? 'No results' : 'No matches'}</span><h2 className="h3">{f.q ? `Nothing matches “${f.q}”.` : 'Nothing fits those filters yet.'}</h2><p className="muted">{f.q ? 'Check the spelling, or try a broader word like “tee”, “short” or “bra”.' : 'Try removing a size or colour, or browse everything.'}</p><div className="row-gap"><button className="btn btn--dark" type="button" onClick={() => go('/shop')}>{f.q ? 'Browse everything' : 'Clear filters'}</button>{f.q && <><Link className="btn btn--ghost" to="/men">Shop men</Link><Link className="btn btn--ghost" to="/women">Shop women</Link></>}</div></div>
          )}
          {list.length > 0 && <div className="more"><span className="muted">Showing {shown.length} of {list.length}</span>{limit < list.length && <button type="button" className="btn btn--ghost" onClick={() => setLimit(limit + PAGE)}>Load more</button>}</div>}
        </div>
      </div>
      {sheet && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Filters">
          <div className="sheet-head"><span className="lbl">Filter &amp; sort</span><button className="ico" type="button" onClick={() => setSheet(false)} aria-label="Close filters"><X size={22} strokeWidth={1.4} /></button></div>
          <div className="sheet-body"><Filters f={f} set={set} all={base} onClear={clear} /></div>
          <div className="sheet-foot"><button type="button" className="btn btn--dark" onClick={() => setSheet(false)}>Show {list.length} product{list.length === 1 ? '' : 's'}</button><span className="muted small"></span></div>
        </div>
      )}
    </div>
  );
}
