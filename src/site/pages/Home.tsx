import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Link } from '../router';
import { useStore } from '../store';
import { GarmentArt, type Garment } from '../garments';
import { ProductCard } from '../ui';

type Art = { kind: Garment; colour: string; bg: string; view?: number };
const CATEGORY_TILES: { label: string; cat: string; g: string; cap: string; art: Art }[] = [
  { label: 'T-shirts', cat: 'T-shirts', g: 'men', cap: 'Detail · collar', art: { kind: 'tee', colour: '#1C1C1B', bg: '#CFCAC0', view: 2 } },
  { label: 'Leggings', cat: 'Leggings', g: 'women', cap: 'Detail · waistband', art: { kind: 'legging', colour: '#B8B2A7', bg: '#292929' } },
  { label: 'Sports bras', cat: 'Sports bras', g: 'women', cap: 'Detail · strap', art: { kind: 'bra', colour: '#DCD7CE', bg: '#4A4844' } },
  { label: 'Shorts', cat: 'Gym shorts', g: '', cap: 'Detail · hem', art: { kind: 'shorts', colour: '#1C1C1B', bg: '#B8B2A7' } },
  { label: 'Joggers', cat: 'Joggers', g: 'men', cap: 'Detail · cuff', art: { kind: 'jogger', colour: '#DCD7CE', bg: '#4A4844' } },
  { label: 'Hoodies & layers', cat: 'Hoodies', g: 'men', cap: 'Detail · hood', art: { kind: 'hoodie', colour: '#B8B2A7', bg: '#1C1C1B' } },
];
const EDITS: { title: string; blurb: string; to: string; cap: string; art: Art }[] = [
  { title: 'Obsidian Core', blurb: 'The black essentials. Nine pieces, endlessly combinable.', to: '/shop?colour=onyx', cap: 'Illustration · Obsidian Core', art: { kind: 'hoodie', colour: '#1C1C1B', bg: '#CFCAC0' } },
  { title: 'Sculpt', blurb: 'Second-skin knits with a matte, held finish.', to: '/shop?g=women&fabric=Sculpt', cap: 'Illustration · Sculpt', art: { kind: 'set', colour: '#B8B2A7', bg: '#292929' } },
  { title: 'After Hours', blurb: 'Brushed layers for the walk home.', to: '/shop?g=men&cat=Hoodies', cap: 'Illustration · After Hours', art: { kind: 'jacket', colour: '#DCD7CE', bg: '#1C1C1B' } },
];
const VALUES = [
  ['Restraint', 'No logos for the sake of logos. Detail you notice on the second wear.'],
  ['Precision', 'Patterns fitted on moving bodies, seams placed away from strain.'],
  ['Endurance', 'Fabrics chosen to keep their shape, colour and handle wash after wash.'],
  ['Comfort', 'Soft against skin, quiet in movement, easy to live in.'],
];

