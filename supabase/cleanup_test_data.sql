-- One-off cleanup of QA data created while testing (run in the Supabase SQL editor, project "plutonic").
-- Restores stock for every live (non-cancelled) test order, deletes test orders, test reviews and
-- the *@example.test QA users, and resets order numbers so the first real order is PL-10232.
-- Cancelled orders (and cancelled items) were already restocked when they were cancelled.
do $$
declare o record;
begin
  for o in select data from public.orders where (data->>'step')::int >= 0 loop perform public.restock_open_items(o.data->'items'); end loop;   -- skips items already cancelled (and restocked)
  delete from public.orders;            -- also removes their shipments and returns/refunds (cascade)
  delete from public.automation_log;
  delete from public.reviews;
  delete from auth.users where email like '%@example.test';
  perform setval('public.order_seq', 10231);
  perform setval('public.return_seq', 1000);
end $$;

-- Check: totals should match the catalogue seed
-- m1:221 m2:291 m3:213 m4:148 m5:224 m6:205 m7:140 m8:207 w1:361 w2:238 w3:266 w4:357 w5:264 w6:263 w7:176 w8:261
select (select count(*) from public.orders) orders, (select count(*) from auth.users) users,
       (select string_agg(id || ':' || (select sum(value::int) from jsonb_each_text(data->'stock')), ' ' order by sort) from public.products) stock;
