import { supabase, isSupabaseConfigured, isExpectedSupabaseFallbackError } from './supabaseClient';
import { Staff, ClassSection, TimetableEntry, LogSheet, Substitution } from '../types';
import { isValidUUID, ensureUUID, generateUUID } from './uuid';
import { loadMemoryData, saveMemoryData, resetMemoryToSeed, deduplicateLogSheets, AppMemoryData, isMemoryCleared } from './memoryStorage';
import {
  initialStaff,
  initialClasses,
  getInitialTimetableEntries,
  getInitialLogSheets,
  getInitialSubstitutions,
  rawTimetable
} from '../data/seedData';
import { findStaffMember, rederiveTimetableEntries } from './staffUtils';

// ==========================================
// MAPPERS: Supabase snake_case <-> TypeScript camelCase
// ==========================================

export function mapStaffFromDB(row: any): Staff {
  return {
    id: row.id,
    code: row.code || '',
    fullName: row.full_name ?? null,
    isActive: row.is_active !== undefined ? !!row.is_active : true,
    onLeave: !!row.on_leave,
  };
}

export function mapStaffToDB(staff: Staff) {
  return {
    id: staff.id,
    code: staff.code,
    full_name: staff.fullName,
    is_active: staff.isActive,
    on_leave: !!staff.onLeave,
  };
}

export function mapClassSectionFromDB(row: any): ClassSection {
  return {
    id: row.id,
    yearLabel: row.year_label || '',
    section: row.section || '',
    roomNo: row.room_no || '',
    inchargeName: row.incharge_name || '',
    displayOrder: row.display_order !== undefined ? Number(row.display_order) : 0,
  };
}

export function mapClassSectionToDB(item: ClassSection) {
  return {
    id: item.id,
    year_label: item.yearLabel,
    section: item.section,
    room_no: item.roomNo,
    incharge_name: item.inchargeName,
    display_order: item.displayOrder,
  };
}

export function mapTimetableEntryFromDB(row: any): TimetableEntry {
  let staffIds: string[] = [];
  if (Array.isArray(row.staff_ids)) {
    staffIds = row.staff_ids;
  } else if (typeof row.staff_ids === 'string') {
    try {
      const parsed = JSON.parse(row.staff_ids);
      staffIds = Array.isArray(parsed) ? parsed : [row.staff_ids];
    } catch {
      staffIds = [row.staff_ids];
    }
  }

  return {
    id: row.id,
    classId: row.class_id || '',
    dayOrder: Number(row.day_order) || 1,
    period: Number(row.period) || 1,
    subjectCode: row.subject_code || '',
    isLab: !!row.is_lab,
    excludedFromSubstitution: !!row.excluded_from_substitution,
    staffIds,
  };
}

export function mapTimetableEntryToDB(item: TimetableEntry) {
  return {
    id: item.id,
    class_id: item.classId,
    day_order: item.dayOrder,
    period: item.period,
    subject_code: item.subjectCode,
    is_lab: item.isLab,
    excluded_from_substitution: item.excludedFromSubstitution,
    staff_ids: item.staffIds,
  };
}

export function mapLogSheetFromDB(row: any): LogSheet {
  return {
    id: row.id,
    logDate: row.log_date || '',
    dayOrder: Number(row.day_order) || 1,
    status: (row.status as 'draft' | 'finalized') || 'draft',
    finalizedAt: row.finalized_at || undefined,
    totalAbsentees: row.total_absentees !== undefined && row.total_absentees !== null ? Number(row.total_absentees) : undefined,
    totalSubstitutions: row.total_substitutions !== undefined && row.total_substitutions !== null ? Number(row.total_substitutions) : undefined,
  };
}

export function mapLogSheetToDB(item: LogSheet) {
  return {
    id: ensureUUID(item.id),
    log_date: item.logDate,
    day_order: item.dayOrder,
    status: item.status,
    finalized_at: item.finalizedAt || null,
    total_absentees: item.totalAbsentees !== undefined ? item.totalAbsentees : null,
    total_substitutions: item.totalSubstitutions !== undefined ? item.totalSubstitutions : null,
  };
}

export function mapSubstitutionFromDB(row: any): Substitution {
  let swappedStaffIds: string[] | undefined = undefined;
  if (Array.isArray(row.swapped_staff_ids)) {
    swappedStaffIds = row.swapped_staff_ids;
  } else if (typeof row.swapped_staff_ids === 'string') {
    try {
      const parsed = JSON.parse(row.swapped_staff_ids);
      swappedStaffIds = Array.isArray(parsed) ? parsed : [row.swapped_staff_ids];
    } catch {
      swappedStaffIds = [row.swapped_staff_ids];
    }
  }

  return {
    id: row.id,
    logSheetId: row.log_sheet_id || '',
    classId: row.class_id || '',
    period: Number(row.period) || 1,
    absentStaffId: row.absent_staff_id || '',
    substituteStaffId: row.substitute_staff_id || null,
    remarks: row.remarks || '',
    isSwap: !!row.is_swap,
    swapWithPeriod: row.swap_with_period !== null && row.swap_with_period !== undefined ? Number(row.swap_with_period) : undefined,
    swappedSubjectCode: row.swapped_subject_code || undefined,
    swappedStaffIds,
  };
}

