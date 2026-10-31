import { supabase } from './supabase';

/**
 * Online payments through the PLUTONIC API (/api/v1) and Cashfree Checkout.
 * Secrets never reach the browser: the server creates the payment session and decides
 * (by asking Cashfree) whether an order is paid.
 */
export type PayConfig = { cashfree: boolean; mode: 'sandbox' | 'production' | null };

let cached: Promise<PayConfig> | null = null;
export function payConfig(): Promise<PayConfig> {
  cached ??= fetch('/api/v1/config', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => ({ cashfree: !!d?.payments?.cashfree, mode: d?.payments?.mode ?? null }) as PayConfig)
    .catch(() => ({ cashfree: false, mode: null }) as PayConfig);
  return cached;
}

const SDK = 'https://sdk.cashfree.com/js/v3/cashfree.js';
type CashfreeSdk = (o: { mode: string }) => { checkout: (o: { paymentSessionId: string; redirectTarget: string }) => Promise<unknown> };
function loadSdk(): Promise<CashfreeSdk> {
  const w = window as unknown as { Cashfree?: CashfreeSdk };
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script'); s.src = SDK; s.async = true;
    s.onload = () => (w.Cashfree ? resolve(w.Cashfree) : reject(new Error('sdk')));
    s.onerror = () => reject(new Error('sdk'));
    document.head.appendChild(s);
  });
}

/** Opens Cashfree's hosted payment page for an order awaiting payment. Redirects away on success. */
export async function payWithCashfree(orderId: string, email: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const token = (await supabase?.auth.getSession())?.data.session?.access_token;
    const r = await fetch('/api/v1/payments/cashfree/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify({ orderId, email }),
    });
    const d = await r.json();
    if (!r.ok) return { ok: false, message: d?.error?.message ?? 'The payment page could not be opened.' };
    const Cashfree = await loadSdk();
    await Cashfree({ mode: d.mode }).checkout({ paymentSessionId: d.paymentSessionId, redirectTarget: '_self' });
    return { ok: true };
  } catch {
    return { ok: false, message: 'The payment page could not be opened. Please try again.' };
  }
}

/** Ask the server to settle with the gateway (it, not the browser, decides). */
export async function verifyPayment(orderId: string): Promise<void> {
  try { await fetch('/api/v1/payments/cashfree/verify?orderId=' + encodeURIComponent(orderId), { cache: 'no-store' }); } catch { /* the webhook will also settle it */ }
}
