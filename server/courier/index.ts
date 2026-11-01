import type { Order } from '../../src/site/store';
import { simulator } from './simulator';

/**
 * Courier adapter. The automation only knows this interface, so connecting Shadowfax or Blue Dart later
 * means adding ONE file that implements it (book, and either parseWebhook or poll) and selecting it with
 * COURIER=<name>. Nothing else changes.
 */
export type CourierStatus = 'booked' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'failed' | 'rto';
export type ShipmentKind = 'delivery' | 'pickup' | 'replacement';
export type ShipmentRow = { id: number; awb: string; courier: string; kind: ShipmentKind; order_id: string; return_id: string | null; status: CourierStatus; events: { status: CourierStatus; at: number }[]; created_at: string; updated_at: string };

export type BookInput = {
  kind: ShipmentKind;
  order: Order;
  /** Our reference for the parcel (order id, or the return request id). */
  ref: string;
  /** Pickups only: the date and slot the customer was promised. */
  pickupDate?: string; pickupSlot?: string;
  /** What is in the parcel. */
  items: { name: string; size: string; qty: number }[];
};
export type Booking = { awb: string; courier: string; labelUrl?: string };

export interface Courier {
  name: string;
  book(input: BookInput): Promise<Booking>;
  /** Ask the courier where a parcel is now. Return the status only when it has moved on (simulators and polling couriers). */
  poll?(s: ShipmentRow): Promise<CourierStatus | null>;
  /** Couriers that push updates: verify the signature and translate the payload. Return null if it is not valid. */
  parseWebhook?(headers: Record<string, string | string[] | undefined>, raw: string): { awb: string; status: CourierStatus; at?: number } | null;
}

/** The courier in use, or null when delivery is run by hand (the default until a courier is configured). */
export function activeCourier(): Courier | null {
  const name = (process.env.COURIER ?? '').trim().toLowerCase();
  if (name === 'simulator') return simulator;
  // if (name === 'shadowfax') return shadowfax;   // add the adapter file, then enable here
  // if (name === 'bluedart') return bluedart;
  return null;
}
export const courierByName = (name: string): Courier | null => (name === 'simulator' ? simulator : null);
