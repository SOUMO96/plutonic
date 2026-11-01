import { ORDER_STEPS, type Order, type Refund, type ReturnReq } from './store';
import { flowFor, stepLabel } from './returnRules';
import { inr } from './catalog';

/**
 * Central journey configuration for the ONE tracker.
 *
 * An order has a single tracker. Its journey is chosen from the item's current lifecycle:
 *   delivery  -> (cancelled)                       while nothing has been requested
 *   return    -> Requested, Approved, Pickup scheduled, Picked up, Refund issued
 *   exchange  -> Requested, Approved, Pickup scheduled, Picked up, then the replacement:
 *                packed, shipped, out for delivery, delivered (all inside the exchange journey)
 * When a return or exchange is requested the tracker switches journey in place: only the current journey is
 * shown. Earlier events stay in the database but are never rendered as separate timelines.
 */
export type JourneyKind = 'delivery' | 'return' | 'exchange' | 'cancelled';
export type StepState = 'done' | 'todo' | 'bad';
/** A step that has happened is `done` (ticked). `current` marks the latest one reached, so it can be emphasised. */
export type JourneyStep = { label: string; state: StepState; current?: boolean; detail?: string };
export type Journey = {
  kind: JourneyKind;
  /** Id of the request this journey follows (empty for delivery). */
  id: string;
  /** Small heading: Delivery, Return or Exchange. */
  title: string;
  /** Large current status. */
  status: string;
  subtitle: string;
  steps: JourneyStep[];
  note?: string;
};

const when = (t: number) => new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const longDay = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
const lastAt = (r: ReturnReq) => r.history?.[r.history.length - 1]?.at ?? r.createdAt;

/**
 * Which request the tracker follows: the one with the most recent activity.
 * (Not "any open one": an old, forgotten request must never take over from the journey that just moved.)
 */
export function pickRequest(reqs: ReturnReq[], focusId?: string): ReturnReq | undefined {
  if (focusId) { const f = reqs.find((r) => r.id === focusId); if (f) return f; }
  return [...reqs].sort((a, b) => lastAt(b) - lastAt(a))[0];
}

export function buildJourney(o: Order, returns: ReturnReq[], refunds: Refund[], focusId?: string): Journey {
  const reqs = returns.filter((r) => r.orderId === o.id);
  const req = o.step >= 0 ? pickRequest(reqs, focusId) : undefined;

  if (o.step < 0) {
    return { kind: 'cancelled', id: '', title: 'Delivery', status: 'Cancelled', subtitle: `Order #${o.id}`,
      steps: [{ label: 'Order confirmed', state: 'done', detail: when(o.history[0] ?? o.createdAt) }, { label: 'Order cancelled', state: 'bad', detail: o.history[o.history.length - 1] && o.history.length > 1 ? when(o.history[o.history.length - 1]) : undefined }],
      note: `${o.cancelReason ? `Reason: ${o.cancelReason}. ` : ''}${(o.refundDue ?? 0) > 0 ? `A refund of ${inr(o.refundDue ?? 0)} is being processed to the original payment method.` : ''}`.trim() || undefined };
  }

  if (!req) {
    return { kind: 'delivery', id: '', title: 'Delivery', status: o.step === 4 ? 'Delivered' : o.step === 3 ? 'Out for delivery' : ORDER_STEPS[o.step], subtitle: `Order #${o.id}`,
      steps: ORDER_STEPS.map((s, i): JourneyStep => ({
        label: s, state: i <= o.step ? 'done' : 'todo', current: i === o.step && o.step < 4,
        detail: i <= o.step ? `${when(o.history[i] ?? o.createdAt)}${i === 1 ? ' · Bengaluru warehouse' : ''}${i === 2 ? ' · Courier AWB ' + o.id.replace(/\D/g, '') + '01' : ''}` : 'Pending',
      })) };
  }

  // return / exchange journey
  const hist = req.history ?? [{ status: 'Requested' as const, at: req.createdAt }];
  const at = (s: string) => hist.find((h) => h.status === s)?.at;
  const flow = flowFor(req.kind);
  const rejected = req.status === 'Rejected';
  const reached = rejected ? Math.max(0, ...hist.filter((h) => h.status !== 'Rejected').map((h) => flow.indexOf(h.status))) : flow.indexOf(req.status);
  const refund = refunds.find((x) => x.returnId === req.id);
  const detail = (s: ReturnReq['status']): string => {
    const t = at(s); const stamp = t ? when(t) : '';
    if (s === 'Pickup scheduled' && req.pickupDate) return `${stamp} · pickup ${longDay(req.pickupDate)}, ${req.pickupSlot ?? ''}`;
    if (s === 'Replacement shipped') return `${stamp} · Courier AWB ${req.id.replace(/\D/g, '')}02`;
    if (s === 'Completed' && req.kind === 'return') return `${stamp}${refund ? ` · refund ${inr(refund.amount)} ${refund.status === 'Refunded' ? `sent${refund.reference ? ` (ref ${refund.reference})` : ''}` : 'being processed (5–7 working days)'}` : ''}`;
    return stamp;
  };
  const steps: JourneyStep[] = flow.slice(0, rejected ? reached + 1 : flow.length).map((s, i) => ({
    label: stepLabel(req.kind, s),
    state: i <= reached ? 'done' : 'todo',
    current: i === reached && !rejected && req.status !== 'Completed',
    detail: i <= reached ? detail(s) : 'Pending',
  }));
  if (rejected) steps.push({ label: 'Request declined', state: 'bad', detail: `${at('Rejected') ? when(at('Rejected')!) : ''}${req.adminNote ? ` · ${req.adminNote}` : ''}`.replace(/^ · /, '') });
  const cur = flow[reached];
  return {
    kind: req.kind, id: req.id, title: req.kind === 'exchange' ? 'Exchange' : 'Return',
    status: rejected ? 'Request declined' : req.status === 'Requested' ? 'Waiting for our response' : req.status === 'Completed' ? stepLabel(req.kind, 'Completed') : stepLabel(req.kind, cur),
    subtitle: `${req.productName} · ${req.variant}${req.kind === 'exchange' && req.exchangeTo ? ` → size ${req.exchangeTo.size}` : ''} · Order #${o.id} · Request ${req.id}`,
    steps,
    note: [req.adminNote && !rejected ? `Message from PLUTONIC: ${req.adminNote}` : '', req.status === 'Pickup scheduled' ? 'Please keep the item unworn with tags, in its packaging.' : ''].filter(Boolean).join(' ') || undefined,
  };
}
