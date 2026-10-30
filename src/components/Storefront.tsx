import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Heart, Search, ShoppingBag, X } from 'lucide-react';
import { products } from '../data/products';
import BrandMark from './BrandMark';

type Category = 'him' | 'her';
type Product = (typeof products)[number];

type Props = { category: Category; onChangeCategory: () => void };

export default function Storefront({ category, onChangeCategory }: Props) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [bag, setBag] = useState<Product[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [bagOpen, setBagOpen] = useState(false);
  const [notice, setNotice] = useState('');

  const collectionProducts = useMemo(() => products.filter((product) => product.category === category), [category]);
  const visibleProducts = useMemo(() => collectionProducts.filter((product) => {
    const matchesFilter = filter === 'ALL' || product.type.toUpperCase() === filter;
    const matchesQuery = product.name.toLowerCase().includes(query.toLowerCase());
    return matchesFilter && matchesQuery;
  }), [collectionProducts, filter, query]);

  const addToBag = (product: Product) => {
    setBag((items) => [...items, product]);
    setNotice(product.name + ' added to your bag');
    window.setTimeout(() => setNotice(''), 2400);
  };

  const toggleWishlist = (id: number) => {
    setWishlist((items) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id]);
  };

  const title = category === 'him' ? 'For him' : 'For her';
  const heroImage = category === 'him'
    ? 'https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&w=2200&q=90'
    : 'https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=2200&q=90';

  return (
    <main className="storefront">
      <div className="announcement">COMPLIMENTARY SHIPPING ON ORDERS ABOVE ₹2,999 <span>—</span> MADE TO MOVE WITH YOU</div>
      <header className="store-nav">
        <button className="nav-back" onClick={onChangeCategory} aria-label="Back to collections"><ArrowLeft size={17} /></button>
        <div className="store-nav-links">
          <button onClick={() => setFilter('ALL')}>NEW DROP</button>
          <button onClick={() => { setFilter('ALL'); document.getElementById('pieces')?.scrollIntoView({ behavior: 'smooth' }); }}>CLOTHING</button>
          <button onClick={() => document.getElementById('brand-note')?.scrollIntoView({ behavior: 'smooth' })}>THE POINT OF VIEW</button>
        </div>
        <button className="store-brand" onClick={onChangeCategory} aria-label="Choose another collection">
          <BrandMark size={31} />
        </button>
        <div className="store-nav-actions">
          <label className="store-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pieces" aria-label="Search pieces" />
          </label>
          <button className="bag-trigger" onClick={() => setBagOpen(true)} aria-label={`Open bag, ${bag.length} items`}>
            <ShoppingBag size={18} /><span>BAG ({bag.length})</span>
          </button>
        </div>
      </header>

      <section className="collection-hero">
        <img src={heroImage} alt="" />
        <div className="collection-hero-overlay" />
        <div className="collection-hero-top"><span>PLUTONIC / COLLECTION 001</span><span>01 — 08 / THE EVERYDAY FORM</span></div>
        <div className="collection-hero-copy">
          <p className="eyebrow">THE NEW UNIFORM</p>
          <h1>{title}<br /><em>in orbit.</em></h1>
          <p>Considered essentials. Distinct by design.</p>
          <a href="#pieces" className="outline-link">DISCOVER THE EDIT <ArrowDownRightIcon /></a>
        </div>
        <div className="collection-hero-index">P / 001</div>
      </section>

      <section className="product-section" id="pieces">
        <div className="product-heading">
          <div><p className="eyebrow">THE ROTATION / 2026</p><h2>Pieces in<br /><em>circulation.</em></h2></div>
          <p className="product-heading-note">A focused collection of silhouettes, textures and considered details. Made for wherever the day takes you.</p>
        </div>
        <div className="product-toolbar">
          <div className="filter-tabs" aria-label="Filter products">
            {['ALL', 'TOPS', 'OUTERWEAR', 'BOTTOMS'].map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
          <span>{visibleProducts.length.toString().padStart(2, '0')} PIECES</span>
        </div>
        {visibleProducts.length ? (
          <div className="product-grid">
            {visibleProducts.map((product, index) => (
              <article className="product-card" key={product.id}>
                <div className="product-image-wrap">
                  <img src={product.image} alt={product.name} loading={index > 1 ? 'lazy' : 'eager'} />
                  <span className="product-tag">{product.tag}</span>
                  <button className={'wishlist-button ' + (wishlist.includes(product.id) ? 'saved' : '')} onClick={() => toggleWishlist(product.id)} aria-label={wishlist.includes(product.id) ? 'Remove from wishlist' : 'Add to wishlist'}><Heart size={17} fill={wishlist.includes(product.id) ? 'currentColor' : 'none'} /></button>
                  <button className="quick-add" onClick={() => addToBag(product)}>ADD TO BAG <ArrowUpRight size={15} /></button>
                </div>
                <div className="product-info"><div><h3>{product.name}</h3><p>{product.detail}</p></div><strong>₹{product.price.toLocaleString('en-IN')}</strong></div>
              </article>
            ))}
          </div>
        ) : <div className="empty-results">No pieces found. Try another search.</div>}
      </section>

      <section className="brand-note" id="brand-note">
        <div className="brand-note-mark"><BrandMark size={66} /></div>
        <p className="eyebrow">A DIFFERENT POINT OF GRAVITY</p>
        <h2>Less noise.<br /><em>More presence.</em></h2>
        <p>We believe the everyday deserves intention. Form follows feeling. Detail has a purpose. Nothing is accidental.</p>
        <button onClick={onChangeCategory}>EXPLORE THE OTHER SIDE <ArrowRight size={16} /></button>
      </section>

      <footer className="store-footer">
        <div className="footer-brand"><BrandMark size={32} /></div>
        <p>BEYOND THE ORDINARY.</p>
        <div><a href="#pieces">SHOP</a><a href="#brand-note">OUR POINT OF VIEW</a><a href="mailto:hello@plutonic.example">CONTACT</a></div>
        <small>© 2026 PLUTONIC. A STUDY IN EVERYDAY FORM.</small>
      </footer>

      {notice && <div className="toast" role="status">{notice}</div>}
      {bagOpen && (
        <div className="drawer-backdrop" onClick={() => setBagOpen(false)}>
          <aside className="bag-drawer" onClick={(event) => event.stopPropagation()} aria-label="Shopping bag">
            <div className="drawer-heading"><div><p className="eyebrow">YOUR SELECTION</p><h2>Shopping bag <span>({bag.length})</span></h2></div><button onClick={() => setBagOpen(false)} aria-label="Close bag"><X /></button></div>
            {bag.length ? (
              <>
                <div className="bag-items">{bag.map((item, index) => <div className="bag-item" key={item.id + '-' + index}><img src={item.image} alt="" /><div><h3>{item.name}</h3><p>{item.detail}</p><strong>₹{item.price.toLocaleString('en-IN')}</strong></div><button onClick={() => setBag((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove item"><X size={15} /></button></div>)}</div>
                <div className="bag-total"><span>SUBTOTAL</span><strong>₹{bag.reduce((sum, item) => sum + item.price, 0).toLocaleString('en-IN')}</strong></div>
                <p className="checkout-note">This is a front-end preview. Connect your payment and order service to enable checkout.</p>
              </>
            ) : <div className="bag-empty"><ShoppingBag size={32} /><p>Your bag is waiting for something considered.</p><button onClick={() => setBagOpen(false)}>CONTINUE EXPLORING</button></div>}
          </aside>
        </div>
      )}
    </main>
  );
}

function ArrowDownRightIcon() {
  return <ArrowUpRight size={16} strokeWidth={1.5} />;
}
