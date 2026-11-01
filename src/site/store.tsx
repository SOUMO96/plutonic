import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  baseProducts, COD_FEE, EXPRESS_FEE, FREE_SHIPPING_ABOVE, SHIPPING_FEE, sizeStock,
  type Product,
} from './catalog';
import { CUSTOMER_CANCEL_BEFORE, cancelItem as cancelItemRule, cancelWhole as cancelWholeRule, type Cancelled } from './orderCancel';
import { applyUpdate, buildBatch, currentPiece, requestError, type BatchInput, type Update } from './returnRules';
import { isLive, supabase } from './supabase';
import { parseW, wkey } from './wishlist';

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
export type OrderItem = { productId: string; name: string; colourId: string; colourName: string; size: string; qty: number; price: number; cancelled?: boolean; cancelReason?: string };
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
  /** Set when an order or item is cancelled by an administrator. `refundDue` is the amount owed back (online orders only). */
  cancelReason?: string; cancelledBy?: 'admin' | 'customer'; refundDue?: number;
  /** Set by the courier automation: real tracking number, and an alert if the courier reports a problem. */
  awb?: string; courier?: string; alert?: string;
};
export type ReturnReq = {
  id: string; orderId: string; productName: string; variant: string; kind: 'exchange' | 'return'; reason: string; note: string;
  status: 'Requested' | 'Approved' | 'Pickup scheduled' | 'Picked up' | 'Replacement packed' | 'Replacement shipped' | 'Replacement out for delivery' | 'Completed' | 'Rejected'; createdAt: number;
  /** Which line of the order this covers (one open request per line). */
  itemIndex?: number; productId?: string; qty?: number;
  /** Exchanges: the size/colour the customer wants instead. */
  exchangeTo?: { colourId: string; colourName: string; size: string };
  /** The piece the customer holds for this item when asking (the original, or a replacement from an earlier exchange). */
  piece?: { colourId: string; colourName: string; size: string };
  /** Returns: what is owed back once the item is received. */
  refundAmount?: number;
  pickupDate?: string; pickupSlot?: string; adminNote?: string;
  history?: { status: ReturnReq['status']; at: number }[];
  /** Requests sent together (one action, several items) share a batch; they move through the same journey and are tracked as one. */
  batchId?: string; batchSize?: number;
  /** Set by the automation when a request needs a person (it was not auto-approved). */
  needsReview?: boolean; reviewReason?: string;
  /** Courier tracking numbers: for the pickup, and for the replacement parcel of an exchange. */
  pickupAwb?: string; awb?: string;
};
export type Refund = { id: number | string; orderId: string; returnId?: string; source: 'cancellation' | 'return'; amount: number; status: 'Pending' | 'Refunded'; note?: string; reference?: string; createdAt: number; processedAt?: number };
export type Review = { id: string; productId: string; name: string; rating: number; text: string; size: string; fit: string; status: 'Published' | 'Pending' | 'Hidden'; createdAt: number };
export type Coupon = { code: string; kind: 'percent' | 'flat'; value: number; minSubtotal: number; active: boolean; label: string; perUserLimit?: number | null };

