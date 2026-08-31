-- STOCKYARD database schema
-- Run this once in Supabase: Dashboard → SQL Editor → paste this whole file → Run

create table if not exists stock_rows (
  id uuid primary key default gen_random_uuid(),
  sku text,
  code text not null,
  description text,
  batch text,
  primary_packing text,
  box_net_weight numeric,
  packing_size text,
  expiry_date date,
  storage_location int not null,
  material_category text,
  unit text,
  quantity numeric not null default 0,
  unit_price numeric,
  total_stock_value numeric,
  brand text,
  origin text,
  bin_location text,
  received_at bigint not null default extract(epoch from now()) * 1000,
  created_at timestamptz not null default now()
);

create table if not exists movements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('receipt', 'transfer', 'issue', 'adjustment')),
  code text not null,
  batch_no text,
  from_zone int,
  to_location text,
  qty numeric not null,
  note text,
  po_number text,
  vendor text,
  posting_date date,
  row_id uuid,
  op_id uuid,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists picking_lists (
  id uuid primary key default gen_random_uuid(),
  pl_number text not null,
  type text not null check (type in ('transfer', 'issue')),
  project text,
  to_project text,
  status text not null default 'picking' check (status in ('picking', 'sent', 'confirmed')),
  lines jsonb not null default '[]',
  transfer_note jsonb not null default '{}',
  forecast_id uuid,
  sent_at timestamptz,
  confirmed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

-- Sequential PL/01, PL/02... numbers survive deletes and page reloads
create sequence if not exists pl_number_seq start 1;

create or replace function next_pl_number()
returns text
language sql
as $$
  select 'PL/' || lpad(nextval('pl_number_seq')::text, 2, '0');
$$;

create table if not exists last_import (
  id int primary key default 1,
  file_name text,
  row_count int,
  imported_at timestamptz,
  snapshot jsonb,
  constraint single_row check (id = 1)
);

-- Per-item settings that aren't tied to any one batch/row — currently just
-- a reorder threshold, keyed by item CODE.
create table if not exists item_settings (
  sku text primary key,
  reorder_threshold numeric,
  updated_at timestamptz not null default now()
);

-- A stock take is a physical count session: open it, count what's actually
-- on the shelf per item, and reconcile against system quantities. Lines are
-- stored as jsonb, same pattern as picking_lists.
create table if not exists stock_takes (
  id uuid primary key default gen_random_uuid(),
  st_number text not null,
  zone_filter int,
  status text not null default 'counting' check (status in ('counting', 'completed')),
  lines jsonb not null default '[]',
  created_by text,
  completed_by text,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create sequence if not exists st_number_seq start 1;

create or replace function next_st_number()
returns text
language sql
as $$
  select 'ST/' || lpad(nextval('st_number_seq')::text, 2, '0');
$$;

-- A forecast cycle: collect each project site's monthly quantity request,
-- consolidate by SKU against current stock, and surface what needs buying.
-- Submissions are stored as jsonb, one entry per site: { project, lines: [{sku, desc, qty, unit}], submittedAt }.
-- The item catalog — every item that exists, whether or not it currently has
-- stock. This is what Goods Receipt, Picking, and Forecast search against,
-- so a brand-new item (never received before) or an item that's fully out
-- of stock can still be found and used. Importing Stock.xlsx populates this
-- automatically; new items can also be added by hand.
-- Periodic consumption data exported from SAP (all projects' issues), used
-- as a comparison reference in Forecast consolidation. Each upload is
-- tagged with a period label; the latest upload per SKU is what's shown.
create table if not exists consumption_records (
  id uuid primary key default gen_random_uuid(),
  sku text,
  code text,
  project text, -- null = overall/combined figure, not site-specific
  qty numeric not null,
  unit text,
  period_label text not null,
  uploaded_at timestamptz not null default now()
);

create table if not exists item_master (
  code text primary key,
  sku text not null,
  description text,
  unit text,
  material_category text,
  primary_packing text,
  packing_size text,
  box_net_weight numeric,
  brand text,
  origin text,
  default_storage_location int,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A manual "opening balance" for pending-to-transfer amounts the app can't
-- see itself — e.g. transfers that were already promised/committed before
-- you started using this system, or tracked outside it. These add on top
-- of the live, picking-list-derived pending amounts everywhere PR QTY and
-- "Total Pending" are calculated. Delete/zero one out once the real
-- transfer actually happens in the app, to avoid double-counting.
create table if not exists pending_adjustments (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  site_id text not null,
  qty numeric not null,
  note text,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists forecasts (
  id uuid primary key default gen_random_uuid(),
  fc_number text not null,
  period_label text not null,
  status text not null default 'collecting' check (status in ('collecting', 'completed')),
  submissions jsonb not null default '[]',
  manual_fields jsonb not null default '{}', -- keyed by item code: { transitInt, transitLcl, orderMode, add, p9IntAdd, calculation, invIn, invOut }
  created_by text,
  created_at timestamptz not null default now()
);

create sequence if not exists fc_number_seq start 1;

create or replace function next_fc_number()
returns text
language sql
as $$
  select 'FC/' || lpad(nextval('fc_number_seq')::text, 2, '0');
$$;

-- Safe to re-run: adds the new columns above even if these tables already
-- existed from an earlier version of this schema.
alter table movements add column if not exists created_by text;
alter table picking_lists add column if not exists created_by text;
alter table movements drop constraint if exists movements_type_check;
alter table movements add constraint movements_type_check check (type in ('receipt', 'transfer', 'issue', 'adjustment'));

-- item_settings originally keyed on CODE (one pack-size variant). SKU is the
-- real consolidation key across pack sizes, so reorder thresholds move to
-- being keyed on SKU instead.
-- item_settings originally keyed on CODE (one pack-size variant). SKU is the
-- real consolidation key across pack sizes, so reorder thresholds move to
-- being keyed on SKU instead. Guards against a prior partial run leaving
-- both columns present.
do $$
begin
  if exists (select 1 from information_schema.columns where table_name = 'item_settings' and column_name = 'code') then
    if exists (select 1 from information_schema.columns where table_name = 'item_settings' and column_name = 'sku') then
      alter table item_settings drop column code;
    else
      alter table item_settings rename column code to sku;
    end if;
  end if;
end $$;

alter table consumption_records add column if not exists code text;
alter table consumption_records add column if not exists project text;
alter table consumption_records alter column sku drop not null;
alter table forecasts add column if not exists manual_fields jsonb not null default '{}';
alter table picking_lists add column if not exists forecast_id uuid;
-- Covers every item_master column explicitly, in case this table was
-- first created by an earlier version of this schema that didn't have
-- them all yet (CREATE TABLE IF NOT EXISTS only skips table creation —
-- it does NOT add missing columns to a table that already exists).
alter table item_master add column if not exists sku text;
alter table item_master add column if not exists description text;
alter table item_master add column if not exists unit text;
alter table item_master add column if not exists material_category text;
alter table item_master add column if not exists primary_packing text;
alter table item_master add column if not exists packing_size text;
alter table item_master add column if not exists box_net_weight numeric;
alter table item_master add column if not exists brand text;
alter table item_master add column if not exists origin text;
alter table item_master add column if not exists default_storage_location int;
alter table item_master add column if not exists remarks text;

-- Force PostgREST to pick up the columns above immediately, rather than
-- waiting for its own periodic cache refresh.
NOTIFY pgrst, 'reload schema';

-- item_master was introduced after stock_rows already existed for some
-- deployments — backfill the catalog from whatever's already been imported,
-- so nothing is lost. Safe to re-run: existing codes are left untouched.
insert into item_master (code, sku, description, unit, material_category, primary_packing, packing_size, box_net_weight, brand, origin, default_storage_location)
select distinct on (code)
  code, coalesce(sku, code), description, unit, material_category, primary_packing, packing_size, box_net_weight, brand, origin, storage_location
from stock_rows
order by code, received_at asc
on conflict (code) do nothing;

-- Row Level Security: locked down by default. The app connects with the
-- anon key and a shared app password (see README), so these policies just
-- allow the anon role to read/write — real per-user auth is a later upgrade.
alter table stock_rows enable row level security;
alter table movements enable row level security;
alter table picking_lists enable row level security;
alter table last_import enable row level security;
alter table item_settings enable row level security;
alter table stock_takes enable row level security;
alter table forecasts enable row level security;
alter table item_master enable row level security;
alter table consumption_records enable row level security;
alter table pending_adjustments enable row level security;

drop policy if exists "anon full access" on stock_rows;
drop policy if exists "anon full access" on movements;
drop policy if exists "anon full access" on picking_lists;
drop policy if exists "anon full access" on last_import;
drop policy if exists "anon full access" on item_settings;
drop policy if exists "anon full access" on stock_takes;
drop policy if exists "anon full access" on forecasts;
drop policy if exists "anon full access" on item_master;
drop policy if exists "anon full access" on consumption_records;
drop policy if exists "anon full access" on pending_adjustments;

create policy "anon full access" on stock_rows for all using (true) with check (true);
create policy "anon full access" on movements for all using (true) with check (true);
create policy "anon full access" on picking_lists for all using (true) with check (true);
create policy "anon full access" on last_import for all using (true) with check (true);
create policy "anon full access" on item_settings for all using (true) with check (true);
create policy "anon full access" on stock_takes for all using (true) with check (true);
create policy "anon full access" on forecasts for all using (true) with check (true);
create policy "anon full access" on item_master for all using (true) with check (true);
create policy "anon full access" on consumption_records for all using (true) with check (true);
create policy "anon full access" on pending_adjustments for all using (true) with check (true);
