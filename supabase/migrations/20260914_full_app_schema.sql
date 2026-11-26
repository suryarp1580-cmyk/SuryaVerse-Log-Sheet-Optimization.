-- ============================================================================
-- ACCFIN Substitution & Timetable Management — Complete Unified Schema
-- Department of Accounting & Finance, AMJ College Shift II
-- ============================================================================
-- Run this in your Supabase project's SQL Editor (Dashboard -> SQL Editor)
-- This creates/updates all tables, indexes, and RLS policies safely.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. STAFF (Daily Substitution & Faculty Roster)
-- ----------------------------------------------------------------------------
create table if not exists public.staff (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  full_name text,
  is_active boolean not null default true,
  on_leave boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.staff enable row level security;
drop policy if exists "staff_select_all" on public.staff;
drop policy if exists "staff_modify_authenticated" on public.staff;
create policy "staff_select_all" on public.staff for select using (true);
create policy "staff_modify_authenticated" on public.staff for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 2. CLASS SECTIONS (Daily Grid & Substitution Classes)
-- ----------------------------------------------------------------------------
create table if not exists public.class_sections (
  id text primary key default gen_random_uuid()::text,
  year_label text not null,
  section text not null,
  room_no text default '',
  incharge_name text default '',
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.class_sections enable row level security;
drop policy if exists "class_sections_select_all" on public.class_sections;
drop policy if exists "class_sections_modify_authenticated" on public.class_sections;
create policy "class_sections_select_all" on public.class_sections for select using (true);
create policy "class_sections_modify_authenticated" on public.class_sections for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 3. TIMETABLE ENTRIES (Master Timetable Grid)
-- ----------------------------------------------------------------------------
create table if not exists public.timetable_entries (
  id text primary key default gen_random_uuid()::text,
  class_id text not null,
  day_order integer not null check (day_order between 1 and 6),
  period integer not null check (period between 1 and 5),
  subject_code text not null,
  is_lab boolean not null default false,
  excluded_from_substitution boolean not null default false,
  staff_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.timetable_entries enable row level security;
drop policy if exists "timetable_entries_select_all" on public.timetable_entries;
drop policy if exists "timetable_entries_modify_authenticated" on public.timetable_entries;
create policy "timetable_entries_select_all" on public.timetable_entries for select using (true);
create policy "timetable_entries_modify_authenticated" on public.timetable_entries for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 4. LOG SHEETS (Daily Log Sheets & Sign-offs)
-- ----------------------------------------------------------------------------
create table if not exists public.log_sheets (
  id uuid primary key default gen_random_uuid(),
  log_date text not null unique,
  day_order integer not null check (day_order between 1 and 6),
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  finalized_at timestamptz,
  total_absentees integer default 0,
  total_substitutions integer default 0,
  created_at timestamptz not null default now()
);

alter table public.log_sheets enable row level security;
drop policy if exists "log_sheets_select_all" on public.log_sheets;
drop policy if exists "log_sheets_modify_authenticated" on public.log_sheets;
create policy "log_sheets_select_all" on public.log_sheets for select using (true);
create policy "log_sheets_modify_authenticated" on public.log_sheets for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 5. SUBSTITUTIONS (Daily Period Adjustments & Swaps)
-- ----------------------------------------------------------------------------
create table if not exists public.substitutions (
  id uuid primary key default gen_random_uuid(),
  log_sheet_id uuid not null,
  class_id text not null,
  period integer not null check (period between 1 and 5),
  absent_staff_id text default '',
  substitute_staff_id text,
  remarks text default '',
  is_swap boolean not null default false,
  swap_with_period integer,
  swapped_subject_code text,
  swapped_staff_ids jsonb,
  created_at timestamptz not null default now()
);

alter table public.substitutions enable row level security;
drop policy if exists "substitutions_select_all" on public.substitutions;
drop policy if exists "substitutions_modify_authenticated" on public.substitutions;
create policy "substitutions_select_all" on public.substitutions for select using (true);
create policy "substitutions_modify_authenticated" on public.substitutions for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 6. PROFILES (Staff Roles & Authentication Profiles)
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text default 'Staff',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
drop policy if exists "profiles_select_all" on public.profiles;
drop policy if exists "profiles_modify_own" on public.profiles;
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_modify_own" on public.profiles for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 7. DATABASE BACKUPS (Full Snapshots & Rollback)
-- ----------------------------------------------------------------------------
create table if not exists public.backups (
  id text primary key,
  backup_label text not null,
  created_at timestamptz not null default now(),
  created_by text default 'Admin',
  staff_snapshot jsonb not null default '[]'::jsonb,
  class_sections_snapshot jsonb not null default '[]'::jsonb,
  timetable_entries_snapshot jsonb not null default '[]'::jsonb,
  log_sheets_snapshot jsonb not null default '[]'::jsonb,
  substitutions_snapshot jsonb not null default '[]'::jsonb
);

alter table public.backups enable row level security;
drop policy if exists "backups_select_all" on public.backups;
drop policy if exists "backups_modify_authenticated" on public.backups;
create policy "backups_select_all" on public.backups for select using (true);
create policy "backups_modify_authenticated" on public.backups for all 
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 8. TIMETABLE GENERATOR ENGINE TABLES (tt_classes, tt_staff, tt_workload, etc.)
-- ----------------------------------------------------------------------------
create table if not exists public.tt_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_staff (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  full_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  is_hod boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.tt_workload (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.tt_classes(id) on delete cascade,
  subject_code text not null,
  subject_name text not null,
  hours_per_week int not null check (hours_per_week > 0 and hours_per_week <= 30),
  staff_id uuid not null references public.tt_staff(id),
  is_fixed boolean not null default false,
  fixed_day_order int check (fixed_day_order between 1 and 6),
  fixed_period int check (fixed_period between 1 and 5),
  created_at timestamptz not null default now(),
  unique (class_id, subject_code)
);

create table if not exists public.tt_fixed_slots (
  id uuid primary key default gen_random_uuid(),
  workload_id uuid not null references public.tt_workload(id) on delete cascade,
  class_id uuid not null references public.tt_classes(id) on delete cascade,
  day_order int not null check (day_order between 1 and 6),
  period int not null check (period between 1 and 5),
  created_at timestamptz not null default now(),
  unique (class_id, day_order, period)
);

create table if not exists public.tt_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.tt_classes(id) on delete cascade,
  day_order int not null check (day_order between 1 and 6),
  period int not null check (period between 1 and 5),
  workload_id uuid references public.tt_workload(id) on delete set null,
  is_clash boolean not null default false,
  clash_reason text,
  created_at timestamptz not null default now(),
  unique (class_id, day_order, period)
);

create table if not exists public.tt_generation_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  classes_affected int not null default 0,
  slots_placed int not null default 0,
  unresolved_count int not null default 0,
  fixed_clash_count int not null default 0,
  attempts_used int not null default 0,
  details jsonb,
  created_by text
);

alter table public.tt_classes enable row level security;
alter table public.tt_staff enable row level security;
alter table public.tt_workload enable row level security;
alter table public.tt_fixed_slots enable row level security;
alter table public.tt_slots enable row level security;
alter table public.tt_generation_runs enable row level security;

create policy "tt_classes_read" on public.tt_classes for select using (true);
create policy "tt_classes_write" on public.tt_classes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tt_staff_read" on public.tt_staff for select using (true);
create policy "tt_staff_write" on public.tt_staff for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tt_workload_read" on public.tt_workload for select using (true);
create policy "tt_workload_write" on public.tt_workload for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tt_fixed_slots_read" on public.tt_fixed_slots for select using (true);
create policy "tt_fixed_slots_write" on public.tt_fixed_slots for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tt_slots_read" on public.tt_slots for select using (true);
create policy "tt_slots_write" on public.tt_slots for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "tt_generation_runs_read" on public.tt_generation_runs for select using (true);
create policy "tt_generation_runs_write" on public.tt_generation_runs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create table if not exists public.tt_fixed_periods (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.tt_classes(id) on delete cascade,
  day_order int not null check (day_order between 1 and 6),
  period int not null check (period between 1 and 5),
  slot_type text not null check (slot_type in ('LANG', 'ENG', 'LAB')),
  assigned_staff_id text,
  created_at timestamptz not null default now(),
  unique (class_id, day_order, period)
);
alter table public.tt_fixed_periods add column if not exists assigned_staff_id text;
create index if not exists idx_tt_fixed_periods_class on public.tt_fixed_periods(class_id);
alter table public.tt_fixed_periods enable row level security;
drop policy if exists "tt_fixed_periods_read" on public.tt_fixed_periods;
create policy "tt_fixed_periods_read" on public.tt_fixed_periods for select using (true);
drop policy if exists "tt_fixed_periods_write" on public.tt_fixed_periods;
create policy "tt_fixed_periods_write" on public.tt_fixed_periods for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 9. SEED DATA FOR TIMETABLE GENERATOR (18 ACCFIN Staff & 11 Classes)
-- ----------------------------------------------------------------------------
insert into public.tt_staff (short_code, full_name, is_hod, status) values
  ('AJ',  'DR. A. JULIET', false, 'ACTIVE'),
  ('DA',  'DR. D. AKILANDESWARI', false, 'ACTIVE'),
  ('DJ',  'MR. B. DENNY JONES', false, 'ACTIVE'),
  ('FND', 'DR. P. FATHIMA NANCY DYANA', false, 'ACTIVE'),
  ('GS',  'DR. G. SATHYA', false, 'ACTIVE'),
  ('JD',  'MS. D. JAYALAKSHMI', false, 'ACTIVE'),
  ('JP',  'DR. R. JOTHIPRAKASH', false, 'ACTIVE'),
  ('KM',  'MS. K. MATHUMATHI', false, 'ACTIVE'),
  ('KS',  'MS. K. SINDHUJA', false, 'ACTIVE'),
  ('MJ',  'DR. M. JAGADEESWARI', false, 'ACTIVE'),
  ('MP',  'MS. P. MEENA', false, 'ACTIVE'),
  ('OJ',  'DR. M. OPHELIA JANEFER', false, 'ACTIVE'),
  ('PM',  'DR. P. MARIAPPAN', false, 'ACTIVE'),
  ('PS',  'DR. B. PADMASHREE', false, 'ACTIVE'),
  ('RP',  'DR. P. RAJENDRA PRASAD', true, 'ACTIVE'),
  ('RT',  'MR. R. THIRUMURUGAN', false, 'ACTIVE'),
  ('SS',  'MS. SHILPA S', false, 'ACTIVE'),
  ('TP',  'MS. T. PARKAVI', false, 'ACTIVE')
on conflict (short_code) do update set
  full_name = excluded.full_name,
  is_hod = excluded.is_hod,
  status = 'ACTIVE';

insert into public.tt_classes (code, display_name, sort_order) values
  ('I-MCOM',     'I M.COM',        1),
  ('II-MCOM',    'II M.COM',       2),
  ('I-BCOM-A',   'I B.COM - A',    3),
  ('I-BCOM-B',   'I B.COM - B',    4),
  ('I-BCOM-C',   'I B.COM - C',    5),
  ('II-BCOM-A',  'II B.COM - A',   6),
  ('II-BCOM-B',  'II B.COM - B',   7),
  ('II-BCOM-C',  'II B.COM - C',   8),
  ('III-BCOM-A', 'III B.COM - A',  9),
  ('III-BCOM-B', 'III B.COM - B', 10),
  ('III-BCOM-C', 'III B.COM - C', 11)
on conflict (code) do update set
  display_name = excluded.display_name,
  sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- Notify PostgREST to immediately refresh its schema cache
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
notify pgrst, 'reload config';
