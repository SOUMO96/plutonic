import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import './site.css';
import './motion.css';
import './hover.css';
import { consumePendingScroll, useRoute } from './router';
import { StoreProvider } from './store';
import { Footer, Header, Toast } from './ui';
import Home from './pages/Home';
import Collection from './pages/Collection';
import Listing from './pages/Listing';
import Product from './pages/Product';
import Cart from './pages/Cart';
import Account from './pages/Account';
import { Tracking, Wishlist, Returns } from './pages/Orders';
import { About, Support } from './pages/Info';

// Heavier, rarely-first pages are split out of the initial bundle.
const Checkout = lazy(() => import('./pages/Checkout'));
const Confirmation = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.Confirmation })));
const Admin = lazy(() => import('./pages/Admin'));

const DARK = new Set(['', 'men', 'about']);
/** Elements that ease in as they scroll into view. */
const REVEAL = '.card, .tile, .edit, .split-tile, .sec-head, .support-card, .values > div, .fabrics > *, .layers > *, .news, .philosophy > *, .about-grid > *, .help-tile, .rev, .line, .panel, .co-form section, .timeline li';

/**
 * Adds `is-in` to reveal targets once they approach the viewport. Content stays visible without JS or with
 * reduced motion, and a timer reveals anything near the viewport in case the observer never reports it.
 */
function useScrollReveal(path: string) {
  useEffect(() => {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const selector = REVEAL.split(', ').map((s) => '.pl-main ' + s).join(', ');
    const seen = new WeakSet<Element>();
    const reveal = (el: Element) => { el.classList.add('is-in'); io.unobserve(el); };
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) reveal(e.target); }), { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    const scan = () => document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      el.classList.add('rv');
      const siblings = el.parentElement ? [...el.parentElement.children].filter((c) => c.matches(REVEAL)) : [];
      el.style.setProperty('--i', String(Math.min(Math.max(siblings.indexOf(el), 0), 7)));
      io.observe(el);
    });
    // Safety net: never leave content hidden that is already on (or just below) the screen.
    const sweep = () => document.querySelectorAll('.pl-main .rv:not(.is-in)').forEach((el) => { if (el.getBoundingClientRect().top < window.innerHeight * 1.15) reveal(el); });
    scan();
    const mo = new MutationObserver(scan);
    const root = document.querySelector('.pl-main');
    if (root) mo.observe(root, { childList: true, subtree: true });
    const timer = window.setInterval(sweep, 900);
    window.addEventListener('scroll', sweep, { passive: true });
    return () => { io.disconnect(); mo.disconnect(); window.clearInterval(timer); window.removeEventListener('scroll', sweep); };
  }, [path]);
}

export default function SiteApp({ onReplayIntro }: { onReplayIntro: () => void }) {
  const route = useRoute();
  const root = route.seg[0] ?? '';
  const dark = DARK.has(root);
  const bare = root === 'checkout' || root === 'order' || root === 'admin';
  const [ready, setReady] = useState(false);
  const first = useRef(true);

  useEffect(() => { setReady(true); }, []);
  useScrollReveal(route.path);

  useEffect(() => {
    const titles: Record<string, string> = { '': 'Home', men: 'Men', women: 'Women', shop: 'Shop', product: 'Product', cart: 'Your bag', checkout: 'Checkout', order: 'Order confirmed', account: 'Account', tracking: 'Order tracking', wishlist: 'Wishlist', returns: 'Returns & exchanges', admin: 'Admin', about: 'About', support: 'Support' };
    document.title = `PLUTONIC — ${titles[root] ?? 'Beyond the Ordinary'}`;
    // Back/forward restores the previous scroll position once the page has rendered.
    const y = consumePendingScroll();
    if (y !== null) window.requestAnimationFrame(() => window.scrollTo(0, y));
    first.current = false;
  }, [root, route.path]);

  let page;
  switch (root) {
    case '': page = <Home />; break;
    case 'men': page = <Collection gender="men" />; break;
    case 'women': page = <Collection gender="women" />; break;
    case 'shop': page = <Listing route={route} />; break;
    case 'product': page = <Product route={route} />; break;
    case 'cart': page = <Cart />; break;
    case 'checkout': page = <Checkout />; break;
    case 'order': page = <Confirmation route={route} />; break;
    case 'account': page = <Account route={route} />; break;
    case 'tracking': page = <Tracking route={route} />; break;
    case 'wishlist': page = <Wishlist />; break;
    case 'returns': page = <Returns />; break;
    case 'about': page = <About />; break;
    case 'support': page = <Support />; break;
    case 'admin': page = <Admin />; break;
    default: page = <Home />;
  }

  return (
    <StoreProvider>
      <div className={'pl ' + (dark ? 'pl--dark' : 'pl--ivory') + (ready ? ' pl--ready' : '')}>
        <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
        {!bare && <Header />}
        <main id="main" className="pl-main" tabIndex={-1}>
          <div key={route.path} className="page-enter">
            <Suspense fallback={<div className="pl-wrap" style={{ minHeight: '60vh' }} aria-busy="true" />}>{page}</Suspense>
          </div>
        </main>
        {!bare && <Footer onReplayIntro={onReplayIntro} />}
        <Toast />
      </div>
    </StoreProvider>
  );
}
