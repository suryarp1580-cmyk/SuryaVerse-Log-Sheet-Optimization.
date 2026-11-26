import { Staff, TimetableEntry, ClassSection, Substitution } from '../types';

export interface BusyStaffContext {
  staff: Staff;
  classSection: ClassSection | null;
  subjectCode: string;
}

export interface StaffWorkload {
  regularPeriods: number;
  substitutionPeriods: number;
  totalPeriods: number;
  freedPeriods: number;
}

function normalizeStaffMatchTokens(staffId: string, staffCode?: string): Set<string> {
  const tokens = new Set<string>();
  const add = (v: string | undefined | null) => {
    const t = (v || '').trim().toUpperCase();
    if (!t) return;
    tokens.add(t);
    tokens.add(t.startsWith('STAFF-') ? t.slice(6) : `STAFF-${t}`);
  };
  add(staffId);
  add(staffCode);
  return tokens;
}

/**
 * Returns all active staff members who are FREE to substitute at a given Day Order and Period.
 * Free staff = active staff who are NOT teaching any class at this day order & period,
 * excluding timetable entries marked as excluded_from_substitution.
 */
export function getFreeStaff(
  dayOrder: number,
  period: number,
  staffList: Staff[],
  timetableEntries: TimetableEntry[]
): Staff[] {
  // Find all staff who are busy in non-excluded periods
  const busyTokens = new Set<string>();

  timetableEntries.forEach(entry => {
    if (
      entry.dayOrder === dayOrder &&
      entry.period === period &&
      !entry.excludedFromSubstitution
    ) {
      entry.staffIds.forEach(id => {
        for (const tok of normalizeStaffMatchTokens(id)) {
          busyTokens.add(tok);
        }
      });
    }
  });

  // Free staff are active staff, not on leave, and not in the busy set
  return staffList
    .filter(s => {
      if (!s.isActive || s.onLeave) return false;
      const myTokens = normalizeStaffMatchTokens(s.id, s.code);
      for (const tok of myTokens) {
        if (busyTokens.has(tok)) return false;
      }
      return true;
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}

/**
 * Returns list of staff who ARE teaching at a given Day Order and Period,
 * alongside contextual information (what class, subject, etc.)
 */
export function getBusyStaff(
  dayOrder: number,
  period: number,
  staffList: Staff[],
  classes: ClassSection[],
  timetableEntries: TimetableEntry[]
): BusyStaffContext[] {
  const busyList: BusyStaffContext[] = [];

  timetableEntries.forEach(entry => {
    if (
      entry.dayOrder === dayOrder &&
      entry.period === period &&
      !entry.excludedFromSubstitution
    ) {
      const cls = classes.find(c => c.id === entry.classId) || null;
      entry.staffIds.forEach(id => {
        const tokens = normalizeStaffMatchTokens(id);
        const staff = staffList.find(
          s => tokens.has(s.id.trim().toUpperCase()) || tokens.has(s.code.trim().toUpperCase())
        );
        if (staff) {
          busyList.push({
            staff,
            classSection: cls,
            subjectCode: entry.subjectCode
          });
        }
      });
    }
  });

  return busyList.sort((a, b) => a.staff.code.localeCompare(b.staff.code));
}

/**
 * Computes a staff member's teaching workload for a specific day order and log sheet.
 * - regularPeriods: count of timetable_entries for that staff on that dayOrder (excluding periods where that staff is marked absent in this log sheet's substitutions).
 * - substitutionPeriods: count of substitutions in this log sheet where substituteStaffId === staffId.
 * - freedPeriods: count of periods this staff was marked absent (their own class covered by someone else or swapped).
 * - totalPeriods: regularPeriods + substitutionPeriods (their actual teaching load for the day after adjustments).
 */
export function computeStaffWorkload(
  staffId: string,
  dayOrder: number,
  timetableEntries: TimetableEntry[],
  substitutions: Substitution[],
  logSheetId?: string,
  staffCode?: string
): StaffWorkload {
  const staffTokens = normalizeStaffMatchTokens(staffId, staffCode);
  const matchesStaff = (candidate: string | null | undefined): boolean => {
    if (!candidate) return false;
    const up = candidate.trim().toUpperCase();
    return staffTokens.has(up) || staffTokens.has(up.startsWith('STAFF-') ? up.slice(6) : up);
  };

  // Filter substitutions for this log sheet if logSheetId is provided
  const sheetSubs = logSheetId
    ? substitutions.filter(s => s.logSheetId === logSheetId)
    : substitutions;

  // Master scheduled classes on this day order
  const masterSlots = timetableEntries.filter(
    e => e.dayOrder === dayOrder && e.staffIds.some(matchesStaff)
  );

  // Freed periods: count of periods this staff was marked absent in this log sheet's substitutions
  let freedPeriods = 0;
  sheetSubs.forEach(sub => {
    if (matchesStaff(sub.absentStaffId)) {
      freedPeriods += 1;
    }
  });

  // Build a set of (classId-period) where this staff was marked absent on this log sheet
  const absentClassPeriodSet = new Set(
    sheetSubs
      .filter(sub => matchesStaff(sub.absentStaffId))
      .map(sub => `${sub.classId}-${sub.period}`)
  );

  // Regular periods: master slots on this day order minus periods where this staff was absent
  let regularPeriods = 0;
  masterSlots.forEach(entry => {
    if (!absentClassPeriodSet.has(`${entry.classId}-${entry.period}`)) {
      regularPeriods += 1;
    }
  });

  // Substitution periods: count of substitutions in this log sheet where substituteStaffId === staffId
  // or where they were assigned via swap
  const substitutionPeriods = sheetSubs.filter(
    sub =>
      matchesStaff(sub.substituteStaffId) ||
      (sub.isSwap && sub.swappedStaffIds?.some(matchesStaff))
  ).length;

  const totalPeriods = regularPeriods + substitutionPeriods;

  return {
    regularPeriods,
    substitutionPeriods,
    totalPeriods,
    freedPeriods
  };
}
