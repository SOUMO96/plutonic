import { Check } from 'lucide-react';
import type { Journey } from './journeys';

/**
 * THE tracker. There is exactly one of these per order and it is the only place tracking is drawn
 * (order page and public tracking page). Its content comes from `buildJourney()` in journeys.ts:
 * when an order moves from delivery to a return or exchange, this same component simply receives a
 * different journey (title, steps, progress, status) and updates in place. Steps are keyed by position
 * so React reuses the same elements instead of mounting a second timeline.
 *
 * Calm by design: a done step is its label and the time on one line (extra facts such as the pickup date or
 * courier number sit under it); a step still to come is just its label.
 */
const split = (detail?: string) => {
  if (!detail || detail === 'Pending') return { at: '', extra: '' };
  const i = detail.indexOf(' · ');
  return i < 0 ? { at: detail, extra: '' } : { at: detail.slice(0, i), extra: detail.slice(i + 3) };
};

export function Tracker({ journey }: { journey: Journey }) {
  // the page already shows the order number; keep the request reference, drop the repeat
  const sub = journey.subtitle.replace(/ · Order #\S+/, '').replace(/^Order #\S+$/, '');
  return (
    <div className="tracker" data-journey={journey.kind} aria-live="polite">
      <span className="lbl muted tracker-kind">{journey.title}</span>
      <h3 className="tracker-status">{journey.status}</h3>
      {sub && <p className="muted small tracker-sub">{sub}</p>}
      <ol className="timeline">
        {journey.steps.map((s, i) => {
          const { at, extra } = split(s.detail);
          return (
            <li key={i} className={(s.state === 'done' ? 'done' : s.state === 'bad' ? 'done rejected' : '') + (s.current ? ' current' : '')} aria-current={s.current ? 'step' : undefined}>
              <span className="dotc">{s.state === 'done' && <Check size={11} strokeWidth={2.2} aria-hidden="true" />}{s.state === 'bad' && '×'}</span>
              <div className="tl-row"><b>{s.label}</b>{at && <span className="muted small tl-at">{at}</span>}</div>
              {extra && <span className="muted small tl-extra">{extra}</span>}
            </li>
          );
        })}
      </ol>
      {journey.note && <p className="muted small tracker-note">{journey.note}</p>}
    </div>
  );
}
