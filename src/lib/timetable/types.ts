// ============================================================================
// ACCFIN Timetable Generator — Shared Types
// ============================================================================

export interface TTClass {
  id: string;
  code: string;
  display_name: string;
  sort_order: number;
}

export interface TTStaff {
  id: string;
  short_code: string;
  full_name: string;
  status: 'ACTIVE' | 'INACTIVE';
  is_hod: boolean;
}

export interface TTWorkload {
  id: string;
  class_id: string;
  subject_code: string;
  subject_name: string;
  hours_per_week: number;
  staff_id: string;
  is_fixed: boolean;
  fixed_day_order: number | null; // 1-6, only set when is_fixed
  fixed_period: number | null; // 1-5, only set when is_fixed
  // joined fields (populated by the fetch query, not stored)
  staff?: TTStaff;
  class?: TTClass;
}

export interface TTGenerationRun {
  id: string;
  run_at: string;
  classes_affected: number;
  slots_placed: number;
  unresolved_count: number;
  fixed_clash_count: number;
  attempts_used: number;
  details: unknown;
}

export interface TTSlot {
  id: string;
  class_id: string;
  day_order: number; // 1-6
  period: number; // 1-5
  workload_id: string | null;
  is_clash: boolean;
  clash_reason: string | null;
  workload?: TTWorkload;
}

// Shape of a single row in the Workload Entry form before it is saved.
// Kept separate from TTWorkload so the form can hold an incomplete row
// (e.g. subject typed in, staff not yet picked) without breaking types.
export interface WorkloadDraftRow {
  key: string; // client-side only, for React list rendering
  subject_code: string;
  subject_name: string;
  hours_per_week: string; // string while editing, parsed to number on submit
  staff_id: string;
  is_fixed: boolean;
}

export interface FormActionResult {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
}

export type FixedPeriodType = 'LANG' | 'ENG' | 'LAB';

export interface TTFixedPeriodSlot {
  id?: string;
  class_id: string;
  day_order: number; // 1-6
  period: number; // 1-5
  slot_type: FixedPeriodType;
  assigned_staff_id?: string | null;
}

export type FixedPeriodsByClass = Record<string, TTFixedPeriodSlot[]>;

