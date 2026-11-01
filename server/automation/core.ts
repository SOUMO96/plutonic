/**
 * Shared fulfilment actions. The admin screens AND the automation call these, so a person and the
 * robot always apply exactly the same rules and side effects (stock, refunds, history).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { applyUpdate, type Update } from '../../src/site/returnRules';
import type { Order, ReturnReq } from '../../src/site/store';

export type Level = 'info' | 'review' | 'error';

/** One line in the "what the automation did" log shown in the admin Automation page. */
export async function log(db: SupabaseClient, subject: string, action: string, detail?: string, level: Level = 'info') {
  await db.from('automation_log').insert({ subject, action, detail: detail ?? null, level });
}

export const DEFAULT_SETTINGS: Record<string, string> = { auto_courier: 'on', auto_approve_returns: 'on', auto_refund: 'on', auto_approve_max_value: '5000', auto_approve_max_requests: '10' };
export async function readSettings(db: SupabaseClient): Promise<Record<string, string>> {
  const { data } = await db.from('app_settings').select('key, value');
  const out = { ...DEFAULT_SETTINGS };
  for (const r of data ?? []) if (r.key in DEFAULT_SETTINGS) out[r.key] = r.value;
  return out;
}

/** Move an order forward to `step` (never backwards), filling the history for every step passed. */
export async function setOrderStep(db: SupabaseClient, orderId: string, step: number): Promise<boolean> {
  const { data } = await db.from('orders').select('data').eq('id', orderId).maybeSingle();
  if (!data) return false;
  const o = data.data as Order;
  if (o.step < 0 || o.step >= step || step > 4) return false;
  const history = [...(o.history ?? [])];
  // never earlier than the previous step, even if this computer's clock runs behind the database's
  const now = Math.max(Date.now(), history[history.length - 1] ?? 0);
  while (history.length <= step) history.push(now);
  const { data: moved } = await db.from('orders').update({ data: { ...o, step, history } }).eq('id', orderId).eq('data->>step', String(o.step)).select('id');
  return !!moved?.length;
}

export type Moved = { ok: true; ret: ReturnReq } | { ok: false; http: number; error: string; message: string };

/**
 * Move a return/exchange to a new status: validates the transition, records history, and applies the
 * side effects once (stock swap when a replacement is packed; stock back + refund line when a return completes).
 */
export async function moveReturn(db: SupabaseClient, id: string, status: ReturnReq['status'], u: Update = {}): Promise<Moved> {
  const { data: row, error } = await db.from('returns').select('data, order_id, status').eq('id', id).maybeSingle();
  if (error) return { ok: false, http: 502, error: 'database_error', message: 'Database error.' };
  if (!row) return { ok: false, http: 404, error: 'not_found', message: 'Request not found.' };
  const r = row.data as ReturnReq;
  const upd = applyUpdate({ ...r, status: row.status }, status, u);
  if ('error' in upd) return { ok: false, http: 409, error: 'invalid_transition', message: upd.error };
  const { data: ord } = await db.from('orders').select('data').eq('id', row.order_id).maybeSingle();
  const item = ord?.data?.items?.[r.itemIndex ?? -1];
  const piece = r.piece ?? (item ? { colourId: item.colourId, size: item.size } : undefined);
  const qty = r.qty ?? item?.qty ?? 1;
  const stockOf = async (colourId: string, size: string) => { const { data: prod } = await db.from('products').select('data').eq('id', r.productId).maybeSingle(); return prod?.data?.stock?.[`${colourId}:${size}`] ?? 0; };
  if ((status === 'Approved' || status === 'Replacement packed') && r.kind === 'exchange' && r.exchangeTo && (await stockOf(r.exchangeTo.colourId, r.exchangeTo.size)) < qty)
    return { ok: false, http: 409, error: 'replacement_out_of_stock', message: `Size ${r.exchangeTo.size} is out of stock, so this exchange cannot go ahead.` };
  const { data: moved, error: e2 } = await db.from('returns').update({ status, data: upd.ret }).eq('id', id).eq('status', row.status).select('id');
  if (e2) {
    if ((e2 as { code?: string }).code === '23514') return { ok: false, http: 409, error: 'database_update_needed', message: 'The database does not know the replacement steps yet. Run supabase/migrations/007_exchange_once_replacement_tracking.sql in the Supabase SQL editor, then try again.' };
    return { ok: false, http: 502, error: 'database_error', message: 'Database error.' };
  }
  if (!moved?.length) return { ok: false, http: 409, error: 'changed', message: 'This request was just updated. Refresh and try again.' };
  if (item && piece) {
    if (status === 'Replacement packed' && r.exchangeTo) {
      await db.rpc('adjust_stock', { p_items: [{ productId: item.productId, colourId: piece.colourId, size: piece.size, delta: qty }, { productId: item.productId, colourId: r.exchangeTo.colourId, size: r.exchangeTo.size, delta: -qty }] });
    }
    if (status === 'Completed' && r.kind === 'return') {
      await db.rpc('adjust_stock', { p_items: [{ productId: item.productId, colourId: piece.colourId, size: piece.size, delta: qty }] });
      if ((r.refundAmount ?? 0) > 0) {
        const cod = ord?.data?.payment === 'cod';
        await db.from('refunds').insert({ order_id: row.order_id, return_id: r.id, source: 'return', amount: r.refundAmount, note: cod ? 'Cash on delivery order: ask the customer for UPI or bank details' : 'Return completed' });
      }
    }
  }
  return { ok: true, ret: upd.ret };
}
