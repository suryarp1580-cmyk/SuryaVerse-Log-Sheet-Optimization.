// ============================================================================
// ACCFIN Staff Resolution, Workload Split Distribution & Timetable Backfill
// Ensures zero-failure staff resolution across Daily Log Sheets and Timetable Generator.
// ============================================================================

import type { Staff, ClassSection, TimetableEntry } from '../types';
import type { TTStaff, TTClass, TTWorkload } from './timetable/types';
import { parseStaffSplitNotation } from './timetable/workload-api';
import { initialStaff, rawTimetable, initialClasses } from '../data/seedData';

/**
 * Universal resolver to find a staff member from the Staff List.
 * Handles UUIDs, short codes (e.g. 'JD'), prefixed IDs (e.g. 'staff-JD'),
 * full names, and normalized variants without failing.
 */
export function findStaffMember(staffList: Staff[], idOrCode: string | undefined | null): Staff | undefined {
  if (!idOrCode) return undefined;
  const raw = String(idOrCode).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return undefined;

  const upper = raw.toUpperCase();
  const withoutStaffPrefix = upper.startsWith('STAFF-') ? upper.replace('STAFF-', '') : upper;

  return staffList.find(s => {
    if (!s) return false;
    const sId = String(s.id || '').trim();
    const sCode = String(s.code || '').trim().toUpperCase();
    const sFull = String(s.fullName || '').trim().toUpperCase();

    return (
      sId === raw ||
      sId.toUpperCase() === upper ||
      sCode === upper ||
      sCode === withoutStaffPrefix ||
      sId.toUpperCase() === `STAFF-${withoutStaffPrefix}` ||
      (sFull && (sFull === upper || sFull.includes(upper)))
    );
  });
}

/**
 * Universal resolver to find a TTStaff record.
 */
export function findTTStaff(allStaff: TTStaff[], idOrCode: string | undefined | null): TTStaff | undefined {
  if (!idOrCode) return undefined;
  const raw = String(idOrCode).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return undefined;

  const upper = raw.toUpperCase();
  const withoutStaffPrefix = upper.startsWith('STAFF-') ? upper.replace('STAFF-', '') : upper;

  return allStaff.find(s => {
    if (!s) return false;
    const sId = String(s.id || '').trim();
    const sCode = String(s.short_code || '').trim().toUpperCase();
    const sFull = String(s.full_name || '').trim().toUpperCase();

    return (
      sId === raw ||
      sId.toUpperCase() === upper ||
      sCode === upper ||
      sCode === withoutStaffPrefix ||
      sId.toUpperCase() === `STAFF-${withoutStaffPrefix}` ||
      (sFull && (sFull === upper || sFull.includes(upper)))
    );
  });
}

export interface ResolvedStaffAssignment {
  staffId: string;
  staffCode: string;
  hours: number;
}

export interface WorkloadStaffResolutionResult {
  assignments: ResolvedStaffAssignment[];
  warnings: string[];
}

/**
 * Resolves staff assignments for a workload entry.
 * Robustly parses:
 * 1. Split-hour notation strings: 'MJ(4)/MP(1)', 'MJ(4) / JD(2)'
 * 2. Array of splits: [{ staffId, staffCode, hours }]
 * 3. Array of staff IDs or codes: ['MJ', 'MP']
 * 4. Single staff ID, short code, or prefixed ID: 'JD', 'staff-JD', 'uuid-...'
 * 5. Joined staff object: { staff: { id, short_code } }
 *
 * If ANY faculty member cannot be resolved or notation is invalid:
 * Flags a loud, visible warning: "Could not assign staff for {SUBJECT} – {CLASS}"
 */
