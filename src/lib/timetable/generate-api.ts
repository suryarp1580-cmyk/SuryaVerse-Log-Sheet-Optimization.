// ============================================================================
// ACCFIN Timetable Generator — Generate Data Layer (Vite port)
// Respects Step 0 Fixed Periods (LANG, ENG, LAB) as locked/blocked slots
// before placing any departmental workload subjects.
// ============================================================================

import { supabase } from '../supabaseClient';
import {
  generateSchedule,
  type BlockedClassSlot,
  type FixedPlacement,
  type SchedulableWorkload,
} from './scheduler';
import type { TTStaff, TTClass, TTWorkload } from './types';
import { resolveWorkloadStaff, rederiveTimetableEntries, findTTStaff } from '../staffUtils';
import { DAY_ORDER_LABELS } from './constants';
import {
  saveMemoryData,
  loadMemoryData,
  loadWorkloadMemory,
  loadTTStaffMemory,
  saveGeneratedSlotsMemory,
} from '../memoryStorage';
import {
  getAllFixedPeriods,
  resolveActiveClassId,
} from './fixed-periods-api';
import { initialClasses, initialStaff } from '../../data/seedData';
import type { TimetableEntry } from '../../types';

export interface GenerateRunSummary {
  success: boolean;
  message: string;
  classesAffected: number;
  slotsPlaced: number;
  unresolved: Array<{
    classCode: string;
    subjectCode: string;
    staffCode: string;
    staffName: string;
    missingHours: number;
  }>;
  fixedClashes: Array<{ reason: string; classCode: string; dayOrder: number; period: number }>;
  consecutiveWarnings: Array<{
    staffId: string;
    staffCode: string;
    staffName: string;
    dayOrder: number;
    dayOrderLabel: string;
    periodA: number;
    periodB: number;
    text: string;
  }>;
  sameDayRepeats: Array<{
    classId: string;
    classCode: string;
    subjectCode: string;
    dayOrder: number;
    dayOrderLabel: string;
    count: number;
    text: string;
  }>;
  overSixHoursWarnings: Array<{
    classId: string;
    classCode: string;
    subjectCode: string;
    totalHours: number;
    text: string;
  }>;
  attemptsUsed: number;
  staffWarnings?: string[];
}

