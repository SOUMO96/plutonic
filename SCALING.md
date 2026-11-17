# Running a big sale on PLUTONIC

Nothing can promise "it never fails". What this setup is built to do is **never lose or double an order, never oversell, never charge twice, and slow down politely instead of breaking.**

## What was measured (one laptop, free-tier-sized database, real Supabase project)

| Test | Result |
| --- | --- |
| 120 shoppers press "Place order" at the same instant for 25 units | exactly 25 orders, 95 clean "no longer available", **0 oversold, stock never negative**, all answered in under 1 second |
| 60 orders arrive at once | all 60 packed with a courier booked in **8 seconds**, no duplicate tracking numbers, no errors |
| 1,000 uncached catalogue reads, 100 at a time | about 150/s straight from the database. In production the CDN absorbs these (see below) |

Treat these as a floor: they came from a home connection to a small database. They say the *logic* is correct under pressure; they are not a promise about the maximum.

## How it is built to hold

- **Catalogue and reviews come from a CDN-cached API** (`s-maxage=20`, with `stale-while-revalidate` and `stale-if-error`). A rush of 100,000 browsers becomes a handful of database reads per 20 seconds, and if the database stumbles the CDN keeps serving the last good copy for up to an hour. If the API itself is unreachable the browser falls back to asking the database directly.
- **Stock can never oversell.** Each order locks only the products it contains, checks stock, and subtracts it in one step. Two people can never take the last unit.
- **Retries are safe.** Each checkout attempt carries a one-time key. If the network blinks or the shop is busy, the browser waits and retries with the same key and the database returns the order already placed instead of creating a second one. (Needs migration `011_scale.sql`; until it is applied the browser does not auto-retry and tells the customer to check My Orders.)
- **Busy is not broken.** Timeouts, "too many connections" and gateway errors are retried with a growing, randomised delay and a friendly message. Real refusals (out of stock, bad coupon) show immediately.
- **The automation scales sideways.** A database lease lets any number of servers run it without colliding, it works through a backlog in parallel batches for up to 25 seconds per run, and every action is guarded so doing it twice is harmless.
- **Live updates are optional.** A realtime connection opens only while the Orders page is open (not for every visitor), and the page also checks every 12-20 seconds at randomised times as a fallback.
- **Pages fail softly.** An error in one page shows "This page could not load" with a reload button; the header, bag and footer keep working.
- **Abuse limits are shared.** Checkout, coupons, tracking, payment and admin sign-in are rate limited in the database, so the limit holds across every server. Cash-on-delivery is capped per customer and coupons are one use per customer.
- **Heavy files are cached and slow connections are spared.** Static assets are cached for a year, the intro film is skipped down to the small version on Data Saver or 2G/3G.
- **Repeat visits start from the device.** A small service worker (`src/sw.ts`) keeps the app shell (HTML, hashed JS/CSS), images and the logo on the visitor's device. The page is fetched from the network first (3 s timeout) so a new deploy shows at once; offline or slow, the saved shell opens. It never touches `/api`, admin, Supabase, Cashfree, other sites, non-GET requests or anything with an Authorization header, and caches are wiped on customer and admin sign-out. A new version shows a "New version available" bar; nothing reloads by itself.
- **A database stampede is absorbed in two layers.** The CDN serves public catalogue reads; behind it a tiny per-server cache (`server/v1/memo.ts`) lets one query per key run every few seconds while everyone else shares the answer (and serves the last good answer if the database stumbles). Public routes use an anonymous database client and ignore the caller's token, so nothing user-specific can ever be shared.
- **Health check:** `GET /api/v1/health` returns the database response time. Point an uptime monitor at it.

## Before a real sale: your checklist

1. **Run `supabase/migrations/011_scale.sql`** in the Supabase SQL editor (safe retries, automation lease, indexes). Then `GET /api/v1/config` shows `"idempotentOrders": true`.
2. **Upgrade the database for the day.** The free tier is not meant for a sale. Use Supabase Pro and raise the compute size (Small/Medium, or larger for a big sale), keep connection pooling on, and enable Realtime only if you want live pushes.
3. **Use a Vercel plan that fits the traffic** and keep the project and the database in the same region (the database is in Mumbai).
4. **Add the scheduler** that calls `POST /api/v1/automation/tick` every minute with `x-automation-secret` (set `AUTOMATION_SECRET`). Without it the backlog only moves when someone visits.
5. **Cashfree**: switch to production keys, confirm your account's payment rate limits and that your webhook URL is set. Do the same for the courier's booking limits.
6. **Monitoring and alerts**: uptime check on `/api/v1/health`, Vercel and Supabase dashboards for errors and connections, and the admin Automation page for items flagged "needs review".
7. **Rehearse**: run a load test (k6 or similar) against a staging copy at 2-3x the traffic you expect, and watch database CPU and connections.
8. **Plan for a spike**: announce the start time, put the hero product's stock where you want it, and consider a queue/waiting page (a service such as Cloudflare Waiting Room) in front of checkout if you expect far more people than you can serve at once. A waiting room is the standard way to turn "everyone at once" into "everyone, in order".

## Honest limits

- One database is the ceiling. This design comfortably serves thousands of shoppers browsing and hundreds of order attempts per second on a decent compute size. Tens of thousands of *orders* per second, or millions of simultaneous shoppers, needs a different design (stock held in a fast in-memory store, orders taken through a queue). That is a larger project, worth doing only if you genuinely expect that volume.
- Payment gateways, couriers and email providers have their own limits and outages; the shop slows down and retries around them but cannot make them faster.
- No code can stop a provider (Supabase, Vercel, Cashfree) from having an incident. The design is meant to fail soft: never lose an order, tell the customer clearly, and recover on its own when the provider does.
