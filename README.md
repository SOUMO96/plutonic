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

1. Plays the approved single NASA/JPL-Caltech black-hole pullback.
2. The event-horizon and accretion-disk framing is aligned with the supplied PLUTONIC mark: the disk axis matches the logo slash angle and the central opening aligns with the symbol aperture.
3. The background push and logo reveal use one shared CSS timeline. The source video remains visible while the cropped, transparent source logo is revealed over it; the video fades only after the logo is already legible.
4. The logo is a single image asset at `public/plutonic-logo-transparent.svg`. It uses the existing artwork from `public/plutonic-logo.webp`, crops the surrounding dark canvas/perimeter, and applies a luminance key so no square image background is displayed. No logo is redrawn, and no particles or duplicate wordmark are used.
5. The final image contains the supplied symbol and PLUTONIC wordmark once. The punchline constant remains empty until approved wording is provided.
6. The scene continues into the FOR HIM / FOR HER collection gateway.

The intro has a skip control and respects `prefers-reduced-motion`. The EHT M87* observation remains as fallback if the external video cannot play.

## Scientific image and video credits

- **EHT observation:** Event Horizon Telescope Collaboration, M87*, 2019. Image supplied by the European Southern Observatory (ESO): https://www.eso.org/public/images/eso1907a/
- **Moving simulation footage:** NASA/JPL-Caltech/R. Hurt (IPAC), *Black Hole with Accretion Disk Visualization*: https://svs.gsfc.nasa.gov/14619/

The M87* frame is an observational reconstruction. The moving footage is a NASA scientific visualization, not live telescope footage. NASA describes this visualization as a qualitatively correct depiction using a simplified optical model, rather than a full general-relativistic ray-tracing calculation.

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The starter project did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state. Real order processing still needs to be connected.
