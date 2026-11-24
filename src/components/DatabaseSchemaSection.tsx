import React, { useState, useEffect, useMemo } from 'react';
import { supabase, getActiveSupabaseUrl, isSupabaseConfigured, getSupabaseProjectRef } from '../lib/supabaseClient';
import { seedDatabaseWithPastData } from '../lib/database';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Database,
  Terminal,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  FileCode,
  Loader2,
  HelpCircle,
  Layers,
  ArrowRight
} from 'lucide-react';

interface DatabaseSchemaSectionProps {
  showToast: (message: string, type: 'success' | 'info') => void;
  onSeedDatabase?: () => Promise<void>;
}

export interface TableDefinition {
  name: string;
  description: string;
  category: 'Daily Operations' | 'Timetable Generator' | 'System & Backups';
  order: number;
  dependencies?: string[];
  createSql: string;
}

export interface TableHealthResult {
  name: string;
  description: string;
  category: 'Daily Operations' | 'Timetable Generator' | 'System & Backups';
  order: number;
  dependencies?: string[];
  createSql: string;
  status: 'checking' | 'exists' | 'missing' | 'error';
  rowCount: number | null;
  errorMessage?: string;
}

// ============================================================================
// INDIVIDUAL TABLE DEFINITIONS (IN STRICT DEPENDENCY ORDER)
// Every statement uses CREATE TABLE IF NOT EXISTS and ends with reload schema
// ============================================================================
export const REQUIRED_TABLES: TableDefinition[] = [
  // 1. Daily Operations (No FK dependencies)
  {
    name: 'staff',
    description: 'Faculty roster for daily substitution and leave tracking',
    category: 'Daily Operations',
    order: 1,
    createSql: `-- Table 1: staff
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.staff (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  full_name text,
  is_active boolean NOT NULL DEFAULT true,
  on_leave boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
DROP POLICY IF EXISTS "staff_modify_authenticated" ON public.staff;
CREATE POLICY "staff_select_all" ON public.staff FOR SELECT USING (true);
CREATE POLICY "staff_modify_authenticated" ON public.staff FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'class_sections',
    description: 'Class sections, year labels, room numbers, and faculty in-charges',
    category: 'Daily Operations',
    order: 2,
    createSql: `-- Table 2: class_sections
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.class_sections (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  year_label text NOT NULL,
  section text NOT NULL,
  room_no text DEFAULT '',
  incharge_name text DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "class_sections_select_all" ON public.class_sections;
DROP POLICY IF EXISTS "class_sections_modify_authenticated" ON public.class_sections;
CREATE POLICY "class_sections_select_all" ON public.class_sections FOR SELECT USING (true);
CREATE POLICY "class_sections_modify_authenticated" ON public.class_sections FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'timetable_entries',
    description: 'Master 6-day order timetable schedules for daily substitution grid',
    category: 'Daily Operations',
    order: 3,
    createSql: `-- Table 3: timetable_entries
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id text NOT NULL,
  day_order integer NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period integer NOT NULL CHECK (period BETWEEN 1 AND 5),
  subject_code text NOT NULL,
  is_lab boolean NOT NULL DEFAULT false,
  excluded_from_substitution boolean NOT NULL DEFAULT false,
  staff_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "timetable_entries_select_all" ON public.timetable_entries;
DROP POLICY IF EXISTS "timetable_entries_modify_authenticated" ON public.timetable_entries;
CREATE POLICY "timetable_entries_select_all" ON public.timetable_entries FOR SELECT USING (true);
CREATE POLICY "timetable_entries_modify_authenticated" ON public.timetable_entries FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'log_sheets',
    description: 'Daily log sheets, day orders, totals, and finalization status',
    category: 'Daily Operations',
    order: 4,
    createSql: `-- Table 4: log_sheets
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.log_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date text NOT NULL UNIQUE,
  day_order integer NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  finalized_at timestamptz,
  total_absentees integer DEFAULT 0,
  total_substitutions integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.log_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "log_sheets_select_all" ON public.log_sheets;
DROP POLICY IF EXISTS "log_sheets_modify_authenticated" ON public.log_sheets;
CREATE POLICY "log_sheets_select_all" ON public.log_sheets FOR SELECT USING (true);
CREATE POLICY "log_sheets_modify_authenticated" ON public.log_sheets FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'substitutions',
    description: 'Daily substitutions, assigned faculty, swaps, and notes',
    category: 'Daily Operations',
    order: 5,
    dependencies: ['log_sheets'],
    createSql: `-- Table 5: substitutions
-- Depends on: log_sheets (Foreign key: log_sheet_id references log_sheets.id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_sheet_id uuid NOT NULL REFERENCES public.log_sheets(id) ON DELETE CASCADE,
  class_id text NOT NULL,
  period integer NOT NULL CHECK (period BETWEEN 1 AND 5),
  absent_staff_id text DEFAULT '',
  substitute_staff_id text,
  remarks text DEFAULT '',
  is_swap boolean NOT NULL DEFAULT false,
  swap_with_period integer,
  swapped_subject_code text,
  swapped_staff_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "substitutions_select_all" ON public.substitutions;
DROP POLICY IF EXISTS "substitutions_modify_authenticated" ON public.substitutions;
CREATE POLICY "substitutions_select_all" ON public.substitutions FOR SELECT USING (true);
CREATE POLICY "substitutions_modify_authenticated" ON public.substitutions FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },

  // 2. System & Backups
  {
    name: 'profiles',
    description: 'User roles (Admin, HOD, Staff) tied to Supabase Auth users',
    category: 'System & Backups',
    order: 6,
    dependencies: ['auth.users'],
    createSql: `-- Table 6: profiles
-- Depends on: auth.users (Foreign key: id references auth.users.id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text DEFAULT 'Staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_modify_own" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_modify_own" ON public.profiles FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'backups',
    description: 'Full database snapshot archives and metadata for restore',
    category: 'System & Backups',
    order: 7,
    createSql: `-- Table 7: backups
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.backups (
  id text PRIMARY KEY,
  backup_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'Admin',
  staff_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  class_sections_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  timetable_entries_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  log_sheets_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitutions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backups_select_all" ON public.backups;
DROP POLICY IF EXISTS "backups_modify_authenticated" ON public.backups;
CREATE POLICY "backups_select_all" ON public.backups FOR SELECT USING (true);
CREATE POLICY "backups_modify_authenticated" ON public.backups FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },

  // 3. Timetable Generator Engine
  {
    name: 'tt_classes',
    description: 'Timetable Generator: 11 department class sections',
    category: 'Timetable Generator',
    order: 8,
    createSql: `-- Table 8: tt_classes
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_classes_read" ON public.tt_classes;
DROP POLICY IF EXISTS "tt_classes_write" ON public.tt_classes;
CREATE POLICY "tt_classes_read" ON public.tt_classes FOR SELECT USING (true);
CREATE POLICY "tt_classes_write" ON public.tt_classes FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Default 11 Department Classes Seed
INSERT INTO public.tt_classes (code, display_name, sort_order) VALUES
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
ON CONFLICT (code) DO UPDATE SET
  display_name = excluded.display_name,
  sort_order = excluded.sort_order;

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'tt_staff',
    description: 'Timetable Generator: 18 department faculty roster and short codes',
    category: 'Timetable Generator',
    order: 9,
    createSql: `-- Table 9: tt_staff
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  is_hod boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_staff_read" ON public.tt_staff;
DROP POLICY IF EXISTS "tt_staff_write" ON public.tt_staff;
CREATE POLICY "tt_staff_read" ON public.tt_staff FOR SELECT USING (true);
CREATE POLICY "tt_staff_write" ON public.tt_staff FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- Default 18 ACCFIN Faculty Roster Seed
INSERT INTO public.tt_staff (short_code, full_name, is_hod, status) VALUES
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
ON CONFLICT (short_code) DO UPDATE SET
  full_name = excluded.full_name,
  is_hod = excluded.is_hod,
  status = 'ACTIVE';

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'tt_workload',
    description: 'Timetable Generator: Subject hours, allocations, and assigned faculty',
    category: 'Timetable Generator',
    order: 10,
    dependencies: ['tt_classes', 'tt_staff'],
    createSql: `-- Table 10: tt_workload
-- Depends on: tt_classes, tt_staff (Foreign keys: class_id, staff_id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_workload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  subject_name text NOT NULL,
  hours_per_week int NOT NULL CHECK (hours_per_week > 0 AND hours_per_week <= 30),
  staff_id uuid NOT NULL REFERENCES public.tt_staff(id),
  is_fixed boolean NOT NULL DEFAULT false,
  fixed_day_order int CHECK (fixed_day_order BETWEEN 1 AND 6),
  fixed_period int CHECK (fixed_period BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_code)
);

ALTER TABLE public.tt_workload ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_workload_read" ON public.tt_workload;
DROP POLICY IF EXISTS "tt_workload_write" ON public.tt_workload;
CREATE POLICY "tt_workload_read" ON public.tt_workload FOR SELECT USING (true);
CREATE POLICY "tt_workload_write" ON public.tt_workload FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'tt_fixed_slots',
    description: 'Timetable Generator: Pinned fixed period slots (Language, Lab, etc.)',
    category: 'Timetable Generator',
    order: 11,
    dependencies: ['tt_workload', 'tt_classes'],
    createSql: `-- Table 11: tt_fixed_slots
-- Depends on: tt_workload, tt_classes (Foreign keys: workload_id, class_id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_fixed_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id uuid NOT NULL REFERENCES public.tt_workload(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  day_order int NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, day_order, period)
);

ALTER TABLE public.tt_fixed_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_fixed_slots_read" ON public.tt_fixed_slots;
DROP POLICY IF EXISTS "tt_fixed_slots_write" ON public.tt_fixed_slots;
CREATE POLICY "tt_fixed_slots_read" ON public.tt_fixed_slots FOR SELECT USING (true);
CREATE POLICY "tt_fixed_slots_write" ON public.tt_fixed_slots FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'tt_slots',
    description: 'Timetable Generator: Generated timetable period slots and clash markers',
    category: 'Timetable Generator',
    order: 12,
    dependencies: ['tt_classes', 'tt_workload'],
    createSql: `-- Table 12: tt_slots
-- Depends on: tt_classes, tt_workload (Foreign keys: class_id, workload_id)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  day_order int NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 5),
  workload_id uuid REFERENCES public.tt_workload(id) ON DELETE SET NULL,
  is_clash boolean NOT NULL DEFAULT false,
  clash_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, day_order, period)
);

ALTER TABLE public.tt_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_slots_read" ON public.tt_slots;
DROP POLICY IF EXISTS "tt_slots_write" ON public.tt_slots;
CREATE POLICY "tt_slots_read" ON public.tt_slots FOR SELECT USING (true);
CREATE POLICY "tt_slots_write" ON public.tt_slots FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
  {
    name: 'tt_generation_runs',
    description: 'Timetable Generator: Run audit history, metrics, and logs',
    category: 'Timetable Generator',
    order: 13,
    createSql: `-- Table 13: tt_generation_runs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.tt_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  classes_affected int NOT NULL DEFAULT 0,
  slots_placed int NOT NULL DEFAULT 0,
  unresolved_count int NOT NULL DEFAULT 0,
  fixed_clash_count int NOT NULL DEFAULT 0,
  attempts_used int NOT NULL DEFAULT 0,
  details jsonb,
  created_by text
);

ALTER TABLE public.tt_generation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_generation_runs_read" ON public.tt_generation_runs;
DROP POLICY IF EXISTS "tt_generation_runs_write" ON public.tt_generation_runs;
CREATE POLICY "tt_generation_runs_read" ON public.tt_generation_runs FOR SELECT USING (true);
CREATE POLICY "tt_generation_runs_write" ON public.tt_generation_runs FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

NOTIFY pgrst, 'reload schema';`,
  },
];

