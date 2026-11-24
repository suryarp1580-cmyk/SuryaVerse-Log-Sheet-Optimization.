// ============================================================================
// ACCFIN Timetable Generator — View Data Layer (Vite port)
// Merges Step 0 Fixed Periods (LANG, ENG, LAB) into Class Timetable View
// and supports both live Supabase and resilient local storage fallback.
// ============================================================================

import { supabase, getActiveSupabaseUrl, getActiveSupabaseAnonKey } from '../supabaseClient';
import type { ClassTimetableData, StaffTimetableData, GridCell, GridCellMap } from './grid-types';
import { slotKey } from './grid-types';
import type { FixedPeriodsByClass, FormActionResult, TTClass, TTFixedPeriodSlot, TTStaff, TTWorkload } from './types';
import { getFixedSlotsForClass } from './fixed-periods-api';
import {
  loadFixedPeriodsMemory,
  loadGeneratedSlotsMemory,
  loadTTStaffMemory,
  loadWorkloadMemory,
} from '../memoryStorage';

function fixedTypeLabel(slotType: string): string {
  if (slotType === 'LANG') return 'Language (Fixed)';
  if (slotType === 'ENG') return 'English (Fixed)';
  return 'Lab / Practical (Fixed)';
}

function mergeStep0FixedCellsAndLegend(
  classId: string,
  classCode: string,
  classDisplayName: string,
  cells: GridCellMap,
  legend: ClassTimetableData['legend'],
  fixedSlots: TTFixedPeriodSlot[]
) {
  const counts: Record<string, number> = {};
  for (const fs of fixedSlots) {
    const key = slotKey(fs.day_order, fs.period);
    if (!cells[key]) {
      cells[key] = {
        slotId: `fixed-step0-${classId}-${fs.day_order}-${fs.period}`,
        workloadId: '',
        subjectCode: fs.slot_type,
        subjectName: fixedTypeLabel(fs.slot_type),
        staffShortCode: 'FIXED',
        staffName: 'Step 0 Fixed Period',
        classCode,
        classDisplayName,
        isFixed: true,
        isClash: false,
        clashReason: null,
      };
    }
    counts[fs.slot_type] = (counts[fs.slot_type] ?? 0) + 1;
  }

  for (const [stype, hrs] of Object.entries(counts)) {
    const alreadyInLegend = legend.some((l) => l.subjectCode.toUpperCase() === stype);
    if (!alreadyInLegend) {
      legend.push({
        subjectCode: stype,
        subjectName: fixedTypeLabel(stype),
        hoursPerWeek: hrs,
        staffName: 'College Fixed (Step 0)',
      });
    }
  }
}

async function fetchFixedPeriodsForClass(classId: string, classCode?: string): Promise<TTFixedPeriodSlot[]> {
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const mockClasses: TTClass[] = classCode
    ? [{ id: classId, code: classCode, display_name: classCode, sort_order: 0 }]
    : [];
  const localSlots = getFixedSlotsForClass(memFixed, classId, mockClasses);

  try {
    const { data, error } = await supabase
      .from('tt_fixed_periods')
      .select('*')
      .eq('class_id', classId);
    if (!error && Array.isArray(data) && data.length > 0) {
      return data as TTFixedPeriodSlot[];
    }
  } catch {
    // Silent fallback to local memory
  }
  return localSlots;
}

