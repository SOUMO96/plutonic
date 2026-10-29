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

1. Opens on the EHT M87* observation as a loading fallback, then plays the single approved NASA/JPL-Caltech pullback clip.
2. The moving black-hole plate is rotated to match the uploaded logo slash axis (approximately -21.3° on screen).
3. The camera pullback completes, then the video performs a controlled push-in and fades towards black.
4. The supplied PLUTONIC artwork crossfades in as one image. It already contains one symbol and one wordmark, so no generated logo, particle layer, or duplicate typography is rendered.
5. The punchline remains an empty editable constant in `src/components/PlutonicLogoReveal.tsx`; no wording is invented.
6. The same background component remains mounted for the subsequent FOR HIM / FOR HER screen.

The intro has a skip control and respects `prefers-reduced-motion`. The EHT image remains a still fallback if the NASA video is unavailable or browser autoplay is blocked.

## Scientific image and video credits

- **EHT observation:** Event Horizon Telescope Collaboration, M87*, 2019. Image supplied by the European Southern Observatory (ESO): https://www.eso.org/public/images/eso1907a/
- **Moving simulation footage:** NASA/JPL-Caltech/R. Hurt (IPAC), *Black Hole with Accretion Disk Visualization*: https://svs.gsfc.nasa.gov/14619/

The M87* frame is an observational reconstruction. The moving footage is a NASA scientific visualization, not live telescope footage. NASA describes this visualization as a qualitatively correct depiction using a simplified optical model, rather than a full general-relativistic ray-tracing calculation. The visuals are credited in the opening scene.

## Brand asset

The supplied PLUTONIC artwork is stored at `public/plutonic-logo.webp`. The intro displays this one complete image asset for the final lockup; it is not reconstructed with CSS, SVG or particle effects. Replace this file when the approved master artwork changes. The black-hole sequence and logo crossfade are independent of the asset.

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The starter project did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state. Real order processing still needs to be connected.

## Performance notes

- Uses the single NASA pullback clip as the moving astrophysical background.
- The final logo lockup is the supplied original artwork, shown once as a single image.
- The video plate is rotated to align its accretion-disk axis with the diagonal slash in the supplied logo.
- No decorative photon-ring overlay, extra orbital border, particle canvas, or duplicated wordmark is used.
- The EHT image remains available as a poster / loading fallback.
- Video is muted and plays inline; network availability and browser autoplay policy can affect the opening sequence.
