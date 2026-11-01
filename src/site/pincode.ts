/**
 * Indian states and union territories, and PIN code -> state/city lookup.
 *
 * The lookup asks our own server (/api/v1/pincode/:pin), which asks India Post's public PIN directory and keeps the answer
 * cached. If that is unreachable (or in the browser-only demo) it falls back to a built-in table of PIN prefixes, which is right
 * for almost every PIN and is marked as an estimate so the customer can still change it.
 * This file has no browser-only code, so the server imports it too.
 */

/** All 28 states and 8 union territories, as the customer sees them. */
export const STATES = [
  'Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir',
  'Jharkhand', 'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal',
] as const;

const squash = (s: string) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z]+/g, ' ').trim();
const ALIASES: Record<string, string> = {
  orissa: 'Odisha', pondicherry: 'Puducherry', 'jammu and kashmir': 'Jammu and Kashmir', 'jammu kashmir': 'Jammu and Kashmir',
  'andaman and nicobar': 'Andaman and Nicobar Islands', 'andaman nicobar islands': 'Andaman and Nicobar Islands',
  'dadra and nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu', 'daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'dadra nagar haveli': 'Dadra and Nagar Haveli and Daman and Diu', 'dadra and nagar haveli and daman and diu': 'Dadra and Nagar Haveli and Daman and Diu',
  'nct of delhi': 'Delhi', 'new delhi': 'Delhi', uttaranchal: 'Uttarakhand', chattisgarh: 'Chhattisgarh',
};
/** Turn whatever a directory calls a state into the exact name in STATES (or '' if it is not recognised). */
export function normaliseState(name: string | undefined | null): string {
  const k = squash(name ?? ''); if (!k) return '';
  return STATES.find((s) => squash(s) === k) ?? ALIASES[k] ?? '';
}

/** First 3 digits of a PIN -> state, for the places where the first 2 digits are not enough. */
const BY3: Record<string, string> = {
  '160': 'Chandigarh', '194': 'Ladakh', '403': 'Goa', '737': 'Sikkim', '744': 'Andaman and Nicobar Islands',
  '246': 'Uttarakhand', '248': 'Uttarakhand', '249': 'Uttarakhand', '262': 'Uttarakhand', '263': 'Uttarakhand',
  '605': 'Puducherry', '673': 'Kerala', '682': 'Kerala', '533': 'Andhra Pradesh',
  '396': 'Gujarat', '361': 'Gujarat',
  '790': 'Arunachal Pradesh', '791': 'Arunachal Pradesh', '792': 'Arunachal Pradesh', '793': 'Meghalaya', '794': 'Meghalaya',
  '795': 'Manipur', '796': 'Mizoram', '797': 'Nagaland', '798': 'Nagaland', '799': 'Tripura',
  '814': 'Jharkhand', '815': 'Jharkhand', '816': 'Jharkhand', '822': 'Jharkhand', '825': 'Jharkhand', '826': 'Jharkhand', '827': 'Jharkhand', '828': 'Jharkhand', '829': 'Jharkhand',
  '823': 'Bihar', '824': 'Bihar',
  '500': 'Telangana', '501': 'Telangana', '502': 'Telangana', '503': 'Telangana', '504': 'Telangana', '505': 'Telangana', '506': 'Telangana', '507': 'Telangana', '508': 'Telangana', '509': 'Telangana',
  '515': 'Andhra Pradesh', '516': 'Andhra Pradesh', '517': 'Andhra Pradesh', '518': 'Andhra Pradesh', '519': 'Andhra Pradesh',
};
/** First 2 digits -> state. */
const BY2: Record<string, string> = {
  '11': 'Delhi', '12': 'Haryana', '13': 'Haryana', '14': 'Punjab', '15': 'Punjab', '16': 'Punjab', '17': 'Himachal Pradesh',
  '18': 'Jammu and Kashmir', '19': 'Jammu and Kashmir',
  '20': 'Uttar Pradesh', '21': 'Uttar Pradesh', '22': 'Uttar Pradesh', '23': 'Uttar Pradesh', '24': 'Uttar Pradesh', '25': 'Uttar Pradesh', '26': 'Uttar Pradesh', '27': 'Uttar Pradesh', '28': 'Uttar Pradesh',
  '30': 'Rajasthan', '31': 'Rajasthan', '32': 'Rajasthan', '33': 'Rajasthan', '34': 'Rajasthan',
  '36': 'Gujarat', '37': 'Gujarat', '38': 'Gujarat', '39': 'Gujarat',
  '40': 'Maharashtra', '41': 'Maharashtra', '42': 'Maharashtra', '43': 'Maharashtra', '44': 'Maharashtra',
  '45': 'Madhya Pradesh', '46': 'Madhya Pradesh', '47': 'Madhya Pradesh', '48': 'Madhya Pradesh', '49': 'Chhattisgarh',
  '50': 'Telangana', '51': 'Andhra Pradesh', '52': 'Andhra Pradesh', '53': 'Andhra Pradesh',
  '56': 'Karnataka', '57': 'Karnataka', '58': 'Karnataka', '59': 'Karnataka',
  '60': 'Tamil Nadu', '61': 'Tamil Nadu', '62': 'Tamil Nadu', '63': 'Tamil Nadu', '64': 'Tamil Nadu',
  '67': 'Kerala', '68': 'Kerala', '69': 'Kerala',
  '70': 'West Bengal', '71': 'West Bengal', '72': 'West Bengal', '73': 'West Bengal', '74': 'West Bengal',
  '75': 'Odisha', '76': 'Odisha', '77': 'Odisha', '78': 'Assam', '79': 'Assam',
  '80': 'Bihar', '81': 'Jharkhand', '82': 'Bihar', '83': 'Jharkhand', '84': 'Bihar', '85': 'Bihar',
};
/** Best guess at the state from the PIN alone (no network). Empty when the PIN is not a valid Indian PIN. */
export function stateFromPin(pin: string): string {
  if (!/^[1-9]\d{5}$/.test(pin)) return '';
  return BY3[pin.slice(0, 3)] ?? BY2[pin.slice(0, 2)] ?? '';
}

export type PinInfo = { state: string; city: string; district: string; source: 'post' | 'estimate' };
export type PinResult = PinInfo | { notFound: true } | null;

const cache = new Map<string, PinResult>();
/**
 * Look up a PIN code. Returns the state (and a city suggestion) or `{ notFound: true }` when India Post says there is no such PIN.
 * Returns the offline estimate when the directory cannot be reached, and null when it is not even a plausible PIN.
 */
export async function lookupPin(pin: string): Promise<PinResult> {
  if (!/^[1-9]\d{5}$/.test(pin)) return null;
  if (cache.has(pin)) return cache.get(pin) ?? null;
  let out: PinResult = null;
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const r = await fetch('/api/v1/pincode/' + pin, { signal: ctl.signal }); clearTimeout(t);
    if (r.status === 404) out = { notFound: true };
    else if (r.ok) { const j = (await r.json()) as Partial<PinInfo>; if (j.state) out = { state: j.state, city: j.city ?? '', district: j.district ?? '', source: j.source === 'post' ? 'post' : 'estimate' }; }
  } catch { /* fall through to the estimate */ }
  if (!out) { const s = stateFromPin(pin); out = s ? { state: s, city: '', district: '', source: 'estimate' } : null; }
  if (out) cache.set(pin, out);
  return out;
}