export async function getClassList(): Promise<TTClass[]> {
  const { data, error } = await supabase.from('tt_classes').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStaffList(): Promise<TTStaff[]> {
  const { data, error } = await supabase.from('tt_staff').select('*').eq('status', 'ACTIVE').order('full_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getClassTimetable(classId: string, forceLive = false): Promise<ClassTimetableData> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        };
        const [classRes, workloadRes, slotsRes] = await Promise.all([
          fetch(`${url}/rest/v1/tt_classes?id=eq.${classId}&select=*&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_workload?class_id=eq.${classId}&select=*,staff:tt_staff(*)&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_slots?class_id=eq.${classId}&select=*,workload:tt_workload(*,staff:tt_staff(*))&_ts=${Date.now()}`, { headers }),
        ]);

        if (classRes.ok && workloadRes.ok && slotsRes.ok) {
          const classRows = await classRes.json();
          const classRow = classRows?.[0];
          if (classRow) {
            const workload = await workloadRes.json();
            const slots = await slotsRes.json();

            const cells: GridCellMap = {};
            const placedHoursByWorkload = new Map<string, number>();

            for (const slot of slots ?? []) {
              const w = slot.workload as any;
              if (!w) continue;
              const key = slotKey(slot.day_order, slot.period);
              const cell: GridCell = {
                slotId: slot.id,
                workloadId: w.id,
                subjectCode: w.subject_code,
                subjectName: w.subject_name,
                staffShortCode: w.staff?.short_code ?? '?',
                staffName: w.staff?.full_name ?? 'Unknown',
                classCode: classRow.code,
                classDisplayName: classRow.display_name,
                isFixed: w.is_fixed,
                isClash: slot.is_clash,
                clashReason: slot.clash_reason,
              };
              cells[key] = cell;
              placedHoursByWorkload.set(w.id, (placedHoursByWorkload.get(w.id) ?? 0) + 1);
            }

            const unresolved = (workload ?? [])
              .map((w: any) => {
                const placed = placedHoursByWorkload.get(w.id) ?? 0;
                const missingHours = w.hours_per_week - placed;
                return {
                  workloadId: w.id,
                  subjectCode: w.subject_code,
                  subjectName: w.subject_name,
                  staffShortCode: w.staff?.short_code ?? '?',
                  staffName: w.staff?.full_name ?? 'Unknown',
                  missingHours,
                };
              })
              .filter((u: any) => u.missingHours > 0);

            const legend: ClassTimetableData['legend'] = (workload ?? []).map((w: any) => ({
              subjectCode: w.subject_code,
              subjectName: w.subject_name,
              hoursPerWeek: w.hours_per_week,
              staffName: w.staff?.full_name ?? 'Unknown',
            }));

            const fixedSlots = await fetchFixedPeriodsForClass(classId, classRow.code);
            mergeStep0FixedCellsAndLegend(classId, classRow.code, classRow.display_name, cells, legend, fixedSlots);

            return { classId, classDisplayName: classRow.display_name, cells, unresolved, legend };
          }
        }
      } catch {
        // Fall through to standard Supabase / local fallback
      }
    }
  }

  try {
    const [{ data: classRow, error: classErr }, { data: workload, error: workloadErr }, { data: slots, error: slotsErr }] =
      await Promise.all([
        supabase.from('tt_classes').select('*').eq('id', classId).single(),
        supabase.from('tt_workload').select('*, staff:tt_staff(*)').eq('class_id', classId),
        supabase.from('tt_slots').select('*, workload:tt_workload(*, staff:tt_staff(*))').eq('class_id', classId),
      ]);

    if (!classErr && !workloadErr && !slotsErr && classRow) {
      const cells: GridCellMap = {};
      const placedHoursByWorkload = new Map<string, number>();

      for (const slot of slots ?? []) {
        const w = slot.workload as any;
        if (!w) continue;
        const key = slotKey(slot.day_order, slot.period);
        const cell: GridCell = {
          slotId: slot.id,
          workloadId: w.id,
          subjectCode: w.subject_code,
          subjectName: w.subject_name,
          staffShortCode: w.staff?.short_code ?? '?',
          staffName: w.staff?.full_name ?? 'Unknown',
          classCode: classRow.code,
          classDisplayName: classRow.display_name,
          isFixed: w.is_fixed,
          isClash: slot.is_clash,
          clashReason: slot.clash_reason,
        };
        cells[key] = cell;
        placedHoursByWorkload.set(w.id, (placedHoursByWorkload.get(w.id) ?? 0) + 1);
      }

      // If DB tt_slots is empty, check local generated slots snapshot
      if ((!slots || slots.length === 0)) {
        const localGenerated = loadGeneratedSlotsMemory().filter((s: any) => s.class_id === classId);
        for (const s of localGenerated) {
          const key = slotKey(s.day_order, s.period);
          if (!cells[key]) {
            cells[key] = {
              slotId: s.id,
              workloadId: s.workload_id,
              subjectCode: s.subject_code,
              subjectName: s.subject_name,
              staffShortCode: s.staff_short_code ?? '?',
              staffName: s.staff_full_name ?? 'Unknown',
              classCode: classRow.code,
              classDisplayName: classRow.display_name,
              isFixed: Boolean(s.is_fixed),
              isClash: Boolean(s.is_clash),
              clashReason: s.clash_reason ?? null,
            };
            placedHoursByWorkload.set(s.workload_id, (placedHoursByWorkload.get(s.workload_id) ?? 0) + 1);
          }
        }
      }

      const effectiveWorkload =
        workload && workload.length > 0
          ? workload
          : (loadWorkloadMemory()[classId] as unknown as TTWorkload[]) ?? [];

      const unresolved = effectiveWorkload
        .map((w: any) => {
          const placed = placedHoursByWorkload.get(w.id) ?? 0;
          const missingHours = w.hours_per_week - placed;
          return {
            workloadId: w.id,
            subjectCode: w.subject_code,
            subjectName: w.subject_name,
            staffShortCode: w.staff?.short_code ?? '?',
            staffName: w.staff?.full_name ?? 'Unknown',
            missingHours,
          };
        })
        .filter((u) => u.missingHours > 0);

      const legend: ClassTimetableData['legend'] = effectiveWorkload.map((w: any) => ({
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        hoursPerWeek: w.hours_per_week,
        staffName: w.staff?.full_name ?? 'Unknown',
      }));

      const fixedSlots = await fetchFixedPeriodsForClass(classId, classRow.code);
      mergeStep0FixedCellsAndLegend(classId, classRow.code, classRow.display_name, cells, legend, fixedSlots);

      return { classId, classDisplayName: classRow.display_name, cells, unresolved, legend };
    }
  } catch {
    // Fall back to local memory below
  }

  // Offline / Unmigrated Supabase Resilient Fallback
  const cells: GridCellMap = {};
  const placedHoursByWorkload = new Map<string, number>();
  const localGenerated = loadGeneratedSlotsMemory().filter((s: any) => s.class_id === classId);
  const localWorkload = (loadWorkloadMemory()[classId] as unknown as TTWorkload[]) ?? [];

  for (const s of localGenerated) {
    const key = slotKey(s.day_order, s.period);
    cells[key] = {
      slotId: s.id,
      workloadId: s.workload_id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      staffShortCode: s.staff_short_code ?? '?',
      staffName: s.staff_full_name ?? 'Unknown',
      classCode: classId,
      classDisplayName: classId,
      isFixed: Boolean(s.is_fixed),
      isClash: Boolean(s.is_clash),
      clashReason: s.clash_reason ?? null,
    };
    placedHoursByWorkload.set(s.workload_id, (placedHoursByWorkload.get(s.workload_id) ?? 0) + 1);
  }

  const unresolved = localWorkload
    .map((w: any) => {
      const placed = placedHoursByWorkload.get(w.id) ?? 0;
      const missingHours = w.hours_per_week - placed;
      return {
        workloadId: w.id,
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        staffShortCode: w.staff?.short_code ?? '?',
        staffName: w.staff?.full_name ?? 'Unknown',
        missingHours,
      };
    })
    .filter((u) => u.missingHours > 0);

  const legend: ClassTimetableData['legend'] = localWorkload.map((w: any) => ({
    subjectCode: w.subject_code,
    subjectName: w.subject_name,
    hoursPerWeek: w.hours_per_week,
    staffName: w.staff?.full_name ?? 'Unknown',
  }));

  const fixedSlots = await fetchFixedPeriodsForClass(classId, classId);
  mergeStep0FixedCellsAndLegend(classId, classId, classId, cells, legend, fixedSlots);

  return { classId, classDisplayName: classId, cells, unresolved, legend };
}

