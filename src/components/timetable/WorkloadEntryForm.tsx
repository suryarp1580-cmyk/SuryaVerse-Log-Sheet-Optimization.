'use client';

// ============================================================================
// ACCFIN Timetable Generator — Bulk Multi-Section Workload Entry
// ----------------------------------------------------------------------------
// Matches the real AMJ College Department of Accounting & Finance format:
// - UG Classes (I/II/III B.COM AF): Single subject row with 3 section staff columns (A, B, C)
// - PG Classes (I/II M.COM AF): Single subject row with 1 staff column
// - Split-hour notation support: e.g. MJ(4)/MP(1) parsed into individual assignments
// - Instant persistence to Supabase (tt_workload) & resilient local storage
// - Live sync with Staff Directory
// ============================================================================

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import type { FixedPeriodsByClass, TTClass, TTStaff, TTWorkload } from '../../lib/timetable/types';
import {
  DAY_ORDERS,
  DAY_ORDER_LABELS,
  PERIOD_TIMES,
  TOTAL_SCHEDULABLE_SLOTS_PER_WEEK,
} from '../../lib/timetable/constants';
import {
  buildYearGroups,
  saveBulkWorkload,
  deleteSubjectAcrossSections,
  parseStaffSplitNotation,
  getAllWorkload,
} from '../../lib/timetable/workload-api';
import { getFixedSlotsForClass } from '../../lib/timetable/fixed-periods-api';
import { loadFixedPeriodsMemory, loadWorkloadMemory, saveWorkloadMemory } from '../../lib/memoryStorage';
import { isExpectedSupabaseFallbackError } from '../../lib/supabaseClient';
import { PageHeader, Panel, StatusBanner, PrimaryButton, Badge, inputClass, labelClass } from './ui';
import {
  BookOpen,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Plus,
  HelpCircle,
  Lock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Props {
  classes: TTClass[];
  staff: TTStaff[];
  initialWorkloadByClass?: Record<string, TTWorkload[]>;
  fixedPeriodsByClass?: FixedPeriodsByClass;
  onWorkloadChange?: (updated: Record<string, TTWorkload[]>) => void;
  onEditFixedPeriods?: () => void;
}

export default function WorkloadEntryForm({
  classes,
  staff,
  initialWorkloadByClass = {},
  fixedPeriodsByClass,
  onWorkloadChange,
  onEditFixedPeriods,
}: Props) {
  // 1. Build Year Groups (I B.COM AF [A, B, C], II B.COM AF [A, B, C], etc.)
  const yearGroups = useMemo(() => buildYearGroups(classes), [classes]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => yearGroups[0]?.id || 'I-BCOM');

  // Fallback if selectedGroupId is invalid
  useEffect(() => {
    if (yearGroups.length > 0 && !yearGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(yearGroups[0].id);
    }
  }, [yearGroups, selectedGroupId]);

  const currentGroup = useMemo(
    () => yearGroups.find((g) => g.id === selectedGroupId) || yearGroups[0],
    [yearGroups, selectedGroupId]
  );

  // 2. Workload State & Instant Persistence
  const [workloadByClass, setWorkloadByClass] = useState<Record<string, TTWorkload[]>>(() => {
    const mem = loadWorkloadMemory();
    return Object.keys(mem).length > 0 ? mem : initialWorkloadByClass;
  });

  const [isPending, startTransition] = useTransition();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  // Load fresh workload data from Supabase on mount and synchronize with local memory
  const reloadWorkloadData = async () => {
    setIsRefreshing(true);
    try {
      const freshAll = await getAllWorkload();
      if (freshAll) {
        setWorkloadByClass(freshAll);
        if (onWorkloadChange) onWorkloadChange(freshAll);
      }
    } catch (err) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Could not refresh workload from server, using local storage:', err);
      }
      const mem = loadWorkloadMemory();
      if (mem && Object.keys(mem).length > 0) {
        setWorkloadByClass(mem);
        if (onWorkloadChange) onWorkloadChange(mem);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    reloadWorkloadData();
  }, [selectedGroupId]);

  // 3. Form Input State
  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('5');
  const [showLockedPreview, setShowLockedPreview] = useState(true);

  const effectiveFixedByClass = useMemo<FixedPeriodsByClass>(() => {
    if (fixedPeriodsByClass && Object.keys(fixedPeriodsByClass).length > 0) {
      return fixedPeriodsByClass;
    }
    return (loadFixedPeriodsMemory() as FixedPeriodsByClass) || {};
  }, [fixedPeriodsByClass]);

  // Staff assignments per section: keyed by sectionName ('A', 'B', 'C' or 'PG')
  const [sectionStaffInput, setSectionStaffInput] = useState<Record<string, string>>({
    A: '',
    B: '',
    C: '',
    PG: '',
  });

  // Optional hours overrides per section
  const [showHoursOverride, setShowHoursOverride] = useState(false);
  const [sectionHoursOverride, setSectionHoursOverride] = useState<Record<string, string>>({
    A: '',
    B: '',
    C: '',
    PG: '',
  });

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset inputs when adding is done
  const resetForm = () => {
    setSubjectCode('');
    setSubjectName('');
    setHoursPerWeek('5');
    setSectionStaffInput({ A: '', B: '', C: '', PG: '' });
    setSectionHoursOverride({ A: '', B: '', C: '', PG: '' });
    setShowHoursOverride(false);
    setFieldErrors({});
  };

  // 4. Calculate allotted subject hours & Step 0 fixed slots for the current year group
  const groupStats = useMemo(() => {
    if (!currentGroup) {
      return {
        maxSubjectHours: 0,
        minOpenCapacity: 30,
        maxFixedCount: 0,
        minRemaining: 30,
        isFull: false,
        sectionBreakdown: [] as Array<{
          sectionName: string;
          subjectHours: number;
          fixedCount: number;
          openCapacity: number;
          remaining: number;
        }>,
      };
    }

    const sectionBreakdown = currentGroup.sections.map((sec) => {
      const entries = workloadByClass[sec.classId] || [];
      const subjectHours = entries.reduce((sum, e) => sum + (e.hours_per_week || 0), 0);
      const fixedCount = getFixedSlotsForClass(effectiveFixedByClass, sec.classId, classes).length;
      const openCapacity = Math.max(0, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - fixedCount);
      const remaining = openCapacity - subjectHours;
      return {
        sectionName: sec.sectionName,
        subjectHours,
        fixedCount,
        openCapacity,
        remaining,
      };
    });

    const maxSubjectHours = Math.max(0, ...sectionBreakdown.map((s) => s.subjectHours));
    const minOpenCapacity = Math.min(...sectionBreakdown.map((s) => s.openCapacity));
    const maxFixedCount = Math.max(0, ...sectionBreakdown.map((s) => s.fixedCount));
    const minRemaining = Math.min(...sectionBreakdown.map((s) => s.remaining));

    return {
      maxSubjectHours,
      minOpenCapacity,
      maxFixedCount,
      minRemaining,
      isFull: minRemaining <= 0,
      sectionBreakdown,
    };
  }, [currentGroup, workloadByClass, effectiveFixedByClass, classes]);

  // 5. Handle Single-Click Bulk Save
  const handleAddSubject = () => {
    if (!currentGroup) return;

    setFieldErrors({});
    const code = subjectCode.trim().toUpperCase();
    const name = subjectName.trim().toUpperCase();
    const parsedHours = parseInt(hoursPerWeek, 10);

    const errors: Record<string, string> = {};
    if (!code) errors.subjectCode = 'Short code is required (e.g. ACA, BI, HRM)';
    if (!name) errors.subjectName = 'Subject name is required';
    if (isNaN(parsedHours) || parsedHours <= 0) errors.hoursPerWeek = 'Enter valid weekly hours';

    // Validate section staff inputs
    currentGroup.sections.forEach((sec) => {
      const rawInput = (sectionStaffInput[sec.sectionName] || '').trim();
      if (!rawInput) {
        errors[`staff_${sec.sectionName}`] = `Faculty required for Section ${sec.sectionName}`;
      } else {
        const secHours =
          sectionHoursOverride[sec.sectionName] && parseInt(sectionHoursOverride[sec.sectionName], 10) > 0
            ? parseInt(sectionHoursOverride[sec.sectionName], 10)
            : parsedHours;
        const { error } = parseStaffSplitNotation(rawInput, secHours, staff);
        if (error) {
          errors[`staff_${sec.sectionName}`] = error;
        }
      }
    });

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setStatusMessage({ text: 'Please resolve the highlighted issues.', ok: false });
      return;
    }

    startTransition(async () => {
      const payload = {
        yearGroupId: currentGroup.id,
        subjectCode: code,
        subjectName: name,
        hoursPerWeek: parsedHours,
        isFixed: false,
        fixedDayOrder: null,
        fixedPeriod: null,
        sections: currentGroup.sections.map((sec) => ({
          classId: sec.classId,
          sectionName: sec.sectionName,
          hoursOverride:
            sectionHoursOverride[sec.sectionName] && parseInt(sectionHoursOverride[sec.sectionName], 10) > 0
              ? parseInt(sectionHoursOverride[sec.sectionName], 10)
              : undefined,
          rawStaffInput: sectionStaffInput[sec.sectionName] || '',
        })),
      };

      const result = await saveBulkWorkload(payload, staff);
      setStatusMessage({ text: result.message, ok: result.success });

      if (result.success) {
        resetForm();
        // Immediately fetch updated records from Supabase
        await reloadWorkloadData();
      }
    });
  };

  // 6. Handle Subject Removal Across Sections
  const handleRemoveSubjectAcrossSections = (subjCode: string) => {
    if (!currentGroup) return;
    const cleanCode = subjCode.trim().toUpperCase();
    const classIds = currentGroup.sections.map((s) => s.classId);

    // 1. Optimistic removal from React state immediately (instant 0ms response)
    const next: Record<string, TTWorkload[]> = {};
    for (const [cid, rows] of Object.entries(workloadByClass)) {
      const isTargetClass = classIds.some(
        (c) => c === cid || cid.includes(c) || c.includes(cid)
      );
      if (isTargetClass && Array.isArray(rows)) {
        next[cid] = rows.filter((r) => {
          const match = r.subject_code.match(/^([A-Za-z0-9_-]+)/);
          const base = match ? match[1].toUpperCase() : r.subject_code.toUpperCase();
          return (
            base !== cleanCode &&
            !r.subject_code.toUpperCase().startsWith(cleanCode) &&
            r.subject_code.replace(/[^A-Z0-9]/g, '').toUpperCase() !==
              cleanCode.replace(/[^A-Z0-9]/g, '')
          );
        });
      } else {
        next[cid] = rows;
      }
    }

    setWorkloadByClass(next);
    saveWorkloadMemory(next);
    if (onWorkloadChange) onWorkloadChange(next);

    setStatusMessage({
      text: `Removed "${cleanCode}" from all sections in ${currentGroup.label}.`,
      ok: true,
    });

    // 2. Persist deletion asynchronously across Supabase and persistent storage
    startTransition(async () => {
      try {
        const res = await deleteSubjectAcrossSections(classIds, cleanCode);
        if (!res.success) {
          setStatusMessage({ text: res.message, ok: false });
        }
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Failed to delete subject across sections:', err);
        }
      }
    });
  };

  // 7. Grouped Table Data (One row per unique subject code in the current Year Group)
  const groupedSubjects = useMemo(() => {
    if (!currentGroup) return [];

    // Collect all unique base subject codes in this year group
    const baseCodeMap = new Map<
      string,
      {
        baseCode: string;
        subjectName: string;
        hoursPerWeek: number;
        isFixed: boolean;
        fixedDayOrder: number | null;
        fixedPeriod: number | null;
        sectionAssignments: Record<
          string,
          {
            workloadId: string;
            classId: string;
            splits: { staffCode: string; staffName: string; hours: number }[];
          }
        >;
      }
    >();

    currentGroup.sections.forEach((sec) => {
      const list = workloadByClass[sec.classId] || [];
      list.forEach((w) => {
        // Extract base code (e.g. if code is "ACA" or "ACA (MP)", base is "ACA")
        const match = w.subject_code.match(/^([A-Za-z0-9_-]+)/);
        const base = match ? match[1].toUpperCase() : w.subject_code.toUpperCase();

        if (!baseCodeMap.has(base)) {
          baseCodeMap.set(base, {
            baseCode: base,
            subjectName: w.subject_name,
            hoursPerWeek: w.hours_per_week,
            isFixed: w.is_fixed,
            fixedDayOrder: w.fixed_day_order,
            fixedPeriod: w.fixed_period,
            sectionAssignments: {},
          });
        }

        const groupObj = baseCodeMap.get(base)!;
        if (!groupObj.sectionAssignments[sec.sectionName]) {
          groupObj.sectionAssignments[sec.sectionName] = {
            workloadId: w.id,
            classId: sec.classId,
            splits: [],
          };
        }

        // Add this staff split
        const sStaff = w.staff || staff.find((s) => s.id === w.staff_id);
        const code = sStaff?.short_code || '??';
        const name = sStaff?.full_name || 'Unknown';
        groupObj.sectionAssignments[sec.sectionName].splits.push({
          staffCode: code,
          staffName: name,
          hours: w.hours_per_week,
        });
      });
    });

    return Array.from(baseCodeMap.values());
  }, [currentGroup, workloadByClass, staff]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Step 1 — Academic Register"
        title="Workload Entry"
        description="Configure academic subjects and faculty assignments for the open periods remaining after Step 0. For UG classes, assign Section A, Section B, and Section C faculty side by side. Data saves automatically."
      />

      {/* Year Group Selection Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E4DCC9] pb-4">
        <div>
          <label className="text-xs font-serif uppercase tracking-wider text-[#7C6E59] block mb-1">
            Select Year Group / Class
          </label>
          <div className="flex flex-wrap gap-2">
            {yearGroups.map((g) => {
              const isActive = g.id === selectedGroupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setSelectedGroupId(g.id);
                    setStatusMessage(null);
                  }}
                  className={`px-4 py-2 text-xs font-medium rounded-sm border transition-all ${
                    isActive
                      ? 'bg-[#3A0D0D] text-[#D4AF37] border-[#3A0D0D] shadow-sm'
                      : 'bg-white text-[#4A4038] border-[#E4DCC9] hover:bg-[#FAF7F1] hover:border-[#C9BEA4]'
                  }`}
                >
                  <span className="font-semibold">{g.label}</span>
                  <span className="ml-1.5 opacity-75 text-[11px]">
                    {g.isUG ? '(Sec A, B, C)' : '(Single)'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={reloadWorkloadData}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 text-xs text-[#7C6E59] hover:text-[#3A0D0D] px-3 py-1.5 rounded bg-white border border-[#E4DCC9] hover:border-[#C9BEA4] transition-colors"
          title="Reload latest records from Supabase"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#3A0D0D]' : ''}`} />
          <span>{isRefreshing ? 'Syncing…' : 'Sync Database'}</span>
        </button>
      </div>

      {/* Status Banner */}
      <StatusBanner tone={groupStats.minRemaining < 0 ? 'danger' : groupStats.minRemaining === 0 ? 'success' : 'warning'}>
        <div className="flex flex-wrap items-center justify-between gap-2 w-full text-xs">
          <span>
            <strong>{currentGroup?.label}</strong>: <strong>{groupStats.maxSubjectHours}</strong> of{' '}
            <strong>{groupStats.minOpenCapacity}</strong> open weekly subject hours allotted
            {groupStats.minRemaining >= 0
              ? ` (${groupStats.minRemaining} hours remaining)`
              : ` (${-groupStats.minRemaining}h over open slot limit)`}
            {groupStats.maxFixedCount > 0 && ` · ${groupStats.maxFixedCount}h locked in Step 0`}.
          </span>
          {currentGroup?.isUG && (
            <span className="opacity-85 font-mono text-[11px]">
              {groupStats.sectionBreakdown
                .map((s) => `Sec ${s.sectionName}: ${s.subjectHours}/${s.openCapacity}h (${s.fixedCount} fixed)`)
                .join(' | ')}
            </span>
          )}
        </div>
      </StatusBanner>

      {/* Step 0 Reserved Fixed Slots Visual Map (Read-Only) */}
      <Panel className="border border-[#E4DCC9] bg-white overflow-hidden">
        <div className="px-4 py-2.5 bg-[#F6EFD6]/70 border-b border-[#E4DCC9] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <Lock className="w-3.5 h-3.5 text-[#3A0D0D]" />
            <span className="font-serif font-semibold text-[#3A0D0D]">
              Step 0 Reserved Fixed Slots ({groupStats.maxFixedCount > 0 ? 'Excluded from Auto-Generator' : 'None reserved'})
            </span>
            <span className="text-[#7C6E59] hidden sm:inline">
              — Shaded cells are locked; open cells are available for subjects below
            </span>
          </div>
          <div className="flex items-center gap-2">
            {onEditFixedPeriods && (
              <button
                type="button"
                onClick={onEditFixedPeriods}
                className="text-[11px] font-medium text-[#3A0D0D] underline hover:text-[#6B1717] cursor-pointer"
              >
                Edit in Step 0
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowLockedPreview((v) => !v)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded border border-[#D9CEB6] bg-white text-[#4A4038] hover:bg-[#FAF7F1] cursor-pointer"
            >
              {showLockedPreview ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  <span>Hide map</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  <span>Show map</span>
                </>
              )}
            </button>
          </div>
        </div>

        {showLockedPreview && currentGroup && (
          <div
            className={`p-3.5 bg-[#FAF7F1]/50 ${
              currentGroup.isUG ? 'grid grid-cols-1 md:grid-cols-3 gap-3' : 'max-w-md'
            }`}
          >
            {currentGroup.sections.map((sec) => {
              const secFixed = getFixedSlotsForClass(effectiveFixedByClass, sec.classId, classes);
              const lookup = new Map<string, string>();
              secFixed.forEach((s) => lookup.set(`${s.day_order}_${s.period}`, s.slot_type));
              const openCnt = Math.max(0, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - secFixed.length);

              return (
                <div key={sec.classId} className="border border-[#E4DCC9] rounded bg-white overflow-hidden">
                  <div className="px-2.5 py-1.5 bg-[#F1EBDE] border-b border-[#E4DCC9] flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#3A0D0D]">{sec.displayName}</span>
                    <span className="font-mono text-[#6B5F4E]">
                      {openCnt}h open · {secFixed.length}h locked
                    </span>
                  </div>
                  <table className="w-full border-collapse text-[10px]">
                    <thead>
                      <tr className="bg-[#FAF7F1] text-[#7C6E59]">
                        <th className="border-b border-r border-[#EDE7D8] py-1 px-1 w-7">D</th>
                        {PERIOD_TIMES.map((pt) =>
                          pt.period === 'BREAK' ? (
                            <th key="brk" className="border-b border-r border-[#EDE7D8] bg-[#EDE7D8]/70 w-3" />
                          ) : (
                            <th key={pt.period} className="border-b border-r last:border-r-0 border-[#EDE7D8] py-1">
                              P{pt.period}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {DAY_ORDERS.map((day) => (
                        <tr key={day}>
                          <td className="border-b border-r border-[#EDE7D8] bg-[#FAF7F1] text-center font-serif font-semibold text-[#3A0D0D] py-0.5">
                            {DAY_ORDER_LABELS[day]}
                          </td>
                          {PERIOD_TIMES.map((pt) => {
                            if (pt.period === 'BREAK') {
                              return (
                                <td
                                  key="brk"
                                  className="border-b border-r border-[#EDE7D8] bg-[#EDE7D8]/70"
                                />
                              );
                            }
                            const t = lookup.get(`${day}_${pt.period}`);
                            return (
                              <td
                                key={`${day}_${pt.period}`}
                                className={`border-b border-r last:border-r-0 border-[#EDE7D8] text-center py-0.5 font-mono ${
                                  t
                                    ? 'bg-[#E5E0D5] text-[#5B534B] font-semibold'
                                    : 'bg-white text-[#C9BEA4]'
                                }`}
                                title={t ? `Reserved in Step 0 (${t}) — unavailable for subjects` : 'Open slot'}
                              >
                                {t ? t : '·'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {/* Bulk Multi-Section Entry Form */}
      <Panel className="p-5 space-y-5 bg-[#FAF7F1] border border-[#E4DCC9]">
        <div className="flex items-center justify-between border-b border-[#E4DCC9]/70 pb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#3A0D0D]" />
            <h3 className="font-serif text-sm font-semibold text-[#3A0D0D]">
              Add Subject for {currentGroup?.label}
            </h3>
          </div>
          <span className="text-[11px] text-[#7C6E59] italic">
            {currentGroup?.isUG
              ? 'Adds to Sections A, B & C simultaneously'
              : 'Adds to PG class workload'}
          </span>
        </div>

        {/* Top Row: Subject Code, Name, Hours */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          <div className="md:col-span-3">
            <label className={labelClass}>Subject Short Code *</label>
            <input
              type="text"
              placeholder="e.g. ACA, BI, HRM"
              className={`${inputClass} uppercase font-semibold`}
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
            />
            {fieldErrors.subjectCode && (
              <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.subjectCode}</p>
            )}
          </div>

          <div className="md:col-span-6">
            <label className={labelClass}>Full Subject Name *</label>
            <input
              type="text"
              placeholder="e.g. ADVANCED CORPORATE ACCOUNTING"
              className={inputClass}
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
            {fieldErrors.subjectName && (
              <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.subjectName}</p>
            )}
          </div>

          <div className="md:col-span-3">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Hours / Week *</label>
              {currentGroup?.isUG && (
                <button
                  type="button"
                  onClick={() => setShowHoursOverride(!showHoursOverride)}
                  className="text-[11px] text-[#7C6E59] hover:text-[#3A0D0D] underline"
                >
                  {showHoursOverride ? 'Uniform' : 'Per-section override'}
                </button>
              )}
            </div>
            <input
              type="number"
              min={1}
              max={30}
              placeholder="5"
              className={inputClass}
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
            />
            {fieldErrors.hoursPerWeek && (
              <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.hoursPerWeek}</p>
            )}
          </div>
        </div>

        {/* Section Faculty Assignment Columns (3 Columns for UG, 1 for PG) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className={labelClass}>
              {currentGroup?.isUG
                ? 'Faculty Assignments (Sections A, B, C)'
                : 'Faculty Assignment'}
            </label>
            <span className="text-[11px] text-[#7C6E59] flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              Format: type staff code (e.g. <strong className="text-[#3A0D0D]">MJ</strong>) or split hours (e.g.{' '}
              <strong className="text-[#3A0D0D]">MJ(4)/MP(1)</strong>)
            </span>
          </div>

          <div className={`grid gap-4 ${currentGroup?.isUG ? 'grid-cols-1 md:grid-cols-3' : 'grid-cols-1'}`}>
            {currentGroup?.sections.map((sec) => {
              const inputVal = sectionStaffInput[sec.sectionName] || '';
              const secHours =
                showHoursOverride && sectionHoursOverride[sec.sectionName]
                  ? parseInt(sectionHoursOverride[sec.sectionName], 10)
                  : parseInt(hoursPerWeek, 10) || 5;

              // Parse on the fly for live helper preview
              const { splits } = parseStaffSplitNotation(inputVal, secHours, staff);

              return (
                <div
                  key={sec.sectionName}
                  className="bg-white border border-[#E4DCC9] p-3 rounded shadow-2xs space-y-2"
                >
                  <div className="flex items-center justify-between border-b border-[#EDE7D8] pb-1.5">
                    <span className="font-serif text-xs font-semibold text-[#3A0D0D] flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-[#3A0D0D] text-[#D4AF37] flex items-center justify-center text-[11px] font-mono">
                        {sec.sectionName === 'PG' ? 'P' : sec.sectionName}
                      </span>
                      {sec.displayName}
                    </span>
                    <span className="text-[11px] text-[#7C6E59] font-mono">{secHours}h total</span>
                  </div>

                  {showHoursOverride && (
                    <div>
                      <label className="text-[10px] uppercase tracking-wide text-[#7C6E59]">Hours Override</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        placeholder={hoursPerWeek}
                        className={`${inputClass} text-xs py-1`}
                        value={sectionHoursOverride[sec.sectionName] || ''}
                        onChange={(e) =>
                          setSectionHoursOverride((prev) => ({
                            ...prev,
                            [sec.sectionName]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}

                  <div>
                    <input
                      id={`faculty-input-${currentGroup.id}-${sec.sectionName}`}
                      name={`faculty-input-${currentGroup.id}-${sec.sectionName}`}
                      type="text"
                      autoComplete="off"
                      placeholder="e.g. MJ or MJ(4)/MP(1)"
                      className={`${inputClass} uppercase font-mono text-xs`}
                      value={inputVal}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSectionStaffInput((prev) => ({
                          ...prev,
                          [sec.sectionName]: val,
                        }));
                      }}
                    />

                    {/* Quick Staff Dropdown Helper */}
                    <div className="mt-1.5">
                      <select
                        id={`faculty-pick-${currentGroup.id}-${sec.sectionName}`}
                        name={`faculty-pick-${currentGroup.id}-${sec.sectionName}`}
                        className="text-[11px] bg-[#FAF7F1] border border-[#E4DCC9] rounded px-2 py-1 text-[#4A4038] w-full focus:outline-hidden"
                        value=""
                        onChange={(e) => {
                          const pickedCode = e.target.value;
                          if (!pickedCode) return;
                          setSectionStaffInput((prev) => ({
                            ...prev,
                            [sec.sectionName]: pickedCode,
                          }));
                        }}
                      >
                        <option value="">Quick pick from Staff Directory…</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.short_code}>
                            {s.short_code} — {s.full_name}
                            {s.is_hod ? ' (HOD)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Split hour preview badges */}
                    {splits && splits.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {splits.map((sp, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1 text-[10px] bg-[#F1EBDE] text-[#3A0D0D] px-1.5 py-0.5 rounded font-mono border border-[#E4DCC9]"
                            title={sp.staffName}
                          >
                            <span className="font-semibold">{sp.staffCode}</span>: {sp.hours}h
                          </span>
                        ))}
                      </div>
                    )}

                    {fieldErrors[`staff_${sec.sectionName}`] && (
                      <p className="text-[11px] text-[#8C1F1F] mt-1">
                        {fieldErrors[`staff_${sec.sectionName}`]}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 0 Reminder */}
        <div className="pt-2 border-t border-[#E4DCC9]/70 flex flex-wrap items-center justify-between gap-2 text-xs text-[#6B5F4E]">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#3A0D0D]" />
            College-mandated LANG, ENG, and LAB fixed periods are locked in <strong>Step 0: Fixed Periods</strong>.
          </span>
          {onEditFixedPeriods && (
            <button
              type="button"
              onClick={onEditFixedPeriods}
              className="text-[#3A0D0D] font-medium underline hover:text-[#6B1717] cursor-pointer"
            >
              Adjust Step 0 Fixed Slots
            </button>
          )}
        </div>

        {/* Submit Button & Status Message */}
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <PrimaryButton type="button" onClick={handleAddSubject} disabled={isPending}>
            <Plus className="w-4 h-4 mr-1.5 inline-block" />
            {isPending
              ? 'Saving to database…'
              : currentGroup?.isUG
              ? 'Add subject (Save All 3 Sections)'
              : 'Add subject'}
          </PrimaryButton>

          {statusMessage && (
            <p
              className={`text-xs font-medium flex items-center gap-1 ${
                statusMessage.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'
              }`}
            >
              {statusMessage.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              {statusMessage.text}
            </p>
          )}
        </div>
      </Panel>

      {/* Multi-Section Academic Register Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-serif text-base font-semibold text-[#3A0D0D] flex items-center gap-2">
            <span>Workload Register: {currentGroup?.label}</span>
            <span className="text-xs font-mono font-normal text-[#7C6E59] bg-[#EDE7D8] px-2 py-0.5 rounded">
              {groupedSubjects.length} subjects
            </span>
          </h3>
          <span className="text-xs text-[#7C6E59]">
            Persistent in database · Preserved across sessions
          </span>
        </div>

        <Panel className="overflow-x-auto border border-[#E4DCC9]">
          <table className="min-w-full divide-y divide-[#E4DCC9] text-xs">
            <thead className="bg-[#F1EBDE]">
              <tr>
                <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038] w-10">#</th>
                <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038] w-24">Code</th>
                <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038]">Subject Name</th>
                <th className="px-3 py-2.5 text-center font-semibold text-[#4A4038] w-16">Hrs</th>
                {currentGroup?.isUG ? (
                  <>
                    <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038] bg-[#EDE7D8]/60">
                      Section A Faculty
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038] bg-[#EDE7D8]/40">
                      Section B Faculty
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038] bg-[#EDE7D8]/60">
                      Section C Faculty
                    </th>
                  </>
                ) : (
                  <th className="px-3 py-2.5 text-left font-semibold text-[#4A4038]">
                    Faculty Assignment
                  </th>
                )}
                <th className="px-3 py-2.5 text-center font-semibold text-[#4A4038] w-28">Fixed Slot</th>
                <th className="px-3 py-2.5 text-right font-semibold text-[#4A4038] w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7D8] bg-white">
              {groupedSubjects.length === 0 ? (
                <tr>
                  <td
                    colSpan={currentGroup?.isUG ? 8 : 6}
                    className="px-4 py-8 text-center text-[#9C917A]"
                  >
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-[#C9BEA4]" />
                    <p className="font-medium text-sm text-[#4A4038]">No subjects configured yet</p>
                    <p className="text-xs text-[#7C6E59] mt-0.5">
                      Use the form above to add subjects for {currentGroup?.label}.
                    </p>
                  </td>
                </tr>
              ) : (
                groupedSubjects.map((row, idx) => (
                  <tr key={row.baseCode} className="hover:bg-[#FAF7F1] transition-colors">
                    <td className="px-3 py-2 text-[#7C6E59] font-mono">{idx + 1}</td>
                    <td className="px-3 py-2 font-mono font-bold text-[#3A0D0D] tracking-wide">
                      {row.baseCode}
                    </td>
                    <td className="px-3 py-2 font-medium text-[#2E2822]">{row.subjectName}</td>
                    <td className="px-3 py-2 text-center font-mono font-semibold text-[#4A4038]">
                      {row.hoursPerWeek}h
                    </td>

                    {currentGroup?.isUG ? (
                      (['A', 'B', 'C'] as const).map((sec) => {
                        const assign = row.sectionAssignments[sec];
                        return (
                          <td key={sec} className="px-3 py-2 text-[#2E2822]">
                            {assign && assign.splits.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {assign.splits.map((sp, sIdx) => (
                                  <span
                                    key={sIdx}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAF7F1] border border-[#E4DCC9] text-[11px] font-mono"
                                    title={sp.staffName}
                                  >
                                    <strong className="text-[#3A0D0D]">{sp.staffCode}</strong>
                                    {assign.splits.length > 1 && (
                                      <span className="text-[#7C6E59]">({sp.hours}h)</span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[#B8A98A]">—</span>
                            )}
                          </td>
                        );
                      })
                    ) : (
                      <td className="px-3 py-2 text-[#2E2822]">
                        {row.sectionAssignments['PG']?.splits.length ? (
                          <div className="flex flex-wrap items-center gap-1">
                            {row.sectionAssignments['PG'].splits.map((sp, sIdx) => (
                              <span
                                key={sIdx}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FAF7F1] border border-[#E4DCC9] text-[11px] font-mono"
                                title={sp.staffName}
                              >
                                <strong className="text-[#3A0D0D]">{sp.staffCode}</strong>
                                <span className="text-[#7C6E59]">— {sp.staffName}</span>
                                {row.sectionAssignments['PG'].splits.length > 1 && (
                                  <span className="text-[#7C6E59]">({sp.hours}h)</span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[#B8A98A]">—</span>
                        )}
                      </td>
                    )}

                    <td className="px-3 py-2 text-center">
                      {row.isFixed ? (
                        <Badge tone="gold">
                          Day {DAY_ORDER_LABELS[row.fixedDayOrder as any] || row.fixedDayOrder} · P{row.fixedPeriod}
                        </Badge>
                      ) : (
                        <span className="text-[#B8A98A]">—</span>
                      )}
                    </td>

                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleRemoveSubjectAcrossSections(row.baseCode)}
                        disabled={isPending}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold text-[#8C1F1F] bg-[#FBEAEA] hover:bg-[#F5D5D5] hover:text-[#6B1717] active:bg-[#EBB8B8] border border-[#8C1F1F]/20 hover:border-[#8C1F1F]/40 shadow-2xs transition-all duration-150 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        aria-label={`Remove subject ${row.baseCode}`}
                        title={`Remove ${row.baseCode} from all sections in ${currentGroup?.label || 'class'}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Remove</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
