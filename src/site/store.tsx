import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  baseProducts, COD_FEE, EXPRESS_FEE, FREE_SHIPPING_ABOVE, SHIPPING_FEE, sizeStock,
  type Product,
} from './catalog';
import { isLive, supabase } from './supabase';

/**
 * Client-side commerce state for the demonstration storefront.
 *
 * Everything persists in this browser's localStorage under one key. There is no
 * server: sign-in, OTP, payment and order processing are simulated so every
 * screen can be exercised end to end. The contracts below are the seams where a
 * real backend (auth, inventory, payments, orders) would be connected.
 */

export type CartLine = { key: string; productId: string; colourId: string; size: string; qty: number };
export type Address = { id: string; label: string; name: string; mobile: string; line1: string; line2: string; landmark: string; pin: string; city: string; state: string };
export type User = { firstName: string; lastName: string; email: string; mobile: string; since: number; fit?: string };
export type OrderItem = { productId: string; name: string; colourId: string; colourName: string; size: string; qty: number; price: number };
export const ORDER_STEPS = ['Order confirmed', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'] as const;
export type Order = {
  id: string; createdAt: number; items: OrderItem[];
  subtotal: number; discount: number; couponCode?: string; shipping: number; codFee: number; total: number;
  delivery: 'standard' | 'express'; payment: 'upi' | 'card' | 'netbanking' | 'cod';
  address: Address; email: string; mobile: string;
  /** Index into ORDER_STEPS reached so far; -1 = cancelled. */
  step: number; history: number[]; sample?: boolean;
  /** Live mode only: simulated (demo), cod, pending (awaiting gateway), paid, failed. */
  paymentStatus?: 'simulated' | 'cod' | 'pending' | 'paid' | 'failed';
};
export type ReturnReq = { id: string; orderId: string; productName: string; variant: string; kind: 'exchange' | 'return'; reason: string; note: string; status: 'Requested' | 'Approved' | 'Pickup scheduled' | 'Completed' | 'Rejected'; createdAt: number };
export type Review = { id: string; productId: string; name: string; rating: number; text: string; size: string; fit: string; status: 'Published' | 'Pending' | 'Hidden'; createdAt: number };
export type Coupon = { code: string; kind: 'percent' | 'flat'; value: number; minSubtotal: number; active: boolean; label: string };

type Persisted = {
  cart: CartLine[]; wishlist: string[]; couponCode: string; user: User | null; addresses: Address[];
  orders: Order[]; returns: ReturnReq[]; reviews: Review[]; coupons: Coupon[];
  edits: Record<string, Product>; extra: Product[]; removed: string[];
  notify: string[]; whatsapp: boolean; newsletter: boolean;
};

const KEY = 'plutonic-demo-store-v1';
const DAY = 86_400_000;

const seedCoupons: Coupon[] = [
  { code: 'WELCOME10', kind: 'percent', value: 10, minSubtotal: 0, active: true, label: '10% off your first order' },
  { code: 'PLUTONIC500', kind: 'flat', value: 500, minSubtotal: 4000, active: true, label: '₹ 500 off orders above ₹ 4,000' },
];

function sampleAddress(name: string, city: string, state: string, pin: string): Address {
  return { id: 'a-' + pin, label: 'Home', name, mobile: '9000000000', line1: 'Sample address line', line2: 'Sample area', landmark: '', pin, city, state };
}
const seedOrders = (now: number): Order[] => [
  mkSeed('PL-10231', now - 2 * DAY, 3, [['m1', 'chalk', 'L', 2], ['w2', 'onyx', 'M', 1]], 'Sample customer', 'Bengaluru', 'Karnataka', '560001'),
  mkSeed('PL-10230', now - 4 * DAY, 4, [['w1', 'onyx', 'S', 1]], 'Sample customer', 'Mumbai', 'Maharashtra', '400001'),
  mkSeed('PL-10229', now - 1 * DAY, 1, [['m8', 'onyx', 'L', 1], ['m7', 'basalt', 'M', 1]], 'Sample customer', 'Delhi', 'Delhi', '110001'),
];
function mkSeed(id: string, createdAt: number, step: number, lines: [string, string, string, number][], name: string, city: string, state: string, pin: string): Order {
  const items: OrderItem[] = lines.map(([pid, cid, size, qty]) => {
    const p = baseProducts.find((x) => x.id === pid)!;
    return { productId: pid, name: p.name, colourId: cid, colourName: p.colours.find((c) => c.id === cid)?.name ?? cid, size, qty, price: p.price };
  });
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = subtotal >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
  return {
    id, createdAt, items, subtotal, discount: 0, shipping, codFee: 0, total: subtotal + shipping, delivery: 'standard', payment: 'upi',
    address: sampleAddress(name, city, state, pin), email: 'sample@example.com', mobile: '9000000000', step,
    history: Array.from({ length: step + 1 }, (_, i) => createdAt + i * 9 * 3_600_000), sample: true,
  };
}

/** In live mode the database is the source of truth: drop any browser-demo records. */
const GUEST_KEY = 'plutonic-guest-orders';
function guestOrders(): Order[] { try { return JSON.parse(window.sessionStorage.getItem(GUEST_KEY) ?? '[]') as Order[]; } catch { return []; } }
const liveReset = (p: Persisted): Persisted => ({ ...p, orders: guestOrders(), returns: [], reviews: [], coupons: [], user: null, addresses: [], edits: {}, extra: [], removed: [] });
type ReviewRow = { id: string; product_id: string; name: string; rating: number; body: string; size: string; fit: string; status: Review['status']; created_at: string };
const rowToReview = (r: ReviewRow): Review =>
  ({ id: r.id, productId: r.product_id, name: r.name, rating: r.rating, text: r.body, size: r.size, fit: r.fit, status: r.status, createdAt: Date.parse(r.created_at) });
/** supabase-js builders are lazy: nothing is sent until they are awaited, so fire-and-forget writes go through here. */
const run = (q: PromiseLike<unknown>) => { void Promise.resolve(q).catch(() => undefined); };
const REVIEW_COLS = 'id, product_id, name, rating, body, size, fit, status, created_at';

function initial(): Persisted {
  const empty: Persisted = {
    cart: [], wishlist: [], couponCode: '', user: null, addresses: [], orders: seedOrders(Date.now()), returns: [], reviews: [],
    coupons: seedCoupons, edits: {}, extra: [], removed: [], notify: [], whatsapp: true, newsletter: false,
  };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return isLive ? liveReset(empty) : empty;
    const merged = { ...empty, ...(JSON.parse(raw) as Partial<Persisted>) };
    return isLive ? liveReset(merged) : merged;
  } catch {
    return empty;
  }
}