export async function runGenerateSchedule(): Promise<GenerateRunSummary> {
  const [
    { data: classesData },
    { data: staffData },
    { data: workloadData },
    { data: fixedSlotRows },
  ] = await Promise.all([
    supabase.from('tt_classes').select('*'),
    supabase.from('tt_staff').select('*'),
    supabase.from('tt_workload').select('*'),
    supabase.from('tt_fixed_slots').select('*'),
  ]);

  const classes: TTClass[] =
    classesData && classesData.length > 0
      ? (classesData as TTClass[])
      : initialClasses.map((c, i) => ({
          id: c.id,
          code: c.id.replace('class-', ''),
          display_name: `${c.yearLabel} Sec ${c.section}`,
          sort_order: i + 1,
        }));

  const memStaff = loadTTStaffMemory() as TTStaff[];
  const staff: TTStaff[] =
    staffData && staffData.length > 0
      ? (staffData as TTStaff[])
      : memStaff.length > 0
        ? memStaff
        : initialStaff.map((s) => ({
            id: s.id,
            short_code: s.code,
            full_name: s.fullName || s.code,
            status: s.isActive ? 'ACTIVE' : 'INACTIVE',
            is_hod: false,
          }));

  // Use live Supabase workload when available, otherwise fall back to local persistent workload memory
  let workload: any[] = Array.isArray(workloadData) && workloadData.length > 0 ? workloadData : [];
  const memWorkloadByClass = loadWorkloadMemory() as Record<string, TTWorkload[]>;
  if (workload.length === 0) {
    workload = Object.values(memWorkloadByClass).flat();
  }

  // Normalize class IDs on workload entries against active `classes`
  workload = workload.map((w) => ({
    ...w,
    class_id: resolveActiveClassId(w.class_id, classes),
  }));

  // Group normalized workload for Step 0 migration check if needed
  const normalizedWorkloadMap: Record<string, TTWorkload[]> = {};
  for (const w of workload) {
    if (!normalizedWorkloadMap[w.class_id]) normalizedWorkloadMap[w.class_id] = [];
    normalizedWorkloadMap[w.class_id].push(w);
  }

  // Load Step 0 Fixed Periods (LANG, ENG, LAB)
  const fixedPeriodsByClass = await getAllFixedPeriods(classes, normalizedWorkloadMap);
  const blockedSlots: BlockedClassSlot[] = [];
  const fixedCoordSetByClass = new Map<string, Set<string>>();

  for (const c of classes) {
    const slots = fixedPeriodsByClass[c.id] ?? [];
    const coordSet = new Set<string>();
    for (const s of slots) {
      const resolvedAssigned = s.assigned_staff_id
        ? findTTStaff(staff, s.assigned_staff_id)
        : undefined;
      const assignedStaffId = resolvedAssigned?.id ?? (s.assigned_staff_id || null);

      blockedSlots.push({
        classId: c.id,
        dayOrder: s.day_order,
        period: s.period,
        slotType: s.slot_type,
        assignedStaffId,
      });
      coordSet.add(`${s.day_order}_${s.period}`);
    }
    fixedCoordSetByClass.set(c.id, coordSet);
  }

  const classById = new Map<string, TTClass>(classes.map((c) => [c.id, c]));
  const staffById = new Map<string, TTStaff>(staff.map((s) => [s.id, s]));

  type FixedSlotRow = { workload_id: string; day_order: number; period: number };
  const fixedSlotsByWorkload = new Map<string, FixedSlotRow[]>();
  for (const fs of (fixedSlotRows ?? []) as FixedSlotRow[]) {
    const list = fixedSlotsByWorkload.get(fs.workload_id) ?? [];
    list.push(fs);
    fixedSlotsByWorkload.set(fs.workload_id, list);
  }

  const fixedPlacements: FixedPlacement[] = [];
  const schedulableWorkload: SchedulableWorkload[] = [];
  const incompleteFixed: string[] = [];
  const allStaffWarnings: string[] = [];

  for (const w of workload) {
    const classDisplayName = classById.get(w.class_id)?.display_name ?? w.class_id;
    const { assignments, warnings } = resolveWorkloadStaff(w, staff, classDisplayName);

    if (warnings.length > 0) {
      allStaffWarnings.push(...warnings);
    }

    const subjUpper = String(w.subject_code || '').trim().toUpperCase();
    const isStep0ManagedCode =
      subjUpper === 'LANG' ||
      subjUpper === 'ENG' ||
      subjUpper === 'TAM' ||
      subjUpper === 'LAB';

    if (w.is_fixed) {
      // If Step 0 already manages fixed slots for this class and this is a legacy LANG/ENG/LAB row, skip safely
      const hasStep0ForClass = (fixedCoordSetByClass.get(w.class_id)?.size ?? 0) > 0;
      if (isStep0ManagedCode && hasStep0ForClass) {
        continue;
      }

      let slots = fixedSlotsByWorkload.get(w.id) ?? [];
      if (slots.length === 0 && w.fixed_day_order && w.fixed_period && w.hours_per_week === 1) {
        slots = [{ workload_id: w.id, day_order: w.fixed_day_order, period: w.fixed_period }];
      }

      if (slots.length === 0) {
        incompleteFixed.push(`${w.subject_code} (${classDisplayName})`);
        continue;
      }
      if (slots.length !== w.hours_per_week) {
        incompleteFixed.push(
          `${w.subject_code} (${classDisplayName}) — has ${slots.length} of ${w.hours_per_week} fixed hour(s) placed`
        );
        continue;
      }

      let slotIdx = 0;
      if (assignments.length > 0) {
        for (const assignment of assignments) {
          for (let h = 0; h < assignment.hours && slotIdx < slots.length; h++, slotIdx++) {
            const slot = slots[slotIdx];
            fixedPlacements.push({
              workloadId: w.id,
              classId: w.class_id,
              staffId: assignment.staffId,
              subjectCode: w.subject_code,
              dayOrder: slot.day_order,
              period: slot.period,
            });
          }
        }
      } else {
        for (const slot of slots) {
          fixedPlacements.push({
            workloadId: w.id,
            classId: w.class_id,
            staffId: w.staff_id,
            subjectCode: w.subject_code,
            dayOrder: slot.day_order,
            period: slot.period,
          });
        }
      }
    } else {
      if (assignments.length > 0) {
        for (const assignment of assignments) {
          schedulableWorkload.push({
            workloadId: w.id,
            classId: w.class_id,
            staffId: assignment.staffId,
            subjectCode: w.subject_code,
            hoursPerWeek: assignment.hours,
          });
        }
      } else {
        schedulableWorkload.push({
          workloadId: w.id,
          classId: w.class_id,
          staffId: w.staff_id,
          subjectCode: w.subject_code,
          hoursPerWeek: w.hours_per_week,
        });
      }
    }
  }

  if (incompleteFixed.length > 0) {
    return failure(
      `These legacy fixed subjects don't have all their weekly hours placed yet — update them or move LANG/ENG/LAB into Step 0: ${incompleteFixed.join('; ')}`,
      allStaffWarnings
    );
  }

  // If workload is empty, fallback to canonical ACCFIN rederivation + overlay Step 0 fixed slots
  if (schedulableWorkload.length === 0 && fixedPlacements.length === 0) {
    const rederivedEntries = rederiveTimetableEntries(initialClasses, initialStaff);

    // Overlay Step 0 fixed slots onto rederived entries
    for (const b of blockedSlots) {
      const targetClass =
        initialClasses.find(
          (c) =>
            c.id === b.classId ||
            c.id.replace('class-', '') === b.classId ||
            classById.get(b.classId)?.code === c.id.replace('class-', '') ||
            c.id.replace('class-', '').replace('-AF-', '-') ===
              (classById.get(b.classId)?.code || b.classId)
        ) || { id: b.classId };

      const entryId = `entry-${targetClass.id}-${b.dayOrder}-${b.period}`;
      const idx = rederivedEntries.findIndex(
        (e) =>
          e.id === entryId ||
          (e.classId === targetClass.id && e.dayOrder === b.dayOrder && e.period === b.period)
      );
      const fixedEntry: TimetableEntry = {
        id: entryId,
        classId: targetClass.id,
        dayOrder: b.dayOrder,
        period: b.period,
        subjectCode: b.slotType,
        isLab: b.slotType === 'LAB',
        excludedFromSubstitution: b.slotType === 'LANG' || b.slotType === 'ENG',
        staffIds: idx >= 0 && b.slotType === 'LAB' ? rederivedEntries[idx].staffIds : [],
      };
      if (idx >= 0) rederivedEntries[idx] = fixedEntry;
      else rederivedEntries.push(fixedEntry);
    }

    saveMemoryData({ timetableEntries: rederivedEntries });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accfin-timetable-updated', { detail: rederivedEntries }));
    }

    return {
      success: true,
      message: 'Generated timetable from department workload across all 11 classes (respecting Step 0 fixed slots).',
      classesAffected: initialClasses.length,
      slotsPlaced: rederivedEntries.length,
      unresolved: [],
      fixedClashes: [],
      consecutiveWarnings: [],
      sameDayRepeats: [],
      overSixHoursWarnings: [],
      attemptsUsed: 1,
      staffWarnings: allStaffWarnings,
    };
  }

  const result = generateSchedule(fixedPlacements, schedulableWorkload, {
    maxRestarts: 80,
    blockedSlots,
  });

  const affectedClassIds = Array.from(
    new Set([
      ...result.slots.map((s) => s.classId),
      ...blockedSlots.map((b) => b.classId),
    ])
  );

  // Save rich generated slot snapshot to local memory so Step 3 View works offline or online
  const workloadById = new Map<string, any>(workload.map((w) => [w.id, w]));
  const localSlotSnapshot = result.slots.map((s) => {
    const w = workloadById.get(s.workloadId);
    const st = staffById.get(s.staffId);
    return {
      id: `local-${s.classId}-${s.dayOrder}-${s.period}`,
      class_id: s.classId,
      day_order: s.dayOrder,
      period: s.period,
      workload_id: s.workloadId,
      staff_id: s.staffId,
      subject_code: s.subjectCode,
      subject_name: w?.subject_name || s.subjectCode,
      staff_short_code: st?.short_code || s.staffId,
      staff_full_name: st?.full_name || 'Unknown',
      is_fixed: s.isFixed,
      is_clash: false,
      clash_reason: null,
    };
  });
  saveGeneratedSlotsMemory(localSlotSnapshot);

  if (affectedClassIds.length > 0) {
    try {
      const { error: deleteErr } = await supabase.from('tt_slots').delete().in('class_id', affectedClassIds);
      if (!deleteErr && result.slots.length > 0) {
        const rowsToInsert = result.slots.map((s) => ({
          class_id: s.classId,
          day_order: s.dayOrder,
          period: s.period,
          workload_id: s.workloadId,
          is_clash: false,
        }));
        await supabase.from('tt_slots').insert(rowsToInsert);
      }
    } catch {
      // Non-fatal if tt_slots table has constraints or offline
    }

    // Backfill BOTH Step 0 fixed slots and generated slots into timetableEntries for Daily Log Sheet
    const memory = loadMemoryData();
    const existingEntries = memory.timetableEntries || [];
    const updatedEntries: TimetableEntry[] = [...existingEntries];

    const resolveTargetSeedClassId = (cid: string): string => {
      const targetClass =
        initialClasses.find(
          (c) =>
            c.id === cid ||
            c.id.replace('class-', '') === cid ||
            classById.get(cid)?.code === c.id.replace('class-', '') ||
            c.id.replace('class-', '').replace('-AF-', '-') === (classById.get(cid)?.code || cid)
        ) || { id: cid };
      return targetClass.id;
    };

    // 1. Write Step 0 fixed slots (LANG, ENG, LAB)
    for (const b of blockedSlots) {
      const targetCid = resolveTargetSeedClassId(b.classId);
      const entryId = `entry-${targetCid}-${b.dayOrder}-${b.period}`;
      const entryIdx = updatedEntries.findIndex(
        (e) =>
          e.id === entryId ||
          (e.classId === targetCid && e.dayOrder === b.dayOrder && e.period === b.period)
      );

      const newEntry: TimetableEntry = {
        id: entryId,
        classId: targetCid,
        dayOrder: b.dayOrder,
        period: b.period,
        subjectCode: b.slotType,
        isLab: b.slotType === 'LAB',
        excludedFromSubstitution: b.slotType === 'LANG' || b.slotType === 'ENG',
        staffIds: entryIdx >= 0 && b.slotType === 'LAB' ? updatedEntries[entryIdx].staffIds : [],
      };

      if (entryIdx >= 0) updatedEntries[entryIdx] = newEntry;
      else updatedEntries.push(newEntry);
    }

    // 2. Write generated departmental subject slots
    for (const slot of result.slots) {
      const targetCid = resolveTargetSeedClassId(slot.classId);
      const entryId = `entry-${targetCid}-${slot.dayOrder}-${slot.period}`;
      const entryIdx = updatedEntries.findIndex(
        (e) =>
          e.id === entryId ||
          (e.classId === targetCid && e.dayOrder === slot.dayOrder && e.period === slot.period)
      );

      const isLab = slot.subjectCode.toUpperCase().includes('LAB') || slot.subjectCode === 'CAB';
      const isExcluded = slot.subjectCode === 'LANG' || slot.subjectCode === 'ENG';

      const newEntry: TimetableEntry = {
        id: entryId,
        classId: targetCid,
        dayOrder: slot.dayOrder,
        period: slot.period,
        subjectCode: slot.subjectCode,
        isLab,
        excludedFromSubstitution: isExcluded,
        staffIds: [slot.staffId],
      };

      if (entryIdx >= 0) updatedEntries[entryIdx] = newEntry;
      else updatedEntries.push(newEntry);
    }

    saveMemoryData({ timetableEntries: updatedEntries });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('accfin-timetable-updated', { detail: updatedEntries }));
    }
  }

  const unresolvedSummary = result.unresolved.map((u) => {
    const st = staffById.get(u.staffId) ?? findTTStaff(staff, u.staffId);
    return {
      classCode: classById.get(u.classId)?.display_name ?? u.classId,
      subjectCode: u.subjectCode,
      staffCode: st?.short_code ?? u.staffId,
      staffName: st?.full_name ?? u.staffId,
      missingHours: u.missingHours,
    };
  });

  const fixedClashSummary = result.fixedClashes.map((c) => ({
    reason: c.reason,
    classCode: classById.get(c.classId)?.display_name ?? c.classId,
    dayOrder: c.dayOrder,
    period: c.period,
  }));

  const consecutiveWarningsSummary = result.consecutiveWarnings.map((cw) => {
    const st = staffById.get(cw.staffId) ?? findTTStaff(staff, cw.staffId);
    const staffCode = st?.short_code ?? cw.staffId;
    const staffName = st?.full_name ?? cw.staffId;
    const dayOrderLabel =
      DAY_ORDER_LABELS[cw.dayOrder as keyof typeof DAY_ORDER_LABELS] ?? String(cw.dayOrder);
    return {
      staffId: cw.staffId,
      staffCode,
      staffName,
      dayOrder: cw.dayOrder,
      dayOrderLabel,
      periodA: cw.periodA,
      periodB: cw.periodB,
      text: `${staffCode} - Day Order ${dayOrderLabel}: P${cw.periodA}, P${cw.periodB} adjacent`,
    };
  });

  const sameDayRepeatsSummary = result.sameDaySubjectRepeats.map((r) => {
    const classDisplayName = classById.get(r.classId)?.display_name ?? r.classId;
    const dayOrderLabel =
      DAY_ORDER_LABELS[r.dayOrder as keyof typeof DAY_ORDER_LABELS] ?? String(r.dayOrder);
    return {
      classId: r.classId,
      classCode: classDisplayName,
      subjectCode: r.subjectCode,
      dayOrder: r.dayOrder,
      dayOrderLabel,
      count: r.count,
      text: `${classDisplayName}, ${r.subjectCode}: ${r.count} periods on Day Order ${dayOrderLabel}`,
    };
  });

  const overSixHoursSummary = result.overSixHoursSubjects.map((o) => {
    const classDisplayName = classById.get(o.classId)?.display_name ?? o.classId;
    return {
      classId: o.classId,
      classCode: classDisplayName,
      subjectCode: o.subjectCode,
      totalHours: o.totalHours,
      text: `${classDisplayName}, ${o.subjectCode}: ${o.totalHours} weekly hours (exceeds 6 Day Orders)`,
    };
  });

  try {
    await supabase.from('tt_generation_runs').insert({
      classes_affected: affectedClassIds.length,
      slots_placed: result.slots.length + blockedSlots.length,
      unresolved_count: result.unresolved.length,
      fixed_clash_count: result.fixedClashes.length,
      attempts_used: result.attemptsUsed,
      details: {
        unresolved: unresolvedSummary,
        fixedClashes: fixedClashSummary,
        consecutiveWarnings: consecutiveWarningsSummary,
        sameDayRepeats: sameDayRepeatsSummary,
        overSixHoursWarnings: overSixHoursSummary,
        staffWarnings: allStaffWarnings,
      },
    });
  } catch {
    // Non-fatal
  }

  const hasUnresolvedOrClash =
    result.unresolved.length > 0 || result.fixedClashes.length > 0;
  const hasSameDayRepeat = sameDayRepeatsSummary.length > 0 || overSixHoursSummary.length > 0;
  const hasConsecutive = consecutiveWarningsSummary.length > 0;

  return {
    success: true,
    message:
      !hasUnresolvedOrClash && !hasSameDayRepeat && !hasConsecutive
        ? `Generated a complete, clash-free timetable across ${affectedClassIds.length} classes (${blockedSlots.length} Step 0 fixed slots preserved).`
        : hasUnresolvedOrClash
          ? `Generated with ${result.unresolved.length} unplaced hour(s) and ${result.fixedClashes.length} fixed-slot clash(es) — see report below.`
          : hasSameDayRepeat
            ? `Generated across ${affectedClassIds.length} classes with ${sameDayRepeatsSummary.length} same-day subject repeat(s) — see report below.`
            : `Generated a clash-free timetable across ${affectedClassIds.length} classes with ${consecutiveWarningsSummary.length} unavoidable back-to-back period warning(s).`,
    classesAffected: affectedClassIds.length,
    slotsPlaced: result.slots.length + blockedSlots.length,
    unresolved: unresolvedSummary,
    fixedClashes: fixedClashSummary,
    consecutiveWarnings: consecutiveWarningsSummary,
    sameDayRepeats: sameDayRepeatsSummary,
    overSixHoursWarnings: overSixHoursSummary,
    attemptsUsed: result.attemptsUsed,
    staffWarnings: allStaffWarnings,
  };
}

function failure(message: string, staffWarnings: string[] = []): GenerateRunSummary {
  return {
    success: false,
    message,
    classesAffected: 0,
    slotsPlaced: 0,
    unresolved: [],
    fixedClashes: [],
    consecutiveWarnings: [],
    sameDayRepeats: [],
    overSixHoursWarnings: [],
    attemptsUsed: 0,
    staffWarnings,
  };
}
