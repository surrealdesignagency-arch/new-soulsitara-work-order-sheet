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
-- 5. ORDER ITEMS (shared by work_orders and sample_requests)
-- ---------------------------------------------------------------------
create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('work_order','sample_request')),
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
alter table order_items enable row level security;

-- All authenticated users can view everything (shared database)
create policy "Authenticated users can view work orders"
  on work_orders for select using (auth.role() = 'authenticated');

create policy "Authenticated users can view sample requests"
  on sample_requests for select using (auth.role() = 'authenticated');

create policy "Authenticated users can view order items"
  on order_items for select using (auth.role() = 'authenticated');

-- All authenticated users can insert (create orders/samples)
create policy "Authenticated users can insert work orders"
  on work_orders for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can insert sample requests"
  on sample_requests for insert with check (auth.role() = 'authenticated');

create policy "Authenticated users can insert order items"
  on order_items for insert with check (auth.role() = 'authenticated');

-- All authenticated users can update status / edit (employees update status, admins edit fully)
create policy "Authenticated users can update work orders"
  on work_orders for update using (auth.role() = 'authenticated');

create policy "Authenticated users can update sample requests"
  on sample_requests for update using (auth.role() = 'authenticated');

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

-- ---------------------------------------------------------------------
-- 8. ENABLE REALTIME (run in Supabase Dashboard > Database > Replication
--    if not automatically enabled by this statement)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table work_orders;
alter publication supabase_realtime add table sample_requests;
alter publication supabase_realtime add table order_items;