export default function Home() {
  const { products, say, user, setPrefs } = useStore();
  const [tab, setTab] = useState<'all' | 'men' | 'women'>('all');
  const [email, setEmail] = useState('');
  const fresh = products.filter((p) => p.isNew).slice(0, 4);
  const best = products.filter((p) => p.bestseller && (tab === 'all' || p.gender === tab)).slice(0, 4);

  return (
    <>
      <section className="hero">
        <Link to="/men" className="hero-pane hero-pane--men" aria-label="Shop men">
          <img src="/images/banners/men-campaign-studio.webp" alt="Man in dark tailoring against a pale studio wall" fetchPriority="high" decoding="async" />
          <span className="hero-shade" /><span className="lbl hero-tag">Men</span>
        </Link>
        <Link to="/women" className="hero-pane hero-pane--women" aria-label="Shop women">
          <img src="/images/banners/women-campaign-milan.webp" alt="Woman in a pale blue coat in a stone square" fetchPriority="high" decoding="async" />
          <span className="hero-shade" /><span className="lbl hero-tag">Women</span>
        </Link>
        <div className="hero-copy pl-wrap">
          <span className="lbl">Season 01 · The Quiet Hours</span>
          <h1>Made to move<br />quietly.</h1>
          <p>Training essentials cut like tailoring — for the session, and every hour after it.</p>
          <div className="row-gap"><Link className="btn btn--light" to="/women">Shop women</Link><Link className="btn btn--ghost-l" to="/men">Shop men</Link></div>
        </div>
      </section>

      <section className="sec">
        <div className="pl-wrap stack-40">
          <div className="sec-head"><div><span className="lbl muted">New arrivals</span><h2 className="h2">Just in, season one</h2></div><Link className="lbl ulink" to="/shop?new=1">View all</Link></div>
          <div className="grid grid--4">{fresh.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}</div>
        </div>
      </section>

      <section className="sec sec--pad0"><div className="pl-wrap split">
        <Link to="/men" className="split-tile"><div className="ph" style={{ aspectRatio: '4 / 5', background: '#2E2E2D' }}><img src="/images/banners/men-campaign-studio.webp" alt="" loading="lazy" decoding="async" /></div><span className="lbl muted">Men</span><span className="h2">Shop men <ArrowUpRight size={22} strokeWidth={1.3} aria-hidden="true" /></span><span className="body muted">Heavyweight jersey, compression and tailored joggers. Weight where it matters.</span></Link>
        <Link to="/women" className="split-tile"><div className="ph" style={{ aspectRatio: '4 / 5', background: '#A39D92' }}><img src="/images/banners/women-campaign-milan.webp" alt="" loading="lazy" decoding="async" /></div><span className="lbl muted">Women</span><span className="h2">Shop women <ArrowUpRight size={22} strokeWidth={1.3} aria-hidden="true" /></span><span className="body muted">Sculpting knits, supportive bras and layers that leave the studio with you.</span></Link>
      </div></section>

      <section className="sec sec--charcoal">
        <div className="pl-wrap stack-40">
          <div className="sec-head"><div><span className="lbl muted">Bestsellers</span><h2 className="h2">Worn most, reordered often</h2></div>
            <div className="seg" role="tablist" aria-label="Bestseller filter">{(['all', 'men', 'women'] as const).map((t) => <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{t === 'all' ? 'All' : t === 'men' ? 'Men' : 'Women'}</button>)}</div></div>
          <div className="grid grid--4">{best.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </div>
      </section>

      <section className="sec">
        <div className="pl-wrap stack-40">
          <div><span className="lbl muted">Shop by category</span><h2 className="h2">Find your essential</h2></div>
          <div className="grid grid--6">
            {CATEGORY_TILES.map((c) => (
              <Link key={c.label} to={`/shop?${c.g ? 'g=' + c.g + '&' : ''}cat=${encodeURIComponent(c.cat)}`} className="tile">
                <div className="ph" style={{ aspectRatio: '3 / 4', background: c.art.bg }}><GarmentArt kind={c.art.kind} colour={c.art.colour} view={c.art.view ?? 0} /><span className="ph-cap" style={{ color: '#85837E' }}>{c.cap}</span></div>
                <span className="lbl">{c.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec--ivory">
        <div className="pl-wrap stack-40">
          <div><span className="lbl muted">Featured collections</span><h2 className="h2">Three edits, one discipline</h2></div>
          <div className="grid grid--3">
            {EDITS.map((e) => (
              <Link key={e.title} to={e.to} className="edit">
                <div className="ph" style={{ aspectRatio: '4 / 5', background: e.art.bg }}><GarmentArt kind={e.art.kind} colour={e.art.colour} /><span className="ph-cap" style={{ color: '#85837E' }}>{e.cap}</span></div>
                <span className="lbl muted">Collection</span><span className="h3">{e.title}</span><span className="body muted">{e.blurb}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="pl-wrap philosophy">
          <div className="stack-24"><span className="lbl muted">Philosophy</span><h2 className="h2">Less, made properly. Clothing for people who train with intent and dress with care.</h2><Link className="lbl ulink" to="/about">Our story</Link></div>
          <dl className="values">{VALUES.map(([k, v]) => <div key={k}><dt className="lbl">{k}</dt><dd className="body muted">{v}</dd></div>)}</dl>
        </div>
      </section>

      <section className="sec sec--charcoal">
        <form className="pl-wrap news" onSubmit={(e) => { e.preventDefault(); if (!/^\S+@\S+\.\S+$/.test(email)) { say('Please enter a valid email address.'); return; } setPrefs({ newsletter: true }); setEmail(''); say('You are subscribed to the PLUTONIC letter.'); }}>
          <span className="lbl muted">The PLUTONIC letter</span>
          <h2 className="h2">New pieces and quiet notes, once a month.</h2>
          <div className="field-row"><label className="sr" htmlFor="nl">Email address</label><input id="nl" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" autoComplete="email" /><button className="btn btn--light" type="submit">Subscribe</button></div>
          <small className="muted">Unsubscribe in one click. We never share your address.{user ? '' : ''}</small>
        </form>
      </section>
    </>
  );
}
