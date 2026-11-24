-- ============================================================================
-- ACCFIN Timetable Generator — Part 2 Migration
-- Adds: (a) fixed-slot placement fields on tt_workload, so language/fixed
--           subjects can be pinned to an exact Day Order + Period before the
--           auto-generator runs, and (b) an audit log of each generation run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Fixed slot placement on tt_workload
-- ----------------------------------------------------------------------------
alter table tt_workload
  add column if not exists fixed_day_order int check (fixed_day_order between 1 and 6),
  add column if not exists fixed_period int check (fixed_period between 1 and 5);

-- Both fields must be set together, and only for rows marked is_fixed.
alter table tt_workload
  add constraint tt_workload_fixed_slot_consistency
  check (
    (fixed_day_order is null and fixed_period is null)
    or (fixed_day_order is not null and fixed_period is not null and is_fixed = true)
  );

-- Prevent two fixed subjects landing in the same class's slot (data-entry
-- error) — partial unique index, only applies to rows that actually have a
-- fixed slot set.
create unique index if not exists uq_tt_workload_fixed_slot
  on tt_workload (class_id, fixed_day_order, fixed_period)
  where fixed_day_order is not null;

-- ----------------------------------------------------------------------------
-- 2. Generation run audit log
-- ----------------------------------------------------------------------------
create table if not exists tt_generation_runs (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null default now(),
  classes_affected int not null default 0,
  slots_placed int not null default 0,
  unresolved_count int not null default 0,
  fixed_clash_count int not null default 0,
  attempts_used int not null default 0,
  details jsonb, -- full unresolved/clash breakdown, for the Part 3 UI to render
  created_by text -- optional: auth.uid() or staff short code, if you wire it up
);

alter table tt_generation_runs enable row level security;
create policy "tt_generation_runs_read" on tt_generation_runs for select using (true);
create policy "tt_generation_runs_write" on tt_generation_runs for insert
  with check (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- Notify PostgREST to immediately refresh its schema cache
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

