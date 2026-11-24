-- ============================================================================
-- ACCFIN Timetable Generator — Schema Migration
-- Department of Accounting & Finance, AMJ College Shift II
-- ============================================================================
-- Run this in the Supabase SQL editor, or via the Supabase CLI:
--   supabase migration up
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CLASSES  (the 11 class sections)
-- ----------------------------------------------------------------------------
create table if not exists tt_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- e.g. 'I-MCOM', 'III-BCOM-A'
  display_name text not null,         -- e.g. 'I M.COM', 'III B.COM - A'
  sort_order int not null default 0,  -- controls display order across the app
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. STAFF  (18 active department staff, keyed by short code)
-- ----------------------------------------------------------------------------
create table if not exists tt_staff (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,    -- e.g. 'RP', 'DA', 'JP'
  full_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  is_hod boolean not null default false,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. WORKLOAD  (the input: one row per subject taught in a class)
-- ----------------------------------------------------------------------------
create table if not exists tt_workload (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references tt_classes(id) on delete cascade,
  subject_code text not null,         -- short code e.g. 'BI', 'HRM', 'ENG'
  subject_name text not null,         -- full name e.g. 'BANKING AND INSURANCE'
  hours_per_week int not null check (hours_per_week > 0 and hours_per_week <= 30),
  staff_id uuid not null references tt_staff(id),
  is_fixed boolean not null default false,
  -- is_fixed = TRUE for language hours (English / Tamil) that are placed
  -- manually before the auto-generator runs, per ACCFIN policy: language
  -- periods are excluded from auto-scheduling and substitution.
  created_at timestamptz not null default now(),
  unique (class_id, subject_code)
);

create index if not exists idx_tt_workload_class on tt_workload(class_id);
create index if not exists idx_tt_workload_staff on tt_workload(staff_id);

-- ----------------------------------------------------------------------------
-- 4. GENERATED SLOTS  (filled in by the scheduling engine — Part 2)
-- ----------------------------------------------------------------------------
-- Day Order 1–6, Period 1–5 (break sits between period 3 and period 4 and is
-- not a schedulable slot — see PERIOD_TIMES in lib/timetable/constants.ts)
create table if not exists tt_slots (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references tt_classes(id) on delete cascade,
  day_order int not null check (day_order between 1 and 6),
  period int not null check (period between 1 and 5),
  workload_id uuid references tt_workload(id) on delete set null,
  is_clash boolean not null default false,
  clash_reason text,                  -- e.g. 'RP already teaching III-BCOM-C at DO2/P4'
  created_at timestamptz not null default now(),
  unique (class_id, day_order, period)
);

create index if not exists idx_tt_slots_class on tt_slots(class_id);
create index if not exists idx_tt_slots_workload on tt_slots(workload_id);

-- ----------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------
-- Mirrors the rest of the ACCFIN app: readable by any authenticated staff
-- member, writable only by authenticated users (tighten to a role check if
-- the main app already has a `role` claim / staff table you want to gate on).
alter table tt_classes enable row level security;
alter table tt_staff enable row level security;
alter table tt_workload enable row level security;
alter table tt_slots enable row level security;

create policy "tt_classes_read" on tt_classes for select using (true);
create policy "tt_staff_read" on tt_staff for select using (true);
create policy "tt_workload_read" on tt_workload for select using (true);
create policy "tt_slots_read" on tt_slots for select using (true);

create policy "tt_classes_write" on tt_classes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "tt_staff_write" on tt_staff for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "tt_workload_write" on tt_workload for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "tt_slots_write" on tt_slots for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 6. SEED DATA — the 18 staff members
-- ----------------------------------------------------------------------------
insert into tt_staff (short_code, full_name, is_hod) values
  ('AJ',  'DR. A. JULIET', false),
  ('DA',  'DR. D. AKILANDESWARI', false),
  ('DJ',  'MR. B. DENNY JONES', false),
  ('FND', 'DR. P. FATHIMA NANCY DYANA', false),
  ('GS',  'DR. G. SATHYA', false),
  ('JD',  'MS. D. JAYALAKSHMI', false),
  ('JP',  'DR. R. JOTHIPRAKASH', false),
  ('KM',  'MS. K. MATHUMATHI', false),
  ('KS',  'MS. K. SINDHUJA', false),
  ('MJ',  'DR. M. JAGADEESWARI', false),
  ('MP',  'MS. P. MEENA', false),
  ('OJ',  'DR. M. OPHELIA JANEFER', false),
  ('PM',  'DR. P. MARIAPPAN', false),
  ('PS',  'DR. B. PADMASHREE', false),
  ('RP',  'DR. P. RAJENDRA PRASAD', true),
  ('RT',  'MR. R. THIRUMURUGAN', false),
  ('SS',  'MS. SHILPA S', false),
  ('TP',  'MS. T. PARKAVI', false)
on conflict (short_code) do nothing;

-- ----------------------------------------------------------------------------
-- 7. SEED DATA — the 11 class sections (inferred from the department's
--    existing printed timetables; edit here if section names differ)
-- ----------------------------------------------------------------------------
insert into tt_classes (code, display_name, sort_order) values
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
on conflict (code) do nothing;

-- ----------------------------------------------------------------------------
-- Notify PostgREST to immediately refresh its schema cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

