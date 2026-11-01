/**
 * A wishlist entry remembers the exact piece the customer chose: product, colour and size.
 * It is stored as one string `productId_colourId_size` (e.g. `w2_onyx_M`), which fits the existing
 * `wishlist.product_id` column and the API route, so no database change is needed.
 * Older entries that are just a product id (no colour or size) are still understood.
 */
export const wkey = (productId: string, colourId: string, size: string) => `${productId}_${colourId}_${size}`;

export function parseW(key: string): { productId: string; colourId?: string; size?: string } {
  const a = key.indexOf('_'), z = key.lastIndexOf('_');
  if (a < 0 || z === a) return { productId: key };
  return { productId: key.slice(0, a), colourId: key.slice(a + 1, z), size: key.slice(z + 1) };
}
