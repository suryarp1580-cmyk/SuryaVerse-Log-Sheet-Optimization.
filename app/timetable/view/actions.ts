'use server';

// ============================================================================
// ACCFIN Timetable Generator — Timetable View Actions
// ----------------------------------------------------------------------------
// Reads tt_slots + tt_workload for display, and lets the HOD manually place
// an unresolved subject into an empty slot (or remove a placed one) without
// re-running the whole generator. Manual placements that would double-book a
// staff member are still saved — but flagged is_clash = true so the grid
// shows them in red until the HOD moves them again.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { ClassTimetableData, StaffTimetableData, GridCell, GridCellMap } from '@/lib/timetable/grid-types';
import { slotKey } from '@/lib/timetable/grid-types';
import type { FormActionResult, TTClass, TTStaff } from '@/lib/timetable/types';

export async function getClassList(): Promise<TTClass[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from('tt_classes').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStaffList(): Promise<TTStaff[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tt_staff')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('full_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getClassTimetable(classId: string): Promise<ClassTimetableData> {
  const supabase = createClient();

  const [{ data: classRow, error: classErr }, { data: workload, error: workloadErr }, { data: slots, error: slotsErr }] =
    await Promise.all([
      supabase.from('tt_classes').select('*').eq('id', classId).single(),
      supabase.from('tt_workload').select('*, staff:tt_staff(*)').eq('class_id', classId),
      supabase
        .from('tt_slots')
        .select('*, workload:tt_workload(*, staff:tt_staff(*))')
        .eq('class_id', classId),
    ]);

  if (classErr) throw new Error(`Class not found: ${classErr.message}`);
  if (workloadErr) throw new Error(workloadErr.message);
  if (slotsErr) throw new Error(slotsErr.message);

  const cells: GridCellMap = {};
  const placedHoursByWorkload = new Map<string, number>();

  for (const slot of slots ?? []) {
    const w = slot.workload as any;
    if (!w) continue; // workload was deleted after the slot was generated — skip defensively
    const key = slotKey(slot.day_order, slot.period);
    const cell: GridCell = {
      slotId: slot.id,
      workloadId: w.id,
      subjectCode: w.subject_code,
      subjectName: w.subject_name,
      staffShortCode: w.staff?.short_code ?? '?',
      staffName: w.staff?.full_name ?? 'Unknown',
      classCode: classRow!.code,
      classDisplayName: classRow!.display_name,
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
    .filter((u) => u.missingHours > 0);

  const legend = (workload ?? []).map((w: any) => ({
    subjectCode: w.subject_code,
    subjectName: w.subject_name,
    hoursPerWeek: w.hours_per_week,
    staffName: w.staff?.full_name ?? 'Unknown',
  }));

  return {
    classId,
    classDisplayName: classRow!.display_name,
    cells,
    unresolved,
    legend,
  };
}

export async function getStaffTimetable(staffId: string): Promise<StaffTimetableData> {
  const supabase = createClient();

  const [{ data: staffRow, error: staffErr }, { data: slots, error: slotsErr }, { data: workload, error: workloadErr }] =
    await Promise.all([
      supabase.from('tt_staff').select('*').eq('id', staffId).single(),
      supabase
        .from('tt_slots')
        .select('*, workload:tt_workload(*, class:tt_classes(*))')
        .eq('workload.staff_id', staffId),
      supabase.from('tt_workload').select('*, class:tt_classes(*)').eq('staff_id', staffId),
    ]);

  if (staffErr) throw new Error(`Staff not found: ${staffErr.message}`);
  if (slotsErr) throw new Error(slotsErr.message);
  if (workloadErr) throw new Error(workloadErr.message);

  const cells: GridCellMap = {};
  let totalHours = 0;

  for (const slot of slots ?? []) {
    const w = slot.workload as any;
    // The `.eq('workload.staff_id', ...)` filter above is applied to the
    // joined table; rows where the join didn't match come back with
    // workload = null, so skip those explicitly.
    if (!w || w.staff_id !== staffId) continue;
    const key = slotKey(slot.day_order, slot.period);
    cells[key] = {
      slotId: slot.id,
      workloadId: w.id,
      subjectCode: w.subject_code,
      subjectName: w.subject_name,
      staffShortCode: '',
      staffName: staffRow!.full_name,
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

  return {
    staffId,
    staffName: staffRow!.full_name,
    totalHours,
    cells,
    legend,
  };
}

export async function manuallyPlaceSlot(
  classId: string,
  dayOrder: number,
  period: number,
  workloadId: string
): Promise<FormActionResult> {
  const supabase = createClient();

  // Refuse to overwrite an occupied slot — the HOD must remove it first,
  // so nothing is silently lost.
  const { data: existing, error: existingErr } = await supabase
    .from('tt_slots')
    .select('id')
    .eq('class_id', classId)
    .eq('day_order', dayOrder)
    .eq('period', period)
    .maybeSingle();

  if (existingErr) return { success: false, message: `Could not check slot: ${existingErr.message}` };
  if (existing) {
    return { success: false, message: 'That slot is already occupied. Remove it first, then place here.' };
  }

  const { data: workloadRow, error: workloadErr } = await supabase
    .from('tt_workload')
    .select('*')
    .eq('id', workloadId)
    .single();

  if (workloadErr || !workloadRow) {
    return { success: false, message: 'Could not find that subject.' };
  }

  // Check whether the staff member is already teaching a DIFFERENT class at
  // this exact Day Order + Period — if so, still save it, but flag it as a
  // clash so it's visibly red until the HOD resolves it.
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

  revalidatePath('/timetable/view');

  return {
    success: true,
    message: isClash
      ? 'Placed, but this creates a staff clash — shown in red. Move it to resolve.'
      : 'Placed successfully.',
  };
}

export async function removeSlot(slotId: string): Promise<FormActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from('tt_slots').delete().eq('id', slotId);
  if (error) return { success: false, message: `Failed to remove: ${error.message}` };
  revalidatePath('/timetable/view');
  return { success: true, message: 'Removed.' };
}
