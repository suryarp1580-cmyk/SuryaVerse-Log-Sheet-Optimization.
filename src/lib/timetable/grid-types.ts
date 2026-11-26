// ============================================================================
// ACCFIN Timetable Generator — Grid View Types
// ============================================================================

export interface GridCell {
  slotId: string;
  workloadId: string;
  subjectCode: string;
  subjectName: string;
  staffShortCode: string;
  staffName: string;
  classCode: string;
  classDisplayName: string;
  isFixed: boolean;
  isClash: boolean;
  clashReason: string | null;
}

// Keyed as `${dayOrder}_${period}`, e.g. "3_4" = Day Order III, Period 4
export type GridCellMap = Record<string, GridCell>;

export interface UnresolvedItem {
  workloadId: string;
  subjectCode: string;
  subjectName: string;
  staffShortCode: string;
  staffName: string;
  missingHours: number;
}

export interface ClassTimetableData {
  classId: string;
  classDisplayName: string;
  cells: GridCellMap;
  unresolved: UnresolvedItem[];
  legend: Array<{
    subjectCode: string;
    subjectName: string;
    hoursPerWeek: number;
    staffName: string;
  }>;
}

export interface StaffTimetableData {
  staffId: string;
  staffName: string;
  totalHours: number;
  cells: GridCellMap;
  legend: Array<{
    classDisplayName: string;
    subjectCode: string;
    subjectName: string;
    hoursPerWeek: number;
  }>;
}

export interface DayOrderRow {
  classId: string;
  classCode: string;
  classDisplayName: string;
  roomNo: string;
  sortOrder: number;
  periods: Record<number, GridCell | null>;
}

export interface DayOrderTimetableData {
  dayOrder: number;
  rows: DayOrderRow[];
}

export function slotKey(dayOrder: number, period: number): string {
  return `${dayOrder}_${period}`;
}