type Persisted = {
  cart: CartLine[]; wishlist: string[]; couponCode: string; user: User | null; addresses: Address[];
  orders: Order[]; returns: ReturnReq[]; refunds: Refund[]; reviews: Review[]; coupons: Coupon[];
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
const liveReset = (p: Persisted): Persisted => ({ ...p, orders: guestOrders(), returns: [], refunds: [], reviews: [], coupons: [], user: null, addresses: [], edits: {}, extra: [], removed: [] });
type ReviewRow = { id: string; product_id: string; name: string; rating: number; body: string; size: string; fit: string; status: Review['status']; created_at: string };
const rowToReview = (r: ReviewRow): Review =>
  ({ id: r.id, productId: r.product_id, name: r.name, rating: r.rating, text: r.body, size: r.size, fit: r.fit, status: r.status, createdAt: Date.parse(r.created_at) });
/** supabase-js builders are lazy: nothing is sent until they are awaited, so fire-and-forget writes go through here. */
const run = (q: PromiseLike<unknown>) => { void Promise.resolve(q).catch(() => undefined); };
type RefundRow = { id: number; order_id: string; return_id: string | null; source: Refund['source']; amount: number; status: Refund['status']; note: string | null; reference: string | null; created_at: string; processed_at: string | null };
const rowToRefund = (x: RefundRow): Refund => ({ id: x.id, orderId: x.order_id, returnId: x.return_id ?? undefined, source: x.source, amount: x.amount, status: x.status, note: x.note ?? undefined, reference: x.reference ?? undefined, createdAt: Date.parse(x.created_at), processedAt: x.processed_at ? Date.parse(x.processed_at) : undefined });
/** Ask the server to run whatever automation is due (courier booking, auto-approval). Best effort; a scheduler also runs it. */
const kickAutomation = () => {
  try {
    if (!supabase) return;
    // only a signed-in customer may nudge the automation (the scheduler also runs it every minute)
    void supabase.auth.getSession().then(({ data }) => { const t = data.session?.access_token; if (t) void fetch('/api/v1/automation/kick', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(() => undefined); }).catch(() => undefined);
  } catch { /* ignore */ }
};
const REVIEW_COLS = 'id, product_id, name, rating, body, size, fit, status, created_at';
/** GET a JSON endpoint with a time limit (a slow or dead server must never freeze the page). Returns null on any failure. */
async function getJson<T>(url: string, ms = 8000): Promise<T | null> {
  try {
    const ctl = new AbortController(); const t = window.setTimeout(() => ctl.abort(), ms);
    const r = await fetch(url, { signal: ctl.signal }); window.clearTimeout(t);
    return r.ok ? ((await r.json()) as T) : null;
  } catch { return null; }
}
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));
/** One id per checkout attempt, so a retry of the same attempt can never become a second order. */
const newKey = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : 'k' + Date.now() + Math.random().toString(36).slice(2));
/** Errors that mean "the system is busy or the network blinked", as opposed to "your order was refused". */
const transient = (e: { code?: string; message?: string }, status?: number) =>
  !e.code || ['53300', '57014', '40001', '40P01', '08006', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003'].includes(e.code) || [429, 502, 503, 504].includes(status ?? 0) || /fetch|network|timeout|timed out/i.test(e.message ?? '');

function initial(): Persisted {
  const empty: Persisted = {
    cart: [], wishlist: [], couponCode: '', user: null, addresses: [], orders: seedOrders(Date.now()), returns: [], refunds: [], reviews: [],
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
export type AutomationLog = { id: number; at: number; subject: string; action: string; detail?: string; level: 'info' | 'review' | 'error' };
export type Automation = { mode: string; settings: Record<string, string>; log: AutomationLog[] };
type AdminData = { products: Product[]; orders: Order[]; returns: ReturnReq[]; refunds: Refund[]; reviews: Review[]; coupons: Coupon[]; automation?: Automation };
/** One request, ONE action (return or exchange), several items. */
export type NewReturnBatch = BatchInput;
export type NewReturn = { orderId: string; itemIndex: number; kind: 'exchange' | 'return'; reason: string; note: string; exchangeSize?: string };
export type Auth = {
  signUp: (p: { email: string; password: string; firstName: string; lastName: string; mobile: string; fit?: string }) => Promise<Result & { needsConfirm?: boolean }>;
  signIn: (email: string, password: string) => Promise<Result & { needsConfirm?: boolean }>;
  /** Confirm a new account with the 6-digit code emailed at sign-up; signs the customer in on success. */
  verifyEmail: (email: string, code: string) => Promise<Result>;
  resetPassword: (email: string) => Promise<Result>;
  /** Re-send the sign-up confirmation email (only when the project requires email confirmation). */
  resendConfirmation: (email: string) => Promise<Result>;
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
  /** Saved pieces, each `productId_colourId_size` (see wishlist.ts). */
  wishlist: string[];
  /** True if any colour/size of this product is saved. */
  isWished: (productId: string) => boolean;
  isWishedVariant: (productId: string, colourId: string, size: string) => boolean;
  /** Save or remove exactly this wishlist entry. */
  toggleWish: (key: string) => void;
  /** Remove every saved colour/size of a product. */
  removeWishProduct: (productId: string) => void;
  coupon: Coupon | undefined; applyCoupon: (code: string) => Promise<{ ok: boolean; message: string }>; removeCoupon: () => void;
  price: (delivery?: 'standard' | 'express', payment?: Order['payment']) => PriceBreakdown;
  placeOrder: (d: { delivery: Order['delivery']; payment: Order['payment']; address: Address; email: string; mobile: string }) => Promise<Order | { error: string }>;
  orders: Order[]; advanceOrder: (id: string) => void; cancelOrder: (id: string) => void;
  returns: ReturnReq[]; refunds: Refund[];
  /** Customer: ask to return or exchange one item. Resolves with an error message if the rules refuse it. */
  createReturn: (r: NewReturn) => Promise<{ ok: boolean; message: string; request?: ReturnReq }>;
  /** Send one request for several items (all returns, or all exchanges). All or nothing. */
  createReturnBatch: (r: NewReturnBatch) => Promise<{ ok: boolean; message: string; requests?: ReturnReq[] }>;
  /** Administrator: move a request along (approve, schedule pickup, picked up, complete, reject). */
  updateReturn: (id: string, status: ReturnReq['status'], u?: Update) => Promise<{ ok: boolean; message: string }>;
  markRefunded: (id: number | string, reference: string) => Promise<boolean>;
  /** Administrator: the fulfilment automation (courier, switches, what it did). */
  automation: Automation | null; setAutomation: (key: string, value: string) => Promise<boolean>;
  /** Customer: fetch the latest order / return / refund status from the server. */
  refreshAccount: () => Promise<void>;
  /** Open live updates for the account while a page needs them; call the returned function to close. */
  watchAccount: () => () => void;
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
  /** Re-read orders, returns, refunds etc. from the server (new customer activity). */
  refreshAdmin: () => Promise<void>;
  /** Administrator: cancel a whole order, or one item of it (stock is returned). */
  adminCancelOrder: (id: string, reason: string) => Promise<boolean>;
  adminCancelItem: (id: string, index: number, reason: string) => Promise<boolean>;
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
      const keep = isLive ? { ...state, orders: [], returns: [], refunds: [], reviews: [], user: null, addresses: [], coupons: [], edits: {}, extra: [], removed: [] } : state;
      window.localStorage.setItem(KEY, JSON.stringify(keep));
    } catch { /* storage unavailable */ }
  }, [state]);

  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus>('idle');
  const [authReady, setAuthReady] = useState(!isLive);
  const uid = useRef<string | null>(null);
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>['channel']> | null>(null);
  const refreshRef = useRef<() => void>(() => undefined);
  const hydrateRef = useRef<((u: { id: string; email?: string | null; created_at?: string }) => Promise<void>) | null>(null);

  const loadCatalog = useCallback(async () => {
    if (!supabase) return;
    // The catalogue comes from the cached API (a CDN copy, so a rush of shoppers never reaches the database). If that is
    // unreachable, fall back to asking the database directly, so the shop keeps working.
    const all: Product[] = [];
    for (let off = 0; off < 1000; off += 100) {
      const page = await getJson<{ items: Product[] }>('/api/v1/products?limit=100&offset=' + off);
      if (!page) { all.length = 0; break; }
      all.push(...page.items); if (page.items.length < 100) { if (all.length) setLiveProducts(all); return; }
    }
    const { data } = await supabase.from('products').select('data').order('sort');
    if (data?.length) setLiveProducts(data.map((r) => r.data as Product));
  }, []);
  const loadReviews = useCallback(async () => {
    if (!supabase) return;
    const cached = await getJson<{ items: ReviewRow[] }>('/api/v1/reviews/recent?limit=300');
    const rows = cached?.items ?? ((await supabase.from('reviews').select(REVIEW_COLS).eq('status', 'Published').order('created_at', { ascending: false }).limit(300)).data as ReviewRow[] | null);
    if (rows) setState((s) => ({ ...s, reviews: [...rows.map(rowToReview), ...s.reviews.filter((r) => r.status !== 'Published' && !rows.some((x) => x.id === r.id))] }));
  }, []);

  useEffect(() => {
    if (!supabase) return;
    const db = supabase;
    void loadCatalog();
    void loadReviews();
    const code = state.couponCode;
    if (code) void db.rpc('get_coupon', { p_code: code }).then(({ data }) => { if (data) setState((s) => ({ ...s, coupons: [data as Coupon] })); else setState((s) => ({ ...s, couponCode: '' })); });

    const hydrate = async (u: { id: string; email?: string | null; created_at?: string }) => {
      uid.current = u.id;
      const [prof, addr, wish, ord, ret, rev, ref] = await Promise.all([
        db.from('profiles').select('*').eq('id', u.id).maybeSingle(),
        db.from('addresses').select('id, data').order('created_at'),
        db.from('wishlist').select('product_id'),
        db.from('orders').select('data').order('created_at', { ascending: false }).limit(100),
        db.from('returns').select('data').order('created_at', { ascending: false }).limit(100),
        db.from('reviews').select(REVIEW_COLS).eq('user_id', u.id).order('created_at', { ascending: false }).limit(100),
        db.from('refunds').select('*').order('created_at', { ascending: false }).limit(100),
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
          orders: [...mine, ...guest], returns: (ret.data ?? []).map((r) => r.data as ReturnReq), refunds: ((ref.data ?? []) as RefundRow[]).map(rowToRefund),
          reviews: [...s.reviews.filter((r) => r.status === 'Published'), ...((rev.data ?? []) as ReviewRow[]).map(rowToReview).filter((r) => !s.reviews.some((x) => x.id === r.id && x.status === 'Published'))],
          whatsapp: p?.whatsapp ?? s.whatsapp, newsletter: p?.newsletter ?? s.newsletter,
          user: { firstName: p?.first_name ?? '', lastName: p?.last_name ?? '', email: u.email ?? '', mobile: p?.mobile ?? '', fit: p?.fit ?? undefined, since: Date.parse(u.created_at ?? '') || Date.now() },
        };
      });
    };
    hydrateRef.current = hydrate;
    void db.auth.getSession().then(async ({ data }) => { if (data.session) await hydrate(data.session.user); setAuthReady(true); });
    const { data: sub } = db.auth.onAuthStateChange((_evt, session) => {
      // Defer: calling supabase from inside this callback can deadlock the auth lock.
      window.setTimeout(() => {
        if (session) void hydrate(session.user);
        else { uid.current = null; if (channelRef.current) { void db.removeChannel(channelRef.current); channelRef.current = null; } setState((s) => ({ ...s, user: null, addresses: [], orders: guestOrders(), returns: [], refunds: [] })); }
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
    if (supabase && uid.current) run(supabase.from('wishlist').upsert({ user_id: uid.current, product_id: wkey(l.productId, l.colourId, l.size) }));
    return { ...s, cart: s.cart.filter((x) => x.key !== key), wishlist: s.wishlist.includes(wkey(l.productId, l.colourId, l.size)) ? s.wishlist : [...s.wishlist, wkey(l.productId, l.colourId, l.size)] };
  });

  const removeWishProduct = (productId: string) => {
    const keys = state.wishlist.filter((k) => parseW(k).productId === productId);
    if (supabase && uid.current && keys.length) run(supabase.from('wishlist').delete().in('product_id', keys));
    setState((s) => ({ ...s, wishlist: s.wishlist.filter((k) => parseW(k).productId !== productId) }));
  };
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

  const orderKey = useRef<string | null>(null);
  const placeOrder: Store['placeOrder'] = async (d) => {
    if (!state.cart.length) return { error: 'Your bag is empty.' };
    if (isLive && supabase) {
      orderKey.current ??= newKey();
      // The database function recomputes prices, discount, shipping and stock; nothing is trusted from here.
      const body = { p: { ...{ items: state.cart.map((l) => ({ productId: l.productId, colourId: l.colourId, size: l.size, qty: l.qty })), coupon: state.couponCode, delivery: d.delivery, payment: d.payment, address: d.address, email: d.email, mobile: d.mobile }, idempotencyKey: orderKey.current } };
      // Patient and safe: if the shop is busy or the network blinks, wait and try again with the SAME key, so it can never
      // become two orders. A real refusal (out of stock, bad coupon...) is shown straight away.
      let data: unknown = null, error: { code?: string; message?: string } | null = null, status = 0;
      for (let attempt = 0; attempt < 5; attempt++) {
        const r = await supabase.rpc('place_order', body); data = r.data; error = r.error; status = r.status;
        if (!error || !transient(error, status)) break;
        if (attempt === 0) {
          const cfg = await getJson<{ features?: { idempotentOrders?: boolean } }>('/api/v1/config', 4000);
          if (!cfg?.features?.idempotentOrders) { return { error: 'We could not confirm your order. Please check My Orders before trying again, so you are not charged twice.' }; }
        }
        say('Lots of people are ordering right now. Still placing your order, please keep this page open…');
        await sleep(700 * 2 ** attempt + Math.random() * 400);
      }
      if (error) {
        if (!transient(error, status)) orderKey.current = null;   // refused for real: the next try is a fresh attempt
        return { error: (error.message && !transient(error, status) ? error.message : '') || 'The shop is very busy. Your order was not lost: press Place order again in a moment.' };
      }
      orderKey.current = null;
      const order = data as Order;
      if (!uid.current) { try { window.sessionStorage.setItem(GUEST_KEY, JSON.stringify([order, ...guestOrders()])); } catch { /* ignore */ } }
      setState((s) => ({ ...s, orders: [order, ...s.orders], cart: [], couponCode: '' }));
      if (uid.current && !state.addresses.some((a) => a.pin === d.address.pin && a.line1 === d.address.line1)) saveAddress({ ...d.address, id: undefined, label: d.address.label || 'Home' });
      void loadCatalog();
      kickAutomation();
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
  const reloadRefunds = async () => {
    if (!supabase || !uid.current) return;
    const { data } = await supabase.from('refunds').select('*').order('created_at', { ascending: false });
    if (data) setState((st) => ({ ...st, refunds: (data as RefundRow[]).map(rowToRefund) }));
  };
  const cancelOrder = (id: string) => {
    if (isLive && supabase) {
      void supabase.rpc('cancel_order', { p_id: id }).then(({ data, error }) => {
        if (error) { say(error.message); return; }
        setState((s) => ({ ...s, orders: s.orders.map((o) => (o.id === id ? (data as Order) : o)) }));
        say('Order cancelled'); void reloadRefunds();
      });
      return;
    }
    const cur = state.orders.find((o) => o.id === id);
    const result = cur && cur.step < CUSTOMER_CANCEL_BEFORE ? cancelWholeRule(cur, 'Cancelled by customer', 'customer') : null;
    if (!cur || !result) { say('This order can no longer be cancelled.'); return; }
    localCancel(cur, result, 'Cancelled by customer'); say('Order cancelled');
  };
  /** Browser demo only: store a cancellation result, return its stock and record the refund owed. */
  const localCancel = (before: Order, result: Cancelled, note: string) => setState((s) => {
    const edits = { ...s.edits };
    for (const p of allProducts) { const np = restocked(edits[p.id] ?? p, result); if (np !== (edits[p.id] ?? p)) edits[p.id] = np; }
    const owed = (result.order.refundDue ?? 0) - (before.refundDue ?? 0);
    const refunds = owed > 0 ? [{ id: 'RF-' + (s.refunds.length + 1), orderId: before.id, source: 'cancellation' as const, amount: owed, status: 'Pending' as const, note, createdAt: Date.now() }, ...s.refunds] : s.refunds;
    return { ...s, edits, refunds, orders: s.orders.map((o) => (o.id === before.id ? result.order : o)) };
  });
  /** Pull the signed-in customer's latest orders, return requests and refunds, so admin changes show up on their own. */
  const refreshAccount = useCallback(async () => {
    if (!supabase || !uid.current) return;
    const db = supabase;
    const [ord, ret, ref] = await Promise.all([
      db.from('orders').select('data').order('created_at', { ascending: false }).limit(100),
      db.from('returns').select('data').order('created_at', { ascending: false }).limit(100),
      db.from('refunds').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    if (ord.error || ret.error || ref.error) return;
    const mine = (ord.data ?? []).map((r) => r.data as Order);
    setState((s) => ({ ...s, orders: [...mine, ...s.orders.filter((o) => !mine.some((m) => m.id === o.id))], returns: (ret.data ?? []).map((r) => r.data as ReturnReq), refunds: ((ref.data ?? []) as RefundRow[]).map(rowToRefund) }));
  }, []);
  useEffect(() => { refreshRef.current = () => { void refreshAccount(); }; }, [refreshAccount]);
  /**
   * Live push for this customer's orders, returns and refunds. Only open while a page that needs it is on screen (a connection
   * per visitor for the whole session would hit the realtime connection limit long before the shop's real capacity).
   * Returns a function that closes it. If push is unavailable the page's own timer still keeps things fresh.
   */
  const watchers = useRef(0);
  const watchAccount = useCallback(() => {
    watchers.current += 1;
    if (supabase && uid.current && !channelRef.current) {
      let t = 0; const poke = () => { window.clearTimeout(t); t = window.setTimeout(() => refreshRef.current(), 150); };
      channelRef.current = supabase.channel('account-' + uid.current)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'returns' }, poke)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, poke)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'refunds' }, poke)
        .subscribe();
    }
    return () => {
      watchers.current = Math.max(0, watchers.current - 1);
      if (watchers.current === 0 && channelRef.current && supabase) { void supabase.removeChannel(channelRef.current); channelRef.current = null; }
    };
  }, []);
  const lookupOrder: Store['lookupOrder'] = async (id, email) => {
    if (!supabase) return null;
    const { data } = await supabase.rpc('track_order', { p_id: id, p_email: email });
    const o = (data as Order | null) ?? null;
    if (o) setState((s) => ({ ...s, orders: s.orders.some((x) => x.id === o.id) ? s.orders.map((x) => (x.id === o.id ? o : x)) : [o, ...s.orders] }));
    return o;
  };

  const createReturn: Store['createReturn'] = async (r) => {
    if (isLive && supabase) {
      const { data, error } = await supabase.rpc('create_return', { p: r });
      if (error) return { ok: false, message: error.message };
      setState((s) => ({ ...s, returns: [data as ReturnReq, ...s.returns] }));
      kickAutomation();
      return { ok: true, message: 'Request sent', request: data as ReturnReq };
    }
    // Browser demo: same rules as the database function
    const o = state.orders.find((x) => x.id === r.orderId);
    if (!o) return { ok: false, message: 'Order not found.' };
    const bad = requestError(o, r.itemIndex, state.returns, r.kind);
    if (bad) return { ok: false, message: bad };
    if (r.reason.trim().length < 2) return { ok: false, message: 'Choose a reason.' };
    const it = o.items[r.itemIndex]; const piece = currentPiece(o, r.itemIndex, state.returns); let exchangeTo: ReturnReq['exchangeTo'];
    if (r.kind === 'exchange') {
      const p = allProducts.find((x) => x.id === it.productId);
      if (!r.exchangeSize) return { ok: false, message: 'Choose the size you want instead.' };
      if (r.exchangeSize === piece.size) return { ok: false, message: 'Choose a different size to exchange to.' };
      if (!p || sizeStock(p, piece.colourId, r.exchangeSize) < it.qty) return { ok: false, message: `Size ${r.exchangeSize} is not in stock right now. Choose another size, or request a return.` };
      exchangeTo = { colourId: piece.colourId, colourName: piece.colourName, size: r.exchangeSize };   // same colour only
    }
    const line = it.price * it.qty; const share = o.subtotal > 0 ? Math.round((o.discount * line) / o.subtotal) : 0; const now = Date.now();
    const request: ReturnReq = { id: 'R-' + (1001 + state.returns.length), orderId: o.id, itemIndex: r.itemIndex, productId: it.productId, productName: it.name, variant: `${piece.colourName} · ${piece.size}`, piece, qty: it.qty, kind: r.kind, reason: r.reason, note: r.note, exchangeTo, refundAmount: r.kind === 'return' ? line - share : 0, status: 'Requested', createdAt: now, history: [{ status: 'Requested', at: now }] };
    setState((s) => ({ ...s, returns: [request, ...s.returns] }));
    return { ok: true, message: 'Request sent', request };
  };
  const createReturnBatch: Store['createReturnBatch'] = async (r) => {
    if (isLive && supabase) {
      if (r.items.length === 1) {   // one item: the single-item function (works even before the multi-item database update)
        const only = r.items[0];
        const one = await createReturn({ orderId: r.orderId, itemIndex: only.itemIndex, kind: r.kind, reason: only.reason ?? r.reason ?? '', note: r.note ?? '', exchangeSize: only.exchangeSize });
        return one.ok ? { ok: true, message: one.message, requests: one.request ? [one.request] : [] } : { ok: false, message: one.message };
      }
      const { data, error } = await supabase.rpc('create_return_batch', { p: r });
      if (error) {
        if (error.code === 'PGRST202' || /create_return_batch/.test(error.message)) return { ok: false, message: 'Sending several items together needs a small database update that has not been applied yet. Please send one item at a time for now.' };
        return { ok: false, message: error.message };
      }
      const made = (data as ReturnReq[]) ?? [];
      setState((s) => ({ ...s, returns: [...made, ...s.returns] }));
      kickAutomation();
      return { ok: true, message: 'Request sent', requests: made };
    }
    // Browser demo: the same checks as the database function
    const o = state.orders.find((x) => x.id === r.orderId);
    if (!o) return { ok: false, message: 'Order not found.' };
    const built = buildBatch(o, r, state.returns, {
      sizesOf: (id) => allProducts.find((x) => x.id === id)?.sizes ?? null,
      stockOf: (id, colourId, size) => { const p = allProducts.find((x) => x.id === id); return p ? sizeStock(p, colourId, size) : 0; },
      nextId: (n) => 'R-' + (1001 + state.returns.length + n),
    });
    if ('error' in built) return { ok: false, message: built.error };
    setState((s) => ({ ...s, returns: [...built.requests, ...s.returns] }));
    return { ok: true, message: 'Request sent', requests: built.requests };
  };
  const refreshAdmin = useCallback(async () => {
    if (!isLive) return;   // the browser-only demo has no server data to refresh
    try { const r = await fetch('/api/admin/data', { credentials: 'same-origin', cache: 'no-store' }); if (r.ok) setAdminData((await r.json()) as AdminData); } catch { /* keep what we have */ }
  }, []);
  const updateReturn: Store['updateReturn'] = async (id, status, u = {}) => {
    if (adminData) {
      try {
        const r = await fetch('/api/admin/mutate', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ op: 'return.update', id, status, ...u }) });
        const d = (await r.json().catch(() => ({}))) as { message?: string };
        if (!r.ok) { const m = r.status === 401 ? 'Your admin session has expired. Please sign in again.' : d.message ?? 'That change could not be saved.'; say(m); return { ok: false, message: m }; }
        await refreshAdmin(); return { ok: true, message: 'Updated' };
      } catch { say('Could not reach the server.'); return { ok: false, message: 'Could not reach the server.' }; }
    }
    const cur = state.returns.find((x) => x.id === id);
    if (!cur) return { ok: false, message: 'Request not found.' };
    const upd = applyUpdate(cur, status, u);
    if ('error' in upd) { say(upd.error); return { ok: false, message: upd.error }; }
    const o = state.orders.find((x) => x.id === cur.orderId); const item = o?.items[cur.itemIndex ?? -1];
    const piece = cur.piece ?? (item ? { colourId: item.colourId, colourName: item.colourName, size: item.size } : undefined);
    if ((status === 'Approved' || status === 'Replacement packed') && cur.kind === 'exchange' && cur.exchangeTo && item) {
      const p = allProducts.find((x) => x.id === item.productId);
      if (!p || sizeStock(p, cur.exchangeTo.colourId, cur.exchangeTo.size) < item.qty) { const m = `Size ${cur.exchangeTo.size} is out of stock, so this exchange cannot go ahead.`; say(m); return { ok: false, message: m }; }
    }
    setState((s) => {
      let edits = s.edits; let refunds = s.refunds;
      const bump = (colourId: string, size: string, d: number) => { if (!item) return; edits = { ...edits }; const p = edits[item.productId] ?? allProducts.find((x) => x.id === item.productId); if (p) edits[item.productId] = { ...p, stock: { ...p.stock, [`${colourId}:${size}`]: Math.max(0, (p.stock[`${colourId}:${size}`] ?? 0) + d) } }; };
      if (item && piece) {
        if (status === 'Replacement packed' && cur.exchangeTo) { bump(piece.colourId, piece.size, item.qty); bump(cur.exchangeTo.colourId, cur.exchangeTo.size, -item.qty); }
        if (status === 'Completed' && cur.kind === 'return') {
          bump(piece.colourId, piece.size, item.qty);
          if ((cur.refundAmount ?? 0) > 0) refunds = [{ id: 'RF-' + (s.refunds.length + 1), orderId: cur.orderId, returnId: cur.id, source: 'return', amount: cur.refundAmount ?? 0, status: 'Pending', note: o?.payment === 'cod' ? 'Cash on delivery order: ask the customer for UPI or bank details' : 'Return completed', createdAt: Date.now() }, ...s.refunds];
        }
      }
      return { ...s, edits, refunds, returns: s.returns.map((x) => (x.id === id ? upd.ret : x)) };
    });
    return { ok: true, message: 'Updated' };
  };
  const setAutomation = async (key: string, value: string) => { const ok = await adminCall('setting.set', { key, value }); if (ok) await refreshAdmin(); return ok; };
  const markRefunded: Store['markRefunded'] = async (id, reference) => {
    if (adminData) { const ok = await adminCall('refund.markRefunded', { id, reference }); if (ok) { await refreshAdmin(); say('Marked as refunded'); } return ok; }
    setState((s) => ({ ...s, refunds: s.refunds.map((x) => (x.id === id ? { ...x, status: 'Refunded', reference: reference || undefined, processedAt: Date.now() } : x)) }));
    say('Marked as refunded'); return true;
  };

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
      // The shop creates the account already confirmed and signs the customer straight in (no emailed code). We simply try it:
      // only if the server says this is switched off (404) do we use the emailed-code route, never because of a slow connection.
      let resp: Response | null = null; let body: { error?: { message?: string } } = {};
      for (let attempt = 0; attempt < 2 && !resp; attempt++) {
        try {
          const ctl = new AbortController(); const t = window.setTimeout(() => ctl.abort(), 15000);
          resp = await fetch('/api/v1/auth/signup', { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, firstName, lastName, mobile }) });
          window.clearTimeout(t); body = await resp.json().catch(() => ({}));
        } catch { if (attempt === 1) return { ok: false, message: 'We could not reach the shop. Please check your connection and try again.' }; await sleep(800); }
      }
      if (resp && resp.status !== 404) {
        if (!resp.ok) return { ok: false, message: resp.status === 429 ? 'Too many sign-ups from this connection. Please try again in a minute.' : body.error?.message ?? 'We could not create your account.' };
        const si = await supabase.auth.signInWithPassword({ email, password });
        if (si.error || !si.data.user) return { ok: true, message: 'Account created. Please log in.' };
        await hydrateRef.current?.(si.data.user);
        if (fit) run(supabase.from('profiles').update({ fit }).eq('id', si.data.user.id));
        return { ok: true, message: 'Account created' };
      }
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, mobile } } });
      if (error) return { ok: false, message: /rate limit/i.test(error.message) ? 'We are sending a lot of sign-up emails right now. Please try again in a few minutes.' : error.message };
      if (data.session && data.user) await hydrateRef.current?.(data.user);
      if (fit && data.session) run(supabase.from('profiles').update({ fit }).eq('id', data.session.user.id));
      // Supabase returns an empty identities list for an email that is already registered.
      if (data.user && data.user.identities?.length === 0) return { ok: false, message: 'An account with this email already exists. Try logging in.' };
      return data.session ? { ok: true, message: 'Account created' } : { ok: true, needsConfirm: true, message: 'Check your email to confirm your account, then log in.' };
    },
    signIn: async (email, password) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      // Wait until the account (profile, orders, addresses) is loaded, so the next page already knows who is signed in.
      if (!error && data.user) await hydrateRef.current?.(data.user);
      if (error && /confirm/i.test(error.message)) return { ok: false, needsConfirm: true, message: 'Please confirm your email with the 6-digit code we sent you.' };
      return error ? { ok: false, message: 'Email or password is not right.' } : { ok: true, message: 'Signed in' };
    },
    verifyEmail: async (email, code) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'signup' });
      if (error || !data.user) return { ok: false, message: 'That code is not right or has expired. Check it, or ask for a new one.' };
      await hydrateRef.current?.(data.user);   // wait until the account is loaded so the next page knows who is signed in
      return { ok: true, message: 'Email confirmed' };
    },
    resendConfirmation: async (email) => {
      if (!supabase) return { ok: false, message: 'Accounts are unavailable.' };
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      return error ? { ok: false, message: 'We could not resend the email just now. Please wait a minute and try again.' } : { ok: true, message: 'A new code is on its way.' };
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

  const upsertAdminProduct = (p: Product) => { void adminCall('product.upsert', { product: p, baseStock: adminData?.products.find((x) => x.id === p.id)?.stock }).then((ok) => ok && patchAdmin((d) => ({ ...d, products: d.products.some((x) => x.id === p.id) ? d.products.map((x) => (x.id === p.id ? p : x)) : [...d.products, p] }))); };
  const setAdminActive = (id: string, active: boolean) => { void adminCall('product.setActive', { id, active }).then((ok) => ok && patchAdmin((d) => ({ ...d, products: d.products.map((x) => (x.id === id ? { ...x, active } : x)) }))); };
  const saveProduct = (p: Product) => { if (adminData) upsertAdminProduct(p); else setState((s) => ({ ...s, edits: { ...s.edits, [p.id]: p } })); };
  const createProduct = (p: Product) => { if (adminData) upsertAdminProduct(p); else setState((s) => ({ ...s, extra: [...s.extra, p] })); };
  const archiveProduct = (id: string) => { if (adminData) setAdminActive(id, false); else setState((s) => ({ ...s, removed: [...s.removed, id] })); };
  const restoreProduct = (id: string) => { if (adminData) setAdminActive(id, true); else setState((s) => ({ ...s, removed: s.removed.filter((x) => x !== id) })); };

  /** Apply a cancellation result to whichever data set is active; returns false if the rules refuse it. */
  const adminCancel = async (id: string, op: 'order.cancel' | 'order.cancelItem', args: Record<string, unknown>, compute: (o: Order) => Cancelled | null) => {
    const current = (adminData ? adminData.orders : state.orders).find((o) => o.id === id);
    const result = current && compute(current);
    if (!current || !result) { say('This order can no longer be cancelled.'); return false; }
    if (adminData) { if (!(await adminCall(op, { id, ...args }))) return false; patchAdmin((d) => ({ ...d, orders: d.orders.map((o) => (o.id === id ? result.order : o)), products: d.products.map((p) => restocked(p, result)) })); void refreshAdmin(); }
    else localCancel(current, result, typeof args.reason === 'string' && args.reason ? args.reason : 'Cancelled by admin');
    say(result.whole ? 'Order cancelled and stock returned' : 'Item cancelled and stock returned');
    return true;
  };
  const restocked = (p: Product, r: Cancelled): Product => {
    const back = r.restock.filter((i) => i.productId === p.id);
    if (!back.length) return p;
    const stock = { ...p.stock };
    for (const i of back) stock[`${i.colourId}:${i.size}`] = (stock[`${i.colourId}:${i.size}`] ?? 0) + i.qty;
    return { ...p, stock };
  };
  const adminCancelOrder: Store['adminCancelOrder'] = (id, reason) => adminCancel(id, 'order.cancel', { reason }, (o) => cancelWholeRule(o, reason));
  const adminCancelItem: Store['adminCancelItem'] = (id, index, reason) => adminCancel(id, 'order.cancelItem', { index, reason }, (o) => cancelItemRule(o, index, reason));

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
    wishlist: state.wishlist, isWished: (id) => state.wishlist.some((k) => parseW(k).productId === id), isWishedVariant: (id, colourId, size) => state.wishlist.includes(wkey(id, colourId, size)), toggleWish, removeWishProduct,
    coupon, applyCoupon, removeCoupon, price, placeOrder,
    orders: adminData?.orders ?? state.orders, advanceOrder, cancelOrder, returns: adminData?.returns ?? state.returns, refunds: adminData?.refunds ?? state.refunds, createReturn, createReturnBatch, updateReturn, markRefunded,
    reviews: adminData?.reviews ?? state.reviews, addReview, setReviewStatus,
    user: state.user, signIn, signOut, updateUser, addresses: state.addresses, saveAddress, removeAddress,
    coupons: adminData?.coupons ?? state.coupons, saveCoupon, saveProduct, createProduct, archiveProduct, restoreProduct,
    notifyMe, notified: state.notify, prefs: { whatsapp: state.whatsapp, newsletter: state.newsletter }, setPrefs, toast, say,
    live: isLive, authReady, auth, lookupOrder, adminStatus, enterAdmin, leaveAdmin, refreshAdmin, refreshAccount, watchAccount, automation: adminData?.automation ?? null, setAutomation, adminCancelOrder, adminCancelItem,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
