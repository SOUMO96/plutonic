-- PLUTONIC migration 007:
--  * exchanges are size-only (same colour);
--  * an item can be exchanged ONCE; after that it can only be returned, and after a return the customer places a new order;
--  * a completed exchange no longer blocks a later return (only OPEN requests are unique);
--  * an exchange has its own replacement shipment steps after pickup (packed, shipped, out for delivery, delivered).

alter table public.returns drop constraint returns_status_check;
alter table public.returns add constraint returns_status_check check (status in
  ('Requested','Approved','Pickup scheduled','Picked up','Replacement packed','Replacement shipped','Replacement out for delivery','Completed','Rejected'));

drop index if exists public.returns_one_open_per_item;
create unique index returns_one_open_per_item on public.returns (order_id, ((data->>'itemIndex')::int)) where status not in ('Rejected','Completed');

create or replace function public.create_return(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record; it jsonb; idx int; rid text; r jsonb; kind text; prod record; target jsonb := null; piece jsonb;
  tgt_size text; line int; share int; refund int := 0; delivered_ms bigint; ex_done_ms bigint;
  last_ex jsonb; cname text;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p->>'orderId' and user_id = auth.uid() for update;
  if not found or (o.data->>'step')::int <> 4 then raise exception 'Only delivered orders you placed can be returned or exchanged.'; end if;
  if coalesce(p->>'itemIndex', '') !~ '^\d{1,3}$' then raise exception 'Choose the item you want to return or exchange.'; end if;
  idx := (p->>'itemIndex')::int;
  it := o.data->'items'->idx;
  if it is null or coalesce((it->>'cancelled')::boolean, false) then raise exception 'That item cannot be returned or exchanged.'; end if;
  kind := p->>'kind';
  if kind not in ('exchange','return') then raise exception 'Choose return or exchange.'; end if;
  if length(trim(coalesce(p->>'reason',''))) < 2 then raise exception 'Choose a reason.'; end if;

  -- the 14 days run from delivery, or from the day a replacement was delivered
  delivered_ms := coalesce((o.data->'history'->>4)::bigint, (o.data->>'createdAt')::bigint);
  select max((h->>'at')::bigint) into ex_done_ms from public.returns x, jsonb_array_elements(x.data->'history') h
    where x.order_id = o.id and (x.data->>'itemIndex')::int = idx and x.status = 'Completed' and x.data->>'kind' = 'exchange' and h->>'status' = 'Completed';
  if now_ms - greatest(delivered_ms, coalesce(ex_done_ms, 0)) > 14 * 86400000 then raise exception 'The 14-day return window for this item has closed.'; end if;

  if exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status not in ('Rejected','Completed')) then
    raise exception 'A request for this item is already in progress. You can follow it on your order.';
  end if;
  if exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status = 'Completed' and data->>'kind' = 'return') then
    raise exception 'This item has already been returned. Please place a new order.';
  end if;
  if kind = 'exchange' and exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status = 'Completed' and data->>'kind' = 'exchange') then
    raise exception 'This item has already been exchanged once. It can only be returned now. After a return, please place a new order.';
  end if;

  -- the piece the customer holds now: the original, or the replacement from a completed exchange
  select x.data->'exchangeTo' into last_ex from public.returns x
    where x.order_id = o.id and (x.data->>'itemIndex')::int = idx and x.status = 'Completed' and x.data->>'kind' = 'exchange' order by x.created_at desc limit 1;
  piece := coalesce(last_ex, jsonb_build_object('colourId', it->>'colourId', 'colourName', it->>'colourName', 'size', it->>'size'));

  if kind = 'exchange' then
    tgt_size := nullif(trim(coalesce(p->>'exchangeSize','')), '');
    if tgt_size is null then raise exception 'Choose the size you want instead.'; end if;
    if tgt_size = piece->>'size' then raise exception 'Choose a different size to exchange to.'; end if;
    select * into prod from public.products where id = it->>'productId';
    if not found then raise exception 'This product is no longer available for exchange. Please request a return instead.'; end if;
    if not (prod.data->'sizes' ? tgt_size) then raise exception 'That size does not exist for this product.'; end if;
    if coalesce((prod.data->'stock'->>((piece->>'colourId') || ':' || tgt_size))::int, 0) < (it->>'qty')::int then
      raise exception 'Size % is not in stock right now. Choose another size, or request a return.', tgt_size;
    end if;
    target := jsonb_build_object('colourId', piece->>'colourId', 'colourName', piece->>'colourName', 'size', tgt_size);   -- same colour only
  else
    line := (it->>'price')::int * (it->>'qty')::int;
    share := case when (o.data->>'subtotal')::int > 0 then round((o.data->>'discount')::numeric * line / (o.data->>'subtotal')::numeric)::int else 0 end;
    refund := line - share;
  end if;
  rid := 'R-' || nextval('public.return_seq');
  r := jsonb_strip_nulls(jsonb_build_object('id', rid, 'orderId', o.id, 'itemIndex', idx, 'productId', it->>'productId', 'productName', it->>'name',
    'variant', (piece->>'colourName') || ' · ' || (piece->>'size'), 'piece', piece, 'qty', (it->>'qty')::int, 'kind', kind, 'reason', left(trim(p->>'reason'), 200),
    'note', left(coalesce(p->>'note', ''), 1000), 'exchangeTo', target, 'refundAmount', refund, 'status', 'Requested', 'createdAt', now_ms,
    'history', jsonb_build_array(jsonb_build_object('status', 'Requested', 'at', now_ms))));
  insert into public.returns (id, order_id, user_id, status, data) values (rid, o.id, auth.uid(), 'Requested', r);
  return r;
end $$;
revoke all on function public.create_return(jsonb) from public, anon, authenticated;
grant execute on function public.create_return(jsonb) to authenticated;
