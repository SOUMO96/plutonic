# PLUTONIC REST API (v1)

One reusable backend for the web storefront today and a Flutter (Android/iOS) app later. Same Supabase database, same accounts, same inventory and coupons. No UI code lives in the API.

- Base URL: `https://<your-site>/api/v1` (locally `http://localhost:3000/api/v1`)
- Code: `server/v1/` (routes, rules, Cashfree), served by the single function `api/v1/index.ts (vercel.json rewrites every /api/v1/* path to it)`
- Format: JSON in and out. `POST/PUT/PATCH` need `Content-Type: application/json`.
- Errors: `{ "error": { "code": "...", "message": "..." } }` with the matching HTTP status (400 invalid, 401 sign in, 404, 405, 409, 413, 415, 422 rejected by a business rule, 429 rate limited, 5xx).
- Money is integer rupees. Product/order objects use the same shapes as the web app (`src/site/catalog.ts`, `store.tsx`).

## Authentication

Customers sign in with **Supabase Auth** (email + password). Send the access token on protected calls:

```
Authorization: Bearer <supabase access_token>
```

Flutter: `supabase_flutter` → `Supabase.instance.client.auth.signInWithPassword(...)`, then use `auth.currentSession!.accessToken` as the bearer token, or call Supabase directly (row-level security gives the same isolation). Guests may browse and look up an order (order number + email), but **placing an order requires a signed-in account**.

## Endpoints

| Method & path | Auth | Purpose |
|---|---|---|
| `GET /config` | – | API version and whether online payments are enabled |
| `GET /products?gender=&category=&q=&limit=&offset=` | – | Active catalogue (men/women collections, filters, search) |
| `GET /products/:id` | – | One product incl. colours, sizes, per-variant stock |
| `GET /categories` | – | Category list per gender |
| `GET /coupons/:code` | – | Look up an active coupon (no listing) |
| `GET /reviews?productId=` | – | Published reviews |
| `POST /orders` | yes | **Checkout.** Body: `items[{productId,colourId,size,qty}]`, `coupon`, `delivery` (standard/express), `payment` (upi/card/netbanking/cod), `address`, `email`, `mobile`. Prices, discount, shipping and stock are computed on the server; any client prices are ignored. Returns the order |
| `GET /orders/track?id=&email=` | – | Guest order lookup (id + email must match) |
| `GET /orders`, `GET /orders/:id` | yes | The caller's order history / one order (tracking steps are in `step` and `history`) |
| `POST /orders/:id/cancel` | yes | Cancel before it ships, i.e. while confirmed or packed (stock is returned; refund is paid automatically) |
| `GET /returns`, `POST /returns` | yes | List / request a return or exchange for ONE item: `{orderId, itemIndex, kind: return\|exchange, reason, note?, exchangeSize?}`. Delivered orders within 14 days only; one open request per item; an item can be exchanged once (size only, same colour), after that it can only be returned. Each request carries `status`, `history[]`, `pickupDate`/`pickupSlot` and `adminNote` so an app can show a timeline |
| `GET /refunds` | yes | The caller's refunds: pending or refunded |
| `POST /reviews` | yes | Submit a review (held for moderation) |
| `GET /me`, `PATCH /me` | yes | Profile and preferences |
| `GET /cart`, `PUT /cart` | yes | Server-side cart shared by all devices (`PUT` replaces it) |
| `GET /wishlist`, `PUT /wishlist/:productId`, `DELETE /wishlist/:productId` | yes | Wishlist |
| `GET/POST /addresses`, `PUT/DELETE /addresses/:id` | yes | Saved addresses |
| `POST /payments/cashfree/session` | optional | Start payment for a pending order: `{orderId, email}` → `{paymentSessionId, mode}` |
| `GET /payments/cashfree/verify?orderId=` | – | Settle with Cashfree and return `paid` / `pending` / `closed` |
| `POST /payments/cashfree/webhook` | signature | Cashfree notifications (HMAC-verified; the order is re-checked with Cashfree before being marked paid) |
| `POST /automation/kick`, `POST /automation/tick` | yes / secret | Run whatever fulfilment automation is due (idempotent). `kick` needs a signed-in customer's token. `tick` is for a scheduler and requires `x-automation-secret` (it fails closed in production when `AUTOMATION_SECRET` is not set) |
| `POST /couriers/:name/webhook` | courier signature | Courier tracking updates (501 until an adapter for that courier exists) |

Admin operations are **not** part of this public API. They use `/api/admin/*`, which requires the separate administrator session (see README).

## Payments (Cashfree)

1. App calls `POST /orders`. While payments run in `cashfree` mode every non-COD order is created `paymentStatus: "pending"` and its stock is held for 30 minutes. COD orders are `cod`.
2. App calls `POST /payments/cashfree/session` and receives `paymentSessionId`.
3. Web: Cashfree JS SDK `checkout({ paymentSessionId })`. Flutter: the Cashfree Flutter SDK with the same `paymentSessionId` and `orderId`.
4. Cashfree returns the customer and also calls the webhook. The server asks Cashfree for the real status and calls `mark_order_paid` (amount must equal the order total) or `fail_order` (cancels and restocks). Both are idempotent. Unpaid orders expire after 30 minutes.

Enabling it needs **both**: server env vars `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENV` (`sandbox`/`production`), `SITE_URL`; and the database switch `update app_settings set value='cashfree' where key='payments_mode';`. In Cashfree's dashboard set the webhook URL to `https://<your-site>/api/v1/payments/cashfree/webhook`. Until then payments stay simulated. *The Cashfree calls are written to the 2023-08-01 API but have not been run against the gateway; test in sandbox first.*

## Security model

- Row-level security on every table: customers can read and write only their own rows; the catalogue is public read-only; clients cannot write orders, products or coupons directly.
- Orders, stock and payment settlement run in database functions / server code, never from browser state.
- Service-role and Cashfree secrets exist only in server environment variables; the browser and mobile apps use only the public Supabase URL and publishable key.
- Rate limits per IP (best effort per serverless instance): 120/min general, 10/min checkout, 20/min coupon/track/payments/writes. Add Vercel Firewall rate limiting for hard guarantees.
- Webhook bodies are verified with HMAC-SHA256 (`x-webhook-signature` over `x-webhook-timestamp + rawBody`).

## Database objects every client shares

Tables: `products`, `categories`, `coupons`, `profiles`, `addresses`, `wishlist`, `carts`, `cart_items`, `orders`, `returns`, `reviews`, `payments`, `app_settings`. View: `product_variants` (colour × size stock). Functions: `place_order`, `track_order`, `cancel_order`, `create_return`, `get_coupon`, `set_cart`, plus server-only `mark_order_paid`, `fail_order`, `expire_pending_orders`, `restock_items`. SQL is in `supabase/`.