// ============================================================================
// CONSOLIDATED SINGLE MASTER SCRIPT (STRICT DEPENDENCY ORDER)
// Combined in correct dependency order with IF NOT EXISTS throughout
// ============================================================================
export const CONSOLIDATED_MIGRATION_SQL = `-- ============================================================================
-- ACCFIN Substitution & Timetable Management — Complete Unified Schema
-- Department of Accounting & Finance, Shift II
-- ============================================================================
-- Complete consolidated migration containing all 13 application tables in
-- strict foreign key dependency order. Safe to re-run anytime: uses
-- CREATE TABLE IF NOT EXISTS throughout and ends with PostgREST cache reload.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ----------------------------------------------------------------------------
-- 1. STAFF (Daily Substitution & Faculty Roster)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.staff (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code text NOT NULL UNIQUE,
  full_name text,
  is_active boolean NOT NULL DEFAULT true,
  on_leave boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff_select_all" ON public.staff;
DROP POLICY IF EXISTS "staff_modify_authenticated" ON public.staff;
CREATE POLICY "staff_select_all" ON public.staff FOR SELECT USING (true);
CREATE POLICY "staff_modify_authenticated" ON public.staff FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 2. CLASS SECTIONS (Daily Grid & Substitution Classes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_sections (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  year_label text NOT NULL,
  section text NOT NULL,
  room_no text DEFAULT '',
  incharge_name text DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.class_sections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "class_sections_select_all" ON public.class_sections;
DROP POLICY IF EXISTS "class_sections_modify_authenticated" ON public.class_sections;
CREATE POLICY "class_sections_select_all" ON public.class_sections FOR SELECT USING (true);
CREATE POLICY "class_sections_modify_authenticated" ON public.class_sections FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 3. TIMETABLE ENTRIES (Master Timetable Grid)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.timetable_entries (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_id text NOT NULL,
  day_order integer NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period integer NOT NULL CHECK (period BETWEEN 1 AND 5),
  subject_code text NOT NULL,
  is_lab boolean NOT NULL DEFAULT false,
  excluded_from_substitution boolean NOT NULL DEFAULT false,
  staff_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timetable_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "timetable_entries_select_all" ON public.timetable_entries;
DROP POLICY IF EXISTS "timetable_entries_modify_authenticated" ON public.timetable_entries;
CREATE POLICY "timetable_entries_select_all" ON public.timetable_entries FOR SELECT USING (true);
CREATE POLICY "timetable_entries_modify_authenticated" ON public.timetable_entries FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 4. LOG SHEETS (Daily Log Sheets & Sign-offs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.log_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date text NOT NULL UNIQUE,
  day_order integer NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized')),
  finalized_at timestamptz,
  total_absentees integer DEFAULT 0,
  total_substitutions integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.log_sheets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "log_sheets_select_all" ON public.log_sheets;
DROP POLICY IF EXISTS "log_sheets_modify_authenticated" ON public.log_sheets;
CREATE POLICY "log_sheets_select_all" ON public.log_sheets FOR SELECT USING (true);
CREATE POLICY "log_sheets_modify_authenticated" ON public.log_sheets FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 5. SUBSTITUTIONS (Daily Period Adjustments & Swaps)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.substitutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_sheet_id uuid NOT NULL REFERENCES public.log_sheets(id) ON DELETE CASCADE,
  class_id text NOT NULL,
  period integer NOT NULL CHECK (period BETWEEN 1 AND 5),
  absent_staff_id text DEFAULT '',
  substitute_staff_id text,
  remarks text DEFAULT '',
  is_swap boolean NOT NULL DEFAULT false,
  swap_with_period integer,
  swapped_subject_code text,
  swapped_staff_ids jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.substitutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "substitutions_select_all" ON public.substitutions;
DROP POLICY IF EXISTS "substitutions_modify_authenticated" ON public.substitutions;
CREATE POLICY "substitutions_select_all" ON public.substitutions FOR SELECT USING (true);
CREATE POLICY "substitutions_modify_authenticated" ON public.substitutions FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 6. PROFILES (Staff Roles & Authentication Profiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  role text DEFAULT 'Staff',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_modify_own" ON public.profiles;
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_modify_own" ON public.profiles FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 7. DATABASE BACKUPS (Full Snapshots & Rollback)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.backups (
  id text PRIMARY KEY,
  backup_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text DEFAULT 'Admin',
  staff_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  class_sections_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  timetable_entries_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  log_sheets_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitutions_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "backups_select_all" ON public.backups;
DROP POLICY IF EXISTS "backups_modify_authenticated" ON public.backups;
CREATE POLICY "backups_select_all" ON public.backups FOR SELECT USING (true);
CREATE POLICY "backups_modify_authenticated" ON public.backups FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 8. TIMETABLE GENERATOR ENGINE: CLASSES (tt_classes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_classes_read" ON public.tt_classes;
DROP POLICY IF EXISTS "tt_classes_write" ON public.tt_classes;
CREATE POLICY "tt_classes_read" ON public.tt_classes FOR SELECT USING (true);
CREATE POLICY "tt_classes_write" ON public.tt_classes FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 9. TIMETABLE GENERATOR ENGINE: STAFF (tt_staff)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text NOT NULL UNIQUE,
  full_name text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  is_hod boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tt_staff ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_staff_read" ON public.tt_staff;
DROP POLICY IF EXISTS "tt_staff_write" ON public.tt_staff;
CREATE POLICY "tt_staff_read" ON public.tt_staff FOR SELECT USING (true);
CREATE POLICY "tt_staff_write" ON public.tt_staff FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 10. TIMETABLE GENERATOR ENGINE: WORKLOAD ALLOCATIONS (tt_workload)
-- Depends on: tt_classes, tt_staff
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_workload (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  subject_code text NOT NULL,
  subject_name text NOT NULL,
  hours_per_week int NOT NULL CHECK (hours_per_week > 0 AND hours_per_week <= 30),
  staff_id uuid NOT NULL REFERENCES public.tt_staff(id),
  is_fixed boolean NOT NULL DEFAULT false,
  fixed_day_order int CHECK (fixed_day_order BETWEEN 1 AND 6),
  fixed_period int CHECK (fixed_period BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, subject_code)
);

ALTER TABLE public.tt_workload ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_workload_read" ON public.tt_workload;
DROP POLICY IF EXISTS "tt_workload_write" ON public.tt_workload;
CREATE POLICY "tt_workload_read" ON public.tt_workload FOR SELECT USING (true);
CREATE POLICY "tt_workload_write" ON public.tt_workload FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 11. TIMETABLE GENERATOR ENGINE: FIXED SLOTS (tt_fixed_slots)
-- Depends on: tt_workload, tt_classes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_fixed_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_id uuid NOT NULL REFERENCES public.tt_workload(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  day_order int NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, day_order, period)
);

ALTER TABLE public.tt_fixed_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_fixed_slots_read" ON public.tt_fixed_slots;
DROP POLICY IF EXISTS "tt_fixed_slots_write" ON public.tt_fixed_slots;
CREATE POLICY "tt_fixed_slots_read" ON public.tt_fixed_slots FOR SELECT USING (true);
CREATE POLICY "tt_fixed_slots_write" ON public.tt_fixed_slots FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 12. TIMETABLE GENERATOR ENGINE: PLACED SLOTS (tt_slots)
-- Depends on: tt_classes, tt_workload
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.tt_classes(id) ON DELETE CASCADE,
  day_order int NOT NULL CHECK (day_order BETWEEN 1 AND 6),
  period int NOT NULL CHECK (period BETWEEN 1 AND 5),
  workload_id uuid REFERENCES public.tt_workload(id) ON DELETE SET NULL,
  is_clash boolean NOT NULL DEFAULT false,
  clash_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (class_id, day_order, period)
);

ALTER TABLE public.tt_slots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_slots_read" ON public.tt_slots;
DROP POLICY IF EXISTS "tt_slots_write" ON public.tt_slots;
CREATE POLICY "tt_slots_read" ON public.tt_slots FOR SELECT USING (true);
CREATE POLICY "tt_slots_write" ON public.tt_slots FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 13. TIMETABLE GENERATOR ENGINE: GENERATION RUNS AUDIT (tt_generation_runs)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tt_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  classes_affected int NOT NULL DEFAULT 0,
  slots_placed int NOT NULL DEFAULT 0,
  unresolved_count int NOT NULL DEFAULT 0,
  fixed_clash_count int NOT NULL DEFAULT 0,
  attempts_used int NOT NULL DEFAULT 0,
  details jsonb,
  created_by text
);

ALTER TABLE public.tt_generation_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tt_generation_runs_read" ON public.tt_generation_runs;
DROP POLICY IF EXISTS "tt_generation_runs_write" ON public.tt_generation_runs;
CREATE POLICY "tt_generation_runs_read" ON public.tt_generation_runs FOR SELECT USING (true);
CREATE POLICY "tt_generation_runs_write" ON public.tt_generation_runs FOR ALL 
  USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- ----------------------------------------------------------------------------
-- 14. SEED DATA FOR TIMETABLE GENERATOR (18 ACCFIN Faculty & 11 Classes)
-- ----------------------------------------------------------------------------
INSERT INTO public.tt_staff (short_code, full_name, is_hod, status) VALUES
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
ON CONFLICT (short_code) DO UPDATE SET
  full_name = excluded.full_name,
  is_hod = excluded.is_hod,
  status = 'ACTIVE';

INSERT INTO public.tt_classes (code, display_name, sort_order) VALUES
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
ON CONFLICT (code) DO UPDATE SET
  display_name = excluded.display_name,
  sort_order = excluded.sort_order;

-- ----------------------------------------------------------------------------
-- 15. RELOAD POSTGREST SCHEMA CACHE
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
`;

