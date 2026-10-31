import { useEffect, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

/**
 * Minimal hash router (no dependency). Routes look like `#/product/m1?c=onyx`.
 * Hash routing keeps every page deep-linkable on any static host.
 */
export type Route = { path: string; seg: string[]; query: URLSearchParams };

function read(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', seg: path.split('/').filter(Boolean), query: new URLSearchParams(qs ?? '') };
}

/** True for a link to an inner page such as #/product/m2. The bare home route (#/) does not count. */
export const hasInnerRoute = () => typeof window !== 'undefined' && /^#\/[^/?#]/.test(window.location.hash);

/**
 * Scroll memory. Back/forward restores where you were (e.g. a filtered listing after
 * opening a product); a fresh click through a link or `go()` starts at the top.
 */
let fresh = false;
let pending: number | null = null;
const scrollKey = (hash = window.location.hash) => 'pl-scroll:' + hash;
const recall = (k: string) => { try { return window.sessionStorage.getItem(k); } catch { return null; } };
const remember = (k: string, v: string) => { try { window.sessionStorage.setItem(k, v); } catch { /* storage unavailable */ } };
export const rememberKey = (name: string, v: string) => remember(name + ':' + window.location.hash, v);
export const recallKey = (name: string) => recall(name + ':' + window.location.hash);
export const consumePendingScroll = () => { const y = pending; pending = null; return y; };

if (typeof window !== 'undefined') {
  let raf = 0;
  window.addEventListener('scroll', () => {
    if (raf) return;
    raf = window.requestAnimationFrame(() => { raf = 0; remember(scrollKey(), String(Math.round(window.scrollY))); });
  }, { passive: true });
}

// One shared listener: every component that calls useRoute() sees the same navigation.
let current: Route | null = null;
const subscribers = new Set<(r: Route) => void>();
if (typeof window !== 'undefined') {
  current = read();
  window.addEventListener('hashchange', () => {
    const saved = fresh ? null : recall(scrollKey());
    fresh = false;
    pending = saved === null ? null : Number(saved);
    current = read();
    if (pending === null) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    subscribers.forEach((fn) => fn(current!));
  });
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => current ?? read());
  useEffect(() => { subscribers.add(setRoute); setRoute(current ?? read()); return () => { subscribers.delete(setRoute); }; }, []);
  return route;
}

export const go = (to: string) => { fresh = true; window.location.hash = to.startsWith('#') ? to : '#' + to; };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; children: ReactNode };
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const href = to.startsWith('#') ? to : '#' + to;
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    fresh = true;
    // Same-route clicks (e.g. logo on home) still scroll to the top.
    if (window.location.hash === href) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return <a href={href} onClick={handle} {...rest}>{children}</a>;
}
