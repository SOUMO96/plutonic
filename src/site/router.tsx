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

export const hasSiteRoute = () => typeof window !== 'undefined' && /^#\//.test(window.location.hash);

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => { setRoute(read()); window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export const go = (to: string) => { window.location.hash = to.startsWith('#') ? to : '#' + to; };

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string; children: ReactNode };
export function Link({ to, children, onClick, ...rest }: LinkProps) {
  const href = to.startsWith('#') ? to : '#' + to;
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    // Same-route clicks (e.g. logo on home) still scroll to the top.
    if (window.location.hash === href) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return <a href={href} onClick={handle} {...rest}>{children}</a>;
}