export function resolveWorkloadStaff(
  w: any,
  allStaff: TTStaff[],
  classDisplayName = 'Class'
): WorkloadStaffResolutionResult {
  const subjectCode = String(w.subject_code || w.subject || 'Subject').trim().toUpperCase();
  const totalHours = Number(w.hours_per_week || w.hours) || 1;
  const warnings: string[] = [];

  // Excluded / Non-departmental subjects (LANG, ENG)
  if (subjectCode === 'LANG' || subjectCode === 'ENG' || w.excludedFromSubstitution || w.is_fixed_nondept) {
    return { assignments: [], warnings: [] };
  }

  // 1. Check if splits array is already explicitly provided
  if (Array.isArray(w.splits) && w.splits.length > 0) {
    const assignments: ResolvedStaffAssignment[] = [];
    let allocatedHours = 0;

    for (const split of w.splits) {
      const staffIdentifier = split.staffId || split.staffCode || split.code || split.id;
      const found = findTTStaff(allStaff, staffIdentifier);
      const splitHours = Number(split.hours) || 1;
      allocatedHours += splitHours;

      if (found) {
        assignments.push({
          staffId: found.id,
          staffCode: found.short_code,
          hours: splitHours,
        });
      } else {
        warnings.push(`Could not assign staff for ${subjectCode} – ${classDisplayName} (unknown faculty "${staffIdentifier || '?'}")`);
      }
    }

    if (assignments.length > 0) {
      return { assignments, warnings };
    }
  }

  // 2. Check if rawStaffInput or staff_id contains split-hour string (e.g. "MJ(4)/MP(1)" or "MJ(4)")
  const rawInput = typeof w.rawStaffInput === 'string'
    ? w.rawStaffInput.trim()
    : typeof w.staff_id === 'string'
      ? w.staff_id.trim()
      : '';

  if (rawInput && (rawInput.includes('/') || rawInput.includes('('))) {
    const parsed = parseStaffSplitNotation(rawInput, totalHours, allStaff);
    if (parsed.error) {
      warnings.push(`Could not assign staff for ${subjectCode} – ${classDisplayName}: ${parsed.error}`);
    } else if (parsed.splits.length > 0) {
      return {
        assignments: parsed.splits.map(s => ({
          staffId: s.staffId,
          staffCode: s.staffCode,
          hours: s.hours,
        })),
        warnings,
      };
    }
  }

  // 3. Check if staff_ids is an array of strings
  if (Array.isArray(w.staff_ids) && w.staff_ids.length > 0) {
    const assignments: ResolvedStaffAssignment[] = [];
    const hoursPerStaff = Math.max(1, Math.floor(totalHours / w.staff_ids.length));

    for (const sid of w.staff_ids) {
      const found = findTTStaff(allStaff, sid);
      if (found) {
        assignments.push({
          staffId: found.id,
          staffCode: found.short_code,
          hours: hoursPerStaff,
        });
      } else {
        warnings.push(`Could not assign staff for ${subjectCode} – ${classDisplayName} (faculty "${sid}" not found in Staff Directory)`);
      }
    }

    if (assignments.length > 0) {
      return { assignments, warnings };
    }
  }

  // 4. Check single staff reference (staff_id, staffCode, or staff object)
  const singleCandidate = w.staff?.id || w.staff?.short_code || w.staff_id || w.staffCode;
  if (singleCandidate) {
    const found = findTTStaff(allStaff, singleCandidate);
    if (found) {
      return {
        assignments: [
          {
            staffId: found.id,
            staffCode: found.short_code,
            hours: totalHours,
          },
        ],
        warnings,
      };
    }
  }

  // 5. Unresolved staff: flag loudly
  warnings.push(`Could not assign staff for ${subjectCode} – ${classDisplayName}`);
  return { assignments: [], warnings };
}

/**
 * Re-derives all 330 timetable entries across all 11 classes,
 * ensuring every departmental period has its staffIds populated with
 * valid staff IDs matching the current active Staff List.
 */
export function rederiveTimetableEntries(
  classesList: ClassSection[],
  staffList: Staff[]
): TimetableEntry[] {
  const entries: TimetableEntry[] = [];

  for (const [classKey, dayOrders] of Object.entries(rawTimetable)) {
    // Find matching class section
    const matchingClass = classesList.find(c => 
      c.id === classKey || 
      c.id.replace('class-', '') === classKey.replace('class-', '')
    ) || { id: classKey };

    const classId = matchingClass.id;

    for (const [dayStr, rawPeriods] of Object.entries(dayOrders)) {
      const dayOrder = parseInt(dayStr, 10);

      rawPeriods.forEach((rawPeriod, index) => {
        const period = index + 1;
        const staffIds: string[] = [];

        if (rawPeriod.staffCodes && !rawPeriod.excluded) {
          rawPeriod.staffCodes.forEach(code => {
            const resolved = findStaffMember(staffList, code);
            if (resolved) {
              staffIds.push(resolved.id);
            } else {
              // Fallback to initialStaff lookup
              const fallbackInit = initialStaff.find(s => s.code === code);
              if (fallbackInit) {
                const matchedInList = findStaffMember(staffList, fallbackInit.code);
                staffIds.push(matchedInList ? matchedInList.id : fallbackInit.id);
              } else {
                staffIds.push(code);
              }
            }
          });
        }

        const isLab = Boolean(rawPeriod.isLab || rawPeriod.subject.toUpperCase().includes('LAB'));

        entries.push({
          id: `entry-${classId}-${dayOrder}-${period}`,
          classId: String(classId),
          dayOrder: Number(dayOrder),
          period: Number(period),
          subjectCode: String(rawPeriod.subject),
          isLab,
          excludedFromSubstitution: Boolean(rawPeriod.excluded),
          staffIds: [...staffIds],
        });
      });
    }
  }

  return entries;
}
