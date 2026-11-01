/**
 * Central demonstration catalogue.
 *
 * Every page (home, collections, listing, product, search, wishlist, bag,
 * checkout, orders, admin) reads products through `useProducts()` in store.tsx,
 * which starts from `baseProducts` below and layers admin edits on top. Nothing
 * here is real PLUTONIC inventory: names, prices and stock are sample data.
 */

export type Gender = 'men' | 'women';
export type Colour = { id: string; name: string; hex: string };

export type Product = {
  id: string;
  name: string;
  /** What the garment is, in plain words (also the brief's product name). */
  type: string;
  gender: Gender;
  /** Listing category label, e.g. "Leggings". */
  category: string;
  /** One-line detail shown under the name on cards. */
  detail: string;
  description: string;
  features: string[];
  fabric: string;
  fit: string;
  /** Local image paths. Empty → the design's tonal placeholder is shown. */
  images: string[];
  /** Colour the photographs show; other colours fall back to the illustration. */
  imageColour?: string;
  /** Caption of the intended photograph for each placeholder slot. */
  shots: string[];
  /** Placeholder tone. */
  tone: string;
  originalPrice: number;
  price: number;
  colours: Colour[];
  sizes: string[];
  /** Units in stock keyed `${colourId}:${size}`. */
  stock: Record<string, number>;
  rating: number;
  reviewCount: number;
  isNew: boolean;
  bestseller: boolean;
  active: boolean;
  support?: 'low' | 'medium' | 'high';
  fabricGroup?: string;
};

export const COLOURS: Record<string, Colour> = {
  onyx: { id: 'onyx', name: 'Onyx', hex: '#1C1C1B' },
  basalt: { id: 'basalt', name: 'Basalt', hex: '#4A4844' },
  stone: { id: 'stone', name: 'Stone', hex: '#B8B2A7' },
  chalk: { id: 'chalk', name: 'Chalk', hex: '#DCD7CE' },
};

export const TONES = ['#292929', '#B8B2A7', '#DCD7CE', '#4A4844', '#6B675F', '#1C1C1B', '#A39D92'];

const TOP_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const MEN_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

/** Deterministic sample stock so the demo is stable between reloads. */
function seedStock(id: string, colours: Colour[], sizes: string[], low: string[] = [], out: string[] = []) {
  const stock: Record<string, number> = {};
  let n = 0;
  for (const c of colours) {
    for (const s of sizes) {
      n += 1;
      const key = `${c.id}:${s}`;
      const base = 6 + ((id.charCodeAt(id.length - 1) + n * 7) % 19);
      stock[key] = out.includes(key) ? 0 : low.includes(key) ? 2 : base;
    }
  }
  return stock;
}

type Seed = Omit<Product, 'stock' | 'active' | 'colours' | 'sizes'> & {
  colourIds: string[];
  sizes?: string[];
  low?: string[];
  out?: string[];
};

function make(s: Seed): Product {
  const { colourIds, sizes, low, out, ...rest } = s;
  const colours = colourIds.map((c) => COLOURS[c]);
  const sz = sizes ?? (s.gender === 'men' ? MEN_SIZES : TOP_SIZES);
  return { ...rest, colours, sizes: sz, stock: seedStock(s.id, colours, sz, low, out), active: true };
}

const MEN = '/images/products/men/';

