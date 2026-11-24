// ============================================================================
// ACCFIN Timetable Generator — Generate Data Layer (Vite port)
// PORTED FROM: app/timetable/generate/actions.ts (Next.js Server Action)
// ============================================================================

import { supabase } from '../supabaseClient';
import { generateSchedule, type FixedPlacement, type SchedulableWorkload } from './scheduler';
import type { TTStaff, TTClass } from './types';

export interface GenerateRunSummary {
  success: boolean;
  message: string;
  classesAffected: number;
  slotsPlaced: number;
  unresolved: Array<{ classCode: string; subjectCode: string; staffName: string; missingHours: number }>;
  fixedClashes: Array<{ reason: string; classCode: string; dayOrder: number; period: number }>;
  attemptsUsed: number;
}

export async function runGenerateSchedule(): Promise<GenerateRunSummary> {
  const [
    { data: classes, error: classesErr },
    { data: staff, error: staffErr },
    { data: workload, error: workloadErr },
    { data: fixedSlotRows, error: fixedSlotErr },
  ] = await Promise.all([
    supabase.from('tt_classes').select('*'),
    supabase.from('tt_staff').select('*'),
    supabase.from('tt_workload').select('*'),
    supabase.from('tt_fixed_slots').select('*'),
  ]);

  if (classesErr) return failure(`Could not load classes: ${classesErr.message}`);
  if (staffErr) return failure(`Could not load staff: ${staffErr.message}`);
  if (workloadErr) return failure(`Could not load workload: ${workloadErr.message}`);
  if (fixedSlotErr) return failure(`Could not load fixed slots: ${fixedSlotErr.message}`);
  if (!classes || classes.length === 0) return failure('No classes found — check tt_classes has data.');
  if (!workload || workload.length === 0) {
    return failure('No workload entries found. Add subjects via the Workload Entry tab first.');
  }

  const classById = new Map<string, TTClass>((classes as TTClass[]).map((c) => [c.id, c]));
  const staffById = new Map<string, TTStaff>((staff as TTStaff[]).map((s) => [s.id, s]));

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

  for (const w of workload) {
    if (w.is_fixed) {
      const slots = fixedSlotsByWorkload.get(w.id) ?? [];
      if (slots.length === 0) {
        incompleteFixed.push(`${w.subject_code} (${classById.get(w.class_id)?.display_name ?? w.class_id})`);
        continue;
      }
      if (slots.length !== w.hours_per_week) {
        incompleteFixed.push(
          `${w.subject_code} (${classById.get(w.class_id)?.display_name ?? w.class_id}) — has ${slots.length} of ${w.hours_per_week} fixed hour(s) placed`
        );
        continue;
      }
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

  if (incompleteFixed.length > 0) {
    return failure(
      `These fixed subjects don't have all their weekly hours placed yet — finish setting their slots on the Workload Entry tab before generating: ${incompleteFixed.join('; ')}`
    );
  }

  const result = generateSchedule(fixedPlacements, schedulableWorkload, { maxRestarts: 80 });

  const affectedClassIds = Array.from(new Set(result.slots.map((s) => s.classId)));

  if (affectedClassIds.length > 0) {
    const { error: deleteErr } = await supabase.from('tt_slots').delete().in('class_id', affectedClassIds);
    if (deleteErr) return failure(`Failed to clear old slots: ${deleteErr.message}`);

    const rowsToInsert = result.slots.map((s) => ({
      class_id: s.classId,
      day_order: s.dayOrder,
      period: s.period,
      workload_id: s.workloadId,
      is_clash: false,
    }));

    const { error: insertErr } = await supabase.from('tt_slots').insert(rowsToInsert);
    if (insertErr) return failure(`Failed to save generated slots: ${insertErr.message}`);
  }

  const unresolvedSummary = result.unresolved.map((u) => ({
    classCode: classById.get(u.classId)?.display_name ?? u.classId,
    subjectCode: u.subjectCode,
    staffName: staffById.get(u.staffId)?.full_name ?? u.staffId,
    missingHours: u.missingHours,
  }));

  const fixedClashSummary = result.fixedClashes.map((c) => ({
    reason: c.reason,
    classCode: classById.get(c.classId)?.display_name ?? c.classId,
    dayOrder: c.dayOrder,
    period: c.period,
  }));

  await supabase.from('tt_generation_runs').insert({
    classes_affected: affectedClassIds.length,
    slots_placed: result.slots.length,
    unresolved_count: result.unresolved.length,
    fixed_clash_count: result.fixedClashes.length,
    attempts_used: result.attemptsUsed,
    details: { unresolved: unresolvedSummary, fixedClashes: fixedClashSummary },
  });

  const ok = result.unresolved.length === 0 && result.fixedClashes.length === 0;

  return {
    success: true,
    message: ok
      ? `Generated a complete, clash-free timetable across ${affectedClassIds.length} classes.`
      : `Generated with ${result.unresolved.length} unplaced hour(s) and ${result.fixedClashes.length} fixed-slot clash(es) — see below for manual placement.`,
    classesAffected: affectedClassIds.length,
    slotsPlaced: result.slots.length,
    unresolved: unresolvedSummary,
    fixedClashes: fixedClashSummary,
    attemptsUsed: result.attemptsUsed,
  };
}

function failure(message: string): GenerateRunSummary {
  return { success: false, message, classesAffected: 0, slotsPlaced: 0, unresolved: [], fixedClashes: [], attemptsUsed: 0 };
}
