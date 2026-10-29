# PLUTONIC — Beyond the Ordinary

A cinematic, dark editorial storefront concept built with React 19, Vite, TypeScript, and Three.js.

## Run locally

Prerequisites: Node.js 20+

```bash
npm install
npm run dev
```

Create a production build with `npm run build`. Run TypeScript checks with `npm run lint`.

## Experience flow

1. **Cinematic intro** — procedural WebGL black-hole scene, orbital placeholder mark, wordmark, and tagline.
2. **Collection gateway** — full-bleed editorial panels for **FOR HIM** and **FOR HER**.
3. **Storefront** — category-specific sample products, type filters, search, wishlist toggles, and a front-end shopping bag.

The intro can be skipped. It is shown once per browser session. The app detects `prefers-reduced-motion`; in that mode the opening becomes a short, static brand reveal. The shader uses a 60 FPS animation target and scales the renderer pixel ratio down on mobile.

## Brand replacement

The temporary orbital emblem is isolated in `src/components/BrandMark.tsx`. Replace the SVG in that component with the final brand asset while keeping its props and wrapper class names. The black-hole canvas and page flow are independent of the logo artwork.

The placeholder is an original orbital mark, not the Grok logo or a Grok wordmark.

## Product catalogue

Edit `src/data/products.ts` to replace sample products, prices, types, categories, descriptions, and image URLs with the real catalogue.

## Commerce integration status

This branch is a visual and interaction prototype. The current starter repository did not include live authentication, database-backed inventory, shipping, payment, or checkout services. The bag and wishlist interactions currently run in client-side React state; the drawer explicitly identifies checkout as a service that still needs to be connected. Keep any existing production credentials and payment integrations out of source control.

## Performance notes

- Three.js renders a procedural fragment shader instead of loading a large animated GIF.
- Device pixel ratio is capped more aggressively on mobile.
- The render loop pauses when the page is hidden.
- The intro component disposes its WebGL renderer, geometry, material, and animation frame on unmount.
- Editorial photography is currently loaded from remote Unsplash image URLs; replace these with optimized, locally hosted brand photography before production.
