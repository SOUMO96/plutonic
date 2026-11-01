-- PLUTONIC migration 006: return/exchange lifecycle, one open request per item, refunds ledger.

-- 1. A return moves through: Requested -> Approved -> Pickup scheduled -> Picked up -> Completed (or Rejected).
alter table public.returns drop constraint returns_status_check;
alter table public.returns add constraint returns_status_check check (status in ('Requested','Approved','Pickup scheduled','Picked up','Completed','Rejected'));

-- 2. An item can only have ONE open (non-rejected) request. This is enforced by the database itself, so
--    double-clicks, two tabs and direct API calls cannot create duplicates.
create unique index returns_one_open_per_item on public.returns (order_id, ((data->>'itemIndex')::int)) where status <> 'Rejected';

-- 3. Refunds ledger. Rows are created by the server (cancellations, completed returns); customers can read their own.
create table public.refunds (
  id bigint generated always as identity primary key,
  order_id text not null references public.orders(id) on delete cascade,
  return_id text references public.returns(id) on delete set null,
  source text not null check (source in ('cancellation','return')),
  amount int not null check (amount > 0),
  status text not null default 'Pending' check (status in ('Pending','Refunded')),
  note text,
  reference text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index refunds_order_idx on public.refunds(order_id);
alter table public.refunds enable row level security;
create policy refunds_own_read on public.refunds for select to authenticated
  using (exists (select 1 from public.orders o where o.id = refunds.order_id and o.user_id = (select auth.uid())));

-- 4. Signed stock adjustment for the server (returns put stock back, exchanges swap it).
create function public.adjust_stock(p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare it jsonb; ckey text;
begin
  for it in select value from jsonb_array_elements(p_items) order by value->>'productId' loop
    ckey := (it->>'colourId') || ':' || (it->>'size');
    update public.products
      set data = jsonb_set(data, array['stock', ckey], to_jsonb(greatest(0, coalesce((data->'stock'->>ckey)::int, 0) + (it->>'delta')::int)))
      where id = it->>'productId' and data->'stock' ? ckey;
  end loop;
end $$;
revoke all on function public.adjust_stock(jsonb) from public, anon, authenticated;
grant execute on function public.adjust_stock(jsonb) to service_role;

-- 5. Customer cancel also records the refund owed.
create or replace function public.cancel_order(p_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o record; r jsonb; owed int; before int;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p_id and user_id = auth.uid() for update;
  if not found or (o.data->>'step')::int not between 0 and 2 then raise exception 'This order can no longer be cancelled.'; end if;
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

-- 6. Return / exchange request. All rules are enforced here, not in the browser:
--    delivered + within 14 days, item exists and is not cancelled, one open request per item,
--    exchanges must name a different size/colour that is in stock.
create or replace function public.create_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record; it jsonb; idx int; rid text; r jsonb; kind text; prod record; cname text; target jsonb := null;
  tgt_size text; tgt_colour text; line int; share int; refund int := 0; delivered_ms bigint;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p->>'orderId' and user_id = auth.uid() for update;
  if not found or (o.data->>'step')::int <> 4 then raise exception 'Only delivered orders you placed can be returned or exchanged.'; end if;
  delivered_ms := coalesce((o.data->'history'->>4)::bigint, (o.data->>'createdAt')::bigint);
  if now_ms - delivered_ms > 14 * 86400000 then raise exception 'The 14-day return window for this order has closed.'; end if;
  if coalesce(p->>'itemIndex', '') !~ '^\d{1,3}$' then raise exception 'Choose the item you want to return or exchange.'; end if;
  idx := (p->>'itemIndex')::int;
  it := o.data->'items'->idx;
  if it is null or coalesce((it->>'cancelled')::boolean, false) then raise exception 'That item cannot be returned or exchanged.'; end if;
  kind := p->>'kind';
  if kind not in ('exchange','return') then raise exception 'Choose return or exchange.'; end if;
  if length(trim(coalesce(p->>'reason',''))) < 2 then raise exception 'Choose a reason.'; end if;
  if exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status <> 'Rejected') then
    raise exception 'A request for this item has already been sent. You can follow it on your order.';
  end if;
  if kind = 'exchange' then
    tgt_size := nullif(trim(coalesce(p->>'exchangeSize','')), '');
    tgt_colour := coalesce(nullif(trim(coalesce(p->>'exchangeColour','')), ''), it->>'colourId');
    if tgt_size is null then raise exception 'Choose the size you want instead.'; end if;
    if tgt_size = it->>'size' and tgt_colour = it->>'colourId' then raise exception 'Choose a different size or colour to exchange to.'; end if;
    select * into prod from public.products where id = it->>'productId';
    if not found then raise exception 'This product is no longer available for exchange. Please request a return instead.'; end if;
    select c->>'name' into cname from jsonb_array_elements(prod.data->'colours') c where c->>'id' = tgt_colour;
    if cname is null or not (prod.data->'sizes' ? tgt_size) then raise exception 'That size or colour does not exist for this product.'; end if;
    if coalesce((prod.data->'stock'->>(tgt_colour || ':' || tgt_size))::int, 0) < (it->>'qty')::int then
      raise exception 'Size % in % is not in stock right now. Choose another, or request a return.', tgt_size, cname;
    end if;
    target := jsonb_build_object('colourId', tgt_colour, 'colourName', cname, 'size', tgt_size);
  else
    line := (it->>'price')::int * (it->>'qty')::int;
    share := case when (o.data->>'subtotal')::int > 0 then round((o.data->>'discount')::numeric * line / (o.data->>'subtotal')::numeric)::int else 0 end;
    refund := line - share;
  end if;
  rid := 'R-' || nextval('public.return_seq');
  r := jsonb_strip_nulls(jsonb_build_object('id', rid, 'orderId', o.id, 'itemIndex', idx, 'productId', it->>'productId', 'productName', it->>'name',
    'variant', (it->>'colourName') || ' · ' || (it->>'size'), 'qty', (it->>'qty')::int, 'kind', kind, 'reason', left(trim(p->>'reason'), 200),
    'note', left(coalesce(p->>'note', ''), 1000), 'exchangeTo', target, 'refundAmount', refund, 'status', 'Requested', 'createdAt', now_ms,
    'history', jsonb_build_array(jsonb_build_object('status', 'Requested', 'at', now_ms))));
  insert into public.returns (id, order_id, user_id, status, data) values (rid, o.id, auth.uid(), 'Requested', r);
  return r;
end $$;
revoke all on function public.create_return(jsonb) from public, anon, authenticated;
grant execute on function public.create_return(jsonb) to authenticated;
