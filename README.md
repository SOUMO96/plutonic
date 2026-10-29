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

1. Opens on the Event Horizon Telescope Collaboration's M87* observation.
2. Transitions into NASA/JPL-Caltech simulation footage for a close-up, pullback, and orbital camera sequence.
3. The final orbital shot continues while the temporary brand mark, wordmark, and punchline appear.
4. The visitor proceeds to the FOR HIM / FOR HER collection gateway.

The intro has a skip control and respects `prefers-reduced-motion`. The real observation remains as a still fallback if the external video is unavailable or autoplay is blocked.

## Scientific image and video credits

- **EHT observation:** Event Horizon Telescope Collaboration, M87*, 2019. Image supplied by the European Southern Observatory (ESO): https://www.eso.org/public/images/eso1907a/
- **Moving simulation footage:** NASA/JPL-Caltech/R. Hurt (IPAC), *Black Hole with Accretion Disk Visualization*: https://svs.gsfc.nasa.gov/14619/

The M87* frame is an observational reconstruction. The moving footage is a NASA scientific visualization, not live telescope footage. NASA describes this visualization as a qualitatively correct depiction using a simplified optical model, rather than a full general-relativistic ray-tracing calculation. The visuals are credited in the opening scene.

## Brand replacement

The temporary orbital emblem is isolated in `src/components/BrandMark.tsx`. Replace the SVG in that component with the final brand asset while keeping its props and wrapper class names. The black-hole sequence and page flow are independent of the logo artwork.

The placeholder is an original orbital mark, not the Grok logo or a Grok wordmark.

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The starter project did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state. Real order processing still needs to be connected.

## Performance notes

- Uses native HTML video rather than a custom procedural ring shader.
- 4K source files are selected on wider desktop viewports; 1080p versions are supplied as the fallback source.
- The EHT image remains available as a poster / loading fallback.
- Video is muted and plays inline, as required for most browser autoplay policies.
- External NASA video assets are streamed from NASA's Scientific Visualization Studio; network availability and autoplay policy can affect the opening sequence.
