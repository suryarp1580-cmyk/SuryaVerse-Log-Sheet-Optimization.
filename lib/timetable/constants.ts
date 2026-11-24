// ============================================================================
// ACCFIN Timetable Generator — Structural Constants
// Matches the printed AMJ College Shift II timetable grid exactly.
// ============================================================================

export const DAY_ORDERS = [1, 2, 3, 4, 5, 6] as const;
export type DayOrder = (typeof DAY_ORDERS)[number];

export const PERIODS = [1, 2, 3, 4, 5] as const;
export type Period = (typeof PERIODS)[number];

// Display label + clock time for each period, including the break so the
// grid renders in the same order as the printed sheet.
export const PERIOD_TIMES: { period: Period | 'BREAK'; label: string }[] = [
  { period: 1, label: '8:30 – 9:20' },
  { period: 2, label: '9:20 – 10:10' },
  { period: 3, label: '10:10 – 11:00' },
  { period: 'BREAK', label: '11:00 – 11:30' },
  { period: 4, label: '11:30 – 12:20' },
  { period: 5, label: '12:20 – 1:10' },
];

export const DAY_ORDER_LABELS: Record<DayOrder, string> = {
  1: 'I',
  2: 'II',
  3: 'III',
  4: 'IV',
  5: 'V',
  6: 'VI',
};

// Subject codes treated as "fixed / language" hours per ACCFIN policy:
// placed manually, never touched by the auto-generator or substitution.
// The HOD can extend this list from the workload form (is_fixed checkbox);
// these two are just the sensible defaults to pre-tick.
export const DEFAULT_FIXED_SUBJECT_CODES = ['ENG', 'TAM'];

export const MAX_HOURS_PER_WEEK = 30;
export const TOTAL_SCHEDULABLE_SLOTS_PER_WEEK = DAY_ORDERS.length * PERIODS.length; // 30
