-- PLUTONIC migration 012: return or exchange SEVERAL items of one order in a single request.
--
-- The customer picks ONE action (return OR exchange) and any number of eligible items. This function validates everything first and
-- creates one linked request per item (they share a batchId), all in one transaction: if any item is refused, nothing is created.
-- Every rule of create_return() applies to every item (delivered order, 14-day window, one open request per item, exchange once,
-- replacement size in stock). Additionally:
--   * the whole request is ONE kind: a "kind" on an item that differs from the request's kind is refused;
--   * only one request (batch) may be open on an order at a time, so there is still exactly one journey to track;
--   * replacement stock is checked against the TOTAL asked for (two items needing the same size must both fit).
-- Safe to run again.

create or replace function public.create_return_batch(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  o record; kind text; e jsonb; items jsonb; it jsonb; idx int; rid text; r jsonb; reason text; prod record; target jsonb; piece jsonb;
  tgt_size text; line int; share int; refund int; delivered_ms bigint; ex_done_ms bigint; last_ex jsonb; bid text; need jsonb := '{}'::jsonb;
  seen int[] := '{}'; k text; total_need int; out jsonb := '[]'::jsonb; n int;
  now_ms bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  if auth.uid() is null then raise exception 'Please sign in.'; end if;
  select * into o from public.orders where id = p->>'orderId' and user_id = auth.uid() for update;
  if not found or (o.data->>'step')::int <> 4 then raise exception 'Only delivered orders you placed can be returned or exchanged.'; end if;
  kind := p->>'kind';
  if kind not in ('exchange', 'return') then raise exception 'Choose return or exchange.'; end if;
  items := p->'items';
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) not between 1 and 20 then raise exception 'Select the items you want to return or exchange.'; end if;
  if exists (select 1 from public.returns where order_id = o.id and status not in ('Rejected', 'Completed')) then
    raise exception 'Another request on this order is in progress. You can start a new one when it is finished.';
  end if;
  bid := 'B-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  n := jsonb_array_length(items);
  delivered_ms := coalesce((o.data->'history'->>4)::bigint, (o.data->>'createdAt')::bigint);

  for e in select value from jsonb_array_elements(items) loop
    if e ? 'kind' and e->>'kind' is distinct from kind then raise exception 'A request can be either a return or an exchange, not both. Please send them separately.'; end if;
    if coalesce(e->>'itemIndex', '') !~ '^\d{1,3}$' then raise exception 'Choose the items you want to return or exchange.'; end if;
    idx := (e->>'itemIndex')::int;
    if idx = any(seen) then raise exception 'Each item can only be selected once.'; end if;
    seen := seen || idx;
    it := o.data->'items'->idx;
    if it is null or coalesce((it->>'cancelled')::boolean, false) then raise exception 'That item cannot be returned or exchanged.'; end if;
    reason := coalesce(nullif(trim(coalesce(e->>'reason', '')), ''), nullif(trim(coalesce(p->>'reason', '')), ''));
    if reason is null or length(reason) < 2 then raise exception 'Choose a reason.'; end if;

    select max((h->>'at')::bigint) into ex_done_ms from public.returns x, jsonb_array_elements(x.data->'history') h
      where x.order_id = o.id and (x.data->>'itemIndex')::int = idx and x.status = 'Completed' and x.data->>'kind' = 'exchange' and h->>'status' = 'Completed';
    if now_ms - greatest(delivered_ms, coalesce(ex_done_ms, 0)) > 14 * 86400000 then raise exception 'The 14-day return window for % has closed.', it->>'name'; end if;
    if exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status = 'Completed' and data->>'kind' = 'return') then
      raise exception '% has already been returned. Please place a new order.', it->>'name';
    end if;
    if kind = 'exchange' and exists (select 1 from public.returns where order_id = o.id and (data->>'itemIndex')::int = idx and status = 'Completed' and data->>'kind' = 'exchange') then
      raise exception '% has already been exchanged once. It can only be returned now.', it->>'name';
    end if;

    select x.data->'exchangeTo' into last_ex from public.returns x
      where x.order_id = o.id and (x.data->>'itemIndex')::int = idx and x.status = 'Completed' and x.data->>'kind' = 'exchange' order by x.created_at desc limit 1;
    piece := coalesce(last_ex, jsonb_build_object('colourId', it->>'colourId', 'colourName', it->>'colourName', 'size', it->>'size'));

    target := null; refund := 0;
    if kind = 'exchange' then
      tgt_size := nullif(trim(coalesce(e->>'exchangeSize', '')), '');
      if tgt_size is null then raise exception 'Choose the size you want instead for %.', it->>'name'; end if;
      if tgt_size = piece->>'size' then raise exception 'Choose a different size for %.', it->>'name'; end if;
      select * into prod from public.products where id = it->>'productId';
      if not found then raise exception '% is no longer available for exchange. Please request a return instead.', it->>'name'; end if;
      if not (prod.data->'sizes' ? tgt_size) then raise exception 'That size does not exist for %.', it->>'name'; end if;
      k := (it->>'productId') || ':' || (piece->>'colourId') || ':' || tgt_size;
      total_need := coalesce((need->>k)::int, 0) + (it->>'qty')::int;
      if coalesce((prod.data->'stock'->>((piece->>'colourId') || ':' || tgt_size))::int, 0) < total_need then
        raise exception 'Size % of % is not in stock right now. Choose another size, or request a return.', tgt_size, it->>'name';
      end if;
      need := need || jsonb_build_object(k, total_need);
      target := jsonb_build_object('colourId', piece->>'colourId', 'colourName', piece->>'colourName', 'size', tgt_size);   -- same colour only
    else
      line := (it->>'price')::int * (it->>'qty')::int;
      share := case when (o.data->>'subtotal')::int > 0 then round((o.data->>'discount')::numeric * line / (o.data->>'subtotal')::numeric)::int else 0 end;
      refund := line - share;
    end if;

    rid := 'R-' || nextval('public.return_seq');
    r := jsonb_strip_nulls(jsonb_build_object('id', rid, 'orderId', o.id, 'itemIndex', idx, 'productId', it->>'productId', 'productName', it->>'name',
      'variant', (piece->>'colourName') || ' · ' || (piece->>'size'), 'piece', piece, 'qty', (it->>'qty')::int, 'kind', kind, 'reason', left(trim(reason), 200),
      'note', left(coalesce(p->>'note', ''), 1000), 'exchangeTo', target, 'refundAmount', refund, 'status', 'Requested', 'createdAt', now_ms,
      'batchId', bid, 'batchSize', n, 'history', jsonb_build_array(jsonb_build_object('status', 'Requested', 'at', now_ms))));
    insert into public.returns (id, order_id, user_id, status, data) values (rid, o.id, auth.uid(), 'Requested', r);
    out := out || jsonb_build_array(r);
  end loop;
  return out;
end $$;
revoke all on function public.create_return_batch(jsonb) from public, anon, authenticated;
grant execute on function public.create_return_batch(jsonb) to authenticated;
