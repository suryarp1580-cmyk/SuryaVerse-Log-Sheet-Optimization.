import { Staff, ClassSection, TimetableEntry, LogSheet, Substitution } from '../types';
import { initialStaff, initialClasses, getInitialTimetableEntries, getInitialLogSheets, getInitialSubstitutions } from '../data/seedData';
import { generateUUID } from './uuid';

const STORAGE_KEYS = {
  STAFF: 'accfin_memory_staff_v2',
  CLASSES: 'accfin_memory_classes_v2',
  TIMETABLE: 'accfin_memory_timetable_v2',
  LOG_SHEETS: 'accfin_memory_log_sheets_v2',
  SUBSTITUTIONS: 'accfin_memory_substitutions_v2',
  CONFIGURED: 'accfin_memory_initialized_v2',
  WORKLOAD: 'accfin_memory_workload_v2',
  TT_STAFF: 'accfin_memory_tt_staff_v2',
  FIXED_PERIODS: 'accfin_memory_fixed_periods_v2',
  FIXED_PERIODS_INIT: 'accfin_memory_fixed_periods_init_v2',
  GENERATED_SLOTS: 'accfin_memory_generated_slots_v2',
};

export interface AppMemoryData {
  staffList: Staff[];
  classesList: ClassSection[];
  timetableEntries: TimetableEntry[];
  logSheets: LogSheet[];
  substitutions: Substitution[];
}

/**
 * Ensures every LogSheet has a unique `id` and unique `logDate`.
 * Repairs legacy or collided IDs (such as repeated `todaySheetId` across different dates).
 */
export function deduplicateLogSheets(sheets: LogSheet[]): { sheets: LogSheet[]; changed: boolean } {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    return { sheets: [], changed: false };
  }

  let changed = false;
  const byDate = new Map<string, LogSheet>();

  for (const sheet of sheets) {
    if (!sheet) {
      changed = true;
      continue;
    }
    const existing = byDate.get(sheet.logDate);
    if (!existing) {
      byDate.set(sheet.logDate, sheet);
    } else {
      changed = true;
      // Prefer finalized sheet or the one with more recorded activity
      const keepNew =
        (sheet.status === 'finalized' && existing.status !== 'finalized') ||
        (sheet.status === existing.status &&
          (sheet.totalSubstitutions || 0) > (existing.totalSubstitutions || 0));
      if (keepNew) {
        byDate.set(sheet.logDate, sheet);
      }
    }
  }

  const seenIds = new Set<string>();
  const deduped: LogSheet[] = [];

  for (const sheet of byDate.values()) {
    let id = sheet.id;
    if (!id || seenIds.has(id)) {
      id = generateUUID();
      changed = true;
      deduped.push({ ...sheet, id });
    } else {
      deduped.push(sheet);
    }
    seenIds.add(id);
  }

  return { sheets: deduped, changed };
}

/**
 * Safely inserts or updates a LogSheet in a list while guaranteeing unique `id` and `logDate`.
 */
export function upsertLogSheetInList(
  prev: LogSheet[],
  updatedSheet: LogSheet,
  previousId?: string
): LogSheet[] {
  let replaced = false;
  const next: LogSheet[] = [];

  for (const item of prev) {
    const matches =
      item.id === updatedSheet.id ||
      item.logDate === updatedSheet.logDate ||
      (previousId !== undefined && item.id === previousId);

    if (matches) {
      if (!replaced) {
        next.push(updatedSheet);
        replaced = true;
      }
      // Drop any secondary duplicates that also matched
    } else {
      next.push(item);
    }
  }

  if (!replaced) {
    next.unshift(updatedSheet);
  }

  return deduplicateLogSheets(next).sheets;
}

/**
 * Returns true if the user explicitly purged all records in Danger Zone.
 */
export function isMemoryCleared(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.CONFIGURED) === 'cleared';
}

