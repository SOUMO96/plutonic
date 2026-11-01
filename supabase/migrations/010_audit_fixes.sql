-- PLUTONIC migration 010: fixes from the full audit.
--  1. Customers can cancel only before the parcel ships (steps 0-1), not after it is on its way.
--  2. Coupons: one use per customer by default, clear errors instead of silently ignoring a bad code,
--     and a cap on open cash-on-delivery orders per customer.
--  3. A payment that arrives after an order was cancelled/expired becomes a refund instead of vanishing.
--  4. Race-safe admin writes (compare-and-set order updates, stock-safe product saves, product hide/show).
--  5. A shared (database-backed) rate limiter, so limits hold across serverless instances.
--  6. Backfill refund records for cancelled orders that owe money but have no refund row.
--  Run once in the Supabase SQL editor (safe to run again).

-- ------------------------------------------------------------------ 1. customer cancel: before shipping only
create or replace function public.cancel_order(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; r jsonb; owed int; before int;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'We could not find that order.'; end if;
  if (o.data->>'step')::int not between 0 and 1 then raise exception 'This order has already shipped, so it can no longer be cancelled. You can return or exchange it once it is delivered.'; end if;
  owed := case when o.data->>'payment' <> 'cod' and o.payment_status in ('simulated','paid') then (o.data->>'total')::int else 0 end;
  before := coalesce((o.data->>'refundDue')::int, 0);
  r := jsonb_set(jsonb_set(o.data, '{step}', '-1'), '{cancelledBy}', '"customer"');
  r := jsonb_set(r, '{items}', coalesce((select jsonb_agg(i || '{"cancelled": true}'::jsonb) from jsonb_array_elements(o.data->'items') i), '[]'::jsonb));
  r := jsonb_set(r, '{refundDue}', to_jsonb(owed));
  perform public.restock_open_items(o.data->'items');
  update public.orders set data = r, payment_status = case when payment_status = 'pending' then 'failed' else payment_status end where id = p_id;
  if owed - before > 0 then insert into public.refunds (order_id, source, amount, note) values (p_id, 'cancellation', owed - before, 'Cancelled by customer'); end if;
  return r;
end $$;
revoke all on function public.cancel_order(text) from public, anon, authenticated;
grant execute on function public.cancel_order(text) to authenticated;

-- ------------------------------------------------------------------ 2. coupons and COD cap
alter table public.coupons add column if not exists per_user_limit int default 1 check (per_user_limit is null or per_user_limit >= 1);

create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  it jsonb; prod record; q int; ckey text; have int; cname text; cp record; cpcode text;
  subtotal int := 0; discount int := 0; shipping int := 0; codfee int := 0; total int; after int;
  items jsonb := '[]'::jsonb; v_delivery text; v_payment text; v_email text; v_mobile text; v_addr jsonb; a jsonb;
  v_id text; now_ms bigint; order_json jsonb; v_pay_status text; v_mode text; used int; open_cod int;
begin
  v_delivery := coalesce(p->>'delivery','standard'); v_payment := coalesce(p->>'payment','upi');
  if v_delivery not in ('standard','express') or v_payment not in ('upi','card','netbanking','cod') then raise exception 'Invalid delivery or payment option.'; end if;
  v_email := lower(trim(coalesce(p->>'email','')));
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Enter a valid email address.'; end if;
  v_mobile := regexp_replace(coalesce(p->>'mobile',''), '\D', '', 'g');
  if v_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'Enter a valid 10-digit mobile number.'; end if;
  a := p->'address';
  if jsonb_typeof(a) is distinct from 'object' then raise exception 'Delivery address is required.'; end if;
  if length(trim(coalesce(a->>'name',''))) < 2 or length(trim(coalesce(a->>'line1',''))) < 3 or coalesce(a->>'pin','') !~ '^[1-9][0-9]{5}$' or length(trim(coalesce(a->>'city',''))) < 2 then raise exception 'Please complete the delivery address.'; end if;
  v_addr := jsonb_build_object('id', left(coalesce(a->>'id', 'a-' || extract(epoch from now())::bigint), 60), 'label', left(coalesce(a->>'label','Home'), 40),
    'name', left(a->>'name', 120), 'mobile', v_mobile, 'line1', left(a->>'line1', 200), 'line2', left(coalesce(a->>'line2',''), 200),
    'landmark', left(coalesce(a->>'landmark',''), 200), 'pin', a->>'pin', 'city', left(a->>'city', 80), 'state', left(coalesce(a->>'state',''), 80));
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 then raise exception 'Your bag is empty.'; end if;

  -- cash on delivery reserves stock without any payment, so each customer may have only a few waiting to ship
  if v_payment = 'cod' and auth.uid() is not null then
    select count(*) into open_cod from public.orders where user_id = auth.uid() and payment_status = 'cod' and (data->>'step')::int between 0 and 1;
    if open_cod >= 3 then raise exception 'You already have 3 cash-on-delivery orders waiting to ship. Please pay online for this one, or wait until they ship.'; end if;
  end if;

  for it in select value from jsonb_array_elements(p->'items') order by value->>'productId', value->>'colourId', value->>'size' loop
    q := (it->>'qty')::int;
    if q is null or q < 1 or q > 20 then raise exception 'Invalid quantity.'; end if;
    select * into prod from public.products where id = it->>'productId' and (data->>'active')::boolean for update;
    if not found then raise exception 'An item in your bag is no longer available.'; end if;
    ckey := (it->>'colourId') || ':' || (it->>'size');
    have := coalesce((prod.data->'stock'->>ckey)::int, 0);
    if have < q then raise exception '% (%) is no longer available in that quantity.', prod.data->>'name', it->>'size'; end if;
    select c->>'name' into cname from jsonb_array_elements(prod.data->'colours') c where c->>'id' = it->>'colourId';
    if cname is null then raise exception 'Invalid colour for %.', prod.data->>'name'; end if;
    update public.products set data = jsonb_set(data, array['stock', ckey], to_jsonb(have - q)) where id = prod.id;
    subtotal := subtotal + (prod.data->>'price')::int * q;
    items := items || jsonb_build_array(jsonb_build_object('productId', prod.id, 'name', prod.data->>'name', 'colourId', it->>'colourId', 'colourName', cname, 'size', it->>'size', 'qty', q, 'price', (prod.data->>'price')::int));
  end loop;

  cpcode := upper(trim(coalesce(p->>'coupon','')));
  if cpcode <> '' then
    select * into cp from public.coupons where code = cpcode and active;
    if not found then raise exception 'That coupon code is not valid.'; end if;
    if subtotal < cp.min_subtotal then raise exception 'This coupon needs an order of at least Rs %.', cp.min_subtotal; end if;
    if cp.per_user_limit is not null and auth.uid() is not null then
      select count(*) into used from public.orders where user_id = auth.uid() and data->>'couponCode' = cpcode and (data->>'step')::int >= 0;
      if used >= cp.per_user_limit then raise exception 'You have already used this coupon code.'; end if;
    end if;
    discount := case when cp.kind = 'percent' then round(subtotal * cp.value / 100.0)::int else least(cp.value, subtotal) end;
  end if;
  after := subtotal - discount;
  shipping := case when v_delivery = 'express' then 299 when after >= 2999 then 0 else 149 end;
  codfee := case when v_payment = 'cod' then 49 else 0 end;
  total := after + shipping + codfee;

  select value into v_mode from public.app_settings where key = 'payments_mode';
  v_pay_status := case when v_payment = 'cod' then 'cod' when v_mode = 'cashfree' then 'pending' else 'simulated' end;

  v_id := 'PL-' || nextval('public.order_seq');
  now_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  order_json := jsonb_strip_nulls(jsonb_build_object('id', v_id, 'createdAt', now_ms, 'items', items, 'subtotal', subtotal, 'discount', discount,
    'couponCode', case when discount > 0 then cpcode end, 'shipping', shipping, 'codFee', codfee, 'total', total, 'delivery', v_delivery, 'payment', v_payment,
    'paymentStatus', v_pay_status, 'address', v_addr, 'email', v_email, 'mobile', v_mobile, 'step', 0, 'history', jsonb_build_array(now_ms)));
  insert into public.orders (id, user_id, email, data, payment_status) values (v_id, auth.uid(), v_email, order_json, v_pay_status);
  return order_json;
end $function$;

-- ------------------------------------------------------------------ 3. late payments become refunds
create or replace function public.mark_order_paid(p_id text, p_gateway_order_id text, p_payment_id text, p_amount integer, p_raw jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare o record; pid bigint;
begin
  select * into o from public.orders where id = p_id for update;
  if not found then raise exception 'unknown order'; end if;
  if (o.data->>'total')::int <> p_amount then raise exception 'amount mismatch'; end if;
  insert into public.payments (order_id, gateway_order_id, gateway_payment_id, status, amount, raw) values (p_id, p_gateway_order_id, p_payment_id, 'SUCCESS', p_amount, p_raw) on conflict do nothing returning id into pid;
  if o.payment_status in ('pending','failed') and (o.data->>'step')::int >= 0 then
    update public.orders set payment_status = 'paid', data = jsonb_set(data, '{paymentStatus}', '"paid"') where id = p_id;
  elsif pid is not null and o.payment_status = 'failed' and (o.data->>'step')::int < 0 then
    -- money arrived for an order that was already closed (expired or cancelled): hand it back
    insert into public.refunds (order_id, source, amount, note) values (p_id, 'cancellation', p_amount, 'Payment arrived after the order was closed');
    update public.orders set data = jsonb_set(data, '{refundDue}', to_jsonb(coalesce((data->>'refundDue')::int, 0) + p_amount)) where id = p_id;
  end if;
end $function$;

-- ------------------------------------------------------------------ 4. race-safe admin writes
-- Replace an order only if it still looks exactly as the admin saw it (compare-and-set).
create or replace function public.apply_order_update(p_id text, p_expected jsonb, p_new jsonb, p_payment_status text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.orders where id = p_id for update;
  if not found or o.data is distinct from p_expected then return false; end if;
  update public.orders set data = p_new, payment_status = coalesce(p_payment_status, payment_status) where id = p_id;
  return true;
end $$;
revoke all on function public.apply_order_update(text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_order_update(text, jsonb, jsonb, text) to service_role;

-- Save a product without overwriting stock that changed while the admin had the form open:
-- the admin's edit is applied as a difference (new - what the form was opened with) on top of the live stock.
create or replace function public.save_product(p_id text, p_data jsonb, p_base_stock jsonb, p_sort int) returns void
language plpgsql security definer set search_path = public as $$
declare cur jsonb; merged jsonb := '{}'::jsonb; k text; nv int; bv int; cv int;
begin
  select data->'stock' into cur from public.products where id = p_id for update;
  if cur is null or p_base_stock is null then
    insert into public.products (id, data, sort) values (p_id, p_data, p_sort)
    on conflict (id) do update set data = excluded.data;
    return;
  end if;
  for k in select jsonb_object_keys(p_data->'stock') loop
    nv := coalesce((p_data->'stock'->>k)::int, 0); bv := coalesce((p_base_stock->>k)::int, nv); cv := coalesce((cur->>k)::int, bv);
    merged := merged || jsonb_build_object(k, greatest(0, cv + (nv - bv)));
  end loop;
  update public.products set data = jsonb_set(p_data, '{stock}', merged) where id = p_id;
end $$;
revoke all on function public.save_product(text, jsonb, jsonb, int) from public, anon, authenticated;
grant execute on function public.save_product(text, jsonb, jsonb, int) to service_role;

create or replace function public.set_product_active(p_id text, p_active boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.products set data = jsonb_set(data, '{active}', to_jsonb(p_active)) where id = p_id;
  return found;
end $$;
revoke all on function public.set_product_active(text, boolean) from public, anon, authenticated;
grant execute on function public.set_product_active(text, boolean) to service_role;

-- ------------------------------------------------------------------ 5. shared rate limiter
create table if not exists public.rate_limits (key text primary key, hits int not null, window_start timestamptz not null default now());
alter table public.rate_limits enable row level security;
create or replace function public.rate_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = public as $$
declare h int;
begin
  insert into public.rate_limits as r (key, hits, window_start) values (p_key, 1, now())
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning hits into h;
  if random() < 0.01 then delete from public.rate_limits where window_start < now() - interval '1 day'; end if;
  return h <= p_max;
end $$;
revoke all on function public.rate_hit(text, int, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int, int) to service_role;

-- ------------------------------------------------------------------ 6. backfill missing cancellation refunds
insert into public.refunds (order_id, source, amount, note)
select o.id, 'cancellation', (o.data->>'refundDue')::int - coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id and r.source = 'cancellation'), 0), 'Backfilled: refund was owed but not recorded'
from public.orders o
where (o.data->>'step')::int < 0 and coalesce((o.data->>'refundDue')::int, 0) > coalesce((select sum(r.amount) from public.refunds r where r.order_id = o.id and r.source = 'cancellation'), 0);

create index if not exists refunds_return_idx on public.refunds(return_id);
