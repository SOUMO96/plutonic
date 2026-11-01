# PLUTONIC — Beyond the Ordinary

A cinematic, dark editorial storefront concept built with React 19, Vite, and TypeScript.

## Run locally

Prerequisites: Node.js 20+

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. Run TypeScript checks with `npm run lint`.

## Opening sequence

1. Plays the approved single NASA/JPL-Caltech black-hole pullback. The plate is rotated so the accretion disk follows the PLUTONIC slash angle.
2. At 7.5 s a WebGL canvas (`src/components/BlackHoleLogoMorph.tsx`, `src/lib/blackHoleLogoMorph.ts`) takes over on the identical pixels by reading the video plate's live CSS transform.
3. Pull-back: the camera eases back and re-centres the black hole on the lockup position while the footage keeps playing, slowing toward the end.
4. Transformation: the live footage is deformed (disk compressed into the slash, a brief frame-dragging twist) and its luminance field is level-set morphed into a signed-distance field generated at runtime from `public/plutonic-logo.webp`. The photon ring becomes the ring, the disk becomes the slash, and the shadow remains the solid dark aperture. The mark is never drawn as a separate image.
5. The symbol settles, then the asset's own PLUTONIC wordmark is revealed, followed by the punchline BEYOND THE ORDINARY.
6. The scene continues into the FOR HIM / FOR HER collection gateway.

In development, `window.__morphHold = <seconds>` freezes the transformation timeline for frame inspection (stripped from production builds).

The intro has a skip control and respects `prefers-reduced-motion` (a static lockup that reveals symbol, wordmark and punchline in sequence; the same lockup is the fallback when WebGL or the local footage is unavailable). The EHT M87* observation remains as fallback if the external video cannot play.

## Scientific image and video credits

- **EHT observation:** Event Horizon Telescope Collaboration, M87*, 2019. Image supplied by the European Southern Observatory (ESO): https://www.eso.org/public/images/eso1907a/
- **Moving simulation footage:** NASA/JPL-Caltech/R. Hurt (IPAC), *Black Hole with Accretion Disk Visualization*: https://svs.gsfc.nasa.gov/14619/

The M87* frame is an observational reconstruction. The moving footage is a NASA scientific visualization, not live telescope footage. NASA describes this visualization as a qualitatively correct depiction using a simplified optical model, rather than a full general-relativistic ray-tracing calculation.

## Storefront

After the cinematic intro (first visit only) the site opens on the homepage. It is a hash-routed storefront (`src/site/`) built from the approved Claude Design canvas ("PLUTONIC — Premium Activewear E-commerce"). Routes: `#/` home, `#/men`, `#/women`, `#/shop` (listing, filters, sort, search), `#/product/:id`, `#/cart`, `#/checkout`, `#/order/:id`, `#/account`, `#/tracking/:id`, `#/wishlist`, `#/returns`, `#/about`, `#/support`. `#/shop` accepts `g` (men/women), `cat`, `size`, `colour`, `fabric`, `price`, `q`, `new=1` and `sort`; the URL is the single source of truth, so filters survive refresh and Back. A shared link such as `https://…/#/product/m2`, skips the intro; every fresh load of the site (including `/#/`) plays it, and the footer has a "Replay the welcome film" link.

- `src/site/catalog.ts` is the single product dataset (16 demonstration products, sizes, colours, per-size stock, prices in ₹). Every page reads products through `useStore()`.
- `src/site/store.tsx` holds cart, wishlist, coupons, orders, returns, reviews, account and admin edits in `localStorage` (key `plutonic-demo-store-v1`).
- `src/site/pages/` has one file per page; `src/site/site.css` holds the design tokens and responsive rules.
- Product photographs live in `public/images/` (see `public/images/LICENSES.md`). A product without a photo shows the design's tonal placeholder card. Add files and list them in `images` in `catalog.ts`, or upload them in Admin → Products → Edit.

### What is real and what is simulated

This storefront is connected to **Supabase** (see "Database" below) when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set; without them it falls back to the original browser-only demo. In that demo mode there is **no backend**: sign-in (mobile OTP code `123456`, any email and password), payment, order processing, delivery tracking steps and the admin dashboard are simulated in the browser, and the admin has no authentication. Stock decrements when an order is placed and admin edits (products, stock, coupons, returns, reviews, order status) show up on the storefront immediately, but only in the same browser. Replace `store.tsx` with calls to a real API (auth, inventory, payments, orders) to go live. Legal and policy text, the founding story and support contact details are marked placeholders awaiting your content.


## Administrator access (server-verified)

A customer account is never an administrator. The dashboard at `#/admin` is reachable only with a signed, HttpOnly session cookie issued by a Vercel serverless function after a password check on the server. Nothing in localStorage, the URL, or the customer login can grant it, and the dashboard code is not downloaded until the server confirms the session. Default is deny: a missing or failing check, unreachable API, or missing configuration all show the sign-in page.

- Sign in at **`/#/admin/login`** (not linked from the customer site).
- API (`api/admin/`): `POST /api/admin/login`, `GET /api/admin/session`, `POST /api/admin/logout`. Every future admin endpoint must start with `const cfg = requireAdmin(req, res); if (!cfg) return;` (`api/_lib/adminAuth.ts`).
- Password: scrypt hash, constant-time comparison, same work done for a wrong email. Session: HMAC-SHA256 signed token, 8 h absolute expiry, `HttpOnly; SameSite=Strict; Path=/api/admin` (+ `Secure` on HTTPS), cleared on sign-out. Login/logout reject cross-origin and non-JSON requests; login is throttled (8 attempts / 15 min per IP, best effort per warm instance).

### Configure (outside the source code)