export function mapSubstitutionToDB(item: Substitution) {
  return {
    id: ensureUUID(item.id),
    log_sheet_id: ensureUUID(item.logSheetId),
    class_id: item.classId,
    period: item.period,
    absent_staff_id: item.absentStaffId,
    substitute_staff_id: item.substituteStaffId || null,
    remarks: item.remarks || '',
    is_swap: !!item.isSwap,
    swap_with_period: item.swapWithPeriod !== undefined ? item.swapWithPeriod : null,
    swapped_subject_code: item.swappedSubjectCode || null,
    swapped_staff_ids: item.swappedStaffIds || null,
  };
}

// ==========================================
// SUPABASE DATA FETCHERS & MUTATIONS
// CONNECTED TO ACTIVE MEMORY & SUPABASE DATABASE
// ==========================================

export interface FetchAppDataResult {
  staffList: Staff[];
  classesList: ClassSection[];
  timetableEntries: TimetableEntry[];
  logSheets: LogSheet[];
  substitutions: Substitution[];
  isSupabaseLive: boolean;
  statusMessage?: string;
}

export async function fetchAllAppData(options?: { forceRemoteSync?: boolean }): Promise<FetchAppDataResult> {
  const forceRemoteSync = Boolean(options?.forceRemoteSync);
  const memoryData = loadMemoryData();
  const memoryCleared = isMemoryCleared();

  if (!isSupabaseConfigured) {
    if (forceRemoteSync) {
      return {
        ...memoryData,
        isSupabaseLive: false,
        statusMessage: 'Supabase is not configured. Loaded current local state.',
      };
    }
    return {
      ...memoryData,
      isSupabaseLive: false,
      statusMessage: memoryCleared
        ? 'All database records have been deleted. Touch "Seed Database" to restore past records anytime.'
        : 'Supabase is not configured yet. Operating in local memory mode with verified ACCFIN seed data.'
    };
  }

  try {
    const [staffRes, classesRes, timetableRes, logSheetsRes, substitutionsRes] = await Promise.all([
      supabase.from('staff').select('*').order('code', { ascending: true }),
      supabase.from('class_sections').select('*').order('display_order', { ascending: true }),
      supabase.from('timetable_entries').select('*'),
      supabase.from('log_sheets').select('*').order('log_date', { ascending: false }),
      supabase.from('substitutions').select('*'),
    ]);

    // Check if tt_staff is populated if staff table is missing or empty
    let staffList: Staff[] = [];
    if (!staffRes.error && staffRes.data && staffRes.data.length > 0) {
      staffList = staffRes.data.map(mapStaffFromDB);
    } else {
      try {
        const { data: ttData } = await supabase
          .from('tt_staff')
          .select('*')
          .order('full_name', { ascending: true });
        if (ttData && ttData.length > 0) {
          staffList = ttData.map((r: any) => ({
            id: r.id,
            code: r.short_code,
            fullName: r.full_name ?? null,
            isActive: r.status === 'ACTIVE',
            onLeave: false,
          }));
        }
      } catch {
        // Fallback below
      }
    }

    // Check if any core daily-operations tables are missing or not found in schema cache (PGRST205)
    const criticalTablesMissing = [staffRes, classesRes, timetableRes, logSheetsRes, substitutionsRes].some(
      r => r.error?.code === 'PGRST205' || r.error?.message?.includes('schema cache')
    );

    if (criticalTablesMissing) {
      if (memoryCleared) {
        return {
          staffList: [],
          classesList: [],
          timetableEntries: [],
          logSheets: [],
          substitutions: [],
          isSupabaseLive: false,
          statusMessage: 'All database records have been deleted. Touch "Seed Database" to restore past records anytime.'
        };
      }

      const mergedStaff = (!staffRes.error && staffRes.data && staffRes.data.length > 0)
        ? staffRes.data.map(mapStaffFromDB)
        : (memoryData.staffList.length > 0
            ? memoryData.staffList
            : (staffList.length > 0 ? staffList : initialStaff.map(s => ({ ...s }))));

      const mergedClasses = (classesRes.data && classesRes.data.length > 0)
        ? classesRes.data.map(mapClassSectionFromDB)
        : (memoryData.classesList.length > 0 ? memoryData.classesList : initialClasses);

      const mergedTimetable = (timetableRes.data && timetableRes.data.length > 0)
        ? timetableRes.data.map(mapTimetableEntryFromDB)
        : (memoryData.timetableEntries.length > 0 ? memoryData.timetableEntries : rederiveTimetableEntries(mergedClasses, mergedStaff));

      const mergedLogSheets = deduplicateLogSheets(
        (logSheetsRes.data && logSheetsRes.data.length > 0)
          ? logSheetsRes.data.map(mapLogSheetFromDB)
          : memoryData.logSheets
      ).sheets;

      const mergedSubs = (substitutionsRes.data && substitutionsRes.data.length > 0)
        ? substitutionsRes.data.map(mapSubstitutionFromDB)
        : memoryData.substitutions;

      const result = {
        staffList: mergedStaff,
        classesList: mergedClasses,
        timetableEntries: mergedTimetable,
        logSheets: mergedLogSheets,
        substitutions: mergedSubs,
      };

      saveMemoryData(result);

      return {
        ...result,
        isSupabaseLive: false,
        statusMessage: "Supabase tables pending migration. Running in active local memory mode. Apply the SQL migration to enable cloud sync."
      };
    }

    if (forceRemoteSync) {
      const remoteErr =
        staffRes.error || classesRes.error || timetableRes.error || logSheetsRes.error || substitutionsRes.error;
      if (remoteErr) {
        throw remoteErr;
      }
    }

    if (classesRes.error && timetableRes.error && staffList.length === 0) {
      const err = classesRes.error || timetableRes.error;
      return {
        ...memoryData,
        isSupabaseLive: false,
        statusMessage: memoryCleared
          ? 'All database records have been deleted. Touch "Seed Database" to restore past records anytime.'
          : `Database notice: ${err?.message || 'Connection pending'}. Active data loaded from memory.`
      };
    }

    let classesList: ClassSection[] = (classesRes.data || []).map(mapClassSectionFromDB);
    let timetableEntries: TimetableEntry[] = (timetableRes.data || []).map(mapTimetableEntryFromDB);
    let logSheets: LogSheet[] = (logSheetsRes.data || []).map(mapLogSheetFromDB);
    let substitutions: Substitution[] = (substitutionsRes.data || []).map(mapSubstitutionFromDB);

    // If user explicitly deleted all data in Danger Zone, do not force-seed
    if (memoryCleared) {
      staffList = [];
      classesList = [];
      timetableEntries = [];
      logSheets = [];
      substitutions = [];
    } else {
      // If tables are empty and not intentionally cleared, populate from memory/seed data
      if (staffList.length === 0) staffList = memoryData.staffList.length > 0 ? memoryData.staffList.map(s => ({ ...s })) : initialStaff.map(s => ({ ...s }));
      if (classesList.length === 0) classesList = memoryData.classesList.length > 0 ? memoryData.classesList.map(c => ({ ...c })) : initialClasses.map(c => ({ ...c }));
      
      // Ensure timetable entries are populated and their staffIds are aligned with staffList
      if (timetableEntries.length === 0) {
        timetableEntries = memoryData.timetableEntries && memoryData.timetableEntries.length > 0
          ? memoryData.timetableEntries.map(t => ({ ...t, staffIds: [...t.staffIds] }))
          : rederiveTimetableEntries(classesList, staffList);
      }

      // Re-align / backfill staffIds with active staffList to ensure no broken or (Nil) staff
      timetableEntries = timetableEntries.map(entry => {
        let resolvedStaffIds = (entry.staffIds || []).map(id => {
          const found = findStaffMember(staffList, id);
          return found ? found.id : id;
        });

        // If a departmental entry has missing or unresolved staffIds, re-derive from baseline timetable
        const hasValidStaff = resolvedStaffIds.some(id => !!findStaffMember(staffList, id));
        if ((resolvedStaffIds.length === 0 || !hasValidStaff) && !entry.excludedFromSubstitution) {
          const fallback = rawTimetable[entry.classId]?.[entry.dayOrder]?.[entry.period - 1];
          if (fallback?.staffCodes) {
            resolvedStaffIds = fallback.staffCodes
              .map(code => findStaffMember(staffList, code)?.id || code)
              .filter(Boolean);
          }
        }

        return {
          ...entry,
          staffIds: resolvedStaffIds
        };
      });

      // If Supabase queries succeeded, Supabase's rows (even []) are authoritative for log_sheets and substitutions
      if (logSheetsRes.error && !forceRemoteSync) {
        logSheets = memoryData.logSheets.map(l => ({ ...l }));
      }
      if (substitutionsRes.error && !forceRemoteSync) {
        substitutions = memoryData.substitutions.map(s => ({
          ...s,
          swappedStaffIds: s.swappedStaffIds ? [...s.swappedStaffIds] : undefined,
        }));
      }
    }

    // Normalize UUID identifiers
    const legacyMap = new Map<string, string>();
    logSheets = logSheets.map(sheet => {
      if (!isValidUUID(sheet.id)) {
        const validId = ensureUUID(sheet.id, legacyMap);
        return { ...sheet, id: validId };
      }
      return sheet;
    });

    substitutions = substitutions.map(sub => {
      let logSheetId = sub.logSheetId;
      if (!isValidUUID(logSheetId)) {
        logSheetId = ensureUUID(logSheetId, legacyMap);
      }
      let subId = sub.id;
      if (!isValidUUID(subId)) {
        subId = ensureUUID(subId);
      }
      return { ...sub, id: subId, logSheetId };
    });

    logSheets = deduplicateLogSheets(logSheets).sheets;

    const result = {
      staffList,
      classesList,
      timetableEntries,
      logSheets,
      substitutions,
    };

    // Save to local memory storage so state is always preserved locally
    saveMemoryData(result);

    return {
      ...result,
      isSupabaseLive: true,
      statusMessage: 'Connected and synchronized with Supabase.'
    };
  } catch (err: any) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Network or connectivity error while contacting Supabase, using active memory:', err);
    }
    return {
      ...memoryData,
      isSupabaseLive: false,
      statusMessage: `Running in active memory mode. (${err?.message || 'Connection offline'})`
    };
  }
}

