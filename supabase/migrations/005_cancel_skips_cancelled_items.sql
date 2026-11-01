-- PLUTONIC migration 005: never restock an item twice.
-- Administrators can cancel single items (order.items[i].cancelled = true, stock returned at that moment).
-- A later whole-order cancel / payment failure must restock only the items that are still open.
create or replace function public.restock_open_items(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.restock_items(coalesce((select jsonb_agg(i) from jsonb_array_elements(p_items) i where coalesce((i->>'cancelled')::boolean, false) = false), '[]'::jsonb));
end $$;
revoke all on function public.restock_open_items(jsonb) from public, anon, authenticated;
grant execute on function public.restock_open_items(jsonb) to service_role;

create or replace function public.cancel_order(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; r jsonb;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p_id and user_id = auth.uid() for update;
  if not found or (o.data->>'step')::int not between 0 and 2 then raise exception 'This order can no longer be cancelled.'; end if;
  r := jsonb_set(jsonb_set(o.data, '{step}', '-1'), '{cancelledBy}', '"customer"');
  r := jsonb_set(r, '{items}', coalesce((select jsonb_agg(i || '{"cancelled": true}'::jsonb) from jsonb_array_elements(o.data->'items') i), '[]'::jsonb));
  r := jsonb_set(r, '{refundDue}', to_jsonb(case when o.data->>'payment' <> 'cod' and o.payment_status in ('simulated','paid') then (o.data->>'total')::int else 0 end));
  perform public.restock_open_items(o.data->'items');    -- only items an administrator had not already cancelled
  update public.orders set data = r, payment_status = case when payment_status = 'pending' then 'failed' else payment_status end where id = p_id;
  return r;
end $$;
revoke all on function public.cancel_order(text) from public, anon, authenticated;
grant execute on function public.cancel_order(text) to authenticated;

create or replace function public.fail_order(p_id text, p_raw jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.orders where id = p_id for update;
  if not found or o.payment_status <> 'pending' then return; end if;
  update public.orders set payment_status = 'failed', data = jsonb_set(jsonb_set(data, '{paymentStatus}', '"failed"'), '{step}', '-1') where id = p_id;
  perform public.restock_open_items(o.data->'items');
  insert into public.payments (order_id, status, amount, raw) values (p_id, 'FAILED', (o.data->>'total')::int, p_raw);
end $$;
revoke all on function public.fail_order(text, jsonb) from public, anon, authenticated;
grant execute on function public.fail_order(text, jsonb) to service_role;