export const baseProducts: Product[] = [
  make({
    id: 'm1', name: 'Meridian Heavyweight Tee', type: "Men's Premium Athleisure T-Shirt", gender: 'men', category: 'T-shirts',
    detail: '240 gsm cotton', description: 'A dense, structured tee that sits clean on the shoulder and keeps its shape wash after wash. Cut for the gym, finished for the street.',
    features: ['240 gsm combed cotton jersey', 'Ribbed collar with bound neck tape', 'Boxy, slightly cropped body', 'Tonal woven label, no logos'],
    fabric: '100% combed cotton, 240 gsm. Machine wash cold.', fit: 'Regular fit, true to size. Model is 185 cm and wears L.',
    images: [MEN + 'meridian-heavyweight-tee-front.webp'], imageColour: 'chalk', shots: ['Packshot · front', 'Packshot · back', 'Detail · collar rib and stitching', 'Detail · fabric, raking light'],
    tone: '#DCD7CE', originalPrice: 1790, price: 1490, colourIds: ['chalk', 'onyx', 'stone'], rating: 4.7, reviewCount: 128, isNew: false, bestseller: true,
  }),
  make({
    id: 'm2', name: 'Axis Oversized Tee', type: "Men's Premium Oversized T-Shirt", gender: 'men', category: 'Oversized tees',
    detail: 'Dropped shoulder', description: 'An oversized silhouette with a dropped shoulder and a heavy, fluid handle. Made to be worn loose, in or out of the gym.',
    features: ['260 gsm brushed cotton', 'Dropped shoulder, extended sleeve', 'Double-needle hem', 'Pre-washed to limit shrinkage'],
    fabric: '100% brushed cotton, 260 gsm. Machine wash cold, line dry.', fit: 'Oversized. Take your usual size for the intended drape, size down for a closer fit.',
    images: [], shots: ['On model · front, walking', 'Packshot · back', 'Detail · shoulder seam', 'Detail · hem'],
    tone: '#292929', originalPrice: 2190, price: 1790, colourIds: ['onyx', 'basalt', 'stone', 'chalk'], rating: 4.6, reviewCount: 94, isNew: true, bestseller: true,
  }),
  make({
    id: 'm3', name: 'Pulse Training Tee', type: "Men's Performance Training T-Shirt", gender: 'men', category: 'T-shirts',
    detail: 'Quick-dry', description: 'A light, breathable training tee with flat seams and a quick-dry finish. Quiet in movement, stays dry through long sessions.',
    features: ['Quick-dry polyester blend', 'Flatlock seams, no chafing', 'Laser-cut ventilation at the back yoke', 'Reflective heat-seal tab'],
    fabric: '88% recycled polyester, 12% elastane, 150 gsm.', fit: 'Athletic fit. Model is 183 cm and wears M.',
    images: [], shots: ['On model · front, training', 'Packshot · back', 'Detail · ventilation', 'Detail · seam'],
    tone: '#4A4844', originalPrice: 1590, price: 1390, colourIds: ['onyx', 'basalt', 'chalk'], rating: 4.5, reviewCount: 61, isNew: true, bestseller: false,
  }),
  make({
    id: 'm4', name: 'Core Compression Top', type: "Men's Compression T-Shirt", gender: 'men', category: 'Compression',
    detail: 'Long sleeve', description: 'Firm, even compression that holds muscle and moves with you. A base layer for heavy lifting and cold mornings.',
    features: ['Four-way stretch, firm compression', 'Anatomical panelling', 'Moisture-wicking inner face', 'Thumb-hole cuffs'],
    fabric: '78% nylon, 22% elastane, 210 gsm.', fit: 'Compression fit. Size up for a looser feel.',
    images: [], shots: ['On model · front, still', 'Packshot · back', 'Detail · panel seam', 'Detail · thumb hole'],
    tone: '#1C1C1B', originalPrice: 2490, price: 2190, colourIds: ['onyx', 'basalt'], rating: 4.8, reviewCount: 73, isNew: false, bestseller: false,
  }),
  make({
    id: 'm5', name: 'Vector Training Tank', type: "Men's Sleeveless Training Tank", gender: 'men', category: 'Tank tops',
    detail: 'Open knit back', description: 'A sleeveless tank with an open-knit back for airflow and a deep armhole for full range of motion.',
    features: ['Open-knit ventilated back', 'Deep, bound armholes', 'Soft jersey front', 'Curved hem'],
    fabric: '92% cotton, 8% elastane, 170 gsm.', fit: 'Relaxed athletic fit.',
    images: [], shots: ['On model · profile, pressing', 'Packshot · front', 'Detail · knit back', 'Detail · armhole'],
    tone: '#A39D92', originalPrice: 1490, price: 1290, colourIds: ['stone', 'onyx', 'chalk'], rating: 4.4, reviewCount: 39, isNew: false, bestseller: false,
  }),
  make({
    id: 'm6', name: 'Stride 7” Training Short', type: "Men's Performance Gym Shorts", gender: 'men', category: 'Gym shorts',
    detail: 'Lined', description: 'A seven-inch short with a built-in liner, a secure zip pocket and a four-way stretch shell. Cut for squats, sprints and everything in between.',
    features: ['Four-way stretch shell', 'Built-in compression liner', 'Zip security pocket', 'Elasticated drawcord waist'],
    fabric: '86% recycled polyester, 14% elastane.', fit: 'Regular fit, 7 inch inseam.',
    images: [], shots: ['Front · studio', 'Back · studio', 'Detail · zip pocket', 'Detail · waistband'],
    tone: '#B8B2A7', originalPrice: 1990, price: 1690, colourIds: ['onyx', 'basalt', 'stone'], rating: 4.6, reviewCount: 88, isNew: false, bestseller: true, low: ['onyx:M'],
  }),
  make({
    id: 'm7', name: 'Orbit Tapered Jogger', type: "Men's Training Joggers", gender: 'men', category: 'Joggers',
    detail: 'Brushed back', description: 'A tapered jogger cut like a trouser, with a brushed back for comfort and a clean ankle that sits well on a trainer.',
    features: ['Brushed-back French terry', 'Tapered leg, clean cuff', 'Two zip pockets, one back pocket', 'Flat drawcord'],
    fabric: '80% cotton, 20% polyester, 320 gsm.', fit: 'Tapered fit. Model is 185 cm and wears L.',
    images: [], shots: ['Front · full length, still', 'Back · studio', 'Detail · cuff', 'Detail · waistband'],
    tone: '#292929', originalPrice: 3290, price: 2790, colourIds: ['onyx', 'basalt'], rating: 4.7, reviewCount: 102, isNew: true, bestseller: true,
  }),
  make({
    id: 'm8', name: 'Nocturne Hoodie', type: "Men's Lightweight Training Hoodie", gender: 'men', category: 'Hoodies',
    detail: 'Brushed loopback', description: 'A lightweight hoodie with a structured hood and brushed loopback interior. Warm enough for the walk in, light enough to train in.',
    features: ['Brushed loopback interior', 'Structured double-layer hood', 'Kangaroo pocket with hidden zip', 'Ribbed cuffs and hem'],
    fabric: '85% cotton, 15% polyester, 300 gsm.', fit: 'Regular fit. Model is 185 cm and wears L.',
    images: [], shots: ['On model · front, hood down', 'On model · back, hood up', 'Detail · hood', 'Detail · loopback'],
    tone: '#1C1C1B', originalPrice: 3790, price: 3290, colourIds: ['onyx', 'basalt', 'stone'], rating: 4.8, reviewCount: 156, isNew: false, bestseller: true, low: ['onyx:L'],
  }),

  make({
    id: 'w1', name: 'Sculpt Sports Bra', type: "Women's Premium Sports Bra", gender: 'women', category: 'Sports bras',
    detail: 'Medium support', description: 'A bonded-underband sports bra in a matte sculpt knit. Medium support for strength work, pilates and long days in the studio.',
    features: ['Bonded underband', 'Removable cups', 'Matte sculpt knit', 'Wide, non-slip straps'],
    fabric: '76% nylon, 24% elastane.', fit: 'Fitted. Choose your usual bra band size.',
    images: [], shots: ['On model · front, studio', 'On model · back', 'Detail · underband', 'Detail · strap'],
    tone: '#4A4844', originalPrice: 2290, price: 1990, colourIds: ['onyx', 'basalt', 'stone', 'chalk'], rating: 4.8, reviewCount: 211, isNew: true, bestseller: true, support: 'medium',
  }),
  make({
    id: 'w2', name: 'Contour Legging', type: "Women's High-Waist Training Leggings", gender: 'women', category: 'Leggings',
    detail: 'Sculpt · 7/8', description: 'A high-waist, 7/8-length legging in a firm, matte sculpt knit that holds the line without squeezing. Squat-proof and quiet in movement.',
    features: ['High waist with internal pocket', 'Squat-proof sculpt knit', 'Flat seams, no chafing', '7/8 length'],
    fabric: '74% nylon, 26% elastane, 280 gsm.', fit: 'Fitted. Model is 175 cm and wears S.',
    images: [], shots: ['Limestone terrace · long stride, profile', 'On model · back', 'Detail · waistband seam', 'Detail · knit, raking light'],
    tone: '#292929', originalPrice: 3390, price: 2890, colourIds: ['onyx', 'basalt', 'stone'], rating: 4.9, reviewCount: 347, isNew: true, bestseller: true, fabricGroup: 'Sculpt', low: ['onyx:M'], out: ['stone:XXL'],
  }),
  make({
    id: 'w3', name: 'Arc 4” Short', type: "Women's Performance Gym Shorts", gender: 'women', category: 'Gym shorts',
    detail: 'Split hem', description: 'A four-inch short with a split hem and a smooth, supportive waistband. Light enough for HIIT, polished enough for errands.',
    features: ['Split hem for stride', 'Smooth wide waistband', 'Hidden key pocket', 'Quick-dry shell'],
    fabric: '88% recycled polyester, 12% elastane.', fit: 'Regular fit, 4 inch inseam.',
    images: [], shots: ['On model · front', 'Back · studio', 'Detail · split hem', 'Detail · waistband'],
    tone: '#6B675F', originalPrice: 1890, price: 1590, colourIds: ['onyx', 'stone', 'chalk'], rating: 4.5, reviewCount: 67, isNew: false, bestseller: false,
  }),
  make({
    id: 'w4', name: 'Form Crop Top', type: "Women's Training Crop Top", gender: 'women', category: 'Training tops',
    detail: 'Soft rib knit', description: 'A cropped training top in soft, stretchy rib that sits close to the body. Layers under a jacket, holds its own on its own.',
    features: ['Soft rib knit', 'Cropped, body-skimming', 'Scooped neckline', 'Seamless side panels'],
    fabric: '68% modal, 27% polyamide, 5% elastane.', fit: 'Fitted, cropped.',
    images: [], shots: ['On model · front', 'On model · side', 'Detail · rib', 'Detail · neckline'],
    tone: '#B8B2A7', originalPrice: 1890, price: 1690, colourIds: ['onyx', 'basalt', 'stone', 'chalk'], rating: 4.6, reviewCount: 82, isNew: false, bestseller: true,
  }),
  make({
    id: 'w5', name: 'Drift Oversized Tee', type: "Women's Oversized Activewear T-Shirt", gender: 'women', category: 'Oversized tees',
    detail: 'Relaxed drape', description: 'A relaxed, oversized tee with a soft drape and a slightly raw hem. Made to move over everything else you are wearing.',
    features: ['Soft-touch cotton blend', 'Relaxed, longer body', 'Slightly raw hem', 'Wide neck'],
    fabric: '60% cotton, 40% modal, 190 gsm.', fit: 'Oversized. Size down for a closer fit.',
    images: [], shots: ['On model · front, walking', 'Packshot · back', 'Detail · hem', 'Detail · neckline'],
    tone: '#DCD7CE', originalPrice: 1890, price: 1590, colourIds: ['chalk', 'onyx', 'stone'], rating: 4.5, reviewCount: 58, isNew: true, bestseller: false,
  }),
  make({
    id: 'w6', name: 'Veil Seamless Set', type: "Women's Seamless Training Set", gender: 'women', category: 'Sets',
    detail: 'Bra and legging', description: 'A seamless two-piece: a medium-support bra and a high-waist legging, knitted in one piece with no side seams.',
    features: ['Seamless one-piece knit', 'Medium-support bra with removable cups', 'High-waist 7/8 legging', 'Sold as a set'],
    fabric: '72% nylon, 28% elastane.', fit: 'Fitted, stretch. Choose your usual size.',
    images: [], shots: ['On model · full set, front', 'On model · back', 'Detail · seamless knit', 'Detail · waistband'],
    tone: '#4A4844', originalPrice: 4190, price: 3490, colourIds: ['onyx', 'basalt', 'stone'], rating: 4.7, reviewCount: 49, isNew: true, bestseller: false, support: 'medium',
  }),
  make({
    id: 'w7', name: 'Eclipse Training Jacket', type: "Women's Lightweight Training Jacket", gender: 'women', category: 'Jackets',
    detail: 'Technical shell', description: 'A cropped, lightweight training jacket in a water-resistant shell. Packs into its own pocket and layers over everything.',
    features: ['Water-resistant technical shell', 'Cropped fit with drawcord hem', 'Zip pockets', 'Packs into its own pocket'],
    fabric: '100% recycled nylon, water-resistant finish.', fit: 'Regular fit, cropped length.',
    images: [], shots: ['On model · front, zipped', 'On model · back', 'Detail · zip and collar', 'Detail · packed'],
    tone: '#1C1C1B', originalPrice: 4390, price: 3890, colourIds: ['onyx', 'stone'], rating: 4.7, reviewCount: 36, isNew: false, bestseller: true,
  }),
  make({
    id: 'w8', name: 'Run Performance Tank', type: "Women's Performance Tank Top", gender: 'women', category: 'Tank tops',
    detail: 'Quick-dry', description: 'A light, quick-dry tank with a racer back and a longer line. Made for runs, intervals and hot studios.',
    features: ['Quick-dry mesh', 'Racer back', 'Longer body with curved hem', 'Reflective detail'],
    fabric: '90% recycled polyester, 10% elastane.', fit: 'Regular fit.',
    images: [], shots: ['On model · front, running', 'Packshot · back', 'Detail · racer back', 'Detail · mesh'],
    tone: '#A39D92', originalPrice: 1590, price: 1390, colourIds: ['onyx', 'chalk', 'stone'], rating: 4.4, reviewCount: 44, isNew: false, bestseller: false,
  }),
];

export const CATEGORIES: Record<Gender, string[]> = {
  men: ['T-shirts', 'Oversized tees', 'Tank tops', 'Compression', 'Gym shorts', 'Joggers', 'Hoodies'],
  women: ['Sports bras', 'Leggings', 'Gym shorts', 'Training tops', 'Oversized tees', 'Sets', 'Jackets', 'Tank tops'],
};

export const FREE_SHIPPING_ABOVE = 2999;
export const SHIPPING_FEE = 149;
export const EXPRESS_FEE = 299;
export const COD_FEE = 49;
export const RETURN_WINDOW_DAYS = 14;

export const inr = (n: number) => '₹ ' + Math.round(n).toLocaleString('en-IN');

export function totalStock(p: Product) {
  return Object.values(p.stock).reduce((a, b) => a + b, 0);
}
export function sizeStock(p: Product, colourId: string, size: string) {
  return p.stock[`${colourId}:${size}`] ?? 0;
}
export function discountPercent(p: Product) {
  return p.originalPrice > p.price ? Math.round((1 - p.price / p.originalPrice) * 100) : 0;
}
