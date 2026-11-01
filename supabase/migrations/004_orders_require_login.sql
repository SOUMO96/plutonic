-- PLUTONIC migration 004: placing an order requires a signed-in account.
-- Unauthenticated (anon) callers can no longer execute place_order; signed-in users still can.
revoke execute on function public.place_order(jsonb) from anon;
