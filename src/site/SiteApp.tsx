import { lazy, Suspense, useEffect } from 'react';
import './site.css';
import { useRoute } from './router';
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

export default function SiteApp({ onGateway }: { onGateway: () => void }) {
  const route = useRoute();
  const root = route.seg[0] ?? '';
  const dark = DARK.has(root);
  const bare = root === 'checkout' || root === 'order' || root === 'admin';

  useEffect(() => {
    const titles: Record<string, string> = { '': 'Home', men: 'Men', women: 'Women', shop: 'Shop', product: 'Product', cart: 'Your bag', checkout: 'Checkout', order: 'Order confirmed', account: 'Account', tracking: 'Order tracking', wishlist: 'Wishlist', returns: 'Returns & exchanges', admin: 'Admin', about: 'About', support: 'Support' };
    document.title = `PLUTONIC — ${titles[root] ?? 'Beyond the Ordinary'}`;
  }, [root]);

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
      <div className={'pl ' + (dark ? 'pl--dark' : 'pl--ivory')}>
        <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
        {!bare && <Header current={root ? '/' + root : undefined} />}
        <main id="main" tabIndex={-1}><Suspense fallback={<div className="pl-wrap" style={{ minHeight: '60vh' }} aria-busy="true" />}>{page}</Suspense></main>
        {!bare && <Footer onGateway={onGateway} />}
        <Toast />
      </div>
    </StoreProvider>
  );
}
