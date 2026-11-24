// ============================================================================
// ACCFIN Timetable Generator — Workload Data Layer (Vite port)
// ----------------------------------------------------------------------------
// PORTED FROM: Next.js Server Actions (app/timetable/workload/actions.ts).
// No 'use server', no revalidatePath — these are plain async functions that
// call Supabase directly from the browser using your existing client.
//
// ASSUMPTION: your project has a configured Supabase client at
// src/lib/supabaseClient.ts exporting `supabase`. Adjust the import below
// if yours lives elsewhere or is named differently.
// ============================================================================

import { supabase } from '../supabaseClient';
import type { FormActionResult, TTClass, TTStaff, TTWorkload } from './types';
import { MAX_HOURS_PER_WEEK, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK } from './constants';

export async function getClasses(): Promise<TTClass[]> {
  const { data, error } = await supabase
    .from('tt_classes')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Failed to load classes: ${error.message}`);
  return data ?? [];
}

export async function getStaff(): Promise<TTStaff[]> {
  const { data, error } = await supabase
    .from('tt_staff')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (error) throw new Error(`Failed to load staff: ${error.message}`);
  return data ?? [];
}

export async function getWorkloadForClass(classId: string): Promise<TTWorkload[]> {
  const { data, error } = await supabase
    .from('tt_workload')
    .select('*, staff:tt_staff(*), fixed_slots:tt_fixed_slots(*)')
    .eq('class_id', classId)
    .order('subject_code', { ascending: true });

  if (error) throw new Error(`Failed to load workload: ${error.message}`);
  return (data as unknown as TTWorkload[]) ?? [];
}

interface FixedSlotInput {
  dayOrder: number;
  period: number;
}

interface AddWorkloadInput {
  classId: string;
  subjectCode: string;
  subjectName: string;
  hoursPerWeek: number;
  staffId: string;
  isFixed: boolean;
  fixedSlots?: FixedSlotInput[];
  fixedDayOrder?: number | null;
  fixedPeriod?: number | null;
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

  const effectiveFixedSlots: FixedSlotInput[] =
    input.fixedSlots ??
    (input.isFixed && input.fixedDayOrder && input.fixedPeriod
      ? [{ dayOrder: input.fixedDayOrder, period: input.fixedPeriod }]
      : []);

  if (input.isFixed) {
    if (input.fixedSlots && input.fixedSlots.length !== input.hoursPerWeek) {
      fieldErrors.fixedSlot = `You set ${input.hoursPerWeek} hour(s) per week, so this needs exactly ${input.hoursPerWeek} Day Order/Period slot(s) — you've given ${input.fixedSlots.length}.`;
    }
    const seen = new Set<string>();
    for (const s of effectiveFixedSlots) {
      const key = `${s.dayOrder}_${s.period}`;
      if (seen.has(key)) {
        fieldErrors.fixedSlot = 'Each fixed slot must be a different Day Order + Period combination.';
        break;
      }
      seen.add(key);
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { success: false, message: 'Please fix the highlighted fields.', fieldErrors };
  }

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

  const { data: inserted, error } = await supabase
    .from('tt_workload')
    .insert({
      class_id: input.classId,
      subject_code: subjectCode,
      subject_name: subjectName,
      hours_per_week: input.hoursPerWeek,
      staff_id: input.staffId,
      is_fixed: input.isFixed,
      fixed_day_order: input.fixedDayOrder ?? (effectiveFixedSlots[0]?.dayOrder ?? null),
      fixed_period: input.fixedPeriod ?? (effectiveFixedSlots[0]?.period ?? null),
    })
    .select('id')
    .single();

  if (error || !inserted) {
    if (error?.code === '23505') {
      return {
        success: false,
        message: `Subject code "${subjectCode}" is already used for this class. Use a different short code.`,
      };
    }
    return { success: false, message: `Failed to save: ${error?.message ?? 'unknown error'}` };
  }

  if (input.isFixed && effectiveFixedSlots.length > 0) {
    const rows = effectiveFixedSlots.map((s) => ({
      workload_id: inserted.id,
      class_id: input.classId,
      day_order: s.dayOrder,
      period: s.period,
    }));
    const { error: slotErr } = await supabase.from('tt_fixed_slots').insert(rows);
    if (slotErr) {
      await supabase.from('tt_workload').delete().eq('id', inserted.id);
      if (slotErr.code === '23505') {
        return {
          success: false,
          message: 'One of those Day Order/Period slots is already taken by another fixed subject in this class. Pick different slots.',
        };
      }
      return { success: false, message: `Failed to save fixed slots: ${slotErr.message}` };
    }
  }

  return { success: true, message: `Added ${subjectCode} (${input.hoursPerWeek}h) to the workload.` };
}

export async function deleteWorkloadEntry(workloadId: string): Promise<FormActionResult> {
  const { error } = await supabase.from('tt_workload').delete().eq('id', workloadId);
  if (error) return { success: false, message: `Failed to delete: ${error.message}` };
  return { success: true, message: 'Removed.' };
}
