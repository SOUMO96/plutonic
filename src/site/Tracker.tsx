import { Check } from 'lucide-react';
import type { Journey } from './journeys';

/**
 * THE tracker. There is exactly one of these per order and it is the only place tracking is drawn
 * (order page and public tracking page). Its content comes from `buildJourney()` in journeys.ts:
 * when an order moves from delivery to a return or exchange, this same component simply receives a
 * different journey (title, steps, progress, status) and updates in place. Steps are keyed by position
 * so React reuses the same elements instead of mounting a second timeline.
 */
export function Tracker({ journey }: { journey: Journey }) {
  return (
    <div className="tracker" data-journey={journey.kind} aria-live="polite">
      <span className="lbl muted tracker-kind">{journey.title}</span>
      <h3 className="h2 tracker-status">{journey.status}</h3>
      <p className="muted small tracker-sub">{journey.subtitle}</p>
      <ol className="timeline">
        {journey.steps.map((s, i) => (
          <li key={i} className={(s.state === 'done' ? 'done' : s.state === 'bad' ? 'done rejected' : '') + (s.current ? ' current' : '')} aria-current={s.current ? 'step' : undefined}>
            <span className="dotc">{s.state === 'done' && <Check size={12} strokeWidth={2} aria-hidden="true" />}{s.state === 'bad' && '×'}</span>
            <b>{s.label}</b><span className="muted small">{s.detail ?? ''}</span>
          </li>
        ))}
      </ol>
      {journey.note && <p className="note" role="note">{journey.note}</p>}
    </div>
  );
}
