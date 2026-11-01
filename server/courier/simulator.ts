import { randomInt } from 'node:crypto';
import type { Courier, CourierStatus, ShipmentRow } from './index.js';

/**
 * A pretend courier for testing the whole automation without a real contract. It books parcels and then
 * moves each one along on a timer: booked > picked up > in transit > out for delivery > delivered.
 * SIM_STEP_SECONDS controls the pace (default 45 s per step so you can watch it; real couriers take days).
 */
const FLOW: CourierStatus[] = ['booked', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered'];
const stepMs = () => Math.max(1, Number(process.env.SIM_STEP_SECONDS ?? 45)) * 1000;

export const simulator: Courier = {
  name: 'simulator',
  async book({ kind, ref }) {
    const awb = (kind === 'delivery' ? 'SIMD' : kind === 'pickup' ? 'SIMP' : 'SIMR') + String(randomInt(10_000_000, 99_999_999));
    return { awb, courier: 'simulator', labelUrl: `/labels/${awb}.pdf?ref=${encodeURIComponent(ref)}` };
  },
  async poll(s: ShipmentRow) {
    const i = FLOW.indexOf(s.status);
    if (i < 0 || i >= FLOW.length - 1) return null;
    const last = s.events.length ? s.events[s.events.length - 1].at : Date.parse(s.created_at);
    return Date.now() - last >= stepMs() ? FLOW[i + 1] : null;
  },
};