/**
 * Load application state from persistent local browser memory.
 * If user explicitly purged data ('cleared'), returns empty arrays.
 * If empty or first run, returns canonical seed data so the app starts fully populated.
 */
export function loadMemoryData(): AppMemoryData {
  if (typeof window === 'undefined') {
    return {
      staffList: initialStaff.map(s => ({ ...s })),
      classesList: initialClasses.map(c => ({ ...c })),
      timetableEntries: getInitialTimetableEntries().map(t => ({ ...t, staffIds: [...t.staffIds] })),
      logSheets: getInitialLogSheets().map(l => ({ ...l })),
      substitutions: getInitialSubstitutions().map(s => ({ ...s, swappedStaffIds: s.swappedStaffIds ? [...s.swappedStaffIds] : undefined })),
    };
  }

  // If user explicitly clicked DELETE ALL, preserve the completely emptied state
  if (isMemoryCleared()) {
    return {
      staffList: [],
      classesList: [],
      timetableEntries: [],
      logSheets: [],
      substitutions: [],
    };
  }

  // If brand new first visit without configured flag, initialize seed data
  if (!localStorage.getItem(STORAGE_KEYS.CONFIGURED)) {
    return resetMemoryToSeed();
  }

  try {
    const rawStaff = localStorage.getItem(STORAGE_KEYS.STAFF);
    const rawClasses = localStorage.getItem(STORAGE_KEYS.CLASSES);
    const rawTimetable = localStorage.getItem(STORAGE_KEYS.TIMETABLE);
    const rawLogSheets = localStorage.getItem(STORAGE_KEYS.LOG_SHEETS);
    const rawSubstitutions = localStorage.getItem(STORAGE_KEYS.SUBSTITUTIONS);

    const staffList: Staff[] = rawStaff ? JSON.parse(rawStaff) : [];
    const classesList: ClassSection[] = rawClasses ? JSON.parse(rawClasses) : [];
    const timetableEntries: TimetableEntry[] = rawTimetable ? JSON.parse(rawTimetable) : [];
    const parsedLogSheets: LogSheet[] = rawLogSheets ? JSON.parse(rawLogSheets) : [];
    const { sheets: logSheets, changed: logsChanged } = deduplicateLogSheets(parsedLogSheets);
    const substitutions: Substitution[] = rawSubstitutions ? JSON.parse(rawSubstitutions) : [];

    if (logsChanged) {
      localStorage.setItem(STORAGE_KEYS.LOG_SHEETS, JSON.stringify(logSheets));
    }

    return {
      staffList,
      classesList,
      timetableEntries,
      logSheets,
      substitutions,
    };
  } catch {
    return {
      staffList: [],
      classesList: [],
      timetableEntries: [],
      logSheets: [],
      substitutions: [],
    };
  }
}

/**
 * Save current state directly to local persistent memory.
 */
export function saveMemoryData(data: Partial<AppMemoryData>): void {
  if (typeof window === 'undefined') return;

  try {
    if (data.staffList !== undefined) {
      localStorage.setItem(STORAGE_KEYS.STAFF, JSON.stringify(data.staffList));
    }
    if (data.classesList !== undefined) {
      localStorage.setItem(STORAGE_KEYS.CLASSES, JSON.stringify(data.classesList));
    }
    if (data.timetableEntries !== undefined) {
      localStorage.setItem(STORAGE_KEYS.TIMETABLE, JSON.stringify(data.timetableEntries));
    }
    if (data.logSheets !== undefined) {
      const { sheets } = deduplicateLogSheets(data.logSheets);
      localStorage.setItem(STORAGE_KEYS.LOG_SHEETS, JSON.stringify(sheets));
    }
    if (data.substitutions !== undefined) {
      localStorage.setItem(STORAGE_KEYS.SUBSTITUTIONS, JSON.stringify(data.substitutions));
    }
    if (localStorage.getItem(STORAGE_KEYS.CONFIGURED) !== 'cleared') {
      localStorage.setItem(STORAGE_KEYS.CONFIGURED, 'true');
    }
  } catch {
    // Silently ignore
  }
}

