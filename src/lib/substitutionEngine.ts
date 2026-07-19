import { Staff, TimetableEntry, ClassSection } from '../types';

export interface BusyStaffContext {
  staff: Staff;
  classSection: ClassSection | null;
  subjectCode: string;
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
  const busyStaffIds = new Set<string>();
  
  timetableEntries.forEach(entry => {
    if (
      entry.dayOrder === dayOrder &&
      entry.period === period &&
      !entry.excludedFromSubstitution
    ) {
      entry.staffIds.forEach(id => busyStaffIds.add(id));
    }
  });

  // Free staff are active staff, not on leave, and not in the busy set
  return staffList
    .filter(s => s.isActive && !s.onLeave && !busyStaffIds.has(s.id))
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
        const staff = staffList.find(s => s.id === id);
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
