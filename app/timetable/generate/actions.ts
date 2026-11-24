'use server';

// ============================================================================
// ACCFIN Timetable Generator — Generate Action
// ----------------------------------------------------------------------------
// Loads every class's workload, runs the scheduling engine, replaces the
// contents of tt_slots with the new result, and logs a summary of anything
// that needs manual attention (fixed-slot clashes, unplaced hours).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  generateSchedule,
  type FixedPlacement,
  type SchedulableWorkload,
} from '@/lib/timetable/scheduler';
import type { TTStaff, TTClass } from '@/lib/timetable/types';

export interface GenerateRunSummary {
  success: boolean;
  message: string;
  classesAffected: number;
  slotsPlaced: number;
  unresolved: Array<{
    classCode: string;
    subjectCode: string;
    staffName: string;
    missingHours: number;
  }>;
  fixedClashes: Array<{
    reason: string;
    classCode: string;
    dayOrder: number;
    period: number;
  }>;
  attemptsUsed: number;
}

export async function runGenerateSchedule(): Promise<GenerateRunSummary> {
  const supabase = createClient();

  const [{ data: classes, error: classesErr }, { data: staff, error: staffErr }, { data: workload, error: workloadErr }] =
    await Promise.all([
      supabase.from('tt_classes').select('*'),
      supabase.from('tt_staff').select('*'),
      supabase.from('tt_workload').select('*'),
    ]);

  if (classesErr) return failure(`Could not load classes: ${classesErr.message}`);
  if (staffErr) return failure(`Could not load staff: ${staffErr.message}`);
  if (workloadErr) return failure(`Could not load workload: ${workloadErr.message}`);
  if (!classes || classes.length === 0) return failure('No classes found — check tt_classes has data.');
  if (!workload || workload.length === 0) {
    return failure('No workload entries found. Add subjects via the Workload Entry page first.');
  }

  const classById = new Map<string, TTClass>((classes as TTClass[]).map((c) => [c.id, c]));
  const staffById = new Map<string, TTStaff>((staff as TTStaff[]).map((s) => [s.id, s]));

  const fixedPlacements: FixedPlacement[] = [];
  const schedulableWorkload: SchedulableWorkload[] = [];
  const skippedIncompleteFixed: string[] = [];

  for (const w of workload) {
    if (w.is_fixed) {
      if (w.fixed_day_order != null && w.fixed_period != null) {
        fixedPlacements.push({
          workloadId: w.id,
          classId: w.class_id,
          staffId: w.staff_id,
          subjectCode: w.subject_code,
          dayOrder: w.fixed_day_order,
          period: w.fixed_period,
        });
      } else {
        // Marked fixed but no slot chosen yet — can't schedule automatically
        // and can't place it manually either without a slot. Flag it.
        skippedIncompleteFixed.push(`${w.subject_code} (${classById.get(w.class_id)?.display_name ?? w.class_id})`);
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

  if (skippedIncompleteFixed.length > 0) {
    return failure(
      `These subjects are marked "Fixed" but have no Day Order/Period set yet — set their slot on the Workload Entry page before generating: ${skippedIncompleteFixed.join(', ')}`
    );
  }

  const result = generateSchedule(fixedPlacements, schedulableWorkload, { maxRestarts: 80 });

  // Replace tt_slots for every affected class in one transaction-ish pass:
  // delete then bulk insert. (Supabase JS doesn't expose multi-statement
  // transactions directly; for a department-scale dataset — a few hundred
  // rows — this delete+insert pair is safe and fast enough in practice.)
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

  revalidatePath('/timetable/generate');
  revalidatePath('/timetable/view');

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
  return {
    success: false,
    message,
    classesAffected: 0,
    slotsPlaced: 0,
    unresolved: [],
    fixedClashes: [],
    attemptsUsed: 0,
  };
}