/**
 * Reset memory storage to the official ACCFIN 2026-27 seed dataset.
 * When includeSampleLogHistory is false (factory reset), logSheets and substitutions are wiped to [].
 */
export function resetMemoryToSeed(includeSampleLogHistory = true): AppMemoryData {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEYS.CONFIGURED, 'true');
  }
  const seedData: AppMemoryData = {
    staffList: initialStaff.map(s => ({ ...s, onLeave: false })),
    classesList: initialClasses.map(c => ({ ...c })),
    timetableEntries: getInitialTimetableEntries().map(t => ({ ...t, staffIds: [...t.staffIds] })),
    logSheets: includeSampleLogHistory ? getInitialLogSheets().map(l => ({ ...l })) : [],
    substitutions: includeSampleLogHistory
      ? getInitialSubstitutions().map(s => ({
          ...s,
          swappedStaffIds: s.swappedStaffIds ? [...s.swappedStaffIds] : undefined,
        }))
      : [],
  };

  saveMemoryData(seedData);
  return seedData;
}

/**
 * Clear all memory storage records and mark status as 'cleared'.
 */
export function clearMemoryData(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEYS.STAFF, '[]');
  localStorage.setItem(STORAGE_KEYS.CLASSES, '[]');
  localStorage.setItem(STORAGE_KEYS.TIMETABLE, '[]');
  localStorage.setItem(STORAGE_KEYS.LOG_SHEETS, '[]');
  localStorage.setItem(STORAGE_KEYS.SUBSTITUTIONS, '[]');
  localStorage.setItem(STORAGE_KEYS.WORKLOAD, '{}');
  localStorage.setItem(STORAGE_KEYS.FIXED_PERIODS, '{}');
  localStorage.removeItem(STORAGE_KEYS.FIXED_PERIODS_INIT);
  localStorage.setItem(STORAGE_KEYS.GENERATED_SLOTS, '[]');
  localStorage.setItem(STORAGE_KEYS.CONFIGURED, 'cleared');
}

/**
 * Load persisted workload dictionary from local memory.
 */
export function loadWorkloadMemory(): Record<string, any[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.WORKLOAD);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist workload dictionary to local memory immediately.
 */
export function saveWorkloadMemory(workloadByClass: Record<string, any[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.WORKLOAD, JSON.stringify(workloadByClass));
  } catch {
    // Silently ignore storage errors
  }
}

/**
 * Load TT staff from local memory.
 */
export function loadTTStaffMemory(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TT_STAFF);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Persist TT staff to local memory immediately.
 */
export function saveTTStaffMemory(staff: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.TT_STAFF, JSON.stringify(staff));
  } catch {
    // Silently ignore
  }
}

/**
 * Check whether Step 0 fixed periods have been initialized in local memory.
 */
export function isFixedPeriodsInitialized(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_KEYS.FIXED_PERIODS_INIT) === 'true';
}

/**
 * Load Step 0 fixed periods map from local memory.
 */
export function loadFixedPeriodsMemory(): Record<string, any[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FIXED_PERIODS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Persist Step 0 fixed periods map to local memory immediately.
 */
export function saveFixedPeriodsMemory(fixedByClass: Record<string, any[]>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.FIXED_PERIODS, JSON.stringify(fixedByClass));
    localStorage.setItem(STORAGE_KEYS.FIXED_PERIODS_INIT, 'true');
  } catch {
    // Silently ignore
  }
}

/**
 * Load locally cached generated timetable slots (used as offline fallback for Step 3 View).
 */
export function loadGeneratedSlotsMemory(): any[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.GENERATED_SLOTS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Save generated timetable slots locally for resilient View Timetable rendering.
 */
export function saveGeneratedSlotsMemory(slots: any[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEYS.GENERATED_SLOTS, JSON.stringify(slots));
  } catch {
    // Silently ignore
  }
}


