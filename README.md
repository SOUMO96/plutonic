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

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The starter project did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state. Real order processing still needs to be connected.
