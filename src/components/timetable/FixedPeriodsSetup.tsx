'use client';

// ============================================================================
// ACCFIN Timetable Generator — Step 0: Fixed Periods Setup
// ----------------------------------------------------------------------------
// Assigns college-mandated fixed periods (LANG, ENG, LAB) per class/section
// BEFORE subject Workload Entry and Auto-Generation.
// - UG classes (I/II/III B.COM AF): 3 section grids side-by-side (A, B, C)
// - PG classes (I/II M.COM AF): single grid
// - 6x5 matrix (Day Orders I–VI x Periods 1–5 + non-selectable Break column)
// - Instant click-to-assign & click-again-to-clear with automatic persistence
// ============================================================================

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type {
  FixedPeriodType,
  FixedPeriodsByClass,
  TTClass,
  TTFixedPeriodSlot,
  TTStaff,
} from '../../lib/timetable/types';
import {
  DAY_ORDERS,
  DAY_ORDER_LABELS,
  PERIOD_TIMES,
  TOTAL_SCHEDULABLE_SLOTS_PER_WEEK,
} from '../../lib/timetable/constants';
import { buildYearGroups, type YearGroupSection } from '../../lib/timetable/workload-api';
import {
  buildDefaultFixedSlotsForClass,
  computeNextFixedPeriodsMap,
  computeNextLabBlockStaffMap,
  formatLabBlockPeriodRange,
  getContiguousLabBlock,
  getFixedSlotsForClass,
  getYearGroupPolicy,
  parseFixedSlotStaffIds,
  persistFixedPeriodCellToSupabase,
  persistFixedPeriodSlotsToSupabase,
  persistFixedPeriodsForClassToSupabase,
  syncStep0LabStaffToTimetableEntries,
} from '../../lib/timetable/fixed-periods-api';
import { findTTStaff } from '../../lib/staffUtils';
import { saveFixedPeriodsMemory } from '../../lib/memoryStorage';
import { PageHeader, Panel, StatusBanner, SecondaryButton, PrimaryButton, inputClass } from './ui';
import {
  Lock,
  Languages,
  BookOpenCheck,
  FlaskConical,
  Eraser,
  RotateCcw,
  Trash2,
  Info,
  ArrowRight,
  CheckCircle2,
  X,
} from 'lucide-react';

interface Props {
  classes: TTClass[];
  staff: TTStaff[];
  fixedPeriodsByClass: FixedPeriodsByClass;
  onFixedPeriodsChange: (updated: FixedPeriodsByClass) => void;
  onProceedToWorkload?: () => void;
}

type ToolMode = FixedPeriodType | 'CLEAR';

const TOOL_STYLES: Record<
  FixedPeriodType,
  {
    label: string;
    fullName: string;
    cellBg: string;
    cellText: string;
    cellBorder: string;
    pillBg: string;
  }
> = {
  LANG: {
    label: 'LANG',
    fullName: 'Language',
    cellBg: 'bg-[#FBEAEA]',
    cellText: 'text-[#6B1717]',
    cellBorder: 'border-[#D9A7A7]',
    pillBg: 'bg-[#3A0D0D] text-[#D4AF37]',
  },
  ENG: {
    label: 'ENG',
    fullName: 'English',
    cellBg: 'bg-[#E8F1F0]',
    cellText: 'text-[#1F4946]',
    cellBorder: 'border-[#9CC2BF]',
    pillBg: 'bg-[#2F5D5A] text-white',
  },
  LAB: {
    label: 'LAB',
    fullName: 'Lab / Practical',
    cellBg: 'bg-[#FBF1E6]',
    cellText: 'text-[#7A480F]',
    cellBorder: 'border-[#DFBA8C]',
    pillBg: 'bg-[#A9631A] text-white',
  },
};

