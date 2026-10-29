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

1. Opens on the EHT M87* observation fallback, then plays the single approved NASA/JPL-Caltech pullback shot.
2. At the end of the pullback, the background performs a cinematic push-in and darkens toward black.
3. Warm accretion-disk light and white photon-ring particles converge, then reform into points sampled from the supplied PLUTONIC logo artwork.
4. Once the particle field settles, the original replaceable logo asset at `public/plutonic-logo.svg` appears sharply for the final brand hold.
5. The punchline remains an empty editable constant in `src/components/PlutonicLogoReveal.tsx`; no tagline is invented.
6. The same background component remains mounted for the subsequent FOR HIM / FOR HER screen.

The intro has a skip control and respects `prefers-reduced-motion`. The real observation remains as a still fallback if the external video is unavailable or autoplay is blocked.

## Scientific image and video credits

- **EHT observation:** Event Horizon Telescope Collaboration, M87*, 2019. Image supplied by the European Southern Observatory (ESO): https://www.eso.org/public/images/eso1907a/
- **Moving simulation footage:** NASA/JPL-Caltech/R. Hurt (IPAC), *Black Hole with Accretion Disk Visualization*: https://svs.gsfc.nasa.gov/14619/

The M87* frame is an observational reconstruction. The moving footage is a NASA scientific visualization, not live telescope footage. NASA describes this visualization as a qualitatively correct depiction using a simplified optical model, rather than a full general-relativistic ray-tracing calculation. The visuals are credited in the opening scene.

## Brand replacement

The supplied PLUTONIC artwork is stored as a replaceable asset at `public/plutonic-logo.svg`. The intro samples its bright pixels for the particle destination, then displays that asset itself for the final crisp logo hold. Replace this single asset when the master-resolution brand artwork is available. The black-hole footage and particle timeline are independent of the artwork.

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The starter project did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state. Real order processing still needs to be connected.

## Performance notes

- Uses the single NASA pullback clip as the moving astrophysical background.
- Particle destinations are sampled from the supplied logo asset; the original asset is used for the final display.
- The final shape transition is a cinematic particle morph, not a physically simulated black-hole-to-logo spacetime transformation.
- The EHT image remains available as a poster / loading fallback.
- Video is muted and plays inline; network availability and browser autoplay policy can affect the opening sequence.
