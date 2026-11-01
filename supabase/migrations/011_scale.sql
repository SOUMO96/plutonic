-- PLUTONIC migration 011: built to stay up under load.
--  1. Idempotent order placement: a retry (slow network, double tap, a client that retries automatically) can never create a second order.
--  2. A database-held lease so any number of servers can run the automation safely (no two work on the same thing).
--  3. Indexes for the queries that run constantly (account pages, automation scans, refund sweeps).
--  Safe to run again.

alter table public.orders add column if not exists idempotency_key text;
create unique index if not exists orders_idempotency_idx on public.orders (user_id, idempotency_key) where idempotency_key is not null;

create or replace function public.place_order(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  it jsonb; prod record; q int; ckey text; have int; cname text; cp record; cpcode text;
  subtotal int := 0; discount int := 0; shipping int := 0; codfee int := 0; total int; after int;
  items jsonb := '[]'::jsonb; v_delivery text; v_payment text; v_email text; v_mobile text; v_addr jsonb; a jsonb;
  v_id text; now_ms bigint; order_json jsonb; v_pay_status text; v_mode text; used int; open_cod int; v_key text;
begin
  -- Safe retries: the same idempotency key from the same customer returns the order already placed instead of placing it twice.
  v_key := nullif(left(coalesce(p->>'idempotencyKey', ''), 80), '');
  if v_key is not null and auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || v_key, 0));
    select data into order_json from public.orders where user_id = auth.uid() and idempotency_key = v_key;
    if found then return order_json; end if;
  end if;
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
  insert into public.orders (id, user_id, email, data, payment_status, idempotency_key) values (v_id, auth.uid(), v_email, order_json, v_pay_status, v_key);
  return order_json;
end $function$;

create table if not exists public.automation_leases (name text primary key, until_at timestamptz not null);
alter table public.automation_leases enable row level security;
create or replace function public.acquire_lease(p_name text, p_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.automation_leases as l (name, until_at) values (p_name, now() + make_interval(secs => p_seconds))
  on conflict (name) do update set until_at = excluded.until_at where l.until_at < now();
  get diagnostics n = row_count;
  return n > 0;
end $$;
create or replace function public.release_lease(p_name text) returns void
language sql security definer set search_path = public as $$ update public.automation_leases set until_at = now() where name = p_name; $$;
revoke all on function public.acquire_lease(text, int), public.release_lease(text) from public, anon, authenticated;
grant execute on function public.acquire_lease(text, int), public.release_lease(text) to service_role;

create index if not exists orders_user_created_idx on public.orders (user_id, created_at desc);
create index if not exists returns_user_created_idx on public.returns (user_id, created_at desc);
create index if not exists orders_awaiting_courier_idx on public.orders (created_at) where (data->>'step') = '0' and payment_status in ('simulated', 'cod', 'paid');
create index if not exists returns_open_idx on public.returns (status) where status not in ('Completed', 'Rejected');
create index if not exists refunds_pending_idx on public.refunds (id) where status = 'Pending';
create index if not exists reviews_published_idx on public.reviews (created_at desc) where status = 'Published';
drop index if exists public.orders_user_idx;
drop index if exists public.returns_user_idx;
