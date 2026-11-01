import { Link } from '../router';
import { CATEGORIES, inr, type Gender } from '../catalog';
import { useStore } from '../store';
import { Photo, ProductCard } from '../ui';

/** Men's (dark) and women's (ivory) collection landing pages. */
export default function Collection({ gender }: { gender: Gender }) {
  const { products } = useStore();
  const mine = products.filter((p) => p.gender === gender);
  const men = gender === 'men';
  const by = (cats: string[]) => mine.filter((p) => cats.includes(p.category));
  const tees = by(['T-shirts', 'Oversized tees', 'Tank tops', 'Compression', 'Training tops']).slice(0, 4);
  const bottoms = by(['Gym shorts', 'Joggers', 'Leggings']).slice(0, 4);
  const layers = by(['Hoodies', 'Jackets', 'Sets']).slice(0, 2);
  const bras = mine.filter((p) => p.support).slice(0, 3);
  const leggings = mine.filter((p) => p.category === 'Leggings');

  return (
    <>
      {men ? (
        <section className="camp camp--men">
          <img src="/images/banners/men-campaign-studio.webp" alt="" fetchPriority="high" decoding="async" />
          <span className="hero-shade" />
          <div className="pl-wrap camp-copy"><span className="lbl">Men · Season 01</span><h1>Weight where<br />it matters.</h1><p>Heavyweight jersey, firm compression and joggers cut like trousers. Built to be worn hard and look composed.</p></div>
        </section>
      ) : (
        <section className="camp-wrap sec--dark"><div className="pl-wrap camp camp--women">
          <div className="camp-copy">
            <span className="lbl muted">Women · Season 01</span><h1>Line,<br />length,<br />ease.</h1>
            <p className="muted">Second-skin knits that hold without squeezing, and layers that leave the studio with you.</p>
            <div className="row-gap"><Link className="btn btn--dark" to="/shop?g=women">Shop the edit</Link><a className="btn btn--ghost" href="#bras" onClick={(e) => { e.preventDefault(); document.getElementById('bras')?.scrollIntoView({ behavior: 'smooth' }); }}>Find your bra</a></div>
          </div>
          <div className="camp-art"><div className="ph" style={{ minHeight: 640, background: '#6B675F' }}><img src="/images/banners/women-campaign-milan.webp" alt="Woman in a pale blue coat in a stone square" fetchPriority="high" decoding="async" /></div></div>
        </div></section>
      )}

      <nav className={'rail' + (men ? '' : ' sec--dark')} aria-label={`${men ? "Men's" : "Women's"} categories`}><div className="pl-wrap rail-in">
        <Link className="lbl" to={`/shop?g=${gender}`}>All</Link>
        {CATEGORIES[gender].map((c) => <Link key={c} className="lbl" to={`/shop?g=${gender}&cat=${encodeURIComponent(c)}`}>{c}</Link>)}
      </div></nav>

      <section className="sec"><div className="pl-wrap stack-40">
        <div><span className="lbl muted">01 · {men ? 'T-shirts & oversized' : 'Tops & tees'}</span><h2 className="h2">{men ? 'The everyday uniform' : 'Pieces that work together'}</h2></div>
        <div className="grid grid--4">{tees.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 2} />)}</div>
      </div></section>

      <section className={'sec ' + (men ? 'sec--ivory' : 'sec--stone')}><div className="pl-wrap stack-40">
        <div className="sec-head"><div><span className="lbl muted">02 · {men ? 'Shorts & joggers' : 'Leggings & shorts'}</span><h2 className="h2">{men ? 'Cut for movement, finished like tailoring' : 'The full-length line'}</h2></div><Link className="lbl ulink" to={`/shop?g=${gender}&cat=${men ? 'Joggers' : 'Leggings'}`}>Shop bottoms</Link></div>
        <div className="grid grid--4">{bottoms.map((p) => <ProductCard key={p.id} p={p} ratio="3 / 4" />)}</div>
      </div></section>

      {!men && bras.length > 0 && (
        <section id="bras" className="sec sec--charcoal"><div className="pl-wrap stack-40">
          <div className="sec-head"><div><span className="lbl muted">Sports bras</span><h2 className="h2">Choose by support, not by guesswork</h2></div><Link className="lbl ulink" to="/support#size-guide">Bra size guide</Link></div>
          <div className="grid grid--3">{bras.map((p) => (
            <Link key={p.id} to={`/product/${p.id}`} className="support-card">
              <Photo p={p} ratio="4 / 5" />
              <span className="meter" aria-label={`Support level ${p.support}`}>{[0, 1, 2].map((i) => <i key={i} className={i <= (['low', 'medium', 'high'] as const).indexOf(p.support!) ? 'on' : ''} />)}</span>
              <b>{p.name} · {p.support![0].toUpperCase() + p.support!.slice(1)} support</b><span className="muted">{p.detail} · {inr(p.price)}</span>
            </Link>))}</div>
        </div></section>
      )}

      {!men && leggings.length > 0 && (
        <section className="sec"><div className="pl-wrap fabrics">
          <Photo p={leggings[0]} ratio="4 / 5" />
          <div className="stack-24"><span className="lbl muted">Leggings</span><h2 className="h2">Three fabrics. One that’s yours.</h2>
            <ul className="fabric-list">{[['Sculpt', 'Firm, matte, holds the line. Strength and studio.', 'Sculpt'], ['Soft', 'Brushed and buttery. Yoga, travel, rest days.', 'Soft'], ['Run', 'Light and quick-drying, with a zip pocket at the back.', 'Run']].map(([n, d, f]) => <li key={n}><Link to={`/shop?g=women&fabric=${f}`}><span><b>{n}</b><span className="muted">{d}</span></span><span>→</span></Link></li>)}</ul>
            <span className="muted small">All in 7/8 and full length · XS–XXL</span></div>
        </div></section>
      )}

      {layers.length > 0 && (
        <section className="sec"><div className="pl-wrap layers">
          <div className="stack-24"><span className="lbl muted">03 · {men ? 'Hoodies & outer layers' : 'Jackets & sets'}</span><h2 className="h2">{men ? 'For the walk in, and the walk home' : 'Layers that leave the studio with you'}</h2><p className="body muted">{men ? 'Brushed loopback, a structured hood and a shell that packs into its own pocket.' : 'A packable shell and a seamless set, cut to move.'}</p><Link className="btn btn--ghost" to={`/shop?g=${gender}&cat=${men ? 'Hoodies' : 'Jackets'}`}>Shop layers</Link></div>
          {layers.map((p) => <ProductCard key={p.id} p={p} />)}
        </div></section>
      )}

      <section className="sec sec--charcoal"><div className="pl-wrap stack-40">
        <div className="sec-head"><div><span className="lbl muted">All {men ? "men's" : "women's"} · {mine.length} pieces</span><h2 className="h2">The full line</h2></div><Link className="btn btn--light" to={`/shop?g=${gender}`}>Filter &amp; sort</Link></div>
        <div className="grid grid--5">{mine.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      </div></section>
    </>
  );
}