type Result = { ok: boolean; message: string };
export type AdminStatus = 'idle' | 'loading' | 'ready' | 'error';
type AdminData = { products: Product[]; orders: Order[]; returns: ReturnReq[]; reviews: Review[]; coupons: Coupon[] };
export type Auth = {
  signUp: (p: { email: string; password: string; firstName: string; lastName: string; mobile: string; fit?: string }) => Promise<Result & { needsConfirm?: boolean }>;
  signIn: (email: string, password: string) => Promise<Result>;
  resetPassword: (email: string) => Promise<Result>;
};

type PriceBreakdown = { subtotal: number; discount: number; shipping: number; codFee: number; total: number; couponLabel?: string };

export type Store = {
  products: Product[];           // active products only (storefront)
  allProducts: Product[];        // including inactive (admin)
  product: (id: string) => Product | undefined;
  cart: CartLine[]; cartCount: number;
  addToCart: (p: Product, colourId: string, size: string, qty: number) => { ok: boolean; message: string };
  setQty: (key: string, qty: number) => void; removeLine: (key: string) => void;
  changeVariant: (key: string, colourId: string, size: string) => { ok: boolean; message: string };
  moveToWishlist: (key: string) => void;
  wishlist: string[]; isWished: (id: string) => boolean; toggleWish: (id: string) => void;
  coupon: Coupon | undefined; applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>; removeCoupon: () => void;
  price: (delivery?: 'standard' | 'express', payment?: Order['payment']) => PriceBreakdown;
  placeOrder: (d: { delivery: Order['delivery']; payment: Order['payment']; address: Address; email: string; mobile: string }) => Promise<Order | { error: string }>;
  orders: Order[]; advanceOrder: (id: string) => void; cancelOrder: (id: string) => void;
  returns: ReturnReq[]; createReturn: (r: Omit<ReturnReq, 'id' | 'createdAt' | 'status'>) => void; setReturnStatus: (id: string, s: ReturnReq['status']) => void;
  reviews: Review[]; addReview: (r: Omit<Review, 'id' | 'createdAt' | 'status'>) => void; setReviewStatus: (id: string, s: Review['status']) => void;
  user: User | null; signIn: (u: Omit<User, 'since'>) => void; signOut: () => void; updateUser: (u: Partial<User>) => void;
  addresses: Address[]; saveAddress: (a: Omit<Address, 'id'> & { id?: string }) => void; removeAddress: (id: string) => void;
  coupons: Coupon[]; saveCoupon: (c: Coupon) => void;
  saveProduct: (p: Product) => void; createProduct: (p: Product) => void; archiveProduct: (id: string) => void; restoreProduct: (id: string) => void;
  notifyMe: (id: string) => void; notified: string[];
  prefs: { whatsapp: boolean; newsletter: boolean }; setPrefs: (p: Partial<{ whatsapp: boolean; newsletter: boolean }>) => void;
  toast: string; say: (m: string) => void;
  /** True when connected to the Supabase database (otherwise the browser-only demo store). */
  live: boolean; authReady: boolean; auth: Auth; lookupOrder: (id: string, email: string) => Promise<Order | null>;
  adminStatus: AdminStatus; enterAdmin: () => Promise<void>; leaveAdmin: () => void;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
};

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(initial);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    try {
      // Live mode: never keep accounts, orders or addresses in browser storage.
      const keep = isLive ? { ...state, orders: [], returns: [], reviews: [], user: null, addresses: [], coupons: [], edits: {}, extra: [], removed: [] } : state;
      window.localStorage.setItem(KEY, JSON.stringify(keep));
    } catch { /* storage unavailable */ }
  }, [state]);

  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus>('idle');
  const [authReady, setAuthReady] = useState(!isLive);
  const uid = useRef<string | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('products').select('data').order('sort');
    if (data?.length) setLiveProducts(data.map((r) => r.data as Product));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    void loadCatalog();
    void db.from('reviews').select(REVIEW_COLS).order('created_at', { ascending: false }).then(({ data }) => {
      if (data) setState((s) => ({ ...s, reviews: (data as ReviewRow[]).map(rowToReview) }));
    });
    const code = state.couponCode;
    if (code) void db.rpc('get_coupon', { p_code: code }).then(({ data }) => { if (data) setState((s) => ({ ...s, coupons: [data as Coupon] })); else setState((s) => ({ ...s, couponCode: '' })); });

    const hydrate = async (u: { id: string; email?: string | null; created_at?: string }) => {
      uid.current = u.id;
      const [prof, addr, wish, ord, ret, rev] = await Promise.all([
        db.from('profiles').select('*').eq('id', u.id).maybeSingle(),
        db.from('addresses').select('id, data').order('created_at'),
        db.from('wishlist').select('product_id'),
        db.from('orders').select('data').order('created_at', { ascending: false }),
        db.from('returns').select('data').order('created_at', { ascending: false }),
        db.from('reviews').select(REVIEW_COLS).order('created_at', { ascending: false }),
      ]);
      const p = prof.data;
      setState((s) => {
        const dbWish = (wish.data ?? []).map((w) => w.product_id as string);
        const merged = [...new Set([...dbWish, ...s.wishlist])];
        const extra = merged.filter((x) => !dbWish.includes(x));
        if (extra.length) run(db.from('wishlist').upsert(extra.map((product_id) => ({ user_id: u.id, product_id }))));
        const mine = (ord.data ?? []).map((r) => r.data as Order);
        const guest = s.orders.filter((o) => !mine.some((m) => m.id === o.id));
        return {
          ...s, wishlist: merged, addresses: (addr.data ?? []).map((r) => ({ ...(r.data as Address), id: r.id as string })),
          orders: [...mine, ...guest], returns: (ret.data ?? []).map((r) => r.data as ReturnReq),
          reviews: ((rev.data ?? []) as ReviewRow[]).map(rowToReview),
          whatsapp: p?.whatsapp ?? s.whatsapp, newsletter: p?.newsletter ?? s.newsletter,
          user: { firstName: p?.first_name ?? '', lastName: p?.last_name ?? '', email: u.email ?? '', mobile: p?.mobile ?? '', fit: p?.fit ?? undefined, since: Date.parse(u.created_at ?? '') || Date.now() },
        };
      });
    };
    void db.auth.getSession().then(async ({ data }) => { if (data.session) await hydrate(data.session.user); setAuthReady(true); });
    const { data: sub } = db.auth.onAuthStateChange((_evt, session) => {
      // Defer: calling supabase from inside this callback can deadlock the auth lock.
      window.setTimeout(() => {
        if (session) void hydrate(session.user);
        else { uid.current = null; setState((s) => ({ ...s, user: null, addresses: [], orders: guestOrders(), returns: [] })); }
      }, 0);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadCatalog]);

  const say = useCallback((m: string) => {
    setToast(m);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2600);
  }, []);

  const allProducts = useMemo(() => {
    if (adminData) return adminData.products;
    if (isLive && liveProducts) return liveProducts;
    const merged = [...baseProducts.map((b) => state.edits[b.id] ?? b), ...state.extra.map((e) => state.edits[e.id] ?? e)];
    return merged.map((p) => ({ ...p, active: p.active && !state.removed.includes(p.id) }));
  }, [state.edits, state.extra, state.removed, adminData, liveProducts]);
  const products = useMemo(() => allProducts.filter((p) => p.active), [allProducts]);
  const product = useCallback((id: string) => allProducts.find((p) => p.id === id), [allProducts]);

  const coupon = useMemo(() => state.coupons.find((c) => c.code === state.couponCode && c.active), [state.coupons, state.couponCode]);

  const subtotalOf = useCallback((lines: CartLine[]) => lines.reduce((s, l) => s + (allProducts.find((p) => p.id === l.productId)?.price ?? 0) * l.qty, 0), [allProducts]);

  const price: Store['price'] = useCallback((delivery = 'standard', payment = 'upi') => {
    const subtotal = subtotalOf(state.cart);
    let discount = 0;
    if (coupon && subtotal >= coupon.minSubtotal) discount = coupon.kind === 'percent' ? Math.round(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
    const after = subtotal - discount;
    const shipping = state.cart.length === 0 ? 0 : delivery === 'express' ? EXPRESS_FEE : after >= FREE_SHIPPING_ABOVE ? 0 : SHIPPING_FEE;
    const codFee = payment === 'cod' && state.cart.length ? COD_FEE : 0;
    return { subtotal, discount, shipping, codFee, total: after + shipping + codFee, couponLabel: coupon?.code };
  }, [state.cart, coupon, subtotalOf]);

  const addToCart: Store['addToCart'] = (p, colourId, size, qty) => {
    const have = sizeStock(p, colourId, size);
    const key = `${p.id}|${colourId}|${size}`;
    const inBag = state.cart.find((l) => l.key === key)?.qty ?? 0;
    if (have <= 0) return { ok: false, message: 'That size is sold out in this colour.' };
    if (inBag + qty > have) return { ok: false, message: `Only ${have} left in ${size}.` };
    setState((s) => {
      const found = s.cart.find((l) => l.key === key);
      const cart = found ? s.cart.map((l) => (l.key === key ? { ...l, qty: l.qty + qty } : l)) : [...s.cart, { key, productId: p.id, colourId, size, qty }];
      return { ...s, cart };
    });
    return { ok: true, message: `${p.name} added to your bag` };
  };

  const setQty = (key: string, qty: number) => setState((s) => {
    const l = s.cart.find((x) => x.key === key); if (!l) return s;
    const p = allProducts.find((x) => x.id === l.productId);
    const max = p ? sizeStock(p, l.colourId, l.size) : qty;
    return { ...s, cart: s.cart.map((x) => (x.key === key ? { ...x, qty: Math.max(1, Math.min(qty, max || 1)) } : x)) };
  });
  const changeVariant: Store['changeVariant'] = (key, colourId, size) => {
    const l = state.cart.find((x) => x.key === key);
    const p = l && allProducts.find((x) => x.id === l.productId);
    if (!l || !p) return { ok: false, message: 'That item is no longer in your bag.' };
    const have = sizeStock(p, colourId, size);
    if (have <= 0) return { ok: false, message: 'That combination is sold out.' };
    const nk = `${p.id}|${colourId}|${size}`;
    if (nk === key) return { ok: true, message: '' };
    const merged = (state.cart.find((x) => x.key === nk)?.qty ?? 0) + l.qty;
    setState((s) => {
      const target = s.cart.some((x) => x.key === nk);
      const next = { key: nk, productId: p.id, colourId, size, qty: Math.min(merged, have) };
      // Keep the line where it was; fold it into an existing identical line if there is one.
      const cart = target
        ? s.cart.filter((x) => x.key !== key).map((x) => (x.key === nk ? next : x))
        : s.cart.map((x) => (x.key === key ? next : x));
      return { ...s, cart };
    });
    return { ok: true, message: `Updated to ${p.colours.find((c) => c.id === colourId)?.name} · ${size}` };
  };
  const removeLine = (key: string) => setState((s) => ({ ...s, cart: s.cart.filter((l) => l.key !== key) }));
  const moveToWishlist = (key: string) => setState((s) => {
    const l = s.cart.find((x) => x.key === key); if (!l) return s;
    return { ...s, cart: s.cart.filter((x) => x.key !== key), wishlist: s.wishlist.includes(l.productId) ? s.wishlist : [...s.wishlist, l.productId] };
  });

  const toggleWish = (id: string) => {
    if (supabase && uid.current) {
      if (state.wishlist.includes(id)) run(supabase.from('wishlist').delete().eq('product_id', id));
      else run(supabase.from('wishlist').upsert({ user_id: uid.current, product_id: id }));
    }
    setState((s) => ({ ...s, wishlist: s.wishlist.includes(id) ? s.wishlist.filter((x) => x !== id) : [...s.wishlist, id] }));
  };

  const applyCoupon: Store['applyCoupon'] = async (raw) => {
    const code = raw.trim().toUpperCase();
    let c = state.coupons.find((x) => x.code === code);
    if (isLive && supabase) {
      const { data } = await supabase.rpc('get_coupon', { p_code: code });
      c = (data as Coupon | null) ?? undefined;
      if (c) { const found = c; setState((s) => ({ ...s, coupons: [found, ...s.coupons.filter((x) => x.code !== found.code)] })); }
    }
    if (!c || !c.active) return { ok: false, message: 'That code is not valid.' };
    const sub = subtotalOf(state.cart);
    if (sub < c.minSubtotal) return { ok: false, message: `Add ₹ ${(c.minSubtotal - sub).toLocaleString('en-IN')} more to use ${c.code}.` };
    setState((s) => ({ ...s, couponCode: c.code }));
    return { ok: true, message: `${c.code} applied · ${c.label}` };
  };
  const removeCoupon = () => setState((s) => ({ ...s, couponCode: '' }));

  const placeOrder: Store['placeOrder'] = async (d) => {
    if (!state.cart.length) return { error: 'Your bag is empty.' };
    if (isLive && supabase) {
      // The database function recomputes prices, discount, shipping and stock; nothing is trusted from here.
      const { data, error } = await supabase.rpc('place_order', { p: { items: state.cart.map((l) => ({ productId: l.productId, colourId: l.colourId, size: l.size, qty: l.qty })), coupon: state.couponCode, delivery: d.delivery, payment: d.payment, address: d.address, email: d.email, mobile: d.mobile } });
      if (error) return { error: error.message || 'We could not place your order. Please try again.' };
      const order = data as Order;
      if (!uid.current) { try { window.sessionStorage.setItem(GUEST_KEY, JSON.stringify([order, ...guestOrders()])); } catch { /* ignore */ } }
      setState((s) => ({ ...s, orders: [order, ...s.orders], cart: [], couponCode: '' }));
      if (uid.current && !state.addresses.some((a) => a.pin === d.address.pin && a.line1 === d.address.line1)) saveAddress({ ...d.address, id: undefined, label: d.address.label || 'Home' });
      void loadCatalog();
      return order;
    }
    for (const l of state.cart) {
      const p = allProducts.find((x) => x.id === l.productId);
      if (!p || sizeStock(p, l.colourId, l.size) < l.qty) return { error: `${p?.name ?? 'An item'} (${l.size}) is no longer available in that quantity.` };
    }
    const pr = price(d.delivery, d.payment);
    const now = Date.now();
    const nextNumber = Math.max(10231, ...state.orders.map((o) => Number(o.id.replace(/\D/g, '')) || 0)) + 1;
    const order: Order = {
      id: 'PL-' + nextNumber, createdAt: now, delivery: d.delivery, payment: d.payment, address: d.address, email: d.email, mobile: d.mobile,
      items: state.cart.map((l) => {
        const p = allProducts.find((x) => x.id === l.productId)!;
        return { productId: p.id, name: p.name, colourId: l.colourId, colourName: p.colours.find((c) => c.id === l.colourId)?.name ?? l.colourId, size: l.size, qty: l.qty, price: p.price };
      }),
      subtotal: pr.subtotal, discount: pr.discount, couponCode: pr.discount ? state.couponCode : undefined, shipping: pr.shipping, codFee: pr.codFee, total: pr.total, step: 0, history: [now],
    };
    setState((s) => {
      const edits = { ...s.edits };
      for (const l of s.cart) {
        const p = edits[l.productId] ?? allProducts.find((x) => x.id === l.productId)!;
        edits[l.productId] = { ...p, stock: { ...p.stock, [`${l.colourId}:${l.size}`]: Math.max(0, (p.stock[`${l.colourId}:${l.size}`] ?? 0) - l.qty) } };
      }
      return { ...s, edits, orders: [order, ...s.orders], cart: [], couponCode: '', addresses: s.user && !s.addresses.some((a) => a.pin === d.address.pin && a.line1 === d.address.line1) ? [...s.addresses, { ...d.address, id: 'a-' + now }] : s.addresses };
    });
    return order;
  };

  const adminCall = async (op: string, payload: Record<string, unknown>) => {
    try {
      const r = await fetch('/api/admin/mutate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op, ...payload }) });
      if (r.ok) return true;
      say(r.status === 401 ? 'Your admin session has expired. Please sign in again.' : 'That change could not be saved.');
    } catch { say('Could not reach the server.'); }
    return false;
  };
  const patchAdmin = (fn: (d: AdminData) => AdminData) => setAdminData((d) => (d ? fn(d) : d));
  const step = (o: Order): Order => (o.step >= 0 && o.step < ORDER_STEPS.length - 1 ? { ...o, step: o.step + 1, history: [...o.history, Date.now()] } : o);

  const advanceOrder = (id: string) => {
    if (adminData) { void adminCall('order.advance', { id }).then((ok) => ok && patchAdmin((d) => ({ ...d, orders: d.orders.map((o) => (o.id === id ? step(o) : o)) }))); return; }
    advanceLocal(id);
  };
  const advanceLocal = (id: string) => setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id && o.step >= 0 && o.step < ORDER_STEPS.length - 1 ? { ...o, step: o.step + 1, history: [...o.history, Date.now()] } : o)) }));
  const cancelOrder = (id: string) => {
    if (isLive && supabase) {
      void supabase.rpc('cancel_order', { p_id: id }).then(({ data, error }) => {
        if (error) { say(error.message); return; }
        setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? (data as Order) : o)) }));
      });
      return;
    }
    setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id && o.step >= 0 && o.step < 3 ? { ...o, step: -1 } : o)) }));
  };
  const lookupOrder: Store['lookupOrder'] = async (id, email) => {
    if (!supabase) return null;
    const { data } = await supabase.rpc('track_order', { p_id: id, p_email: email });
    const o = (data as Order | null) ?? null;
    if (o) setState((s) => ({ ...s, orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? o : x)) : [o, ...s.orders] }));
    return o;
  };

  const createReturn: Store['createReturn'] = (r) => {
    if (isLive && supabase) {
      void supabase.rpc('create_return', { p: r }).then(({ data, error }) => {
        if (error) { say(error.message); return; }
        setState((s) => ({ ...s, returns: [data as ReturnReq, ...s.returns] }));
        say(r.kind === 'exchange' ? 'Exchange requested' : 'Return requested');
      });
      return;
    }
    setState((s) => ({ ...s, returns: [{ ...r, id: 'R-' + (1000 + s.returns.length + 1), createdAt: Date.now(), status: 'Requested' }, ...s.returns] })); say(r.kind === 'exchange' ? 'Exchange requested' : 'Return requested'); };
  const setReturnStatus = (id: string, status: ReturnReq['status']) => {
    if (adminData) { void adminCall('return.setStatus', { id, status }).then((ok) => ok && patchAdmin((d) => ({ ...d, returns: d.returns.map((r) => (r.id === id ? { ...r, status } : r)) }))); return; }
    setReturnLocal(id, status);
  };
  const setReturnLocal = (id: string, status: ReturnReq['status']) => setState((s) => ({ ...s, returns: s.returns.map((r) => (r.id === id ? { ...r, status } : r)) }));

  const addReview: Store['addReview'] = (r) => {
    if (isLive && supabase) {
      if (!uid.current) { say('Please log in to write a review.'); return; }
      void supabase.from('reviews').insert({ product_id: r.productId, user_id: uid.current, name: r.name, rating: r.rating, body: r.text, size: r.size, fit: r.fit }).select(REVIEW_COLS).single().then(({ data, error }) => {
        if (error || !data) { say('Your review could not be saved.'); return; }
        setState((s) => ({ ...s, reviews: [rowToReview(data as ReviewRow), ...s.reviews] }));
        say('Thank you. Your review will appear once moderated.');
      });
      return;
    }
    setState((s) => ({ ...s, reviews: [{ ...r, id: 'rv-' + Date.now(), createdAt: Date.now(), status: 'Pending' }, ...s.reviews] })); say('Thank you. Your review will appear once moderated.'); };
  const setReviewStatus = (id: string, status: Review['status']) => {
    if (adminData) { void adminCall('review.setStatus', { id, status }).then((ok) => ok && patchAdmin((d) => ({ ...d, reviews: d.reviews.map((r) => (r.id === id ? { ...r, status } : r)) }))); return; }
    setReviewLocal(id, status);
  };
  const setReviewLocal = (id: string, status: Review['status']) => setState((s) => ({ ...s, reviews: s.reviews.map((r) => (r.id === id ? { ...r, status } : r)) }));

  const signIn: Store['signIn'] = (u) => setState((s) => ({ ...s, user: { ...u, since: s.user?.since ?? Date.now() } }));
  const signOut = () => { if (supabase) void supabase.auth.signOut(); setState((s) => ({ ...s, user: null })); };
  const updateUser: Store['updateUser'] = (u) => {
    setState((s) => (s.user ? { ...s, user: { ...s.user, ...u } } : s));
    if (supabase && uid.current) run(supabase.from('profiles').update({ ...(u.firstName !== undefined && { first_name: u.firstName }), ...(u.lastName !== undefined && { last_name: u.lastName }), ...(u.mobile !== undefined && { mobile: u.mobile }), ...(u.fit !== undefined && { fit: u.fit }) }).eq('id', uid.current));
  };
  const auth: Auth = {
    signUp: async ({ email, password, firstName, lastName, mobile, fit }) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, mobile } } });
      if (error) return { ok: false, message: error.message };
      if (fit && data.session) run(supabase.from('profiles').update({ fit }).eq('id', data.session.user.id));
      // Supabase returns an empty identities list for an email that is already registered.
      if (data.user && data.user.identities?.length === 0) return { ok: false, message: 'An account with this email already exists. Try logging in.' };
      return data.session ? { ok: true, message: 'Account created' } : { ok: true, needsConfirm: true, message: 'Check your email to confirm your account, then log in.' };
    },
    signIn: async (email, password) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? { ok: false, message: /confirm/i.test(error.message) ? 'Please confirm your email first, then log in.' : 'Email or password is not right.' } : { ok: true, message: 'Signed in' };
    },
    resetPassword: async (email) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname + '#/account' });
      return { ok: true, message: 'If an account exists for that email, a reset link is on its way.' };
    },
  };

  const saveAddress: Store['saveAddress'] = (a) => {
    const full = { ...a, id: a.id ?? (isLive ? crypto.randomUUID() : 'a-' + Date.now()) } as Address;
    if (supabase && uid.current) run(supabase.from('addresses').upsert({ id: full.id, user_id: uid.current, data: full }));
    setState((s) => {
    return { ...s, addresses: s.addresses.some((x) => x.id === full.id) ? s.addresses.map((x) => (x.id === full.id ? full : x)) : [...s.addresses, full] };
    });
  };
  const removeAddress = (id: string) => { if (supabase && uid.current) run(supabase.from('addresses').delete().eq('id', id)); setState((s) => ({ ...s, addresses: s.addresses.filter((a) => a.id !== id) })); };

  const saveCoupon = (c: Coupon) => {
    if (adminData) { void adminCall('coupon.upsert', { coupon: c }).then((ok) => ok && patchAdmin((d) => ({ ...d, coupons: d.coupons.some((x) => x.code === c.code) ? d.coupons.map((x) => (x.code === c.code ? c : x)) : [...d.coupons, c] }))); return; }
    saveCouponLocal(c);
  };
  const saveCouponLocal = (c: Coupon) => setState((s) => ({ ...s, coupons: s.coupons.some((x) => x.code === c.code) ? s.coupons.map((x) => (x.code === c.code ? c : x)) : [...s.coupons, c] }));

  const upsertAdminProduct = (p: Product) => { void adminCall('product.upsert', { product: p }).then((ok) => ok && patchAdmin((d) => ({ ...d, products: d.products.some((x) => x.id === p.id) ? d.products.map((x) => (x.id === p.id ? p : x)) : [...d.products, p] }))); };
  const setAdminActive = (id: string, active: boolean) => { void adminCall('product.setActive', { id, active }).then((ok) => ok && patchAdmin((d) => ({ ...d, products: d.products.map((x) => (x.id === id ? { ...x, active } : x)) }))); };
  const saveProduct = (p: Product) => { if (adminData) upsertAdminProduct(p); else setState((s) => ({ ...s, edits: { ...s.edits, [p.id]: p } })); };
  const createProduct = (p: Product) => { if (adminData) upsertAdminProduct(p); else setState((s) => ({ ...s, extra: [...s.extra, p] })); };
  const archiveProduct = (id: string) => { if (adminData) setAdminActive(id, false); else setState((s) => ({ ...s, removed: [...s.removed, id] })); };
  const restoreProduct = (id: string) => { if (adminData) setAdminActive(id, true); else setState((s) => ({ ...s, removed: s.removed.filter((x) => x !== id) })); };

  /** Admin screens load every record through the administrator-only API (needs a verified admin session). */
  const enterAdmin = useCallback(async () => {
    if (!isLive) { setAdminStatus('ready'); return; }
    setAdminStatus('loading');
    try {
      const r = await fetch('/api/admin/data', { credentials: 'same-origin', cache: 'no-store' });
      if (!r.ok) { setAdminStatus('error'); return; }
      setAdminData((await r.json()) as AdminData); setAdminStatus('ready');
    } catch { setAdminStatus('error'); }
  }, []);
  const leaveAdmin = useCallback(() => { setAdminData(null); setAdminStatus('idle'); }, []);

  const notifyMe = (id: string) => { setState((s) => ({ ...s, notify: s.notify.includes(id) ? s.notify : [...s.notify, id] })); say('We will let you know when it is back.'); };
  const setPrefs: Store['setPrefs'] = (p) => { if (supabase && uid.current) run(supabase.from('profiles').update({ ...(p.whatsapp !== undefined && { whatsapp: p.whatsapp }), ...(p.newsletter !== undefined && { newsletter: p.newsletter }) }).eq('id', uid.current)); setPrefsLocal(p); };
  const setPrefsLocal: Store['setPrefs'] = (p) => setState((s) => ({ ...s, whatsapp: p.whatsapp ?? s.whatsapp, newsletter: p.newsletter ?? s.newsletter }));

  const value: Store = {
    products, allProducts, product,
    cart: state.cart, cartCount: state.cart.reduce((n, l) => n + l.qty, 0), addToCart, setQty, removeLine, changeVariant, moveToWishlist,
    wishlist: state.wishlist, isWished: (id) => state.wishlist.includes(id), toggleWish,
    coupon, applyCoupon, removeCoupon, price, placeOrder,
    orders: adminData?.orders ?? state.orders, advanceOrder, cancelOrder, returns: adminData?.returns ?? state.returns, createReturn, setReturnStatus,
    reviews: adminData?.reviews ?? state.reviews, addReview, setReviewStatus,
    user: state.user, signIn, signOut, updateUser, addresses: state.addresses, saveAddress, removeAddress,
    coupons: adminData?.coupons ?? state.coupons, saveCoupon, saveProduct, createProduct, archiveProduct, restoreProduct,
    notifyMe, notified: state.notify, prefs: { whatsapp: state.whatsapp, newsletter: state.newsletter }, setPrefs, toast, say,
    live: isLive, authReady, auth, lookupOrder, adminStatus, enterAdmin, leaveAdmin,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
