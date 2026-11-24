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

import React, { useMemo, useState, useEffect } from 'react';
import type {
  FixedPeriodType,
  FixedPeriodsByClass,
  TTClass,
  TTFixedPeriodSlot,
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
  getFixedSlotsForClass,
  getYearGroupPolicy,
  persistFixedPeriodCellToSupabase,
  persistFixedPeriodsForClassToSupabase,
} from '../../lib/timetable/fixed-periods-api';
import { saveFixedPeriodsMemory } from '../../lib/memoryStorage';
import { PageHeader, Panel, StatusBanner, SecondaryButton, PrimaryButton } from './ui';
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
} from 'lucide-react';

interface Props {
  classes: TTClass[];
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
  fixedPeriodsByClass,
  onFixedPeriodsChange,
  onProceedToWorkload,
}: Props) {
  const yearGroups = useMemo(() => buildYearGroups(classes), [classes]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => yearGroups[0]?.id || 'I-BCOM');
  const [activeTool, setActiveTool] = useState<ToolMode>('LANG');
  const [lastSavedNotice, setLastSavedNotice] = useState<string | null>(null);

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

    // Non-blocking sync to Supabase
    void persistFixedPeriodCellToSupabase(classId, dayOrder, period, nextType);
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

                    return (
                      <td
                        key={`${day}_${periodNum}`}
                        className="border-b border-r last:border-r-0 border-[#E4DCC9] p-1 text-center align-middle"
                      >
                        <button
                          type="button"
                          onClick={() => handleCellClick(sec.classId, day, periodNum, slotType)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            if (slotType) handleCellClick(sec.classId, day, periodNum, slotType);
                          }}
                          title={
                            slotType
                              ? `${TOOL_STYLES[slotType].fullName} locked on Day ${DAY_ORDER_LABELS[day]} Period ${periodNum}. Click to toggle/replace.`
                              : `Open slot — click to mark as ${activeTool === 'CLEAR' ? 'Open' : activeTool}`
                          }
                          className={`w-full min-h-[34px] rounded-xs border text-[11px] font-mono font-semibold transition-all flex items-center justify-center gap-0.5 cursor-pointer ${
                            style
                              ? `${style.cellBg} ${style.cellText} ${style.cellBorder} shadow-2xs hover:brightness-95`
                              : 'bg-white border-dashed border-[#DDD4C1] text-[#B8A98A] hover:border-[#3A0D0D]/50 hover:bg-[#FAF7F1] hover:text-[#3A0D0D]'
                          }`}
                        >
                          {style ? (
                            <>
                              <Lock className="w-2.5 h-2.5 opacity-70 shrink-0" />
                              <span>{style.label}</span>
                            </>
                          ) : (
                            <span className="text-[10px] font-normal opacity-60">Open</span>
                          )}
                        </button>
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
    </div>
  );
}
