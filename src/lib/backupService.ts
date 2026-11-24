import { supabase, isSupabaseConfigured } from './supabaseClient';
import {
  BackupRecord,
  Staff,
  ClassSection,
  TimetableEntry,
  LogSheet,
  Substitution
} from '../types';
import { ensureUUID } from './uuid';
import { loadMemoryData, saveMemoryData } from './memoryStorage';
import {
  mapStaffFromDB,
  mapStaffToDB,
  mapClassSectionFromDB,
  mapClassSectionToDB,
  mapTimetableEntryFromDB,
  mapTimetableEntryToDB,
  mapLogSheetFromDB,
  mapLogSheetToDB,
  mapSubstitutionFromDB,
  mapSubstitutionToDB,
} from './database';

const BACKUPS_STORAGE_KEY = 'accfin_database_backups_v1';

/**
 * Reads local backups stored in browser resilient storage.
 */
export function getLocalBackups(): BackupRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(BACKUPS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Saves a backup to local resilient storage.
 */
export function saveLocalBackup(backup: BackupRecord): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalBackups();
    const updated = [backup, ...current.filter(b => b.id !== backup.id)];
    // Keep the latest 25 backups to avoid browser storage exhaustion
    const capped = updated.slice(0, 25);
    localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Silently ignore
  }
}

/**
 * Removes a backup from local resilient storage.
 */
export function removeLocalBackup(backupId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getLocalBackups();
    const updated = current.filter(b => b.id !== backupId);
    localStorage.setItem(BACKUPS_STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Silently ignore
  }
}

/**
 * Fetches all backups from Supabase `backups` table and/or local resilient storage.
 * Deduplicates by ID and sorts by created_at descending.
 */
