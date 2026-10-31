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

After the cinematic intro (first visit only) the site opens on the homepage. It is a hash-routed storefront (`src/site/`) built from the approved Claude Design canvas ("PLUTONIC — Premium Activewear E-commerce"). Routes: `#/` home, `#/men`, `#/women`, `#/shop` (listing, filters, sort, search), `#/product/:id`, `#/cart`, `#/checkout`, `#/order/:id`, `#/account`, `#/tracking/:id`, `#/wishlist`, `#/returns`, `#/admin`, `#/about`, `#/support`. `#/shop` accepts `g` (men/women), `cat`, `size`, `colour`, `fabric`, `price`, `q`, `new=1` and `sort`; the URL is the single source of truth, so filters survive refresh and Back. A shared link such as `https://…/#/product/m2`, skips the intro; every fresh load of the site (including `/#/`) plays it, and the footer has a "Replay the welcome film" link.

- `src/site/catalog.ts` is the single product dataset (16 demonstration products, sizes, colours, per-size stock, prices in ₹). Every page reads products through `useStore()`.
- `src/site/store.tsx` holds cart, wishlist, coupons, orders, returns, reviews, account and admin edits in `localStorage` (key `plutonic-demo-store-v1`).
- `src/site/pages/` has one file per page; `src/site/site.css` holds the design tokens and responsive rules.
- Product photographs live in `public/images/` (see `public/images/LICENSES.md`). A product without a photo shows the design's tonal placeholder card. Add files and list them in `images` in `catalog.ts`, or upload them in Admin → Products → Edit.

### What is real and what is simulated

This is a front-end implementation. There is **no backend**: sign-in (mobile OTP code `123456`, any email and password), payment, order processing, delivery tracking steps and the admin dashboard are simulated in the browser, and the admin has no authentication. Stock decrements when an order is placed and admin edits (products, stock, coupons, returns, reviews, order status) show up on the storefront immediately, but only in the same browser. Replace `store.tsx` with calls to a real API (auth, inventory, payments, orders) to go live. Legal and policy text, the founding story and support contact details are marked placeholders awaiting your content.