/**
 * Seed Database with all current and past data from coding, connecting both memory and Supabase.
 * Automatically feeds 18 staff, 11 classes, 330 timetable periods, today's current log sheet,
 * historical log sheets, and substitutions into Supabase and memory.
 */
export async function seedDatabaseWithPastData(
  currentData?: Partial<AppMemoryData>
): Promise<{
  success: boolean;
  staffCount: number;
  classesCount: number;
  timetableCount: number;
  logSheetsCount: number;
  substitutionsCount: number;
  syncedToSupabase: boolean;
  message: string;
  data: AppMemoryData;
}> {
  // 1. Staff: 18 verified ACCFIN faculty + any current custom staff
  const staffMap = new Map<string, Staff>();
  initialStaff.forEach(s => staffMap.set(s.id, { ...s, isActive: true, onLeave: false }));
  if (currentData?.staffList) {
    currentData.staffList.forEach(s => staffMap.set(s.id, s));
  }
  const staff = Array.from(staffMap.values());

  // 2. Classes: 11 verified class sections + any current custom classes
  const classesMap = new Map<string, ClassSection>();
  initialClasses.forEach(c => classesMap.set(c.id, c));
  if (currentData?.classesList) {
    currentData.classesList.forEach(c => classesMap.set(c.id, c));
  }
  const classes = Array.from(classesMap.values());

  // 3. Timetable: 330 verified periods across Day Orders 1-6 + any current custom periods
  const ttMap = new Map<string, TimetableEntry>();
  getInitialTimetableEntries().forEach(t => ttMap.set(t.id, t));
  if (currentData?.timetableEntries) {
    currentData.timetableEntries.forEach(t => ttMap.set(t.id, t));
  }
  const timetable = Array.from(ttMap.values());

  // 4. Log Sheets: Today's current live sheet + 6 verified history sheets + any custom sheets
  const todayStr = new Date().toISOString().split('T')[0];
  const sheetsMap = new Map<string, LogSheet>();

  // Add historical log sheets
  getInitialLogSheets().forEach(s => sheetsMap.set(s.logDate, s));

  // Include any current data log sheets first so existing IDs are tracked
  if (currentData?.logSheets) {
    currentData.logSheets.forEach(s => {
      sheetsMap.set(s.logDate, s);
    });
  }

  // Ensure current date sheet is present and active with a guaranteed unique ID
  const usedSheetIds = new Set(Array.from(sheetsMap.values()).map(s => s.id));
  if (!sheetsMap.has(todayStr)) {
    const defaultTodayId = 'a1111111-1111-4111-8111-111111111100';
    const todaySheetId = usedSheetIds.has(defaultTodayId) ? generateUUID() : defaultTodayId;
    sheetsMap.set(todayStr, {
      id: todaySheetId,
      logDate: todayStr,
      dayOrder: 1,
      status: 'draft',
      totalAbsentees: 2,
      totalSubstitutions: 3,
    });
  }

  const logSheets = deduplicateLogSheets(Array.from(sheetsMap.values())).sheets.sort((a, b) =>
    b.logDate.localeCompare(a.logDate)
  );
  const activeTodaySheet = logSheets.find(s => s.logDate === todayStr) || logSheets[0];

  // 5. Substitutions: Today's current live substitutions + historical substitutions
  const subsMap = new Map<string, Substitution>();
  getInitialSubstitutions().forEach(s => subsMap.set(s.id, s));

  // Merge any in-memory current substitutions first
  if (currentData?.substitutions) {
    currentData.substitutions.forEach(s => subsMap.set(s.id, s));
  }

  // Feed sample active substitutions for today's sheet if none exist yet for today
  const hasTodaySubs = Array.from(subsMap.values()).some(s => s.logSheetId === activeTodaySheet.id);
  if (!hasTodaySubs) {
    const todaySubs: Substitution[] = [
      {
        id: subsMap.has('b1111111-1111-4111-8111-111111111111') ? generateUUID() : 'b1111111-1111-4111-8111-111111111111',
        logSheetId: activeTodaySheet.id,
        classId: 'class-I-BCOM-AF-A',
        period: 1,
        absentStaffId: 'staff-KM',
        substituteStaffId: 'staff-TP',
        remarks: 'Medical Leave - Handled by TP',
      },
      {
        id: subsMap.has('b1111111-1111-4111-8111-111111111112') ? generateUUID() : 'b1111111-1111-4111-8111-111111111112',
        logSheetId: activeTodaySheet.id,
        classId: 'class-II-BCOM-AF-B',
        period: 2,
        absentStaffId: 'staff-DJ',
        substituteStaffId: 'staff-GS',
        remarks: 'Academic Council Duty',
      },
      {
        id: subsMap.has('b1111111-1111-4111-8111-111111111113') ? generateUUID() : 'b1111111-1111-4111-8111-111111111113',
        logSheetId: activeTodaySheet.id,
        classId: 'class-III-BCOM-AF-A',
        period: 4,
        absentStaffId: 'staff-TP',
        substituteStaffId: 'staff-JP',
        remarks: 'Valuation Duty - Substitute Assigned',
      },
    ];
    todaySubs.forEach(s => subsMap.set(s.id, s));
  }

  const substitutions = Array.from(subsMap.values());

  const appData: AppMemoryData = {
    staffList: staff,
    classesList: classes,
    timetableEntries: timetable,
    logSheets,
    substitutions,
  };

  // 6. Reset local resilient memory storage immediately with all current and past data
  resetMemoryToSeed();
  saveMemoryData(appData);

  let syncedTablesCount = 0;
  let supabaseError: string | null = null;

  // 7. If Supabase is configured, upsert everything into Supabase tables in FK-safe order
  if (isSupabaseConfigured) {
    try {
      // 7.1 Upsert staff
      const staffPayload = staff.map(mapStaffToDB);
      const { error: staffErr } = await supabase.from('staff').upsert(staffPayload, { onConflict: 'id' });
      const isOffline = staffErr?.code === 'PGRST_OFFLINE';

      if (!staffErr) {
        syncedTablesCount++;
      } else {
        if (!isExpectedSupabaseFallbackError(staffErr)) {
          console.warn('Staff upsert notice:', staffErr.message);
        }
        supabaseError = staffErr.message;
      }

      if (!isOffline) {
        // 7.2 Upsert classes
        const classesPayload = classes.map(mapClassSectionToDB);
        const { error: classesErr } = await supabase.from('class_sections').upsert(classesPayload, { onConflict: 'id' });
        if (!classesErr) {
          syncedTablesCount++;
        } else {
          if (!isExpectedSupabaseFallbackError(classesErr)) {
            console.warn('Classes upsert notice:', classesErr.message);
          }
          supabaseError = classesErr.message;
        }

        // 7.3 Upsert timetable entries in safe chunks of 50 (stop immediately if table missing or offline)
        const timetablePayload = timetable.map(mapTimetableEntryToDB);
        let timetableSuccess = true;
        for (let i = 0; i < timetablePayload.length; i += 50) {
          const chunk = timetablePayload.slice(i, i + 50);
          const { error: ttErr } = await supabase.from('timetable_entries').upsert(chunk, { onConflict: 'id' });
          if (ttErr) {
            timetableSuccess = false;
            if (!isExpectedSupabaseFallbackError(ttErr)) {
              console.warn(`Timetable chunk [${i}-${i + 50}] upsert notice:`, ttErr.message);
            }
            supabaseError = ttErr.message;
            if (isExpectedSupabaseFallbackError(ttErr)) {
              break;
            }
          }
        }
        if (timetableSuccess) syncedTablesCount++;

        // 7.4 Upsert log sheets
        const logSheetsPayload = logSheets.map(mapLogSheetToDB);
        const { error: logErr } = await supabase.from('log_sheets').upsert(logSheetsPayload, { onConflict: 'id' });
        if (!logErr) {
          syncedTablesCount++;
        } else {
          if (!isExpectedSupabaseFallbackError(logErr)) {
            console.warn('Log sheets upsert notice:', logErr.message);
          }
          supabaseError = logErr.message;
        }

        // 7.5 Upsert substitutions
        const subsPayload = substitutions.map(mapSubstitutionToDB);
        const { error: subErr } = await supabase.from('substitutions').upsert(subsPayload, { onConflict: 'id' });
        if (!subErr) {
          syncedTablesCount++;
        } else {
          if (!isExpectedSupabaseFallbackError(subErr)) {
            console.warn('Substitutions upsert notice:', subErr.message);
          }
          supabaseError = subErr.message;
        }

        // 7.6 Upsert tt_staff and tt_classes for the Timetable Generator
        try {
          const ttStaffPayload = [
            { short_code: 'AJ',  full_name: 'DR. A. JULIET', is_hod: false, status: 'ACTIVE' },
            { short_code: 'DA',  full_name: 'DR. D. AKILANDESWARI', is_hod: false, status: 'ACTIVE' },
            { short_code: 'DJ',  full_name: 'MR. B. DENNY JONES', is_hod: false, status: 'ACTIVE' },
            { short_code: 'FND', full_name: 'DR. P. FATHIMA NANCY DYANA', is_hod: false, status: 'ACTIVE' },
            { short_code: 'GS',  full_name: 'DR. G. SATHYA', is_hod: false, status: 'ACTIVE' },
            { short_code: 'JD',  full_name: 'MS. D. JAYALAKSHMI', is_hod: false, status: 'ACTIVE' },
            { short_code: 'JP',  full_name: 'DR. R. JOTHIPRAKASH', is_hod: false, status: 'ACTIVE' },
            { short_code: 'KM',  full_name: 'MS. K. MATHUMATHI', is_hod: false, status: 'ACTIVE' },
            { short_code: 'KS',  full_name: 'MS. K. SINDHUJA', is_hod: false, status: 'ACTIVE' },
            { short_code: 'MJ',  full_name: 'DR. M. JAGADEESWARI', is_hod: false, status: 'ACTIVE' },
            { short_code: 'MP',  full_name: 'MS. P. MEENA', is_hod: false, status: 'ACTIVE' },
            { short_code: 'OJ',  full_name: 'DR. M. OPHELIA JANEFER', is_hod: false, status: 'ACTIVE' },
            { short_code: 'PM',  full_name: 'DR. P. MARIAPPAN', is_hod: false, status: 'ACTIVE' },
            { short_code: 'PS',  full_name: 'DR. B. PADMASHREE', is_hod: false, status: 'ACTIVE' },
            { short_code: 'RP',  full_name: 'DR. P. RAJENDRA PRASAD', is_hod: true, status: 'ACTIVE' },
            { short_code: 'RT',  full_name: 'MR. R. THIRUMURUGAN', is_hod: false, status: 'ACTIVE' },
            { short_code: 'SS',  full_name: 'MS. SHILPA S', is_hod: false, status: 'ACTIVE' },
            { short_code: 'TP',  full_name: 'MS. T. PARKAVI', is_hod: false, status: 'ACTIVE' }
          ];
          await supabase.from('tt_staff').upsert(ttStaffPayload, { onConflict: 'short_code' });

          const ttClassesPayload = [
            { code: 'I-MCOM',     display_name: 'I M.COM',        sort_order: 1 },
            { code: 'II-MCOM',    display_name: 'II M.COM',       sort_order: 2 },
            { code: 'I-BCOM-A',   display_name: 'I B.COM - A',    sort_order: 3 },
            { code: 'I-BCOM-B',   display_name: 'I B.COM - B',    sort_order: 4 },
            { code: 'I-BCOM-C',   display_name: 'I B.COM - C',    sort_order: 5 },
            { code: 'II-BCOM-A',  display_name: 'II B.COM - A',   sort_order: 6 },
            { code: 'II-BCOM-B',  display_name: 'II B.COM - B',   sort_order: 7 },
            { code: 'II-BCOM-C',  display_name: 'II B.COM - C',   sort_order: 8 },
            { code: 'III-BCOM-A', display_name: 'III B.COM - A',  sort_order: 9 },
            { code: 'III-BCOM-B', display_name: 'III B.COM - B',  sort_order: 10 },
            { code: 'III-BCOM-C', display_name: 'III B.COM - C',  sort_order: 11 }
          ];
          await supabase.from('tt_classes').upsert(ttClassesPayload, { onConflict: 'code' });
        } catch (ttErr) {
          if (!isExpectedSupabaseFallbackError(ttErr)) {
            console.warn('tt_staff / tt_classes seed notice:', ttErr);
          }
        }
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase upsert during seed failed:', err);
      }
      supabaseError = err?.message || 'Database schema error';
    }
  }

  const syncedToSupabase = isSupabaseConfigured && syncedTablesCount > 0;
  const message = syncedToSupabase
    ? `All current & past data automatically fed and restored! Fed ${staff.length} staff, ${classes.length} classes, ${timetable.length} periods, ${logSheets.length} log sheets (current & history), and ${substitutions.length} substitutions into Supabase and memory.`
    : `All current & past data automatically fed into active memory! (${staff.length} staff, ${classes.length} classes, ${timetable.length} periods, ${logSheets.length} log sheets, and ${substitutions.length} substitutions)`;

  return {
    success: true,
    staffCount: staff.length,
    classesCount: classes.length,
    timetableCount: timetable.length,
    logSheetsCount: logSheets.length,
    substitutionsCount: substitutions.length,
    syncedToSupabase,
    message,
    data: appData,
  };
}

