export interface Staff {
  id: string;
  code: string;
  fullName: string | null;
  isActive: boolean;
  onLeave?: boolean;
}

export interface ClassSection {
  id: string;
  yearLabel: string; // e.g. "I B.COM AF", "II B.COM AF"
  section: string;   // e.g. "A", "B", "C"
  roomNo: string;
  inchargeName: string;
  displayOrder: number;
}

export interface TimetableEntry {
  id: string;
  classId: string;
  dayOrder: number; // 1 to 6
  period: number;   // 1 to 5
  subjectCode: string;
  isLab: boolean;
  excludedFromSubstitution: boolean;
  staffIds: string[]; // links to staff.id (multiple staff allowed for labs)
}

export interface LogSheet {
  id: string;
  logDate: string; // YYYY-MM-DD
  dayOrder: number; // 1 to 6
  status: 'draft' | 'finalized';
  finalizedAt?: string;
  totalAbsentees?: number;
  totalSubstitutions?: number;
}

export interface Substitution {
  id: string;
  logSheetId: string;
  classId: string;
  period: number; // 1 to 5
  absentStaffId: string;
  substituteStaffId: string | null;
  remarks: string;
  
  // Swapping fields
  isSwap?: boolean;
  swapWithPeriod?: number;
  swappedSubjectCode?: string;
  swappedStaffIds?: string[];
}

// Ergononmic interface for grid rendering
export interface GridCell {
  subjectCode: string;
  isLab: boolean;
  excluded: boolean;
  originalStaff: Staff[];
  substitution: Substitution | null;
  substituteStaff: Staff | null;
}

// Database snapshot and backup record structure for Supabase backups table
export interface BackupRecord {
  id: string;
  backup_label: string;
  created_at: string;
  created_by: string;
  staff_snapshot: any[];
  class_sections_snapshot: any[];
  timetable_entries_snapshot: any[];
  log_sheets_snapshot: any[];
  substitutions_snapshot: any[];
}
