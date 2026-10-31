-- PLUTONIC migration 003: server-side carts, payments (Cashfree-ready), categories, variants view.
-- NOT YET APPLIED to the live project. Review, then run in the Supabase SQL editor (or ask Claude to apply it).
-- Requires migrations plutonic_core_schema and restock_on_cancel (already applied).

-- Server-only settings. payments_mode: 'simulated' (demo) | 'cashfree' (unpaid online orders stay 'pending').
create table public.app_settings (key text primary key, value text not null);
alter table public.app_settings enable row level security;
insert into public.app_settings values ('payments_mode', 'simulated');

alter table public.orders add column payment_status text not null default 'simulated' check (payment_status in ('simulated','cod','pending','paid','failed'));
create index orders_payment_pending_idx on public.orders(created_at) where payment_status = 'pending';

create table public.payments (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  gateway text not null default 'cashfree',
  gateway_order_id text,
  gateway_payment_id text,
  status text not null,
  amount int not null,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (gateway, gateway_payment_id)
);
create index payments_order_idx on public.payments(order_id);
alter table public.payments enable row level security;   -- no policies: server (service role) only

create table public.categories (
  slug text primary key,
  gender text not null check (gender in ('men','women')),
  name text not null,
  sort int not null default 0
);
alter table public.categories enable row level security;
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
insert into public.categories (slug, gender, name, sort)
select lower(gender || '-' || regexp_replace(category, '[^a-zA-Z0-9]+', '-', 'g')), gender, category, row_number() over (order by gender, category)
from (select distinct data->>'gender' gender, data->>'category' category from public.products) t;

-- Relational view of variants (colour x size) so any client can query stock without parsing JSON.
create view public.product_variants with (security_invoker = true) as
select p.id as product_id, split_part(s.key, ':', 1) as colour_id, split_part(s.key, ':', 2) as size, s.value::int as stock,
       (p.data->>'price')::int as price
from public.products p, jsonb_each_text(p.data->'stock') s;
grant select on public.product_variants to anon, authenticated;

-- Server-side shopping cart shared by every client of one account.
create table public.carts (user_id uuid primary key references auth.users(id) on delete cascade, coupon_code text, updated_at timestamptz not null default now());
create table public.cart_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null, colour_id text not null, size text not null,
  qty int not null check (qty between 1 and 20),
  primary key (user_id, product_id, colour_id, size)
);
alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
create policy carts_own_all on public.carts for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy cart_items_own_all on public.cart_items for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.set_cart(p_items jsonb, p_coupon text default null) returns void
language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) > 50 then raise exception 'Invalid cart.'; end if;
  insert into public.carts (user_id, coupon_code, updated_at) values (auth.uid(), nullif(upper(trim(coalesce(p_coupon,''))), ''), now())
    on conflict (user_id) do update set coupon_code = excluded.coupon_code, updated_at = now();
  delete from public.cart_items where user_id = auth.uid();
  insert into public.cart_items (user_id, product_id, colour_id, size, qty)
    select auth.uid(), v->>'productId', v->>'colourId', v->>'size', least(20, greatest(1, (v->>'qty')::int))
    from jsonb_array_elements(p_items) v
    on conflict (user_id, product_id, colour_id, size) do update set qty = least(20, public.cart_items.qty + excluded.qty);
end $$;
revoke all on function public.set_cart(jsonb, text) from public, anon, authenticated;
grant execute on function public.set_cart(jsonb, text) to authenticated;

-- place_order: in 'cashfree' mode every non-COD order starts 'pending' (the browser cannot opt out).
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; prod record; q int; ckey text; have int; cname text; cp record; cpcode text;
  subtotal int := 0; discount int := 0; shipping int := 0; codfee int := 0; total int; after int;
  items jsonb := '[]'::jsonb; v_delivery text; v_payment text; v_email text; v_mobile text; v_addr jsonb; a jsonb;
  v_id text; now_ms bigint; order_json jsonb; v_pay_status text; v_mode text;
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
    if found and subtotal >= cp.min_subtotal then
      discount := case when cp.kind = 'percent' then round(subtotal * cp.value / 100.0)::int else least(cp.value, subtotal) end;
    end if;
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
end $$;
revoke all on function public.place_order(jsonb) from public, anon, authenticated;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- Payment outcome handlers: server (service role) only.
create function public.mark_order_paid(p_id text, p_gateway_order_id text, p_payment_id text, p_amount int, p_raw jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.orders where id = p_id for update;
  if not found then raise exception 'unknown order'; end if;
  if (o.data->>'total')::int <> p_amount then raise exception 'amount mismatch'; end if;
  insert into public.payments (order_id, gateway_order_id, gateway_payment_id, status, amount, raw) values (p_id, p_gateway_order_id, p_payment_id, 'SUCCESS', p_amount, p_raw) on conflict do nothing;
  if o.payment_status in ('pending','failed') and (o.data->>'step')::int >= 0 then
    update public.orders set payment_status = 'paid', data = jsonb_set(data, '{paymentStatus}', '"paid"') where id = p_id;
  end if;
end $$;

create function public.fail_order(p_id text, p_raw jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare o record;
begin
  select * into o from public.orders where id = p_id for update;
  if not found or o.payment_status <> 'pending' then return; end if;
  update public.orders set payment_status = 'failed', data = jsonb_set(jsonb_set(data, '{paymentStatus}', '"failed"'), '{step}', '-1') where id = p_id;
  perform public.restock_items(o.data->'items');
  insert into public.payments (order_id, status, amount, raw) values (p_id, 'FAILED', (o.data->>'total')::int, p_raw);
end $$;

-- Abandoned unpaid orders release their stock.
create function public.expire_pending_orders(p_minutes int default 30) returns int
language plpgsql security definer set search_path = public as $$
declare o record; n int := 0;
begin
  for o in select id from public.orders where payment_status = 'pending' and created_at < now() - make_interval(mins => p_minutes) loop
    perform public.fail_order(o.id, '{"reason":"expired"}'::jsonb); n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.mark_order_paid(text,text,text,int,jsonb), public.fail_order(text,jsonb), public.expire_pending_orders(int) from public, anon, authenticated;
grant execute on function public.mark_order_paid(text,text,text,int,jsonb), public.fail_order(text,jsonb), public.expire_pending_orders(int) to service_role;