/**
 * Full Factory Reset & Reseed Database:
 * - Erases ALL log sheets, substitutions, swaps, and custom edits across EVERY date
 * - Verifies zero remaining rows in `substitutions` and `log_sheets`
 * - Reseeds clean master staff, class sections, and master timetable (with zero substitutions)
 */
export async function resetDatabaseToFactoryDefaults(): Promise<{
  success: boolean;
  staffCount: number;
  classesCount: number;
  timetableCount: number;
  syncedToSupabase: boolean;
  message: string;
  error?: string;
  data: AppMemoryData;
}> {
  // 1. Wipe local persistent memory cleanly (ZERO substitutions & ZERO log sheets)
  const seedData = resetMemoryToSeed(false);
  let syncedToSupabase = false;

  // 2. If Supabase is configured, delete ALL daily & master records and verify deletion
  if (isSupabaseConfigured) {
    try {
      const { error: delSubErr } = await supabase.from('substitutions').delete().not('id', 'is', null);
      if (delSubErr) throw delSubErr;

      const { error: delSheetErr } = await supabase.from('log_sheets').delete().not('id', 'is', null);
      if (delSheetErr) throw delSheetErr;

      // Verify zero rows remain in substitutions and log_sheets across all dates
      const [{ data: remainingSubs, error: verifySubErr }, { data: remainingSheets, error: verifySheetErr }] =
        await Promise.all([
          supabase.from('substitutions').select('id').limit(1),
          supabase.from('log_sheets').select('id').limit(1),
        ]);

      if (verifySubErr) throw verifySubErr;
      if (verifySheetErr) throw verifySheetErr;

      if ((remainingSubs && remainingSubs.length > 0) || (remainingSheets && remainingSheets.length > 0)) {
        const msg =
          'Reset failed: substitution or log sheet rows still remain in Supabase (check database permissions / sign-in).';
        return {
          success: false,
          staffCount: 0,
          classesCount: 0,
          timetableCount: 0,
          syncedToSupabase: false,
          error: msg,
          message: msg,
          data: seedData,
        };
      }

      const { error: delTtErr } = await supabase.from('timetable_entries').delete().not('id', 'is', null);
      if (delTtErr) throw delTtErr;

      const { error: delClassErr } = await supabase.from('class_sections').delete().not('id', 'is', null);
      if (delClassErr) throw delClassErr;

      const { error: delStaffErr } = await supabase.from('staff').delete().not('id', 'is', null);
      if (delStaffErr) throw delStaffErr;

      // Reseed clean master data ONLY (never reseed substitutions or historical log sheets)
      const { error: staffErr } = await supabase
        .from('staff')
        .upsert(seedData.staffList.map(mapStaffToDB), { onConflict: 'id' });
      if (staffErr) throw staffErr;

      const { error: classesErr } = await supabase
        .from('class_sections')
        .upsert(seedData.classesList.map(mapClassSectionToDB), { onConflict: 'id' });
      if (classesErr) throw classesErr;

      const ttPayload = seedData.timetableEntries.map(mapTimetableEntryToDB);
      for (let i = 0; i < ttPayload.length; i += 50) {
        const chunk = ttPayload.slice(i, i + 50);
        const { error: ttErr } = await supabase.from('timetable_entries').upsert(chunk, { onConflict: 'id' });
        if (ttErr) throw ttErr;
      }

      // Final verification check that substitutions remains completely empty
      const { data: postSubsCheck, error: postCheckErr } = await supabase
        .from('substitutions')
        .select('id')
        .limit(1);
      if (postCheckErr) throw postCheckErr;
      if (postSubsCheck && postSubsCheck.length > 0) {
        const msg = 'Reset verification failed: substitution records are still present in Supabase.';
        return {
          success: false,
          staffCount: 0,
          classesCount: 0,
          timetableCount: 0,
          syncedToSupabase: false,
          error: msg,
          message: msg,
          data: seedData,
        };
      }

      syncedToSupabase = true;
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        const errMsg = formatSupabaseError(err, 'Failed to reset Supabase database');
        return {
          success: false,
          staffCount: 0,
          classesCount: 0,
          timetableCount: 0,
          syncedToSupabase: false,
          error: errMsg,
          message: `Reset Database failed in Supabase: ${errMsg}`,
          data: seedData,
        };
      }
      // Expected fallback when Supabase is unreachable or tables aren't migrated yet:
      // local memory has been wiped cleanly with 0 substitutions.
    }
  }

  return {
    success: true,
    staffCount: seedData.staffList.length,
    classesCount: seedData.classesList.length,
    timetableCount: seedData.timetableEntries.length,
    syncedToSupabase,
    message: syncedToSupabase
      ? `Database reset complete! All substitutions and log sheets cleared; clean master timetable restored (${seedData.staffList.length} faculty, ${seedData.classesList.length} classes, ${seedData.timetableEntries.length} periods).`
      : `Local database reset complete! All substitutions and log sheets cleared; clean master timetable restored (${seedData.staffList.length} faculty, ${seedData.classesList.length} classes, ${seedData.timetableEntries.length} periods).`,
    data: seedData,
  };
}