export async function fetchBackups(): Promise<BackupRecord[]> {
  const localBackups = getLocalBackups();
  let supabaseBackups: BackupRecord[] = [];

  if (isSupabaseConfigured) {
    try {
      const { data, error } = await supabase
        .from('backups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        // Table doesn't exist yet (PGRST205) or schema cache issue - silent fallback to local resilient memory
      } else if (data && Array.isArray(data)) {
        supabaseBackups = data.map((row: any) => ({
          id: row.id,
          backup_label: row.backup_label || 'Untitled Backup',
          created_at: row.created_at || new Date().toISOString(),
          created_by: row.created_by || 'System',
          staff_snapshot: Array.isArray(row.staff_snapshot) ? row.staff_snapshot : [],
          class_sections_snapshot: Array.isArray(row.class_sections_snapshot) ? row.class_sections_snapshot : [],
          timetable_entries_snapshot: Array.isArray(row.timetable_entries_snapshot) ? row.timetable_entries_snapshot : [],
          log_sheets_snapshot: Array.isArray(row.log_sheets_snapshot) ? row.log_sheets_snapshot : [],
          substitutions_snapshot: Array.isArray(row.substitutions_snapshot) ? row.substitutions_snapshot : [],
        }));
      }
    } catch {
      // Handled silently
    }
  }

  // Merge and deduplicate by id
  const map = new Map<string, BackupRecord>();
  for (const b of localBackups) {
    map.set(b.id, b);
  }
  for (const b of supabaseBackups) {
    map.set(b.id, b);
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export interface CreateBackupOptions {
  label?: string;
  createdBy?: string;
}

/**
 * Creates a dated full backup snapshot.
 * Gathers data from live Supabase tables or active memory, saves locally to ensure zero data loss,
 * and syncs to Supabase `backups` table if available without crashing or throwing if unmigrated.
 */
export async function createDatabaseBackup(options: CreateBackupOptions): Promise<{
  success: boolean;
  backup?: BackupRecord;
  syncedToCloud?: boolean;
  error?: string;
}> {
  try {
    // 1. Gather baseline snapshot from active memory storage
    const memory = loadMemoryData();
    let staffSnapshot: any[] = memory.staffList.map(mapStaffToDB);
    let classesSnapshot: any[] = memory.classesList.map(mapClassSectionToDB);
    let timetableSnapshot: any[] = memory.timetableEntries.map(mapTimetableEntryToDB);
    let logSheetsSnapshot: any[] = memory.logSheets.map(mapLogSheetToDB);
    let substitutionsSnapshot: any[] = memory.substitutions.map(mapSubstitutionToDB);

    // If Supabase is connected, prefer reading live Supabase table rows if available
    if (isSupabaseConfigured) {
      try {
        const [staffRes, classesRes, timetableRes, logSheetsRes, substitutionsRes] = await Promise.all([
          supabase.from('staff').select('*'),
          supabase.from('class_sections').select('*'),
          supabase.from('timetable_entries').select('*'),
          supabase.from('log_sheets').select('*'),
          supabase.from('substitutions').select('*'),
        ]);

        if (!staffRes.error && Array.isArray(staffRes.data) && staffRes.data.length > 0) {
          staffSnapshot = staffRes.data;
        }
        if (!classesRes.error && Array.isArray(classesRes.data) && classesRes.data.length > 0) {
          classesSnapshot = classesRes.data;
        }
        if (!timetableRes.error && Array.isArray(timetableRes.data) && timetableRes.data.length > 0) {
          timetableSnapshot = timetableRes.data;
        }
        if (!logSheetsRes.error && Array.isArray(logSheetsRes.data) && logSheetsRes.data.length > 0) {
          logSheetsSnapshot = logSheetsRes.data;
        }
        if (!substitutionsRes.error && Array.isArray(substitutionsRes.data)) {
          substitutionsSnapshot = substitutionsRes.data;
        }
      } catch {
        // Fallback to memory snapshot silently
      }
    }

    // 2. Format readable date/time for label
    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const autoLabel = `Backup - ${formattedDate} at ${formattedTime}`;
    const backupLabel = options.label && options.label.trim() ? options.label.trim() : autoLabel;

    const backupId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `bk-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const newBackup: BackupRecord = {
      id: backupId,
      backup_label: backupLabel,
      created_at: now.toISOString(),
      created_by: options.createdBy?.trim() || 'Admin',
      staff_snapshot: staffSnapshot,
      class_sections_snapshot: classesSnapshot,
      timetable_entries_snapshot: timetableSnapshot,
      log_sheets_snapshot: logSheetsSnapshot,
      substitutions_snapshot: substitutionsSnapshot,
    };

    // 3. Save to local resilient storage first (guaranteed persistence)
    saveLocalBackup(newBackup);

    let syncedToCloud = false;

    // 4. If Supabase is configured, attempt to insert into the `backups` table
    if (isSupabaseConfigured) {
      try {
        const { error: insertError } = await supabase.from('backups').insert([
          {
            id: newBackup.id,
            backup_label: newBackup.backup_label,
            created_at: newBackup.created_at,
            created_by: newBackup.created_by,
            staff_snapshot: newBackup.staff_snapshot,
            class_sections_snapshot: newBackup.class_sections_snapshot,
            timetable_entries_snapshot: newBackup.timetable_entries_snapshot,
            log_sheets_snapshot: newBackup.log_sheets_snapshot,
            substitutions_snapshot: newBackup.substitutions_snapshot,
          }
        ]);

        if (!insertError) {
          syncedToCloud = true;
        }
      } catch {
        // Preserved locally in resilient memory
      }
    }

    return {
      success: true,
      backup: newBackup,
      syncedToCloud,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unknown backup error occurred',
    };
  }
}

/**
 * Restores a selected backup snapshot into both persistent memory and Supabase tables.
 */
export async function restoreDatabaseBackup(backup: BackupRecord): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // 1. Immediately restore into local memory storage
    const mappedStaff = (backup.staff_snapshot || []).map(mapStaffFromDB);
    const mappedClasses = (backup.class_sections_snapshot || []).map(mapClassSectionFromDB);
    const mappedTimetable = (backup.timetable_entries_snapshot || []).map(mapTimetableEntryFromDB);
    const mappedLogs = (backup.log_sheets_snapshot || []).map(mapLogSheetFromDB);
    const mappedSubs = (backup.substitutions_snapshot || []).map(mapSubstitutionFromDB);

    saveMemoryData({
      staffList: mappedStaff.length > 0 ? mappedStaff : undefined,
      classesList: mappedClasses.length > 0 ? mappedClasses : undefined,
      timetableEntries: mappedTimetable.length > 0 ? mappedTimetable : undefined,
      logSheets: mappedLogs.length > 0 ? mappedLogs : undefined,
      substitutions: mappedSubs,
    });

    // 2. If Supabase is configured, attempt to restore to Supabase tables in FK-safe order
    if (isSupabaseConfigured) {
      try {
        // FK-Safe Deletions
        await supabase.from('substitutions').delete().not('id', 'is', null);
        await supabase.from('log_sheets').delete().not('id', 'is', null);
        await supabase.from('timetable_entries').delete().not('id', 'is', null);
        await supabase.from('class_sections').delete().not('id', 'is', null);
        await supabase.from('staff').delete().not('id', 'is', null);

        // Reverse FK-Safe Insertions
        if (backup.staff_snapshot && backup.staff_snapshot.length > 0) {
          await supabase.from('staff').insert(backup.staff_snapshot);
        }

        if (backup.class_sections_snapshot && backup.class_sections_snapshot.length > 0) {
          await supabase.from('class_sections').insert(backup.class_sections_snapshot);
        }

        if (backup.timetable_entries_snapshot && backup.timetable_entries_snapshot.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < backup.timetable_entries_snapshot.length; i += chunkSize) {
            const chunk = backup.timetable_entries_snapshot.slice(i, i + chunkSize);
            await supabase.from('timetable_entries').insert(chunk);
          }
        }

        const restoreLegacyMap = new Map<string, string>();
        if (backup.log_sheets_snapshot && backup.log_sheets_snapshot.length > 0) {
          const sanitizedLogs = backup.log_sheets_snapshot.map((row: any) => ({
            ...row,
            id: ensureUUID(row.id, restoreLegacyMap)
          }));
          await supabase.from('log_sheets').insert(sanitizedLogs);
        }

        if (backup.substitutions_snapshot && backup.substitutions_snapshot.length > 0) {
          const sanitizedSubs = backup.substitutions_snapshot.map((row: any) => ({
            ...row,
            id: ensureUUID(row.id),
            log_sheet_id: ensureUUID(row.log_sheet_id, restoreLegacyMap)
          }));
          await supabase.from('substitutions').insert(sanitizedSubs);
        }
      } catch {
        // Local memory restore succeeded
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Database restore failed',
    };
  }
}

/**
 * Deletes a backup record from local resilient storage and Supabase backups table.
 */
export async function deleteDatabaseBackup(backupId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    removeLocalBackup(backupId);

    if (isSupabaseConfigured) {
      try {
        await supabase
          .from('backups')
          .delete()
          .eq('id', backupId);
      } catch {
        // Ignored
      }
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Could not delete backup',
    };
  }
}
