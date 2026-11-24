import React, { useState, useEffect } from 'react';
import {
  BackupRecord,
  Staff,
  ClassSection,
  TimetableEntry,
  LogSheet,
  Substitution
} from '../types';
import {
  fetchBackups,
  createDatabaseBackup,
  restoreDatabaseBackup,
  deleteDatabaseBackup
} from '../lib/backupService';
import { isExpectedSupabaseFallbackError } from '../lib/supabaseClient';
import {
  Database,
  RefreshCw,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Plus,
  Loader2,
  Calendar,
  User,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Users,
  BookOpen,
  ArrowDownToLine,
  Clock,
  ShieldCheck,
  X
} from 'lucide-react';

interface DatabaseBackupsSectionProps {
  staffList: Staff[];
  classesList: ClassSection[];
  timetableEntries: TimetableEntry[];
  logSheets: LogSheet[];
  substitutions: Substitution[];
  currentUserFullName?: string;
  onRefreshData: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'info') => void;
  // Optional trigger to refresh backups externally (e.g. after auto-backups)
  refreshTrigger?: number;
}

export default function DatabaseBackupsSection({
  staffList,
  classesList,
  timetableEntries,
  logSheets,
  substitutions,
  currentUserFullName = 'Administrator',
  onRefreshData,
  showToast,
  refreshTrigger = 0
}: DatabaseBackupsSectionProps) {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(true);
  const [customLabel, setCustomLabel] = useState<string>('');
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);

  // Restore Modal State
  const [restoringBackup, setRestoringBackup] = useState<BackupRecord | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState<string>('');
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Delete Modal State
  const [deletingBackup, setDeletingBackup] = useState<BackupRecord | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Load backups on mount and whenever refreshTrigger changes
  const loadBackups = async () => {
    setIsLoadingBackups(true);
    try {
      const data = await fetchBackups();
      setBackups(data);
    } catch (err) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice loading database backups:', err);
      }
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, [refreshTrigger]);

  // Format date and time readably
  const formatDateTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      if (isNaN(date.getTime())) return isoString;
      return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    } catch {
      return isoString;
    }
  };

  // Handle manual backup creation
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    try {
      const result = await createDatabaseBackup({
        label: customLabel.trim() || undefined,
        createdBy: currentUserFullName
      });

      if (!result.success || !result.backup) {
        throw new Error(result.error || 'Failed to create backup');
      }

      // Add to list and clear custom label
      setBackups(prev => [result.backup!, ...prev.filter(b => b.id !== result.backup!.id)]);
      setCustomLabel('');

      const timeString = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      const syncMsg = result.syncedToCloud
        ? `Backup "${result.backup.backup_label}" created and saved to Supabase cloud at ${timeString}.`
        : `Backup "${result.backup.backup_label}" created and secured in persistent memory at ${timeString}.`;

      showToast(syncMsg, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Backup notice:', err);
      }
      showToast(`Backup notice: ${err?.message || 'Error creating backup'}`, 'info');
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Handle restore confirmation
  const handleConfirmRestore = async () => {
    if (!restoringBackup) return;
    if (restoreConfirmText.trim() !== 'RESTORE') {
      showToast('Please type RESTORE in capital letters to confirm.', 'info');
      return;
    }

    setIsRestoring(true);
    try {
      const result = await restoreDatabaseBackup(restoringBackup);
      if (!result.success) {
        throw new Error(result.error || 'Restore failed');
      }

      // Synchronize live state across the app
      await onRefreshData();

      showToast(
        `Database successfully restored from backup "${restoringBackup.backup_label}".`,
        'success'
      );

      // Close modal and reset text
      setRestoringBackup(null);
      setRestoreConfirmText('');
    } catch (err: any) {
      console.error('Restore error:', err);
      showToast(`Database restore failed: ${err?.message || 'Error writing records'}`, 'info');
    } finally {
      setIsRestoring(false);
    }
  };

  // Handle delete confirmation
  const handleConfirmDelete = async () => {
    if (!deletingBackup) return;
    setIsDeleting(true);
    try {
      const result = await deleteDatabaseBackup(deletingBackup.id);
      if (!result.success) {
        throw new Error(result.error || 'Delete failed');
      }

      setBackups(prev => prev.filter(b => b.id !== deletingBackup.id));
      showToast(`Backup "${deletingBackup.backup_label}" deleted.`, 'success');
      setDeletingBackup(null);
    } catch (err: any) {
      console.error('Delete backup error:', err);
      showToast(`Failed to delete backup: ${err?.message || 'Database error'}`, 'info');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div id="database-backups-section" className="space-y-6 pt-4">
      {/* Section Header */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-2.5 bg-[#556B2F] text-white rounded-lg shadow-xs shrink-0">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-black text-lg text-[#161b27]">
                  Database Backups & Snapshot Recovery
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#556B2F]/10 text-[#556B2F]">
                  Supabase Backups Table
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl font-sans leading-relaxed">
                Take complete point-in-time snapshots of live faculty, classes, master timetable, log sheets, and substitutions records. Backups are stored as structured JSONB snapshots in the Supabase <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px] text-[#161b27]">backups</code> table and can be restored at any time.
              </p>
            </div>
          </div>

          <button
            onClick={loadBackups}
            disabled={isLoadingBackups}
            title="Refresh Backups List"
            className="px-3.5 py-2 border border-[#cbc4cd] text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-all self-start sm:self-auto cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingBackups ? 'animate-spin' : ''}`} />
            <span>Refresh List</span>
          </button>
        </div>

        {/* Create Backup Now Action Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          <div className="flex-1 max-w-xl">
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
              Backup Label (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. End of Semester Finalized, Pre-Inspection Snapshot..."
              value={customLabel}
              onChange={e => setCustomLabel(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !isCreatingBackup) {
                  handleCreateBackup();
                }
              }}
              className="w-full px-3.5 py-2 text-xs border border-[#cbc4cd] rounded-lg bg-white text-[#161b27] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 font-sans"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              If left blank, will automatically use "Backup - [Date & Time]". User stamp: <strong className="text-slate-600">{currentUserFullName}</strong>.
            </p>
          </div>

          <div className="flex items-end self-start md:self-center pt-1">
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="px-5 py-2.5 bg-[#556B2F] hover:bg-[#435424] text-white text-xs font-bold uppercase tracking-wider rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingBackup ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowDownToLine className="w-4 h-4" />
              )}
              <span>{isCreatingBackup ? 'Capturing Snapshot...' : 'Create Backup Now'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Backup History Table */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#cbc4cd] bg-slate-50/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500" />
            <h4 className="font-serif font-bold text-sm text-[#161b27]">
              Backup History & Restores
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-200 text-slate-700">
              {backups.length}
            </span>
          </div>
          <span className="text-[11px] text-slate-500 font-sans">
            Snapshot row counts derived dynamically from live JSONB content
          </span>
        </div>

        {isLoadingBackups ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-[#556B2F]" />
            <p className="text-xs font-medium">Loading database backups...</p>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
              <Database className="w-6 h-6" />
            </div>
            <h5 className="font-serif font-bold text-sm text-[#161b27]">
              No Database Backups Found
            </h5>
            <p className="text-xs text-slate-500 max-w-md mx-auto font-sans leading-relaxed">
              No previous snapshots have been recorded yet. Click "Create Backup Now" above to capture your first complete database snapshot.
            </p>
            <button
              onClick={handleCreateBackup}
              disabled={isCreatingBackup}
              className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-[#556B2F] text-white text-xs font-bold rounded-lg hover:bg-[#435424] cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Initial Backup</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#cbc4cd] bg-slate-100/70 text-[11px] uppercase tracking-wider text-slate-600 font-bold font-sans">
                  <th className="py-3 px-4">Backup Label & Identifier</th>
                  <th className="py-3 px-4">Created Date & Time</th>
                  <th className="py-3 px-4">Created By</th>
                  <th className="py-3 px-4">Snapshot Contents</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {backups.map(bk => {
                  const staffCount = bk.staff_snapshot?.length || 0;
                  const classesCount = bk.class_sections_snapshot?.length || 0;
                  const timetableCount = bk.timetable_entries_snapshot?.length || 0;
                  const logsCount = bk.log_sheets_snapshot?.length || 0;
                  const subsCount = bk.substitutions_snapshot?.length || 0;
                  const totalRecords = staffCount + classesCount + timetableCount + logsCount + subsCount;

                  const isAutoBackup = bk.backup_label.toLowerCase().includes('auto-backup');

                  return (
                    <tr
                      key={bk.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      {/* Label */}
                      <td className="py-3.5 px-4 font-medium text-[#161b27]">
                        <div className="flex items-start gap-2.5">
                          <div className={`p-1.5 rounded mt-0.5 shrink-0 ${
                            isAutoBackup ? 'bg-amber-100 text-amber-800' : 'bg-[#556B2F]/10 text-[#556B2F]'
                          }`}>
                            <Database className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-2">
                              <span>{bk.backup_label}</span>
                              {isAutoBackup && (
                                <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-900 rounded font-semibold border border-amber-200">
                                  Auto
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                              ID: {bk.id.substring(0, 14)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Created At */}
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="font-medium">{formatDateTime(bk.created_at)}</span>
                        </div>
                      </td>

                      {/* Created By */}
                      <td className="py-3.5 px-4 text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                          <User className="w-3 h-3 text-slate-500" />
                          {bk.created_by}
                        </span>
                      </td>

                      {/* Row Counts (Derived dynamically from snapshot lengths) */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-wrap items-center gap-1.5 max-w-sm">
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px]" title="Staff Records">
                            Staff: <strong>{staffCount}</strong>
                          </span>
                          <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px]" title="Class Sections">
                            Classes: <strong>{classesCount}</strong>
                          </span>
                          <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[11px]" title="Timetable Periods">
                            Schedule: <strong>{timetableCount}</strong>
                          </span>
                          <span className="px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-[11px]" title="Log Sheets">
                            Logs: <strong>{logsCount}</strong>
                          </span>
                          <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[11px]" title="Substitutions">
                            Subs: <strong>{subsCount}</strong>
                          </span>
                          <span className="ml-1 text-[11px] text-slate-400 font-semibold" title="Total Snapshot Records">
                            ({totalRecords} total)
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              setRestoringBackup(bk);
                              setRestoreConfirmText('');
                            }}
                            title="Restore this backup"
                            className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-amber-700" />
                            <span>Restore</span>
                          </button>

                          <button
                            onClick={() => setDeletingBackup(bk)}
                            title="Delete backup"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* RESTORE CONFIRMATION MODAL */}
      {/* ===================================================================== */}
      {restoringBackup && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-amber-400 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 text-amber-700">
                <div className="p-2.5 bg-amber-100 rounded-xl">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-lg text-[#161b27]">
                    Restore Database Backup?
                  </h3>
                  <p className="text-xs text-amber-800 font-medium">
                    This action will overwrite live database tables.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoringBackup(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Critical Warning Description */}
            <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 text-xs text-amber-950 space-y-2 leading-relaxed font-sans">
              <p className="font-bold text-amber-900">
                Please read carefully before proceeding:
              </p>
              <p>
                This will completely overwrite all current <strong>staff</strong>, <strong>class_sections</strong>, <strong>timetable_entries</strong>, <strong>log_sheets</strong>, and <strong>substitutions</strong> data with the contents of this backup.
              </p>
              <p className="text-rose-800 font-semibold">
                Any live changes or records created after this backup was taken will be permanently lost.
              </p>
            </div>

            {/* Backup Snapshot Info */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs font-sans">
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-slate-500 font-medium">Selected Backup:</span>
                <span className="font-bold text-[#161b27]">{restoringBackup.backup_label}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-slate-500 font-medium">Captured Date:</span>
                <span>{formatDateTime(restoringBackup.created_at)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-700">
                <span className="text-slate-500 font-medium">Captured By:</span>
                <span>{restoringBackup.created_by}</span>
              </div>
              <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2 text-[11px]">
                <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-semibold text-slate-700">
                  Staff: {restoringBackup.staff_snapshot?.length || 0}
                </span>
                <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-semibold text-slate-700">
                  Classes: {restoringBackup.class_sections_snapshot?.length || 0}
                </span>
                <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-semibold text-slate-700">
                  Timetable: {restoringBackup.timetable_entries_snapshot?.length || 0}
                </span>
                <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-semibold text-slate-700">
                  Logs: {restoringBackup.log_sheets_snapshot?.length || 0}
                </span>
                <span className="bg-white px-2 py-0.5 border border-slate-200 rounded font-semibold text-slate-700">
                  Subs: {restoringBackup.substitutions_snapshot?.length || 0}
                </span>
              </div>
            </div>

            {/* Type Confirmation Input */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-800 font-sans">
                To confirm, type <span className="font-mono bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">RESTORE</span> in capital letters below:
              </label>
              <input
                type="text"
                placeholder="Type RESTORE to unlock button"
                value={restoreConfirmText}
                onChange={e => setRestoreConfirmText(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs font-bold border border-amber-400 rounded-lg bg-white text-[#161b27] focus:outline-none focus:ring-2 focus:ring-amber-500/30"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoringBackup(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoreConfirmText.trim() !== 'RESTORE' || isRestoring}
                onClick={handleConfirmRestore}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-xs cursor-pointer flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isRestoring ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RotateCcw className="w-4 h-4" />
                )}
                <span>{isRestoring ? 'Restoring Live Tables...' : 'Confirm & Restore'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ===================================================================== */}
      {deletingBackup && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-[#161b27]">
                Delete Database Backup?
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Are you sure you want to delete the backup snapshot <strong className="text-slate-900">"{deletingBackup.backup_label}"</strong> from <strong className="text-slate-900">{formatDateTime(deletingBackup.created_at)}</strong>? This will permanently remove the snapshot row from the Supabase <code className="font-mono bg-slate-100 px-1">backups</code> table.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingBackup(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-2"
              >
                {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Delete Backup</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