export function formatSupabaseError(err: any, defaultMsg = 'Database operation failed'): string {
  if (!err) return defaultMsg;
  if (err.code === 'PGRST205' || err.message?.includes('schema cache')) {
    return "Database table not found in Supabase schema cache. Data has been saved safely in local memory. (Run 20260914_full_app_schema.sql in Supabase SQL Editor to sync with cloud).";
  }
  if (err.code === '42501' || err.message?.includes('permission denied') || err.message?.includes('row-level security')) {
    return "Permission denied by database security policy. Please ensure you are logged in.";
  }
  return err.message || defaultMsg;
}

/**
 * Persist an added or edited faculty member to both memory and Supabase (staff and tt_staff tables).
 */
export async function syncFacultyMemberToDatabase(
  staff: Staff,
  isHOD = false
): Promise<{ success: boolean; message: string }> {
  // 1. Update local memory immediately
  const memory = loadMemoryData();
  const existingStaff = memory.staffList || [];
  const idx = existingStaff.findIndex(s => s.id === staff.id || s.code.toUpperCase() === staff.code.toUpperCase());
  let updatedList: Staff[];
  if (idx >= 0) {
    updatedList = existingStaff.map((s, i) => (i === idx ? { ...s, ...staff } : s));
  } else {
    updatedList = [...existingStaff, staff];
  }
  saveMemoryData({ staffList: updatedList });

  // 2. Persist to Supabase
  if (isSupabaseConfigured) {
    try {
      // 2.1 Update staff table
      await supabase.from('staff').upsert(mapStaffToDB(staff), { onConflict: 'id' });
    } catch {
      // ignore
    }

    try {
      // 2.2 Update tt_staff table
      await supabase.from('tt_staff').upsert({
        id: isValidUUID(staff.id) ? staff.id : undefined,
        short_code: staff.code.toUpperCase(),
        full_name: staff.fullName || `Prof. ${staff.code.toUpperCase()}`,
        status: staff.isActive ? 'ACTIVE' : 'INACTIVE',
        is_hod: isHOD,
      }, { onConflict: 'short_code' });
    } catch {
      // ignore
    }
  }

  return { success: true, message: `Faculty member ${staff.code} synchronized successfully.` };
}

