'use client';

// ============================================================================
// ACCFIN Timetable Generator — Main Timetable Generator Module
// Integrates Step 1 (Workload Entry), Step 2 (Generate), Step 3 (View)
// with live database synchronization, individual table health check,
// and safe idempotent CREATE TABLE IF NOT EXISTS scripts.
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import type { FixedPeriodsByClass, TTClass, TTStaff, TTWorkload } from '../../lib/timetable/types';
import type { Staff } from '../../types';
import {
  getClasses,
  getStaff,
  getAllWorkload,
} from '../../lib/timetable/workload-api';
import { getAllFixedPeriods } from '../../lib/timetable/fixed-periods-api';
import { seedDatabaseWithPastData } from '../../lib/database';
import { getActiveSupabaseUrl, getSupabaseProjectRef, isSupabaseConfigured, supabase } from '../../lib/supabaseClient';
import { loadWorkloadMemory } from '../../lib/memoryStorage';
import FixedPeriodsSetup from './FixedPeriodsSetup';
import WorkloadEntryForm from './WorkloadEntryForm';
import GenerateButton from './GenerateButton';
import TimetableViewer from './TimetableViewer';
import {
  Database,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Globe,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

type Step = 'fixed' | 'workload' | 'generate' | 'view';

interface Props {
  liveStaffList?: Staff[];
  onStaffChanged?: () => void;
}

const DEFAULT_ACCFIN_CLASSES: TTClass[] = [
  { id: 'I-MCOM', code: 'I-MCOM', display_name: 'I M.COM', sort_order: 1 },
  { id: 'II-MCOM', code: 'II-MCOM', display_name: 'II M.COM', sort_order: 2 },
  { id: 'I-BCOM-A', code: 'I-BCOM-A', display_name: 'I B.COM - A', sort_order: 3 },
  { id: 'I-BCOM-B', code: 'I-BCOM-B', display_name: 'I B.COM - B', sort_order: 4 },
  { id: 'I-BCOM-C', code: 'I-BCOM-C', display_name: 'I B.COM - C', sort_order: 5 },
  { id: 'II-BCOM-A', code: 'II-BCOM-A', display_name: 'II B.COM - A', sort_order: 6 },
  { id: 'II-BCOM-B', code: 'II-BCOM-B', display_name: 'II B.COM - B', sort_order: 7 },
  { id: 'II-BCOM-C', code: 'II-BCOM-C', display_name: 'II B.COM - C', sort_order: 8 },
  { id: 'III-BCOM-A', code: 'III-BCOM-A', display_name: 'III B.COM - A', sort_order: 9 },
  { id: 'III-BCOM-B', code: 'III-BCOM-B', display_name: 'III B.COM - B', sort_order: 10 },
  { id: 'III-BCOM-C', code: 'III-BCOM-C', display_name: 'III B.COM - C', sort_order: 11 },
];

const DEFAULT_ACCFIN_STAFF: TTStaff[] = [
  { id: 'AJ', short_code: 'AJ', full_name: 'DR. A. JULIET', status: 'ACTIVE', is_hod: false },
  { id: 'DA', short_code: 'DA', full_name: 'DR. D. AKILANDESWARI', status: 'ACTIVE', is_hod: false },
  { id: 'DJ', short_code: 'DJ', full_name: 'MR. B. DENNY JONES', status: 'ACTIVE', is_hod: false },
  { id: 'FND', short_code: 'FND', full_name: 'DR. P. FATHIMA NANCY DYANA', status: 'ACTIVE', is_hod: false },
  { id: 'GS', short_code: 'GS', full_name: 'DR. G. SATHYA', status: 'ACTIVE', is_hod: false },
  { id: 'JD', short_code: 'JD', full_name: 'MS. D. JAYALAKSHMI', status: 'ACTIVE', is_hod: false },
  { id: 'JP', short_code: 'JP', full_name: 'DR. R. JOTHIPRAKASH', status: 'ACTIVE', is_hod: false },
  { id: 'KM', short_code: 'KM', full_name: 'MS. K. MATHUMATHI', status: 'ACTIVE', is_hod: false },
  { id: 'KS', short_code: 'KS', full_name: 'MS. K. SINDHUJA', status: 'ACTIVE', is_hod: false },
  { id: 'MJ', short_code: 'MJ', full_name: 'DR. M. JAGADEESWARI', status: 'ACTIVE', is_hod: false },
  { id: 'MP', short_code: 'MP', full_name: 'MS. P. MEENA', status: 'ACTIVE', is_hod: false },
  { id: 'OJ', short_code: 'OJ', full_name: 'DR. M. OPHELIA JANEFER', status: 'ACTIVE', is_hod: false },
  { id: 'PM', short_code: 'PM', full_name: 'DR. P. MARIAPPAN', status: 'ACTIVE', is_hod: false },
  { id: 'PS', short_code: 'PS', full_name: 'DR. B. PADMASHREE', status: 'ACTIVE', is_hod: false },
  { id: 'RP', short_code: 'RP', full_name: 'DR. P. RAJENDRA PRASAD', status: 'ACTIVE', is_hod: true },
  { id: 'RT', short_code: 'RT', full_name: 'MR. R. THIRUMURUGAN', status: 'ACTIVE', is_hod: false },
  { id: 'SS', short_code: 'SS', full_name: 'MS. SHILPA S', status: 'ACTIVE', is_hod: false },
  { id: 'TP', short_code: 'TP', full_name: 'MS. T. PARKAVI', status: 'ACTIVE', is_hod: false },
];

// Table-specific idempotent CREATE statements
const TABLE_SQL_STATEMENTS: Record<string, string> = {
  tt_classes: `-- 1. tt_classes
create table if not exists public.tt_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  display_name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.tt_classes enable row level security;
drop policy if exists "tt_classes_read" on public.tt_classes;
create policy "tt_classes_read" on public.tt_classes for select using (true);
drop policy if exists "tt_classes_write" on public.tt_classes;
create policy "tt_classes_write" on public.tt_classes for all using (true) with check (true);

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
on conflict (code) do update set display_name = excluded.display_name;`,

  tt_staff: `-- 2. tt_staff
create table if not exists public.tt_staff (
  id uuid primary key default gen_random_uuid(),
  short_code text not null unique,
  full_name text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  is_hod boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.tt_staff enable row level security;
drop policy if exists "tt_staff_read" on public.tt_staff;
create policy "tt_staff_read" on public.tt_staff for select using (true);
drop policy if exists "tt_staff_write" on public.tt_staff;
create policy "tt_staff_write" on public.tt_staff for all using (true) with check (true);

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
on conflict (short_code) do update set full_name = excluded.full_name;`,

  tt_workload: `-- 3. tt_workload
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
  created_at timestamptz not null default now()
);
alter table public.tt_workload drop constraint if exists tt_workload_class_id_subject_code_key;
create index if not exists idx_tt_workload_class on public.tt_workload(class_id);
create index if not exists idx_tt_workload_staff on public.tt_workload(staff_id);

alter table public.tt_workload enable row level security;
drop policy if exists "tt_workload_read" on public.tt_workload;
create policy "tt_workload_read" on public.tt_workload for select using (true);
drop policy if exists "tt_workload_write" on public.tt_workload;
create policy "tt_workload_write" on public.tt_workload for all using (true) with check (true);`,

  tt_slots: `-- 4. tt_slots
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
create index if not exists idx_tt_slots_class on public.tt_slots(class_id);
create index if not exists idx_tt_slots_workload on public.tt_slots(workload_id);

alter table public.tt_slots enable row level security;
drop policy if exists "tt_slots_read" on public.tt_slots;
create policy "tt_slots_read" on public.tt_slots for select using (true);
drop policy if exists "tt_slots_write" on public.tt_slots;
create policy "tt_slots_write" on public.tt_slots for all using (true) with check (true);`,

  tt_fixed_periods: `-- 5. tt_fixed_periods (Step 0 Fixed Periods: LANG, ENG, LAB)
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
create policy "tt_fixed_periods_write" on public.tt_fixed_periods for all using (true) with check (true);`,
};

export default function TimetableGeneratorModule({ liveStaffList }: Props) {
  const [step, setStep] = useState<Step>('fixed');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<TTClass[]>([]);
  const [staff, setStaff] = useState<TTStaff[]>([]);
  const [workloadByClass, setWorkloadByClass] = useState<Record<string, TTWorkload[]>>({});
  const [fixedPeriodsByClass, setFixedPeriodsByClass] = useState<FixedPeriodsByClass>({});
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  // Table Health Status
  const [tableHealth, setTableHealth] = useState<Record<string, boolean>>({
    tt_classes: true,
    tt_staff: true,
    tt_workload: true,
    tt_slots: true,
  });

  const activeUrl = getActiveSupabaseUrl();
  const projectRef = getSupabaseProjectRef(activeUrl);
  const isConfigured = isSupabaseConfigured;

  // Check health of each individual table
  const checkTableHealth = async () => {
    const health: Record<string, boolean> = {
      tt_classes: false,
      tt_staff: false,
      tt_workload: false,
      tt_slots: false,
    };
    try {
      const [c, s, w, sl] = await Promise.all([
        supabase.from('tt_classes').select('id').limit(1),
        supabase.from('tt_staff').select('id').limit(1),
        supabase.from('tt_workload').select('id').limit(1),
        supabase.from('tt_slots').select('id').limit(1),
      ]);
      health.tt_classes = !c.error || (c.error.code !== 'PGRST205' && !c.error.message.includes('schema cache'));
      health.tt_staff = !s.error || (s.error.code !== 'PGRST205' && !s.error.message.includes('schema cache'));
      health.tt_workload = !w.error || (w.error.code !== 'PGRST205' && !w.error.message.includes('schema cache'));
      health.tt_slots = !sl.error || (sl.error.code !== 'PGRST205' && !sl.error.message.includes('schema cache'));
    } catch {
      // ignore
    }
    setTableHealth(health);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const forceLive = fetchKey > 0;
        const [classList, staffList, allWorkload] = await Promise.all([
          getClasses(forceLive),
          getStaff(forceLive),
          getAllWorkload(),
        ]);
        if (cancelled) return;

        const effectiveClasses = classList.length > 0 ? classList : DEFAULT_ACCFIN_CLASSES;
        const effectiveStaff = staffList.length > 0 ? staffList : DEFAULT_ACCFIN_STAFF;
        const fixedMap = await getAllFixedPeriods(effectiveClasses, allWorkload);
        if (cancelled) return;

        setClasses(effectiveClasses);
        setStaff(effectiveStaff);
        setWorkloadByClass(allWorkload);
        setFixedPeriodsByClass(fixedMap);
        await checkTableHealth();
      } catch (err: any) {
        if (!cancelled) {
          setLoadError(err?.message || 'Failed to load timetable data.');
          await checkTableHealth();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchKey]);

  // Synchronize live Staff Directory (additions, edits, and removals) across Step 0, Step 1, and Step 3
  const syncedStaff = useMemo<TTStaff[]>(() => {
    const baseStaff = staff.length > 0 ? staff : DEFAULT_ACCFIN_STAFF;
    if (!liveStaffList || liveStaffList.length === 0) {
      return baseStaff;
    }

    const baseByCode = new Map<string, TTStaff>(
      baseStaff.map((s) => [s.short_code.trim().toUpperCase(), s])
    );

    return liveStaffList
      .filter((s) => s && s.isActive !== false)
      .map((s) => {
        const code = s.code.trim().toUpperCase();
        const existing = baseByCode.get(code);
        return {
          id: existing?.id ?? s.id,
          short_code: code,
          full_name: s.fullName || existing?.full_name || `Prof. ${code}`,
          status: 'ACTIVE' as const,
          is_hod: existing?.is_hod ?? false,
        };
      })
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [staff, liveStaffList]);

  const handleUseOfflineDefaults = async () => {
    const offlineWorkload = loadWorkloadMemory();
    const fixedMap = await getAllFixedPeriods(DEFAULT_ACCFIN_CLASSES, offlineWorkload);
    setClasses(DEFAULT_ACCFIN_CLASSES);
    setStaff(DEFAULT_ACCFIN_STAFF);
    setWorkloadByClass(offlineWorkload);
    setFixedPeriodsByClass(fixedMap);
    setLoadError(null);
  };

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2500);
    } catch {
      // fallback
    }
  };

  const handleCopyUnifiedSQL = () => {
    const fullSql = `-- ACCFIN Department Timetable Generator — Complete Idempotent Migration
-- Safe to re-run anytime. Uses IF NOT EXISTS throughout.

${Object.values(TABLE_SQL_STATEMENTS).join('\n\n')}

notify pgrst, 'reload schema';
notify pgrst, 'reload config';`;

    copyToClipboard(fullSql, 'full_sql');
  };

  const handleSeedDatabase = async () => {
    setIsSeeding(true);
    try {
      await seedDatabaseWithPastData();
      setFetchKey((k) => k + 1);
    } catch {
      // handled
    } finally {
      setIsSeeding(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 flex flex-col items-center justify-center text-center">
        <RefreshCw className="w-8 h-8 text-[#D4AF37] animate-spin mb-3" />
        <p className="text-base font-medium text-[#3A0D0D]">Loading timetable data…</p>
        <p className="text-xs text-[#8A806D] mt-1">Connecting to department faculty roster &amp; class schedules</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="border border-[#F0D5D5] bg-[#FFF9F9] rounded-xl p-6 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-[#FBEAEA] text-[#8C1F1F] rounded-lg shrink-0">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-serif font-semibold text-[#8C1F1F]">
                Couldn't load timetable data from Supabase
              </h2>
              <p className="text-sm text-[#4A4038] mt-1.5 leading-relaxed">
                Supabase reported: <code className="px-2 py-0.5 bg-white border border-[#E4DCC9] rounded font-mono text-xs text-[#6B1717]">{loadError}</code>
              </p>

              {/* Connected project line */}
              <div className="mt-3 py-2 px-3 bg-[#F4EFE6] border border-[#E4DCC9] rounded-md flex flex-wrap items-center justify-between gap-2 text-xs text-[#5D5348]">
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-[#8C1F1F] shrink-0" />
                  <span>
                    <strong>Connected Supabase Project:</strong>{' '}
                    {isConfigured && activeUrl ? (
                      <code className="font-mono text-xs text-[#3A0D0D] bg-white px-1.5 py-0.5 rounded border border-[#E4DCC9]">
                        {activeUrl}
                      </code>
                    ) : (
                      <span className="italic text-amber-700">Not configured / Resilient local mode</span>
                    )}
                  </span>
                </div>
                {projectRef && (
                  <span className="text-[11px] font-mono text-[#7A7062]">
                    Ref: <strong>{projectRef}</strong>
                  </span>
                )}
              </div>

              {/* Table Health Check Matrix with Individual Copy Buttons */}
              <div className="mt-5 border border-[#E4DCC9] rounded-lg overflow-hidden bg-white">
                <div className="px-4 py-2.5 bg-[#F1EBDE] border-b border-[#E4DCC9] flex items-center justify-between">
                  <span className="font-serif text-xs font-semibold text-[#3A0D0D]">
                    Database Table Health Check
                  </span>
                  <span className="text-[11px] text-[#7C6E59]">
                    Copy only the missing table's CREATE statement
                  </span>
                </div>
                <div className="divide-y divide-[#EDE7D8]">
                  {Object.entries(TABLE_SQL_STATEMENTS).map(([tableName, sqlStatement]) => {
                    const exists = tableHealth[tableName];
                    return (
                      <div
                        key={tableName}
                        className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          {exists ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#8C1F1F] shrink-0" />
                          )}
                          <div>
                            <span className="font-mono font-semibold text-[#2E2822]">
                              public.{tableName}
                            </span>
                            <span className="ml-2 text-[11px]">
                              {exists ? (
                                <span className="text-emerald-700 font-medium">✓ exists</span>
                              ) : (
                                <span className="text-[#8C1F1F] font-medium">✗ missing</span>
                              )}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => copyToClipboard(sqlStatement, tableName)}
                          className="px-3 py-1.5 bg-[#FAF7F1] hover:bg-[#F1EBDE] border border-[#C9BEA4] text-[#3A0D0D] rounded text-xs font-medium flex items-center gap-1.5 transition-colors"
                        >
                          {copiedKey === tableName ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-[#D4AF37]" />
                          )}
                          <span>
                            {copiedKey === tableName
                              ? 'Copied!'
                              : `Copy CREATE statement for ${tableName}`}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleCopyUnifiedSQL}
                  className="px-4 py-2.5 bg-[#3A0D0D] text-white hover:bg-[#4E1414] rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs"
                >
                  {copiedKey === 'full_sql' ? <Check className="w-4 h-4 text-[#D4AF37]" /> : <Copy className="w-4 h-4 text-[#D4AF37]" />}
                  <span>{copiedKey === 'full_sql' ? 'Full SQL Copied!' : 'Copy Full Safe Script (All Tables)'}</span>
                </button>

                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={handleSeedDatabase}
                  className="px-4 py-2.5 bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors shadow-xs disabled:opacity-50"
                >
                  {isSeeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                  <span>{isSeeding ? 'Seeding Database...' : 'Seed Database'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFetchKey((k) => k + 1)}
                  className="px-4 py-2.5 bg-white border border-[#D4AF37] text-[#3A0D0D] hover:bg-[#FAF7F1] rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-[#D4AF37]" />
                  <span>Retry Connection</span>
                </button>

                <button
                  type="button"
                  onClick={handleUseOfflineDefaults}
                  className="px-4 py-2.5 bg-amber-50 border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-amber-600" />
                  <span>Use Department Defaults (Offline)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF7F1] min-h-full">
      {/* Letterhead masthead */}
      <div className="bg-[#3A0D0D] border-b-4 border-[#D4AF37] no-print">
        <div className="max-w-5xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-serif text-[#D4AF37] text-xs tracking-wide">Department of Accounting &amp; Finance</p>
            <h1 className="font-serif text-white text-xl mt-0.5">Timetable Generator</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/90">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] bg-white/10 px-2 py-0.5 rounded border border-white/20">
              Supabase: {projectRef || 'mpbkurbimxknydymcaco'}
            </span>
          </div>
        </div>
      </div>

      {/* Step Navigation: 0. Fixed Periods -> 1. Workload Entry -> 2. Generate -> 3. View Timetable */}
      <nav className="border-b border-[#E4DCC9] bg-white no-print overflow-x-auto">
        <div className="max-w-7xl mx-auto px-6 flex gap-6 text-sm whitespace-nowrap">
          <button
            type="button"
            onClick={() => setStep('fixed')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer ${
              step === 'fixed'
                ? 'border-[#D4AF37] text-[#3A0D0D]'
                : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'
            }`}
          >
            0. Fixed Periods
          </button>
          <button
            type="button"
            onClick={() => setStep('workload')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer ${
              step === 'workload'
                ? 'border-[#D4AF37] text-[#3A0D0D]'
                : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'
            }`}
          >
            1. Workload Entry
          </button>
          <button
            type="button"
            onClick={() => setStep('generate')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer ${
              step === 'generate'
                ? 'border-[#D4AF37] text-[#3A0D0D]'
                : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'
            }`}
          >
            2. Generate
          </button>
          <button
            type="button"
            onClick={() => setStep('view')}
            className={`py-3 font-medium border-b-2 transition-colors cursor-pointer ${
              step === 'view'
                ? 'border-[#D4AF37] text-[#3A0D0D]'
                : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'
            }`}
          >
            3. View Timetable
          </button>
        </div>
      </nav>

      {step === 'fixed' && (
        <FixedPeriodsSetup
          classes={classes}
          staff={syncedStaff}
          fixedPeriodsByClass={fixedPeriodsByClass}
          onFixedPeriodsChange={setFixedPeriodsByClass}
          onProceedToWorkload={() => setStep('workload')}
        />
      )}
      {step === 'workload' && (
        <WorkloadEntryForm
          classes={classes}
          staff={syncedStaff}
          initialWorkloadByClass={workloadByClass}
          fixedPeriodsByClass={fixedPeriodsByClass}
          onWorkloadChange={setWorkloadByClass}
          onEditFixedPeriods={() => setStep('fixed')}
        />
      )}
      {step === 'generate' && <GenerateButton />}
      {step === 'view' && <TimetableViewer classes={classes} staff={syncedStaff} />}
    </div>
  );
}