export default function DatabaseSchemaSection({ showToast, onSeedDatabase }: DatabaseSchemaSectionProps) {
  const [healthResults, setHealthResults] = useState<TableHealthResult[]>(
    REQUIRED_TABLES.map((t) => ({
      ...t,
      status: 'checking',
      rowCount: null,
    }))
  );
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [copiedFullSql, setCopiedFullSql] = useState<boolean>(false);
  const [copiedTable, setCopiedTable] = useState<string | null>(null);
  const [expandedTableSql, setExpandedTableSql] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'missing' | 'exists'>('all');

  const activeUrl = getActiveSupabaseUrl();
  const projectRef = getSupabaseProjectRef(activeUrl);
  const isConfigured = isSupabaseConfigured;

  // Run health check across every table
  const checkDatabaseHealth = async () => {
    setIsChecking(true);
    const updated: TableHealthResult[] = [];

    for (const table of REQUIRED_TABLES) {
      try {
        const { count, error } = await supabase
          .from(table.name)
          .select('*', { count: 'exact', head: true });

        if (error) {
          const isMissing =
            error.code === 'PGRST205' ||
            error.message.includes('schema cache') ||
            error.message.includes('relation') ||
            error.message.includes('does not exist') ||
            error.message.includes('not found');

          updated.push({
            ...table,
            status: isMissing ? 'missing' : 'error',
            rowCount: null,
            errorMessage: error.message || error.details || 'Not in schema cache',
          });
        } else {
          updated.push({
            ...table,
            status: 'exists',
            rowCount: count ?? 0,
          });
        }
      } catch (err: any) {
        updated.push({
          ...table,
          status: 'error',
          rowCount: null,
          errorMessage: err?.message || 'Check failed',
        });
      }
    }

    setHealthResults(updated);
    setIsChecking(false);

    const missing = updated.filter((t) => t.status === 'missing').length;
    if (missing === 0) {
      showToast('Database Health Check passed: All 13 tables exist in Supabase!', 'success');
    } else {
      showToast(`Health Check: ${missing} table(s) missing from Supabase schema cache.`, 'info');
    }
  };

  useEffect(() => {
    checkDatabaseHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCopyFullSQL = async () => {
    try {
      await navigator.clipboard.writeText(CONSOLIDATED_MIGRATION_SQL);
      setCopiedFullSql(true);
      showToast('Consolidated migration SQL copied! Paste into Supabase SQL Editor.', 'success');
      setTimeout(() => setCopiedFullSql(false), 3000);
    } catch {
      showToast('Could not copy automatically. You can copy the SQL from the code box below.', 'info');
    }
  };

  const handleCopyTableSQL = async (table: TableDefinition) => {
    try {
      await navigator.clipboard.writeText(table.createSql);
      setCopiedTable(table.name);
      showToast(`CREATE statement for "${table.name}" copied to clipboard!`, 'success');
      setTimeout(() => setCopiedTable(null), 3000);
    } catch {
      showToast('Could not copy automatically.', 'info');
    }
  };

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      if (onSeedDatabase) {
        await onSeedDatabase();
      } else {
        const res = await seedDatabaseWithPastData();
        showToast(res.message, res.syncedToSupabase ? 'success' : 'info');
      }
      await checkDatabaseHealth();
    } catch (err: any) {
      showToast(`Seeding failed: ${err?.message || 'Database error'}`, 'info');
    } finally {
      setIsSeeding(false);
    }
  };

  const missingList = healthResults.filter((t) => t.status === 'missing');
  const existsList = healthResults.filter((t) => t.status === 'exists');
  const missingCount = missingList.length;
  const existsCount = existsList.length;

  const filteredResults = useMemo(() => {
    if (categoryFilter === 'missing') return healthResults.filter((t) => t.status === 'missing');
    if (categoryFilter === 'exists') return healthResults.filter((t) => t.status === 'exists');
    return healthResults;
  }, [healthResults, categoryFilter]);

  return (
    <div className="space-y-6">
      {/* Overview & Connection Diagnostic Banner */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-[#556B2F]" />
              <h3 className="font-serif font-black text-lg text-[#161b27]">
                Database Health & Schema Management
              </h3>
            </div>
            <p className="text-xs text-slate-500 max-w-2xl font-sans">
              Diagnose table status across your Supabase instance. If any table is missing from PostgREST schema cache, copy its standalone CREATE statement or run the complete unified script below.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={checkDatabaseHealth}
              disabled={isChecking}
              className="px-4 py-2 bg-[#556B2F] hover:bg-[#435424] text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              <span>{isChecking ? 'Checking Health...' : 'Check Database Health'}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyFullSQL}
              className="px-4 py-2 border border-[#cbc4cd] bg-white text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-2xs"
            >
              {copiedFullSql ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFullSql ? 'Script Copied!' : 'Copy Full Script'}</span>
            </button>

            <button
              type="button"
              onClick={handleSeed}
              disabled={isSeeding}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-2xs disabled:opacity-50"
            >
              {isSeeding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              <span>{isSeeding ? 'Seeding...' : 'Seed Default Data'}</span>
            </button>
          </div>
        </div>

        {/* Supabase Connection Metadata */}
        <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-slate-700 font-medium">
              <strong>Supabase Project:</strong>{' '}
              {isConfigured ? activeUrl : 'Operating in Resilient Local Memory Mode'}
            </span>
            {isConfigured && activeUrl && projectRef && (
              <span className="font-mono text-[11px] bg-slate-100 text-[#556B2F] px-1.5 py-0.5 rounded border border-slate-200">
                Ref: {projectRef}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-slate-500 text-xs font-mono">
            <span>
              Health Summary: <strong>{existsCount}/13</strong> verified
            </span>
            {missingCount > 0 && (
              <span className="text-rose-600 font-bold">({missingCount} missing)</span>
            )}
          </div>
        </div>
      </div>

      {/* Database Health Diagnostic Card */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-[#cbc4cd] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#556B2F]" />
            <div>
              <h4 className="text-sm font-bold text-slate-900">
                Database Health Diagnostic
              </h4>
              <p className="text-xs text-slate-500">
                Status of all 13 application tables in Supabase PostgREST schema cache
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                categoryFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All (13)
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('missing')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                categoryFilter === 'missing'
                  ? 'bg-white text-rose-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Missing ({missingCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryFilter('exists')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                categoryFilter === 'exists'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Exists ({existsCount})
            </button>
          </div>
        </div>

        {/* Missing Tables Notice */}
        {missingCount > 0 && (
          <div className="p-4 bg-amber-50/70 border-b border-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold">
                {missingCount} table{missingCount > 1 ? 's' : ''} not found in Supabase schema cache:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-0.5 pb-1">
                {missingList.map((t) => (
                  <span
                    key={t.name}
                    className="font-mono text-[11px] font-bold px-2 py-0.5 bg-amber-100/90 text-amber-900 border border-amber-300 rounded"
                  >
                    {t.name}
                  </span>
                ))}
              </div>
              <p className="text-slate-600">
                You do not need to re-run the entire script! Click <strong>Copy CREATE Statement</strong> next to each missing table below to run just that table in your{' '}
                <a
                  href="https://supabase.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline text-amber-900 hover:text-amber-950 inline-flex items-center gap-0.5"
                >
                  Supabase SQL Editor <ExternalLink className="w-3 h-3" />
                </a>.
              </p>
            </div>
          </div>
        )}

        {/* All Tables Verified Banner */}
        {missingCount === 0 && !isChecking && (
          <div className="p-4 bg-emerald-50/60 border-b border-emerald-200 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-xs text-emerald-950">
              <span className="font-bold">All 13 tables exist and are verified.</span> The app is in full sync with your live Supabase database!
            </div>
          </div>
        )}

        {/* Table List Diagnostic View */}
        <div className="divide-y divide-slate-100">
          {filteredResults.map((table) => {
            const isMissing = table.status === 'missing';
            const isExists = table.status === 'exists';
            const isCheckingTable = table.status === 'checking';
            const isCopied = copiedTable === table.name;
            const isExpanded = expandedTableSql === table.name;

            return (
              <div
                key={table.name}
                className={`p-4 transition-colors ${
                  isMissing ? 'bg-amber-50/20' : 'bg-white hover:bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono w-5">
                        #{table.order}
                      </span>
                      <code className="font-mono text-sm font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {table.name}
                      </code>

                      {/* Status Badges */}
                      {isCheckingTable && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          <RefreshCw className="w-3 h-3 animate-spin text-slate-400" />
                          checking...
                        </span>
                      )}

                      {isExists && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>exists</span>
                          {table.rowCount !== null && (
                            <span className="text-emerald-700/80 font-normal">
                              ({table.rowCount} {table.rowCount === 1 ? 'row' : 'rows'})
                            </span>
                          )}
                        </span>
                      )}

                      {isMissing && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-800 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-300">
                          <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>missing</span>
                        </span>
                      )}

                      {table.status === 'error' && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-300">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>error</span>
                        </span>
                      )}

                      <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1.5 py-0.5 bg-slate-100 rounded">
                        {table.category}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 pl-7">{table.description}</p>

                    {table.dependencies && table.dependencies.length > 0 && (
                      <p className="text-[11px] text-slate-500 pl-7 flex items-center gap-1">
                        <span>Requires parent table:</span>
                        {table.dependencies.map((dep) => (
                          <code key={dep} className="font-mono text-[10px] bg-slate-100 px-1 py-0.5 rounded border border-slate-200">
                            {dep}
                          </code>
                        ))}
                      </p>
                    )}

                    {table.errorMessage && (
                      <p className="text-[11px] text-rose-700 pl-7 font-mono">
                        Error: {table.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 pl-7 sm:pl-0 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyTableSQL(table)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
                        isMissing
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'border border-[#cbc4cd] bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                      title={`Copy standalone CREATE TABLE statement for ${table.name}`}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{isCopied ? 'SQL Copied!' : isMissing ? 'Copy CREATE statement' : 'Copy CREATE SQL'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedTableSql(expandedTableSql === table.name ? null : table.name)
                      }
                      className="px-2.5 py-1.5 border border-[#cbc4cd] bg-white text-slate-600 hover:bg-slate-100 text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                      title="Inspect SQL definition"
                    >
                      <FileCode className="w-3.5 h-3.5" />
                      <span>{isExpanded ? 'Hide SQL' : 'View SQL'}</span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Inline Collapsible SQL Inspector */}
                {isExpanded && (
                  <div className="mt-3 pl-7 pt-2">
                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-100 font-mono text-xs overflow-x-auto relative">
                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] text-slate-400">
                        <span>DDL Statement for public.{table.name} (with IF NOT EXISTS & RLS)</span>
                        <button
                          type="button"
                          onClick={() => handleCopyTableSQL(table)}
                          className="text-xs text-[#8BA854] hover:text-white flex items-center gap-1"
                        >
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </button>
                      </div>
                      <pre className="whitespace-pre">{table.createSql}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Consolidated Master Migration Script (Directly Visible & Scrollable Code Block) */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-[#cbc4cd] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-slate-700" />
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Consolidated Master Migration Script (All 13 Tables)
            </h4>
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200">
              Safe with IF NOT EXISTS
            </span>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 border border-[#cbc4cd] bg-white text-slate-700 hover:bg-slate-100 text-xs font-bold rounded-md flex items-center gap-1.5 transition-colors"
            >
              <span>Open Supabase SQL Editor</span>
              <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>

            <button
              type="button"
              onClick={handleCopyFullSQL}
              className="px-3.5 py-1.5 bg-[#556B2F] hover:bg-[#435424] text-white text-xs font-bold rounded-md flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
            >
              {copiedFullSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedFullSql ? 'Full SQL Copied!' : 'Copy Full Migration SQL'}</span>
            </button>
          </div>
        </div>

        {/* Visible, Scrollable Code Block */}
        <div className="p-4 bg-slate-950 text-slate-100 max-h-[500px] overflow-y-auto font-mono text-xs leading-relaxed selection:bg-[#556B2F]/50 scrollbar-thin">
          <pre className="whitespace-pre">{CONSOLIDATED_MIGRATION_SQL}</pre>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="p-4 bg-slate-50 border-t border-[#cbc4cd] text-xs text-slate-600 space-y-2">
          <p className="font-bold text-[#161b27]">How to execute this in your Supabase project:</p>
          <ol className="list-decimal list-inside space-y-1 text-slate-600 font-sans">
            <li>
              Click <strong>Copy Full Migration SQL</strong> above (or copy individual missing table statements from the health check list).
            </li>
            <li>
              Open your Supabase project dashboard at{' '}
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold underline text-[#556B2F] hover:text-[#435424]"
              >
                supabase.com/dashboard
              </a>.
            </li>
            <li>Navigate to the <strong>SQL Editor</strong> tab on the left sidebar.</li>
            <li>Click <strong>New Query</strong>, paste the SQL code into the editor, and click <strong>Run</strong> (or press Ctrl + Enter / Cmd + Enter).</li>
            <li>
              Return here and click <strong>Check Database Health</strong> to confirm all 13 tables display <strong>✓ exists</strong>!
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