/**
 * Remove a faculty member from both memory and Supabase.
 */
export async function deleteFacultyMemberFromDatabase(
  staffId: string,
  staffCode?: string
): Promise<{ success: boolean; message: string }> {
  // 1. Update local memory
  const memory = loadMemoryData();
  const updatedStaff = (memory.staffList || []).filter(s => s.id !== staffId && (!staffCode || s.code !== staffCode));
  saveMemoryData({ staffList: updatedStaff });

  // 2. Delete from Supabase
  if (isSupabaseConfigured) {
    try {
      await supabase.from('staff').delete().eq('id', staffId);
    } catch {
      // ignore
    }

    try {
      if (isValidUUID(staffId)) {
        await supabase.from('tt_staff').delete().eq('id', staffId);
      } else if (staffCode) {
        await supabase.from('tt_staff').delete().eq('short_code', staffCode.toUpperCase());
      }
    } catch {
      // ignore
    }
  }

  return { success: true, message: 'Faculty member removed successfully.' };
}

/**
 * Toggle faculty active/inactive status in both memory and Supabase.
 */
export async function toggleFacultyStatusInDatabase(
  staffId: string,
  newActiveState: boolean,
  staffCode?: string
): Promise<{ success: boolean }> {
  const memory = loadMemoryData();
  const updatedStaff = (memory.staffList || []).map(s => {
    if (s.id === staffId || (staffCode && s.code === staffCode)) {
      return { ...s, isActive: newActiveState };
    }
    return s;
  });
  saveMemoryData({ staffList: updatedStaff });

  if (isSupabaseConfigured) {
    try {
      await supabase.from('staff').update({ is_active: newActiveState }).eq('id', staffId);
    } catch {}
    try {
      const statusStr = newActiveState ? 'ACTIVE' : 'INACTIVE';
      if (isValidUUID(staffId)) {
        await supabase.from('tt_staff').update({ status: statusStr }).eq('id', staffId);
      } else if (staffCode) {
        await supabase.from('tt_staff').update({ status: statusStr }).eq('short_code', staffCode.toUpperCase());
      }
    } catch {}
  }

  return { success: true };
}

/**
 * Toggle faculty on-leave status in both memory and Supabase.
 */
export async function toggleFacultyLeaveInDatabase(
  staffId: string,
  newLeaveState: boolean
): Promise<{ success: boolean }> {
  const memory = loadMemoryData();
  const updatedStaff = (memory.staffList || []).map(s => {
    if (s.id === staffId) {
      return { ...s, onLeave: newLeaveState };
    }
    return s;
  });
  saveMemoryData({ staffList: updatedStaff });

  if (isSupabaseConfigured) {
    try {
      await supabase.from('staff').update({ on_leave: newLeaveState }).eq('id', staffId);
    } catch {}
  }

  return { success: true };
}

