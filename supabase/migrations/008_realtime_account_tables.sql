-- PLUTONIC migration 008: broadcast changes so customers see order/return/refund updates instantly.
-- Row-level security still applies to realtime: a signed-in customer only receives rows they can already read (their own).
alter publication supabase_realtime add table public.returns, public.orders, public.refunds;
