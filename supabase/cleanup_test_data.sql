-- One-off cleanup of the QA data created while testing (run in the Supabase SQL editor).
-- Restores stock for every test order, deletes the test orders and QA user, resets order numbers.
do $$
declare o record;
begin
  for o in select data from public.orders loop perform public.restock_items(o.data->'items'); end loop;
  delete from public.orders;
  delete from auth.users where email = 'plutonic.qa@example.test';
  perform setval('public.order_seq', 10231);
  perform setval('public.return_seq', 1000);
end $$;

-- Check: totals should match the catalogue seed
-- m1:221 m2:291 m3:213 m4:148 m5:224 m6:205 m7:140 m8:207 w1:361 w2:238 w3:266 w4:357 w5:264 w6:263 w7:176 w8:261
select id, (select sum(value::int) from jsonb_each_text(data->'stock')) as total_stock from public.products order by sort;