1. `npm run admin:hash` — type a password (12+ chars) into your own terminal; it prints three values.
2. Vercel → Project → Settings → Environment Variables (Production/Preview): `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`. Never prefix with `VITE_`; never commit them. Redeploy after adding.
3. Locally, put the same three in `.env.local` (git-ignored); `npm run dev` serves `/api/admin/*` through a dev-only middleware (`vite.config.ts`).
4. To sign every admin out at once, change `ADMIN_SESSION_SECRET`. To change the password, regenerate the hash.

### Limitations

- The dashboard's *data* (products, stock, orders, coupons, edits) still lives in each visitor's browser `localStorage`; it is demonstration data, not centrally secured. Server-side protection covers access to the interface, not that data. A real store needs a database behind admin endpoints that use `requireAdmin`.
- One administrator account. The login throttle is in-memory per serverless instance; use Vercel Firewall/rate limiting for stronger protection. Sign-out clears the cookie but a copied token stays valid until it expires (max 8 h) or the secret is rotated.


## Database (Supabase)

Project `plutonic` (ap-south-1). Schema and policies were applied as migrations `plutonic_core_schema` and `restock_on_cancel`.

- **Tables** (all with row-level security): `products` (public read of active items), `coupons` (no client access), `profiles`, `addresses`, `wishlist` (own rows only), `orders`, `returns` (own rows read-only), `reviews` (public read of Published; signed-in users insert Pending).
- **Customer sign-in:** Supabase Auth, email + password. Mobile OTP is demo-only and is hidden when the database is connected. Email confirmation follows your Supabase Auth settings.
- **Orders** are created only by the `place_order` database function, which recomputes prices, coupon discount, shipping and stock from the database and decrements stock atomically. Browsers cannot insert or edit orders, products or coupons. **Placing an order requires a signed-in account** (checkout redirects visitors to log in or sign up and returns them with their bag; the database also refuses orders from anonymous callers). Guests can still look up an existing order with order number + email (`track_order`). Payment is still simulated.
- **Admin dashboard data** (every order, returns, reviews, coupons, all products) is read and written only through `/api/admin/data` and `/api/admin/mutate`, which require the administrator session described above and use the **service-role key on the server**.
- No database role or "admin" flag exists that a customer account could be given.

### Environment variables

| Variable | Where | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | browser + Vercel | No, public by design (RLS protects the data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + `.env.local` only | **Yes**, server-only; never prefix with `VITE_` |
| `SUPABASE_URL` (optional) | server | No; defaults to `VITE_SUPABASE_URL` |

Copy the service-role key from Supabase → Project Settings → API. Without it the admin dashboard shows a "database not configured" banner and saves nothing.

### Limitations

- Products edited in the admin overwrite the whole product record; an admin edit made at the same moment as a customer order could overwrite that order's stock change.
- Admin image uploads are stored inside the product record as data URLs. Move them to Supabase Storage before adding many photos.
- Rating averages and review counts on products are static numbers from the catalogue, not computed from reviews.
- No email is sent for orders, and payment is simulated.

## REST API for web and future mobile apps

The reusable backend is documented in [API.md](API.md): versioned endpoints under `/api/v1/` (catalogue, carts, wishlist, addresses, orders, returns, reviews, Cashfree payments) that share one Supabase database and one set of accounts with the web storefront, so a Flutter app can connect later without a second backend.

### Cancelling orders (admin)

In the dashboard's Orders list, **Cancel…** opens a dialog to cancel the **whole order** or **one item** (with a reason and optional note). It works until the order is delivered; stock is returned immediately, and cancelling the last open item cancels the whole order. Refunds are only *recorded* (`refundDue` on the order, shown to the admin and the customer): online-paid orders owe the item price minus its share of any coupon discount (the full total, including shipping, when the whole order is cancelled); pay-on-delivery orders owe nothing. Sending the money back still has to be done by an administrator in Cashfree/your bank; there is no automatic refund yet. Rules live in `src/site/orderCancel.ts` and are shared by the browser demo store and `/api/admin/mutate`.

### Email verification codes (sign-up)

Sign-up confirms the email with a **6-digit code** (Supabase Auth + `verifyOtp`), not a link. One-time dashboard setup: (1) Authentication > SMTP Settings: enable custom SMTP with a free provider (Brevo, Gmail app password, ...) because Supabase's built-in sender allows only a few emails per hour; (2) Authentication > Email Templates > "Confirm signup": paste `supabase/email-templates/confirm-signup.html` (it must contain `{{ .Token }}`); (3) keep Providers > Email > "Confirm email" ON. Resending a code and signing in with an unconfirmed email both lead to the same code screen.

### Orders, returns, exchanges and refunds

Customers manage everything on **Account > Orders**: each order expands to show live tracking, a Cancel button (until it ships), and Return or exchange per item once delivered (14-day window). Each item can have only **one open request**, enforced by the database (a unique index plus the `create_return()` function), so repeated or simultaneous clicks cannot create duplicates; a rejected request may be re-submitted. Exchanges must name a different size/colour that is in stock. After sending, the customer sees a confirmation and then a timeline on the item: Requested, Approved, Pickup scheduled (date and slot), Picked up, Completed, with the admin's message.

In the admin dashboard, **Returns** moves a request along (approve, schedule pickup, picked up, complete, or reject with a reason); completing a return puts the item back in stock and adds a line to **Refunds**, completing an exchange swaps the stock. **Refunds** is the ledger of money owed to customers (cancelled orders/items and completed returns): send the money from Cashfree or your bank, then press Mark refunded and add the payment reference; the customer sees it as sent. The app records refunds but does not send money automatically. The dashboard refreshes itself every 20 seconds (and has a Refresh button). Rules: `src/site/returnRules.ts`, `src/site/orderCancel.ts`; schema: migrations 005 and 006.
