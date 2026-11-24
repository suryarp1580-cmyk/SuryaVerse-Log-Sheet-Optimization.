'use server';

// ============================================================================
// ACCFIN Timetable Generator — Workload Entry Server Actions
// ----------------------------------------------------------------------------
// ASSUMPTION: this drops into the existing ACCFIN Next.js 14 App Router
// project, which already has a Supabase server client factory at
// '@/lib/supabase/server' exporting `createClient()` (the standard
// @supabase/ssr pattern). If your project's helper lives at a different
// path or export name, update the import on the next line only — nothing
// else in this file needs to change.
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { FormActionResult, TTClass, TTStaff, TTWorkload } from '@/lib/timetable/types';
import { MAX_HOURS_PER_WEEK, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK } from '@/lib/timetable/constants';

export async function getClasses(): Promise<TTClass[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tt_classes')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Failed to load classes: ${error.message}`);
  return data ?? [];
}

export async function getStaff(): Promise<TTStaff[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tt_staff')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (error) throw new Error(`Failed to load staff: ${error.message}`);
  return data ?? [];
}

export async function getWorkloadForClass(classId: string): Promise<TTWorkload[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('tt_workload')
    .select('*, staff:tt_staff(*)')
    .eq('class_id', classId)
    .order('subject_code', { ascending: true });

  if (error) throw new Error(`Failed to load workload: ${error.message}`);
  return (data as unknown as TTWorkload[]) ?? [];
}

interface AddWorkloadInput {
  classId: string;
  subjectCode: string;
  subjectName: string;
  hoursPerWeek: number;
  staffId: string;
  isFixed: boolean;
  fixedDayOrder: number | null;
  fixedPeriod: number | null;
}

export async function addWorkloadEntry(input: AddWorkloadInput): Promise<FormActionResult> {
  const fieldErrors: Record<string, string> = {};

  const subjectCode = input.subjectCode.trim().toUpperCase();
  const subjectName = input.subjectName.trim().toUpperCase();

  if (!subjectCode) fieldErrors.subjectCode = 'Subject short code is required.';
  if (!subjectName) fieldErrors.subjectName = 'Full subject name is required.';
  if (!input.staffId) fieldErrors.staffId = 'Select a staff member.';
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0) {
    fieldErrors.hoursPerWeek = 'Hours per week must be a positive number.';
  } else if (input.hoursPerWeek > MAX_HOURS_PER_WEEK) {
    fieldErrors.hoursPerWeek = `Hours per week cannot exceed ${MAX_HOURS_PER_WEEK}.`;
  }
  if (input.isFixed && (!input.fixedDayOrder || !input.fixedPeriod)) {
    fieldErrors.fixedSlot = 'Select both a Day Order and a Period for a fixed subject.';
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, message: 'Please fix the highlighted fields.', fieldErrors };
  }

  const supabase = createClient();

  // Guard: total weekly hours already allotted to this class must not exceed
  // the number of physical slots in the grid (6 day orders x 5 periods = 30).
  const { data: existing, error: existingErr } = await supabase
    .from('tt_workload')
    .select('hours_per_week')
    .eq('class_id', input.classId);

  if (existingErr) {
    return { success: false, message: `Could not validate hours: ${existingErr.message}` };
  }

  const currentTotal = (existing ?? []).reduce((sum, row) => sum + row.hours_per_week, 0);
  if (currentTotal + input.hoursPerWeek > TOTAL_SCHEDULABLE_SLOTS_PER_WEEK) {
    return {
      success: false,
      message: `This class already has ${currentTotal} hours allotted. Adding ${input.hoursPerWeek} more would exceed the ${TOTAL_SCHEDULABLE_SLOTS_PER_WEEK} slots available in the weekly grid.`,
    };
  }

  const { error } = await supabase.from('tt_workload').insert({
    class_id: input.classId,
    subject_code: subjectCode,
    subject_name: subjectName,
    hours_per_week: input.hoursPerWeek,
    staff_id: input.staffId,
    is_fixed: input.isFixed,
    fixed_day_order: input.fixedDayOrder,
    fixed_period: input.fixedPeriod,
  });

  if (error) {
    if (error.code === '23505' && error.message.includes('uq_tt_workload_fixed_slot')) {
      return {
        success: false,
        message: `Day Order ${input.fixedDayOrder}, Period ${input.fixedPeriod} is already taken by another fixed subject in this class. Pick a different slot.`,
      };
    }
    if (error.code === '23505') {
      return {
        success: false,
        message: `Subject code "${subjectCode}" is already used for this class. Use a different short code.`,
      };
    }
    return { success: false, message: `Failed to save: ${error.message}` };
  }

  revalidatePath('/timetable/workload');
  return { success: true, message: `Added ${subjectCode} (${input.hoursPerWeek}h) to the workload.` };
}

export async function deleteWorkloadEntry(workloadId: string): Promise<FormActionResult> {
  const supabase = createClient();
  const { error } = await supabase.from('tt_workload').delete().eq('id', workloadId);

  if (error) {
    return { success: false, message: `Failed to delete: ${error.message}` };
  }

  revalidatePath('/timetable/workload');
  return { success: true, message: 'Removed.' };
}