export default function FixedPeriodsSetup({
  classes,
  staff,
  fixedPeriodsByClass,
  onFixedPeriodsChange,
  onProceedToWorkload,
}: Props) {
  const yearGroups = useMemo(() => buildYearGroups(classes), [classes]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => yearGroups[0]?.id || 'I-BCOM');
  const [activeTool, setActiveTool] = useState<ToolMode>('LANG');
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{
    classId: string;
    dayOrder: number;
    period: number;
    slotType: FixedPeriodType;
    blockRangeLabel?: string;
    selectedStaffIds: string[];
    anchorRect: { top: number; left: number; bottom: number; width: number };
  } | null>(null);
  const [staffCodeInput, setStaffCodeInput] = useState('');
  const [staffInputError, setStaffInputError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (yearGroups.length > 0 && !yearGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(yearGroups[0].id);
    }
  }, [yearGroups, selectedGroupId]);

  const currentGroup = useMemo(
    () => yearGroups.find((g) => g.id === selectedGroupId) || yearGroups[0],
    [yearGroups, selectedGroupId]
  );

  const policy = useMemo(
    () => getYearGroupPolicy(currentGroup?.id || ''),
    [currentGroup?.id]
  );

  // Switch default paint tool sensibly when moving between I/II year (LANG/ENG) and III/PG (LAB)
  useEffect(() => {
    if (!policy.allowsLangEngByDefault && (activeTool === 'LANG' || activeTool === 'ENG')) {
      setActiveTool('LAB');
    } else if (policy.allowsLangEngByDefault && activeTool === 'LAB') {
      setActiveTool('LANG');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedGroupId]);

  // Close floating staff editor on Escape or outside click
  useEffect(() => {
    if (!editingCell) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditingCell(null);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setEditingCell(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      window.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [editingCell]);

  const findExactStaffByCode = (raw: string): TTStaff | undefined => {
    const q = raw.trim().toUpperCase();
    if (!q) return undefined;
    return staff.find((s) => s.short_code.trim().toUpperCase() === q);
  };

  const commitCellAssignedStaff = (
    classId: string,
    dayOrder: number,
    period: number,
    slotType: FixedPeriodType,
    assignedStaff: TTStaff | null
  ) => {
    const staffIdOrNull = assignedStaff ? assignedStaff.id : null;
    const updatedMap = computeNextFixedPeriodsMap(
      fixedPeriodsByClass,
      classId,
      dayOrder,
      period,
      slotType,
      staffIdOrNull
    );
    onFixedPeriodsChange(updatedMap);
    setLastSavedNotice(
      assignedStaff
        ? `Assigned ${assignedStaff.short_code} to ${slotType} on Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]} · P${period}`
        : `Cleared optional staff on ${slotType} (Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]} · P${period})`
    );
    void persistFixedPeriodCellToSupabase(classId, dayOrder, period, slotType, staffIdOrNull);
  };

  const commitLabBlockAssignedStaff = (
    classId: string,
    dayOrder: number,
    period: number,
    nextStaffList: TTStaff[]
  ) => {
    const nextIds = nextStaffList.map((s) => s.id);
    const { nextMap, updatedBlockSlots } = computeNextLabBlockStaffMap(
      fixedPeriodsByClass,
      classId,
      dayOrder,
      period,
      nextIds
    );
    onFixedPeriodsChange(nextMap);

    const rangeLabel = formatLabBlockPeriodRange(updatedBlockSlots) || `P${period}`;
    const codesLabel = nextStaffList.map((s) => s.short_code).join('/');
    setLastSavedNotice(
      nextStaffList.length > 0
        ? `Assigned ${codesLabel} to LAB (${rangeLabel}) on Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]}`
        : `Cleared optional staff on LAB (${rangeLabel}) on Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]}`
    );

    void persistFixedPeriodSlotsToSupabase(updatedBlockSlots);
    const classCode = classes.find((c) => c.id === classId)?.code || classId;
    syncStep0LabStaffToTimetableEntries(classId, classCode, updatedBlockSlots, staff);
  };

  const openStaffEditor = (
    classId: string,
    dayOrder: number,
    period: number,
    slotType: FixedPeriodType,
    currentAssignedList: TTStaff[],
    triggerEl: HTMLElement
  ) => {
    const rect = triggerEl.getBoundingClientRect();
    let blockRangeLabel: string | undefined;
    if (slotType === 'LAB') {
      const classSlots = getFixedSlotsForClass(fixedPeriodsByClass, classId, classes);
      const block = getContiguousLabBlock(classSlots, dayOrder, period);
      blockRangeLabel = formatLabBlockPeriodRange(block);
    }

    setStaffCodeInput(slotType === 'LAB' ? '' : (currentAssignedList[0]?.short_code || ''));
    setStaffInputError(null);
    setEditingCell({
      classId,
      dayOrder,
      period,
      slotType,
      blockRangeLabel,
      selectedStaffIds: currentAssignedList.map((s) => s.id),
      anchorRect: {
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        width: rect.width,
      },
    });
  };

  const handleCellClick = (classId: string, dayOrder: number, period: number, existingType: FixedPeriodType | null) => {
    let nextType: FixedPeriodType | null;
    if (activeTool === 'CLEAR') {
      nextType = null;
    } else if (existingType === activeTool) {
      // Toggle off when clicking a cell that already holds the active tool
      nextType = null;
    } else {
      nextType = activeTool;
    }

    if (
      editingCell &&
      editingCell.classId === classId &&
      editingCell.dayOrder === dayOrder &&
      editingCell.period === period
    ) {
      setEditingCell(null);
    }

    const updatedMap = computeNextFixedPeriodsMap(
      fixedPeriodsByClass,
      classId,
      dayOrder,
      period,
      nextType
    );
    onFixedPeriodsChange(updatedMap);
    setLastSavedNotice(
      nextType
        ? `Locked Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]} · P${period} as ${nextType}`
        : `Opened Day ${DAY_ORDER_LABELS[dayOrder as keyof typeof DAY_ORDER_LABELS]} · P${period} for subject scheduling`
    );

    const updatedList = updatedMap[classId] ?? [];
    const updatedSlot = updatedList.find(
      (s) => s.day_order === dayOrder && s.period === period
    );

    if (nextType === 'LAB') {
      const block = getContiguousLabBlock(updatedList, dayOrder, period);
      void persistFixedPeriodSlotsToSupabase(block.length > 0 ? block : updatedSlot ? [updatedSlot] : []);
      const classCode = classes.find((c) => c.id === classId)?.code || classId;
      syncStep0LabStaffToTimetableEntries(
        classId,
        classCode,
        block.length > 0 ? block : updatedSlot ? [updatedSlot] : [],
        staff
      );
    } else {
      void persistFixedPeriodCellToSupabase(
        classId,
        dayOrder,
        period,
        nextType,
        updatedSlot?.assigned_staff_id ?? null
      );
    }
  };

  const handleApplyYearDefaults = () => {
    if (!currentGroup) return;
    let nextMap: FixedPeriodsByClass = { ...fixedPeriodsByClass };

    for (const sec of currentGroup.sections) {
      const classObj = classes.find((c) => c.id === sec.classId) ?? {
        id: sec.classId,
        code: sec.classCode,
        display_name: sec.displayName,
        sort_order: 0,
      };
      const defaultSlots = buildDefaultFixedSlotsForClass(classObj);
      nextMap[sec.classId] = defaultSlots;
      void persistFixedPeriodsForClassToSupabase(sec.classId, defaultSlots);
    }

    saveFixedPeriodsMemory(nextMap);
    onFixedPeriodsChange(nextMap);
    setLastSavedNotice(`Applied recommended AMJC defaults for ${currentGroup.label}.`);
  };

  const handleClearSection = (sec: YearGroupSection) => {
    const nextMap: FixedPeriodsByClass = {
      ...fixedPeriodsByClass,
      [sec.classId]: [],
    };
    saveFixedPeriodsMemory(nextMap);
    onFixedPeriodsChange(nextMap);
    setLastSavedNotice(`Cleared all fixed slots for ${sec.displayName}.`);
    void persistFixedPeriodsForClassToSupabase(sec.classId, []);
  };

  const groupSummary = useMemo(() => {
    if (!currentGroup) return { perSection: [] as Array<{ label: string; fixed: number; open: number }> };
    return {
      perSection: currentGroup.sections.map((sec) => {
        const slots = getFixedSlotsForClass(fixedPeriodsByClass, sec.classId, classes);
        const fixed = slots.length;
        return {
          label: sec.sectionName === 'PG' ? sec.displayName : `Sec ${sec.sectionName}`,
          fixed,
          open: Math.max(0, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - fixed),
        };
      }),
    };
  }, [currentGroup, fixedPeriodsByClass, classes]);

  const renderSectionGrid = (sec: YearGroupSection) => {
    const slots = getFixedSlotsForClass(fixedPeriodsByClass, sec.classId, classes);
    const cellLookup = new Map<string, TTFixedPeriodSlot>();
    let langCount = 0;
    let engCount = 0;
    let labCount = 0;

    for (const s of slots) {
      cellLookup.set(`${s.day_order}_${s.period}`, s);
      if (s.slot_type === 'LANG') langCount++;
      else if (s.slot_type === 'ENG') engCount++;
      else if (s.slot_type === 'LAB') labCount++;
    }

    const totalFixed = slots.length;
    const openSlots = Math.max(0, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - totalFixed);

    return (
      <Panel key={sec.classId} className="overflow-hidden border border-[#C9BEA4] shadow-2xs flex flex-col">
        {/* Section Header */}
        <div className="bg-[#F1EBDE] border-b border-[#D9CEB6] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#3A0D0D] text-[#D4AF37] flex items-center justify-center text-xs font-mono font-bold">
              {sec.sectionName === 'PG' ? 'P' : sec.sectionName}
            </span>
            <div>
              <h3 className="font-serif text-sm font-semibold text-[#3A0D0D] leading-tight">
                {sec.displayName}
              </h3>
              <p className="text-[11px] text-[#6B5F4E]">
                <strong className="text-[#3A0D0D]">{openSlots}h</strong> open for subjects ·{' '}
                <span>{totalFixed}h fixed</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {totalFixed > 0 && (
              <button
                type="button"
                onClick={() => handleClearSection(sec)}
                className="text-[11px] px-2 py-1 rounded border border-[#D9CEB6] bg-white hover:bg-[#FBEAEA] hover:text-[#8C1F1F] hover:border-[#D9A7A7] text-[#6B5F4E] flex items-center gap-1 transition-colors"
                title={`Clear all fixed slots in ${sec.displayName}`}
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {/* Counts Strip */}
        <div className="px-3.5 py-1.5 bg-[#FAF7F1] border-b border-[#EDE7D8] flex flex-wrap items-center gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FBEAEA] text-[#6B1717] border border-[#E7C2C2] font-mono">
            LANG: <strong>{langCount}</strong>
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#E8F1F0] text-[#1F4946] border border-[#B5D2CF] font-mono">
            ENG: <strong>{engCount}</strong>
          </span>
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FBF1E6] text-[#7A480F] border border-[#E6CBA8] font-mono">
            LAB: <strong>{labCount}</strong>
          </span>
          <span className="ml-auto text-[#7C6E59] font-mono">
            {totalFixed}/{TOTAL_SCHEDULABLE_SLOTS_PER_WEEK} locked
          </span>
        </div>

        {/* 6x5 Matrix + Break */}
        <div className="overflow-x-auto bg-white">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border-b border-r border-[#D9CEB6] bg-[#3A0D0D] text-[#D4AF37] font-serif font-medium px-2 py-2 text-center w-11">
                  Day
                </th>
                {PERIOD_TIMES.map((pt) =>
                  pt.period === 'BREAK' ? (
                    <th
                      key="break"
                      className="border-b border-r border-[#D9CEB6] bg-[#EDE7D8] text-[#9C917A] font-medium px-1 py-2 text-center w-7 text-[10px]"
                      title={`Break (${pt.label}) — Non-selectable`}
                    >
                      Brk
                    </th>
                  ) : (
                    <th
                      key={pt.period}
                      className="border-b border-r last:border-r-0 border-[#D9CEB6] bg-[#F6EFD6] text-[#3A0D0D] font-semibold px-1.5 py-2 text-center"
                    >
                      <div>P{pt.period}</div>
                      <div className="text-[9px] font-normal text-[#7C6E59] hidden sm:block whitespace-nowrap">
                        {pt.label.split('–')[0].trim()}
                      </div>
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {DAY_ORDERS.map((day, dIdx) => (
                <tr key={day} className={dIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAF7F1]/60'}>
                  <td className="border-b border-r border-[#D9CEB6] bg-[#F6EFD6]/70 font-serif font-semibold text-[#3A0D0D] text-center py-2 px-2">
                    {DAY_ORDER_LABELS[day]}
                  </td>
                  {PERIOD_TIMES.map((pt) => {
                    if (pt.period === 'BREAK') {
                      return (
                        <td
                          key="break"
                          className="border-b border-r border-[#D9CEB6] bg-[#EDE7D8]/75 text-center text-[#B8A98A] select-none cursor-not-allowed"
                          title="Break — non-selectable"
                        >
                          ·
                        </td>
                      );
                    }

                    const periodNum = pt.period as number;
                    const assigned = cellLookup.get(`${day}_${periodNum}`);
                    const slotType = assigned?.slot_type ?? null;
                    const style = slotType ? TOOL_STYLES[slotType] : null;
                    const assignedStaffIds = assigned ? parseFixedSlotStaffIds(assigned, staff) : [];
                    const assignedStaffList = assignedStaffIds
                      .map((id) => findTTStaff(staff, id))
                      .filter((s): s is TTStaff => Boolean(s));
                    const staffCodeDisplay = assignedStaffList.map((s) => s.short_code).join('/');
                    const staffNamesTooltip = assignedStaffList
                      .map((s) => `${s.short_code} — ${s.full_name}`)
                      .join(', ');

                    return (
                      <td
                        key={`${day}_${periodNum}`}
                        className="border-b border-r last:border-r-0 border-[#E4DCC9] p-1 text-center align-middle"
                      >
                        {style && slotType ? (
                          <div
                            className={`w-full min-h-[34px] rounded-xs border text-[11px] font-mono font-semibold transition-all flex flex-col items-center justify-center ${style.cellBg} ${style.cellText} ${style.cellBorder} shadow-2xs`}
                          >
                            <div className="w-full px-1 pt-0.5 flex items-center justify-center gap-0.5 leading-tight flex-wrap">
                              <button
                                type="button"
                                onClick={() => handleCellClick(sec.classId, day, periodNum, slotType)}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  handleCellClick(sec.classId, day, periodNum, slotType);
                                }}
                                title={`${TOOL_STYLES[slotType].fullName} locked on Day ${DAY_ORDER_LABELS[day]} Period ${periodNum}${staffNamesTooltip ? ` (${staffNamesTooltip})` : ''}. Click to toggle/replace.`}
                                className="inline-flex items-center justify-center gap-0.5 leading-tight hover:brightness-95 cursor-pointer"
                              >
                                <Lock className="w-2.5 h-2.5 opacity-70 shrink-0" />
                                <span>{style.label}</span>
                              </button>
                              {assignedStaffList.length > 0 && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openStaffEditor(
                                      sec.classId,
                                      day,
                                      periodNum,
                                      slotType,
                                      assignedStaffList,
                                      e.currentTarget
                                    );
                                  }}
                                  title={`Assigned: ${staffNamesTooltip} (click to edit or clear)`}
                                  className="px-1 rounded bg-white/80 border border-current/25 text-[9.5px] font-bold leading-tight hover:bg-white cursor-pointer"
                                >
                                  ({staffCodeDisplay})
                                </button>
                              )}
                            </div>
                            {assignedStaffList.length === 0 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openStaffEditor(
                                    sec.classId,
                                    day,
                                    periodNum,
                                    slotType,
                                    [],
                                    e.currentTarget
                                  );
                                }}
                                title="Optional: assign staff to this fixed period"
                                className="text-[9px] leading-none font-normal opacity-60 hover:opacity-100 hover:underline pb-0.5 cursor-pointer"
                              >
                                + Add staff
                              </button>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCellClick(sec.classId, day, periodNum, slotType)}
                            title={`Open slot — click to mark as ${activeTool === 'CLEAR' ? 'Open' : activeTool}`}
                            className="w-full min-h-[34px] rounded-xs border text-[11px] font-mono font-semibold transition-all flex items-center justify-center gap-0.5 cursor-pointer bg-white border-dashed border-[#DDD4C1] text-[#B8A98A] hover:border-[#3A0D0D]/50 hover:bg-[#FAF7F1] hover:text-[#3A0D0D]"
                          >
                            <span className="text-[10px] font-normal opacity-60">Open</span>
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          eyebrow="Step 0 — Fixed Periods Setup"
          title="College-Set Fixed Periods (LANG, ENG & LAB)"
          description="Lock in Language, English, and Lab/Practical periods per class before entering subject workloads. Locked cells are permanently excluded from the auto-generator and subtracted from weekly open hours. Every click saves immediately."
        />
        {onProceedToWorkload && (
          <PrimaryButton type="button" onClick={onProceedToWorkload} className="shrink-0 mt-1">
            <span>Next: 1. Workload Entry</span>
            <ArrowRight className="w-4 h-4 ml-1.5" />
          </PrimaryButton>
        )}
      </div>

      {/* Year Group Selection Tabs (matching Workload Entry) */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#E4DCC9] pb-4">
        <div>
          <label className="text-xs font-serif uppercase tracking-wider text-[#7C6E59] block mb-1.5">
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
                    setLastSavedNotice(null);
                  }}
                  className={`px-4 py-2 text-xs font-medium rounded-sm border transition-all cursor-pointer ${
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

        <div className="flex items-center gap-2">
          <SecondaryButton
            type="button"
            onClick={handleApplyYearDefaults}
            className="text-xs py-1.5 px-3"
            title="Restore canonical AMJ College defaults for this year group"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            <span>Apply Year Defaults</span>
          </SecondaryButton>
        </div>
      </div>

      {/* Guidance & Year Rule Banner */}
      <StatusBanner tone={policy.allowsLangEngByDefault ? 'neutral' : 'warning'}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">{currentGroup?.label}:</span> {policy.hintText}{' '}
              <span className="opacity-80">
                (LANG/ENG usually apply to I &amp; II year only — III year and PG typically only need Lab/Practical fixed slots.)
              </span>
            </div>
          </div>
          <div className="font-mono text-[11px] bg-white/70 px-2 py-0.5 rounded border border-[#C9BEA4]/50">
            {groupSummary.perSection.map((p) => `${p.label}: ${p.open}h open`).join(' · ')}
          </div>
        </div>
      </StatusBanner>

      {/* Assignment Brush Toolbar */}
      <Panel className="p-3.5 bg-[#FAF7F1] border-[#E4DCC9] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-serif font-semibold text-[#3A0D0D] mr-1">
            Click cells to assign:
          </span>

          <button
            type="button"
            onClick={() => setActiveTool('LANG')}
            className={`px-3 py-1.5 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'LANG'
                ? 'bg-[#3A0D0D] text-[#D4AF37] border-[#3A0D0D] shadow-xs ring-2 ring-[#D4AF37]/40'
                : 'bg-white text-[#6B1717] border-[#D9A7A7] hover:bg-[#FBEAEA]'
            }`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>LANG</span>
            {!policy.allowsLangEngByDefault && (
              <span className="text-[10px] opacity-75 font-normal">(rare in {currentGroup?.label})</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('ENG')}
            className={`px-3 py-1.5 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'ENG'
                ? 'bg-[#2F5D5A] text-white border-[#2F5D5A] shadow-xs ring-2 ring-[#2F5D5A]/30'
                : 'bg-white text-[#1F4946] border-[#9CC2BF] hover:bg-[#E8F1F0]'
            }`}
          >
            <BookOpenCheck className="w-3.5 h-3.5" />
            <span>ENG</span>
            {!policy.allowsLangEngByDefault && (
              <span className="text-[10px] opacity-75 font-normal">(rare in {currentGroup?.label})</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('LAB')}
            className={`px-3 py-1.5 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'LAB'
                ? 'bg-[#A9631A] text-white border-[#A9631A] shadow-xs ring-2 ring-[#A9631A]/30'
                : 'bg-white text-[#7A480F] border-[#DFBA8C] hover:bg-[#FBF1E6]'
            }`}
          >
            <FlaskConical className="w-3.5 h-3.5" />
            <span>LAB</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool('CLEAR')}
            className={`px-3 py-1.5 rounded text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTool === 'CLEAR'
                ? 'bg-[#4A4038] text-white border-[#4A4038] shadow-xs'
                : 'bg-white text-[#4A4038] border-[#C9BEA4] hover:bg-[#F1EBDE]'
            }`}
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Open / Clear</span>
          </button>
        </div>

        <div className="text-[11px] text-[#6B5F4E] flex items-center gap-1.5">
          {lastSavedNotice ? (
            <span className="text-[#3F6634] font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {lastSavedNotice}
            </span>
          ) : (
            <span>Tip: Click a matching cell again to clear it back to Open.</span>
          )}
        </div>
      </Panel>

      {/* Section Grid(s): 3-Column Side-by-Side for UG, Single for PG */}
      <div
        className={
          currentGroup?.isUG
            ? 'grid grid-cols-1 xl:grid-cols-3 gap-4'
            : 'max-w-2xl'
        }
      >
        {currentGroup?.sections.map((sec) => renderSectionGrid(sec))}
      </div>

      {/* Anchored Optional Staff Assignment Popover (never resizes or reflows grid) */}
      {editingCell &&
        typeof document !== 'undefined' &&
        createPortal(
          (() => {
            const isLabMode = editingCell.slotType === 'LAB';
            const selectedLabStaff: TTStaff[] = isLabMode
              ? editingCell.selectedStaffIds
                  .map((id) => findTTStaff(staff, id))
                  .filter((s): s is TTStaff => Boolean(s))
              : [];

            const addLabStaffFromInput = (rawText: string, closeAfterIfEmpty = false): boolean => {
              const trimmed = rawText.trim();
              if (!trimmed) {
                if (closeAfterIfEmpty) setEditingCell(null);
                return true;
              }
              const tokens = trimmed
                .split(/[,/+\s]+/)
                .map((t) => t.trim())
                .filter(Boolean);

              const matchedToAdd: TTStaff[] = [];
              const unknownTokens: string[] = [];

              for (const tok of tokens) {
                const m = findExactStaffByCode(tok);
                if (m) matchedToAdd.push(m);
                else unknownTokens.push(tok.toUpperCase());
              }

              if (unknownTokens.length > 0) {
                setStaffInputError(
                  `Unknown code "${unknownTokens.join(', ')}". Pick from directory below.`
                );
                return false;
              }

              const nextList = [...selectedLabStaff];
              for (const m of matchedToAdd) {
                if (!nextList.some((x) => x.id === m.id)) {
                  nextList.push(m);
                }
              }

              setStaffCodeInput('');
              setStaffInputError(null);
              setEditingCell((prev) =>
                prev ? { ...prev, selectedStaffIds: nextList.map((s) => s.id) } : null
              );
              commitLabBlockAssignedStaff(
                editingCell.classId,
                editingCell.dayOrder,
                editingCell.period,
                nextList
              );
              return true;
            };

            const removeLabStaff = (staffIdToRemove: string) => {
              const nextList = selectedLabStaff.filter((s) => s.id !== staffIdToRemove);
              setStaffInputError(null);
              setEditingCell((prev) =>
                prev ? { ...prev, selectedStaffIds: nextList.map((s) => s.id) } : null
              );
              commitLabBlockAssignedStaff(
                editingCell.classId,
                editingCell.dayOrder,
                editingCell.period,
                nextList
              );
            };

            return (
              <div
                ref={popoverRef}
                style={{
                  position: 'fixed',
                  top: Math.min(
                    editingCell.anchorRect.bottom + 6,
                    Math.max(12, window.innerHeight - (isLabMode ? 225 : 175))
                  ),
                  left: Math.min(
                    Math.max(12, editingCell.anchorRect.left + editingCell.anchorRect.width / 2 - 128),
                    Math.max(12, window.innerWidth - 272)
                  ),
                }}
                className="z-50 w-64 bg-white border border-[#C9BEA4] rounded-md shadow-xl p-2.5 space-y-2"
              >
                <div className="flex items-center justify-between border-b border-[#EDE7D8] pb-1">
                  <span className="text-[11px] font-serif font-semibold text-[#3A0D0D]">
                    {editingCell.slotType} · Day{' '}
                    {DAY_ORDER_LABELS[editingCell.dayOrder as keyof typeof DAY_ORDER_LABELS]}{' '}
                    {isLabMode
                      ? editingCell.blockRangeLabel || `P${editingCell.period}`
                      : `P${editingCell.period}`}{' '}
                    — Staff (Optional)
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingCell(null)}
                    className="text-[#8A806D] hover:text-[#3A0D0D] p-0.5 cursor-pointer"
                    aria-label="Close staff selector"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {isLabMode ? (
                  <>
                    {/* Removable tags for all staff assigned to this LAB block */}
                    {selectedLabStaff.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {selectedLabStaff.map((s) => (
                          <span
                            key={s.id}
                            title={s.full_name}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FBF1E6] border border-[#DFBA8C] text-[#7A480F] text-[10px] font-mono font-bold"
                          >
                            <span>{s.short_code}</span>
                            <button
                              type="button"
                              onClick={() => removeLabStaff(s.id)}
                              className="hover:text-[#8C1F1F] cursor-pointer leading-none"
                              aria-label={`Remove ${s.short_code}`}
                              title={`Remove ${s.short_code} from block`}
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        autoComplete="off"
                        placeholder="Add staff code (e.g. TP, DA)"
                        className={`${inputClass} uppercase font-mono text-xs py-1 flex-1`}
                        value={staffCodeInput}
                        onChange={(e) => {
                          setStaffCodeInput(e.target.value);
                          setStaffInputError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addLabStaffFromInput(staffCodeInput, true);
                          }
                        }}
                      />
                      {staffCodeInput.trim() && (
                        <button
                          type="button"
                          onClick={() => addLabStaffFromInput(staffCodeInput, false)}
                          className="px-2 py-1 rounded bg-[#3A0D0D] text-[#D4AF37] text-[10px] font-semibold hover:brightness-110 cursor-pointer shrink-0"
                        >
                          Add
                        </button>
                      )}
                    </div>

                    <select
                      className="text-[11px] bg-[#FAF7F1] border border-[#E4DCC9] rounded px-2 py-1 text-[#4A4038] w-full focus:outline-hidden"
                      value=""
                      onChange={(e) => {
                        const pickedCode = e.target.value;
                        if (!pickedCode) return;
                        const pickedStaff = findExactStaffByCode(pickedCode);
                        if (!pickedStaff) return;
                        const nextList = selectedLabStaff.some((x) => x.id === pickedStaff.id)
                          ? selectedLabStaff
                          : [...selectedLabStaff, pickedStaff];
                        setStaffInputError(null);
                        setEditingCell((prev) =>
                          prev ? { ...prev, selectedStaffIds: nextList.map((s) => s.id) } : null
                        );
                        commitLabBlockAssignedStaff(
                          editingCell.classId,
                          editingCell.dayOrder,
                          editingCell.period,
                          nextList
                        );
                      }}
                    >
                      <option value="">Quick pick from Staff Directory…</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.short_code}>
                          {s.short_code} — {s.full_name}
                          {s.is_hod ? ' (HOD)' : ''}
                          {selectedLabStaff.some((x) => x.id === s.id) ? ' ✓' : ''}
                        </option>
                      ))}
                    </select>

                    {staffInputError && (
                      <p className="text-[10px] text-[#8C1F1F] leading-tight">{staffInputError}</p>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      {selectedLabStaff.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setStaffCodeInput('');
                            setStaffInputError(null);
                            setEditingCell((prev) =>
                              prev ? { ...prev, selectedStaffIds: [] } : null
                            );
                            commitLabBlockAssignedStaff(
                              editingCell.classId,
                              editingCell.dayOrder,
                              editingCell.period,
                              []
                            );
                            setEditingCell(null);
                          }}
                          className="text-[10px] text-[#8C1F1F] hover:underline cursor-pointer"
                        >
                          Clear staff
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#7C6E59]">Applies to whole LAB block</span>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          if (staffCodeInput.trim()) {
                            const ok = addLabStaffFromInput(staffCodeInput, false);
                            if (!ok) return;
                          }
                          setEditingCell(null);
                        }}
                        className="text-[10px] font-semibold text-[#3A0D0D] hover:underline cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <input
                      type="text"
                      autoFocus
                      autoComplete="off"
                      placeholder="Staff code (e.g. TP)"
                      className={`${inputClass} uppercase font-mono text-xs py-1`}
                      value={staffCodeInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStaffCodeInput(val);
                        const trimmed = val.trim();
                        if (!trimmed) {
                          setStaffInputError(null);
                          commitCellAssignedStaff(
                            editingCell.classId,
                            editingCell.dayOrder,
                            editingCell.period,
                            editingCell.slotType,
                            null
                          );
                          return;
                        }
                        const match = findExactStaffByCode(trimmed);
                        if (match) {
                          setStaffInputError(null);
                          commitCellAssignedStaff(
                            editingCell.classId,
                            editingCell.dayOrder,
                            editingCell.period,
                            editingCell.slotType,
                            match
                          );
                        } else {
                          setStaffInputError(null);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const trimmed = staffCodeInput.trim();
                          if (!trimmed) {
                            setEditingCell(null);
                            return;
                          }
                          const match = findExactStaffByCode(trimmed);
                          if (match) {
                            setStaffInputError(null);
                            commitCellAssignedStaff(
                              editingCell.classId,
                              editingCell.dayOrder,
                              editingCell.period,
                              editingCell.slotType,
                              match
                            );
                            setEditingCell(null);
                          } else {
                            setStaffInputError(`Unknown code "${trimmed.toUpperCase()}". Pick from directory below.`);
                          }
                        }
                      }}
                    />

                    <select
                      className="text-[11px] bg-[#FAF7F1] border border-[#E4DCC9] rounded px-2 py-1 text-[#4A4038] w-full focus:outline-hidden"
                      value={findExactStaffByCode(staffCodeInput)?.short_code || ''}
                      onChange={(e) => {
                        const pickedCode = e.target.value;
                        if (!pickedCode) return;
                        const pickedStaff = findExactStaffByCode(pickedCode);
                        if (!pickedStaff) return;
                        setStaffCodeInput(pickedStaff.short_code);
                        setStaffInputError(null);
                        commitCellAssignedStaff(
                          editingCell.classId,
                          editingCell.dayOrder,
                          editingCell.period,
                          editingCell.slotType,
                          pickedStaff
                        );
                        setEditingCell(null);
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

                    {staffInputError && (
                      <p className="text-[10px] text-[#8C1F1F] leading-tight">{staffInputError}</p>
                    )}

                    <div className="flex items-center justify-between pt-0.5">
                      {staffCodeInput.trim() ? (
                        <button
                          type="button"
                          onClick={() => {
                            setStaffCodeInput('');
                            setStaffInputError(null);
                            commitCellAssignedStaff(
                              editingCell.classId,
                              editingCell.dayOrder,
                              editingCell.period,
                              editingCell.slotType,
                              null
                            );
                            setEditingCell(null);
                          }}
                          className="text-[10px] text-[#8C1F1F] hover:underline cursor-pointer"
                        >
                          Clear staff
                        </button>
                      ) : (
                        <span className="text-[10px] text-[#7C6E59]">Optional · saves instantly</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingCell(null)}
                        className="text-[10px] font-semibold text-[#3A0D0D] hover:underline cursor-pointer"
                      >
                        Done
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
}
