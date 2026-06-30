-- =====================================================================
-- SOULSITARA WELLNESS PRODUCTS PVT LTD - Supabase Schema
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PROFILES (extends auth.users with role info)
-- ---------------------------------------------------------------------
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text not null,
  full_name text,
  role text not null default 'employee' check (role in ('admin','employee')),
  created_at timestamptz default now()
);

alter table profiles enable row level security;

create policy "Profiles are viewable by authenticated users"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "Users can update own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 2. SEQUENCES FOR AUTO NUMBERING
-- ---------------------------------------------------------------------
create sequence if not exists work_order_seq start 2501 increment 1;
create sequence if not exists sample_request_seq start 1 increment 1;
create sequence if not exists quotation_seq start 1 increment 1;

-- ---------------------------------------------------------------------
-- 3. WORK ORDERS
-- ---------------------------------------------------------------------
create table if not exists work_orders (
  id uuid primary key default gen_random_uuid(),
  order_number integer not null default nextval('work_order_seq') unique,
  order_date date not null default current_date,
  due_date date not null,
  client_name text not null,
  contact_person text,
  mobile_number text,
  email text,
  address text,
  client_manager text not null,
  other_manager_name text,
  status text not null default 'Pending'
    check (status in ('Pending','Formulation','Production','Packaging','Quality Check','Ready','Dispatched','Delivered')),
  additional_comments text,
  subtotal numeric(12,2) default 0,
  total_gst numeric(12,2) default 0,
  grand_total numeric(12,2) default 0,
  advance_payment numeric(12,2) default 0,
  balance_amount numeric(12,2) default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_work_orders_due_date on work_orders(due_date);
create index if not exists idx_work_orders_status on work_orders(status);

-- ---------------------------------------------------------------------
-- 4. SAMPLE REQUESTS
-- ---------------------------------------------------------------------
create table if not exists sample_requests (
  id uuid primary key default gen_random_uuid(),
  sample_number integer not null default nextval('sample_request_seq') unique,
  order_date date not null default current_date,
  due_date date not null,
  client_name text not null,
  contact_person text,
  mobile_number text,
  email text,
  address text,
  client_manager text not null,
  other_manager_name text,
  status text not null default 'Pending'
    check (status in ('Pending','Formulation','Production','Packaging','Quality Check','Ready','Dispatched','Delivered')),
  additional_comments text,
  subtotal numeric(12,2) default 0,
  total_gst numeric(12,2) default 0,
  grand_total numeric(12,2) default 0,
  advance_payment numeric(12,2) default 0,
  balance_amount numeric(12,2) default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sample_requests_due_date on sample_requests(due_date);
create index if not exists idx_sample_requests_status on sample_requests(status);

-- ---------------------------------------------------------------------
-- 4b. QUOTATIONS (no Due Date / Status / Advance Payment / Balance)
-- ---------------------------------------------------------------------
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number integer not null default nextval('quotation_seq') unique,
  quote_date date not null default current_date,
  quote_validity text not null,
  client_name text not null,
  contact_person text,
  mobile_number text,
  email text,
  address text,
  client_manager text not null,
  other_manager_name text,
  terms_and_conditions text,
  subtotal numeric(12,2) default 0,
  total_gst numeric(12,2) default 0,
  grand_total numeric(12,2) default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quotations_client on quotations(client_name);

-- ---------------------------------------------------------------------
-- 5. ORDER ITEMS (shared by work_orders, sample_requests, quotations)
-- ---------------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('work_order','sample_request','quotation')),
  parent_id uuid not null,
  serial_number integer not null,
  item_name text not null,
  pack_size text,
  formulation_reference text,
  packaging_container text,
  label_packaging_details text,
  quantity numeric(12,2) not null default 0,
  rate numeric(12,2) not null default 0,
  gst_percent numeric(5,2) not null default 0 check (gst_percent in (0,5,18)),
  amount numeric(12,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists idx_order_items_parent on order_items(parent_type, parent_id);

-- ---------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (shared access for authenticated employees)
-- ---------------------------------------------------------------------
alter table work_orders enable row level security;
alter table sample_requests enable row level security;
alter table quotations enable row level security;
alter table order_items enable row level security;

-- All authenticated users can view everything (shared database)
create policy "Authenticated users can view work orders"
  on work_orders for select using (auth.role() = 'authenticated');

create policy "Authenticated users can view sample requests"
  on sample_requests for select using (auth.role() = 'authenticated');

create policy "Authenticated users can view quotations"
  on quotations for select using (auth.role() = 'authenticated');

create policy "Authenticated users can view order items"
  on order_items for select using (auth.role() = 'authenticated');

-- All authenticated users can insert (create orders/samples/quotations)
create policy "Authenticated users can insert work orders"
  on work_orders for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can insert sample requests"
  on sample_requests for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can insert quotations"
  on quotations for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can insert order items"
  on order_items for insert with check (auth.role() = 'authenticated');

-- All authenticated users can update status / edit (employees update status, admins edit fully)
create policy "Authenticated users can update work orders"
  on work_orders for update using (auth.role() = 'authenticated');

create policy "Authenticated users can update sample requests"
  on sample_requests for update using (auth.role() = 'authenticated');

create policy "Authenticated users can update quotations"
  on quotations for update using (auth.role() = 'authenticated');

create policy "Authenticated users can update order items"
  on order_items for update using (auth.role() = 'authenticated');

-- Only admins can delete (checked via profiles.role)
create policy "Admins can delete work orders"
  on work_orders for delete using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "Admins can delete sample requests"
  on sample_requests for delete using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "Admins can delete quotations"
  on quotations for delete using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

create policy "Admins can delete order items"
  on order_items for delete using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

-- ---------------------------------------------------------------------
-- 7. AUTO-UPDATE updated_at TRIGGER
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_work_orders_updated_at
  before update on work_orders
  for each row execute function set_updated_at();

create trigger trg_sample_requests_updated_at
  before update on sample_requests
  for each row execute function set_updated_at();

create trigger trg_quotations_updated_at
  before update on quotations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 8. ENABLE REALTIME (run in Supabase Dashboard > Database > Replication
--    if not automatically enabled by this statement)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table work_orders;
alter publication supabase_realtime add table sample_requests;
alter publication supabase_realtime add table quotations;
alter publication supabase_realtime add table order_items;

-- ---------------------------------------------------------------------
-- 9. MIGRATION: Run this block ONLY if your database was created
--    BEFORE the additional_comments column was added.
--    Safe to run multiple times.
-- ---------------------------------------------------------------------
alter table work_orders add column if not exists additional_comments text;
alter table sample_requests add column if not exists additional_comments text;

-- ---------------------------------------------------------------------
-- 9b. MIGRATION: Run this block if your database was created BEFORE
--     the Quotation module was added. Safe to run multiple times.
--     This adds the quotations table + updates order_items to allow
--     'quotation' as a valid parent_type.
-- ---------------------------------------------------------------------
create sequence if not exists quotation_seq start 1 increment 1;

create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_number integer not null default nextval('quotation_seq') unique,
  quote_date date not null default current_date,
  quote_validity text not null,
  client_name text not null,
  contact_person text,
  mobile_number text,
  email text,
  address text,
  client_manager text not null,
  other_manager_name text,
  terms_and_conditions text,
  subtotal numeric(12,2) default 0,
  total_gst numeric(12,2) default 0,
  grand_total numeric(12,2) default 0,
  created_by uuid references profiles(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quotations_client on quotations(client_name);

alter table quotations enable row level security;

drop policy if exists "Authenticated users can view quotations" on quotations;
create policy "Authenticated users can view quotations"
  on quotations for select using (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can insert quotations" on quotations;
create policy "Authenticated users can insert quotations"
  on quotations for insert with check (auth.role() = 'authenticated');

drop policy if exists "Authenticated users can update quotations" on quotations;
create policy "Authenticated users can update quotations"
  on quotations for update using (auth.role() = 'authenticated');

drop policy if exists "Admins can delete quotations" on quotations;
create policy "Admins can delete quotations"
  on quotations for delete using (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'admin')
  );

drop trigger if exists trg_quotations_updated_at on quotations;
create trigger trg_quotations_updated_at
  before update on quotations
  for each row execute function set_updated_at();

-- Update order_items check constraint to allow 'quotation' as parent_type.
-- Postgres requires dropping and recreating a check constraint to modify it.
do $$
begin
  alter table order_items drop constraint if exists order_items_parent_type_check;
  alter table order_items add constraint order_items_parent_type_check
    check (parent_type in ('work_order','sample_request','quotation'));
end $$;

alter publication supabase_realtime add table quotations;

-- ---------------------------------------------------------------------
-- 10. VERIFY DATA IS BEING STORED (run anytime to check)
-- ---------------------------------------------------------------------
-- Run this in SQL Editor after creating a Work Order, Sample Request,
-- or Quotation in the app to confirm Supabase is actually saving your data.

-- select count(*) as total_work_orders from work_orders;
-- select count(*) as total_sample_requests from sample_requests;
-- select count(*) as total_quotations from quotations;
-- select count(*) as total_order_items from order_items;
-- select order_number, client_name, grand_total, additional_comments, created_at
--   from work_orders order by created_at desc limit 5;
-- select quotation_number, client_name, quote_validity, grand_total, created_at
--   from quotations order by created_at desc limit 5;

-- ---------------------------------------------------------------------
-- MIGRATION: Add ad_name column if not yet present
-- Run this if you get "column ad_name does not exist" errors
-- ---------------------------------------------------------------------
alter table work_orders     add column if not exists additional_comments text;
alter table work_orders     add column if not exists lead_source text;
alter table work_orders     add column if not exists ad_name text;
alter table sample_requests add column if not exists additional_comments text;
alter table sample_requests add column if not exists lead_source text;
alter table sample_requests add column if not exists ad_name text;
alter table quotations      add column if not exists lead_source text;
alter table quotations      add column if not exists ad_name text;