export async function getStaffTimetable(staffId: string, forceLive = false): Promise<StaffTimetableData> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        };
        const [staffRes, slotsRes, workloadRes] = await Promise.all([
          fetch(`${url}/rest/v1/tt_staff?id=eq.${staffId}&select=*&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_slots?select=*,workload:tt_workload(*,class:tt_classes(*))&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_workload?staff_id=eq.${staffId}&select=*,class:tt_classes(*)&_ts=${Date.now()}`, { headers }),
        ]);

        if (staffRes.ok && slotsRes.ok && workloadRes.ok) {
          const staffRows = await staffRes.json();
          const staffRow = staffRows?.[0];
          if (staffRow) {
            const allSlots = await slotsRes.json();
            const workload = await workloadRes.json();

            const cells: GridCellMap = {};
            let totalHours = 0;

            for (const slot of allSlots ?? []) {
              const w = slot.workload as any;
              if (!w || w.staff_id !== staffId) continue;
              const key = slotKey(slot.day_order, slot.period);
              cells[key] = {
                slotId: slot.id,
                workloadId: w.id,
                subjectCode: w.subject_code,
                subjectName: w.subject_name,
                staffShortCode: '',
                staffName: staffRow.full_name,
                classCode: w.class?.code ?? '',
                classDisplayName: w.class?.display_name ?? 'Unknown class',
                isFixed: w.is_fixed,
                isClash: slot.is_clash,
                clashReason: slot.clash_reason,
              };
              totalHours += 1;
            }

            const legend = (workload ?? []).map((w: any) => ({
              classDisplayName: w.class?.display_name ?? 'Unknown class',
              subjectCode: w.subject_code,
              subjectName: w.subject_name,
              hoursPerWeek: w.hours_per_week,
            }));

            return { staffId, staffName: staffRow.full_name, totalHours, cells, legend };
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  try {
    const [{ data: staffRow, error: staffErr }, { data: slots, error: slotsErr }, { data: workload, error: workloadErr }] =
      await Promise.all([
        supabase.from('tt_staff').select('*').eq('id', staffId).single(),
        supabase.from('tt_slots').select('*, workload:tt_workload(*, class:tt_classes(*))').eq('workload.staff_id', staffId),
        supabase.from('tt_workload').select('*, class:tt_classes(*)').eq('staff_id', staffId),
      ]);

    if (!staffErr && !slotsErr && !workloadErr && staffRow) {
      const cells: GridCellMap = {};
      let totalHours = 0;

      for (const slot of slots ?? []) {
        const w = slot.workload as any;
        if (!w || w.staff_id !== staffId) continue;
        const key = slotKey(slot.day_order, slot.period);
        cells[key] = {
          slotId: slot.id,
          workloadId: w.id,
          subjectCode: w.subject_code,
          subjectName: w.subject_name,
          staffShortCode: '',
          staffName: staffRow.full_name,
          classCode: w.class?.code ?? '',
          classDisplayName: w.class?.display_name ?? 'Unknown class',
          isFixed: w.is_fixed,
          isClash: slot.is_clash,
          clashReason: slot.clash_reason,
        };
        totalHours += 1;
      }

      const legend = (workload ?? []).map((w: any) => ({
        classDisplayName: w.class?.display_name ?? 'Unknown class',
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        hoursPerWeek: w.hours_per_week,
      }));

      return { staffId, staffName: staffRow.full_name, totalHours, cells, legend };
    }
  } catch {
    // Offline fallback below
  }

  const memStaff = (loadTTStaffMemory() as TTStaff[]).find((s) => s.id === staffId);
  const staffName = memStaff?.full_name ?? staffId;
  const localSlots = loadGeneratedSlotsMemory().filter((s: any) => s.staff_id === staffId);
  const cells: GridCellMap = {};
  let totalHours = 0;

  for (const s of localSlots) {
    const key = slotKey(s.day_order, s.period);
    cells[key] = {
      slotId: s.id,
      workloadId: s.workload_id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      staffShortCode: '',
      staffName,
      classCode: s.class_id,
      classDisplayName: s.class_id,
      isFixed: Boolean(s.is_fixed),
      isClash: Boolean(s.is_clash),
      clashReason: s.clash_reason ?? null,
    };
    totalHours += 1;
  }

  return { staffId, staffName, totalHours, cells, legend: [] };
}

export async function manuallyPlaceSlot(
  classId: string,
  dayOrder: number,
  period: number,
  workloadId: string
): Promise<FormActionResult> {
  // Block placement into Step 0 Fixed Period slots
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const fixedForClass = getFixedSlotsForClass(memFixed, classId);
  const step0Match = fixedForClass.find(
    (s) => s.day_order === dayOrder && s.period === period
  );
  if (step0Match) {
    return {
      success: false,
      message: `Day Order ${dayOrder}, Period ${period} is locked as ${step0Match.slot_type} in Step 0. Choose an open slot instead.`,
    };
  }

  const { data: existing, error: existingErr } = await supabase
    .from('tt_slots')
    .select('id')
    .eq('class_id', classId)
    .eq('day_order', dayOrder)
    .eq('period', period)
    .maybeSingle();

  if (existingErr) return { success: false, message: `Could not check slot: ${existingErr.message}` };
  if (existing) return { success: false, message: 'That slot is already occupied. Remove it first, then place here.' };

  const { data: workloadRow, error: workloadErr } = await supabase
    .from('tt_workload')
    .select('*')
    .eq('id', workloadId)
    .single();

  if (workloadErr || !workloadRow) return { success: false, message: 'Could not find that subject.' };

  const { data: staffConflicts, error: conflictErr } = await supabase
    .from('tt_slots')
    .select('id, class_id, workload:tt_workload!inner(staff_id)')
    .eq('day_order', dayOrder)
    .eq('period', period)
    .eq('workload.staff_id', workloadRow.staff_id)
    .neq('class_id', classId);

  if (conflictErr) return { success: false, message: `Could not check for clashes: ${conflictErr.message}` };

  const isClash = (staffConflicts?.length ?? 0) > 0;
  const clashReason = isClash
    ? `This staff member is already teaching a different class at Day Order ${dayOrder}, Period ${period}.`
    : null;

  const { error: insertErr } = await supabase.from('tt_slots').insert({
    class_id: classId,
    day_order: dayOrder,
    period: period,
    workload_id: workloadId,
    is_clash: isClash,
    clash_reason: clashReason,
  });

  if (insertErr) return { success: false, message: `Failed to place: ${insertErr.message}` };

  if (isClash && staffConflicts) {
    const counterpartIds = staffConflicts.map((c) => c.id);
    const { error: counterpartErr } = await supabase
      .from('tt_slots')
      .update({
        is_clash: true,
        clash_reason: `This staff member is also placed into a different class at Day Order ${dayOrder}, Period ${period}.`,
      })
      .in('id', counterpartIds);
    if (counterpartErr) {
      return {
        success: true,
        message: `Placed, but this creates a staff clash — shown in red. (Note: the other class's cell may not have been re-flagged: ${counterpartErr.message})`,
      };
    }
  }

  return {
    success: true,
    message: isClash
      ? 'Placed, but this creates a staff clash — shown in red on both classes involved. Move it to resolve.'
      : 'Placed successfully.',
  };
}

export async function removeSlot(slotId: string): Promise<FormActionResult> {
  const { data: removedSlot, error: fetchErr } = await supabase
    .from('tt_slots')
    .select('id, day_order, period, class_id, workload:tt_workload(staff_id)')
    .eq('id', slotId)
    .maybeSingle();

  if (fetchErr) return { success: false, message: `Could not look up slot: ${fetchErr.message}` };

  const { error } = await supabase.from('tt_slots').delete().eq('id', slotId);
  if (error) return { success: false, message: `Failed to remove: ${error.message}` };

  const staffId = (removedSlot?.workload as any)?.staff_id;
  if (removedSlot && staffId) {
    const { data: remaining, error: remainingErr } = await supabase
      .from('tt_slots')
      .select('id, workload:tt_workload!inner(staff_id)')
      .eq('day_order', removedSlot.day_order)
      .eq('period', removedSlot.period)
      .eq('workload.staff_id', staffId);

    if (!remainingErr && remaining && remaining.length <= 1) {
      const remainingIds = remaining.map((r) => r.id);
      if (remainingIds.length > 0) {
        await supabase.from('tt_slots').update({ is_clash: false, clash_reason: null }).in('id', remainingIds);
      }
    }
  }

  return { success: true, message: 'Removed.' };
}
