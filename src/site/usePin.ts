import { useEffect, useRef, useState } from 'react';
import { lookupPin, type PinInfo } from './pincode';

export type PinHint = { kind: 'idle' | 'busy' | 'ok' | 'estimate' | 'missing'; text: string };

/**
 * Watches a PIN code field: once it has 6 digits, finds the area and hands it to `apply` (which should set the state and,
 * if empty, the city). Returns the little message to show under the field. Never blocks: if the lookup fails the customer can
 * still pick the state by hand.
 */
export function usePinHint(pin: string, apply: (r: PinInfo, previousAutoCity: string) => void): PinHint {
  const [hint, setHint] = useState<PinHint>({ kind: 'idle', text: '' });
  const autoCity = useRef('');   // the city we filled in ourselves last time, so a different PIN can replace it but never something the customer typed
  useEffect(() => {
    if (!/^[1-9]\d{5}$/.test(pin)) { setHint({ kind: 'idle', text: '' }); return; }
    let live = true;
    setHint({ kind: 'busy', text: 'Finding your area…' });
    void lookupPin(pin).then((r) => {
      if (!live) return;
      if (!r) { setHint({ kind: 'idle', text: '' }); return; }
      if ('notFound' in r) { setHint({ kind: 'missing', text: 'We could not find this PIN code. Please check the 6 digits.' }); return; }
      apply(r, autoCity.current); autoCity.current = r.city;
      setHint({ kind: r.source === 'post' ? 'ok' : 'estimate', text: (r.city ? r.city + ', ' : '') + r.state });
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);
  return hint;
}
