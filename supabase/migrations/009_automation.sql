-- PLUTONIC migration 009: autonomous fulfilment (courier shipments, a log of what the automation did, switches).
-- Server-only tables: row-level security is on and there are no client policies, so only the server (service role) can use them.

create table public.shipments (
  id bigint generated always as identity primary key,
  awb text not null unique,
  courier text not null,
  kind text not null check (kind in ('delivery','pickup','replacement')),
  order_id text not null references public.orders(id) on delete cascade,
  return_id text references public.returns(id) on delete cascade,
  status text not null default 'booked' check (status in ('booked','picked_up','in_transit','out_for_delivery','delivered','failed','rto')),
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index shipments_order_idx on public.shipments(order_id);
create index shipments_active_idx on public.shipments(status) where status not in ('delivered','rto');
-- one forward delivery per order; one pickup and one replacement per return request (stops double booking)
create unique index shipments_one_delivery on public.shipments(order_id) where kind = 'delivery';
create unique index shipments_one_per_return on public.shipments(return_id, kind) where return_id is not null;
alter table public.shipments enable row level security;

create table public.automation_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  subject text not null,
  action text not null,
  detail text,
  level text not null default 'info' check (level in ('info','review','error'))
);
create index automation_log_at_idx on public.automation_log(at desc);
alter table public.automation_log enable row level security;

insert into public.app_settings (key, value) values
  ('auto_courier', 'on'),             -- book couriers and advance orders from courier updates
  ('auto_approve_returns', 'on'),     -- approve and book pickups for requests that pass the rules
  ('auto_refund', 'on'),              -- pay return refunds through Cashfree when the item reaches the warehouse
  ('auto_approve_max_value', '5000'), -- items above this value (INR) wait for a person
  ('auto_approve_max_requests', '3')  -- more than this many requests in 90 days wait for a person
on conflict (key) do nothing;
