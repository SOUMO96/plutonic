import { registerSW } from 'virtual:pwa-register';

/**
 * Service-worker registration and the "new version available" signal.
 * Nothing here reloads the page by itself: the visitor decides (see UpdatePrompt).
 * The worker is not registered in development, so it never gets in the way of Vite's hot reload or the dev API.
 */
type Listener = (ready: boolean) => void;
const listeners = new Set<Listener>();
let waiting = false;
let activate: ((reload?: boolean) => Promise<void>) | null = null;

export function startPwa() {
  if (import.meta.env.DEV || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  activate = registerSW({
    immediate: true,
    onNeedRefresh() { waiting = true; listeners.forEach((l) => l(true)); },
    onRegisteredSW(_url, registration) {
      // look for a new version once an hour while the page stays open
      if (registration) window.setInterval(() => { registration.update().catch(() => undefined); }, 60 * 60 * 1000);
    },
  });
}

export function onUpdateReady(listener: Listener): () => void {
  listeners.add(listener); if (waiting) listener(true);
  return () => { listeners.delete(listener); };
}
/** The visitor pressed "Reload": let the waiting worker take over and reload once. */
export const applyUpdate = () => { void activate?.(true); };

/** Called when a customer or the admin signs out: nothing user-specific should survive on the device. */
export function purgeUserCaches() {
  try { navigator.serviceWorker?.controller?.postMessage({ type: 'PURGE_USER_CACHES' }); } catch { /* no worker */ }
  try { void caches?.keys().then((keys) => keys.filter((k) => /^pl-(nav|img)-/.test(k)).forEach((k) => void caches.delete(k))); } catch { /* no Cache Storage */ }
}
