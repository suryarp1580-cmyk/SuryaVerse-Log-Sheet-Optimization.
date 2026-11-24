import React, { useState } from 'react';
import {
  Staff,
  ClassSection,
  TimetableEntry,
  LogSheet,
  Substitution
} from '../types';
import { supabase, isSupabaseConfigured, getActiveSupabaseUrl, getSupabaseProjectRef, isExpectedSupabaseFallbackError } from '../lib/supabaseClient';
import {
  initialStaff,
  initialClasses,
  getInitialTimetableEntries
} from '../data/seedData';
import {
  mapStaffToDB,
  mapClassSectionToDB,
  mapTimetableEntryToDB,
  seedDatabaseWithPastData,
  syncFacultyMemberToDatabase,
  deleteFacultyMemberFromDatabase
} from '../lib/database';
import { clearMemoryData, loadMemoryData, saveMemoryData } from '../lib/memoryStorage';
import {
  Users,
  Layers,
  BookOpen,
  AlertTriangle,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  RefreshCw,
  Search,
  CheckSquare,
  Square,
  Loader2,
  Shield,
  Filter,
  Save,
  CheckCircle2,
  Flame,
  Database,
  Terminal
} from 'lucide-react';
import DatabaseBackupsSection from './DatabaseBackupsSection';
import DatabaseSchemaSection from './DatabaseSchemaSection';
import { createDatabaseBackup } from '../lib/backupService';

interface AdminDataManagementProps {
  staffList: Staff[];
  classesList: ClassSection[];
  timetableEntries: TimetableEntry[];
  logSheets: LogSheet[];
  substitutions: Substitution[];
  currentUserFullName?: string;
  onRefreshData: () => Promise<void>;
  showToast: (message: string, type: 'success' | 'info') => void;
  onSeedDatabase?: () => Promise<void>;
}

export default function AdminDataManagement({
  staffList,
  classesList,
  timetableEntries,
  logSheets,
  substitutions,
  currentUserFullName = 'Administrator',
  onRefreshData,
  showToast,
  onSeedDatabase
}: AdminDataManagementProps) {
  // Active sub-tab
  const [activeTab, setActiveTab] = useState<'staff' | 'classes' | 'timetable' | 'danger' | 'backups' | 'schema'>('staff');
  const [backupRefreshTrigger, setBackupRefreshTrigger] = useState<number>(0);

  // =========================================================================
  // 1. STAFF MANAGEMENT STATE
  // =========================================================================
  const [staffSearch, setStaffSearch] = useState('');
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [newStaffCode, setNewStaffCode] = useState('');
  const [newStaffFullName, setNewStaffFullName] = useState('');
  const [newStaffIsActive, setNewStaffIsActive] = useState(true);
  const [newStaffOnLeave, setNewStaffOnLeave] = useState(false);
  const [isSubmittingStaff, setIsSubmittingStaff] = useState(false);

  // Inline edit for staff
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffCode, setEditStaffCode] = useState('');
  const [editStaffFullName, setEditStaffFullName] = useState('');
  const [editStaffIsActive, setEditStaffIsActive] = useState(true);
  const [editStaffOnLeave, setEditStaffOnLeave] = useState(false);

  // Staff delete confirmation
  const [deletingStaffId, setDeletingStaffId] = useState<string | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);

  // =========================================================================
  // 2. CLASS SECTIONS MANAGEMENT STATE
  // =========================================================================
  const [isAddingClass, setIsAddingClass] = useState(false);
  const [newClassYearLabel, setNewClassYearLabel] = useState('I B.COM AF');
  const [newClassSection, setNewClassSection] = useState('A');
  const [newClassRoomNo, setNewClassRoomNo] = useState('');
  const [newClassInchargeName, setNewClassInchargeName] = useState('');
  const [newClassDisplayOrder, setNewClassDisplayOrder] = useState<number>(classesList.length + 1);
  const [isSubmittingClass, setIsSubmittingClass] = useState(false);

  // Inline edit for classes
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassYearLabel, setEditClassYearLabel] = useState('');
  const [editClassSection, setEditClassSection] = useState('');
  const [editClassRoomNo, setEditClassRoomNo] = useState('');
  const [editClassInchargeName, setEditClassInchargeName] = useState('');
  const [editClassDisplayOrder, setEditClassDisplayOrder] = useState<number>(0);

  // Class delete confirmation
  const [deletingClassId, setDeletingClassId] = useState<string | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);

  // =========================================================================
  // 3. TIMETABLE MANAGEMENT STATE
  // =========================================================================
  const [filterClassId, setFilterClassId] = useState<string>(classesList[0]?.id || '');
  const [filterDayOrder, setFilterDayOrder] = useState<number>(1);
  const [isAddingEntry, setIsAddingEntry] = useState(false);

  const [newEntryClassId, setNewEntryClassId] = useState(classesList[0]?.id || '');
  const [newEntryDayOrder, setNewEntryDayOrder] = useState(1);
  const [newEntryPeriod, setNewEntryPeriod] = useState(1);
  const [newEntrySubjectCode, setNewEntrySubjectCode] = useState('');
  const [newEntryIsLab, setNewEntryIsLab] = useState(false);
  const [newEntryExcluded, setNewEntryExcluded] = useState(false);
  const [newEntryStaffIds, setNewEntryStaffIds] = useState<string[]>([]);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);

  // Inline edit for timetable entry
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editEntrySubjectCode, setEditEntrySubjectCode] = useState('');
  const [editEntryIsLab, setEditEntryIsLab] = useState(false);
  const [editEntryExcluded, setEditEntryExcluded] = useState(false);
  const [editEntryStaffIds, setEditEntryStaffIds] = useState<string[]>([]);
  const [isSavingEntry, setIsSavingEntry] = useState(false);

  // Timetable delete confirmation
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const [isDeletingEntry, setIsDeletingEntry] = useState(false);

  // =========================================================================
  // 4. DANGER ZONE STATE
  // =========================================================================
  const [reseedConfirmText, setReseedConfirmText] = useState('');
  const [isReseeding, setIsReseeding] = useState(false);

  const [deleteAllConfirmText, setDeleteAllConfirmText] = useState('');
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Helper map for staff lookup
  const staffMap = new Map(staffList.map(s => [s.id, s]));

  // =========================================================================
  // HANDLERS: STAFF
  // =========================================================================
  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffCode.trim()) {
      showToast('Staff Code is required.', 'info');
      return;
    }

    setIsSubmittingStaff(true);
    const newStaff: Staff = {
      id: `staff-${Date.now()}-${newStaffCode.trim().toLowerCase()}`,
      code: newStaffCode.trim().toUpperCase(),
      fullName: newStaffFullName.trim() || null,
      isActive: newStaffIsActive,
      onLeave: newStaffOnLeave
    };

    try {
      // 1. Update resilient local memory and sync with Supabase (staff + tt_staff)
      await syncFacultyMemberToDatabase(newStaff);

      await onRefreshData();
      showToast(`Faculty member "${newStaff.code}" added successfully.`, 'success');
      setNewStaffCode('');
      setNewStaffFullName('');
      setNewStaffIsActive(true);
      setNewStaffOnLeave(false);
      setIsAddingStaff(false);
    } catch (err: any) {
      console.error('Error adding staff:', err);
      showToast(`Failed to add staff: ${err?.message || 'Unknown error'}`, 'info');
    } finally {
      setIsSubmittingStaff(false);
    }
  };

  const startEditStaff = (staff: Staff) => {
    setEditingStaffId(staff.id);
    setEditStaffCode(staff.code);
    setEditStaffFullName(staff.fullName || '');
    setEditStaffIsActive(staff.isActive);
    setEditStaffOnLeave(!!staff.onLeave);
  };

  const handleSaveEditStaff = async (staffId: string) => {
    if (!editStaffCode.trim()) {
      showToast('Staff Code cannot be empty.', 'info');
      return;
    }

    try {
      const existingStaff = staffList.find(s => s.id === staffId);
      const updatedStaff: Staff = {
        id: staffId,
        code: editStaffCode.trim().toUpperCase(),
        fullName: editStaffFullName.trim() || null,
        isActive: editStaffIsActive,
        onLeave: editStaffOnLeave
      };

      // Update resilient local memory and sync with Supabase (staff + tt_staff)
      await syncFacultyMemberToDatabase(updatedStaff, existingStaff?.code === 'RP');

      await onRefreshData();
      setEditingStaffId(null);
      showToast(`Staff member "${editStaffCode}" updated successfully.`, 'success');
    } catch (err: any) {
      console.error('Error updating staff:', err);
      showToast(`Failed to update staff: ${err?.message || 'Unknown error'}`, 'info');
    }
  };

  const handleDeleteStaff = async (staffId: string) => {
    setIsDeletingStaff(true);
    try {
      const targetStaff = staffList.find(s => s.id === staffId);

      // 1. Clean up timetable entries where this staff was assigned in local memory
      const currentMemory = loadMemoryData();
      const baseTT = currentMemory.timetableEntries.length > 0 ? currentMemory.timetableEntries : timetableEntries;
      const updatedTT = baseTT.map(t => ({
        ...t,
        staffIds: t.staffIds.filter(id => id !== staffId)
      }));
      saveMemoryData({ timetableEntries: updatedTT });

      // 2. Remove from memory and Supabase (staff + tt_staff)
      await deleteFacultyMemberFromDatabase(staffId, targetStaff?.code);

      await onRefreshData();
      setDeletingStaffId(null);
      showToast('Staff member removed successfully.', 'success');
    } catch (err: any) {
      console.error('Error deleting staff:', err);
      showToast(`Failed to delete staff: ${err?.message || 'Check foreign key references'}`, 'info');
    } finally {
      setIsDeletingStaff(false);
    }
  };

  // =========================================================================
  // HANDLERS: CLASS SECTIONS
  // =========================================================================
  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassYearLabel.trim() || !newClassSection.trim()) {
      showToast('Year label and section are required.', 'info');
      return;
    }

    setIsSubmittingClass(true);
    const newClass: ClassSection = {
      id: `class-${newClassYearLabel.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${newClassSection.toLowerCase()}-${Date.now().toString().slice(-4)}`,
      yearLabel: newClassYearLabel.trim(),
      section: newClassSection.trim().toUpperCase(),
      roomNo: newClassRoomNo.trim(),
      inchargeName: newClassInchargeName.trim(),
      displayOrder: Number(newClassDisplayOrder) || (classesList.length + 1)
    };

    try {
      // 1. Update resilient local memory immediately
      const currentMemory = loadMemoryData();
      const baseClasses = currentMemory.classesList.length > 0 ? currentMemory.classesList : classesList;
      const updatedClasses = [...baseClasses.filter(c => c.id !== newClass.id), newClass];
      saveMemoryData({ classesList: updatedClasses });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('class_sections')
            .insert(mapClassSectionToDB(newClass));
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase class insert notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      showToast(`Class section "${newClass.yearLabel} - ${newClass.section}" added.`, 'success');
      setNewClassYearLabel('I B.COM AF');
      setNewClassSection('A');
      setNewClassRoomNo('');
      setNewClassInchargeName('');
      setNewClassDisplayOrder(classesList.length + 2);
      setIsAddingClass(false);
    } catch (err: any) {
      console.error('Error adding class section:', err);
      showToast(`Failed to add class: ${err?.message || 'Unknown error'}`, 'info');
    } finally {
      setIsSubmittingClass(false);
    }
  };

  const startEditClass = (cls: ClassSection) => {
    setEditingClassId(cls.id);
    setEditClassYearLabel(cls.yearLabel);
    setEditClassSection(cls.section);
    setEditClassRoomNo(cls.roomNo);
    setEditClassInchargeName(cls.inchargeName);
    setEditClassDisplayOrder(cls.displayOrder);
  };

  const handleSaveEditClass = async (classId: string) => {
    if (!editClassYearLabel.trim() || !editClassSection.trim()) {
      showToast('Year label and section cannot be empty.', 'info');
      return;
    }

    try {
      // 1. Update resilient local memory immediately
      const currentMemory = loadMemoryData();
      const baseClasses = currentMemory.classesList.length > 0 ? currentMemory.classesList : classesList;
      const updatedClasses = baseClasses.map(c => {
        if (c.id === classId) {
          return {
            ...c,
            yearLabel: editClassYearLabel.trim(),
            section: editClassSection.trim().toUpperCase(),
            roomNo: editClassRoomNo.trim(),
            inchargeName: editClassInchargeName.trim(),
            displayOrder: Number(editClassDisplayOrder) || 0
          };
        }
        return c;
      });
      saveMemoryData({ classesList: updatedClasses });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('class_sections')
            .update({
              year_label: editClassYearLabel.trim(),
              section: editClassSection.trim().toUpperCase(),
              room_no: editClassRoomNo.trim(),
              incharge_name: editClassInchargeName.trim(),
              display_order: Number(editClassDisplayOrder) || 0
            })
            .eq('id', classId);
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase class update notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      setEditingClassId(null);
      showToast('Class section updated successfully.', 'success');
    } catch (err: any) {
      console.error('Error updating class section:', err);
      showToast(`Failed to update class: ${err?.message || 'Unknown error'}`, 'info');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    setIsDeletingClass(true);
    try {
      // 1. Update resilient local memory immediately
      const currentMemory = loadMemoryData();
      const baseClasses = currentMemory.classesList.length > 0 ? currentMemory.classesList : classesList;
      const updatedClasses = baseClasses.filter(c => c.id !== classId);

      const baseTT = currentMemory.timetableEntries.length > 0 ? currentMemory.timetableEntries : timetableEntries;
      const updatedTT = baseTT.filter(t => t.classId !== classId);

      saveMemoryData({ classesList: updatedClasses, timetableEntries: updatedTT });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          await supabase.from('timetable_entries').delete().eq('class_id', classId);
          const { error } = await supabase
            .from('class_sections')
            .delete()
            .eq('id', classId);
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase class delete notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      setDeletingClassId(null);
      showToast('Class section removed successfully.', 'success');
    } catch (err: any) {
      console.error('Error deleting class section:', err);
      showToast(`Failed to delete class: ${err?.message || 'Check foreign key references'}`, 'info');
    } finally {
      setIsDeletingClass(false);
    }
  };

  // =========================================================================
  // HANDLERS: TIMETABLE ENTRIES
  // =========================================================================
  const handleAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEntryClassId || !newEntrySubjectCode.trim()) {
      showToast('Class and Subject Code are required.', 'info');
      return;
    }

    setIsSubmittingEntry(true);
    const newEntryId = `tt-${newEntryClassId}-d${newEntryDayOrder}-p${newEntryPeriod}-${Date.now().toString().slice(-4)}`;

    const newEntry: TimetableEntry = {
      id: newEntryId,
      classId: newEntryClassId,
      dayOrder: Number(newEntryDayOrder),
      period: Number(newEntryPeriod),
      subjectCode: newEntrySubjectCode.trim().toUpperCase(),
      isLab: newEntryIsLab,
      excludedFromSubstitution: newEntryExcluded,
      staffIds: [...newEntryStaffIds]
    };

    try {
      // 1. Update resilient local memory immediately: replace slot if exists, or append
      const currentMemory = loadMemoryData();
      const baseTT = currentMemory.timetableEntries.length > 0 ? currentMemory.timetableEntries : timetableEntries;
      const filteredTT = baseTT.filter(
        t => !(t.classId === newEntry.classId && t.dayOrder === newEntry.dayOrder && t.period === newEntry.period)
      );
      const updatedTT = [...filteredTT, newEntry];
      saveMemoryData({ timetableEntries: updatedTT });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('timetable_entries')
            .upsert(mapTimetableEntryToDB(newEntry), { onConflict: 'id' });
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase timetable insert notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      showToast(`Timetable entry for Period ${newEntry.period} added.`, 'success');
      setNewEntrySubjectCode('');
      setNewEntryIsLab(false);
      setNewEntryExcluded(false);
      setNewEntryStaffIds([]);
      setIsAddingEntry(false);
    } catch (err: any) {
      console.error('Error adding timetable entry:', err);
      showToast(`Failed to add timetable entry: ${err?.message || 'Unknown error'}`, 'info');
    } finally {
      setIsSubmittingEntry(false);
    }
  };

  const startEditEntry = (entry: TimetableEntry) => {
    setEditingEntryId(entry.id);
    setEditEntrySubjectCode(entry.subjectCode);
    setEditEntryIsLab(entry.isLab);
    setEditEntryExcluded(entry.excludedFromSubstitution);
    setEditEntryStaffIds([...entry.staffIds]);
  };

  const handleSaveEditEntry = async (entryId: string) => {
    if (!editEntrySubjectCode.trim()) {
      showToast('Subject Code cannot be empty.', 'info');
      return;
    }

    setIsSavingEntry(true);
    try {
      // 1. Update resilient local memory immediately
      const currentMemory = loadMemoryData();
      const baseTT = currentMemory.timetableEntries.length > 0 ? currentMemory.timetableEntries : timetableEntries;
      const updatedTT = baseTT.map(t => {
        if (t.id === entryId) {
          return {
            ...t,
            subjectCode: editEntrySubjectCode.trim().toUpperCase(),
            isLab: editEntryIsLab,
            excludedFromSubstitution: editEntryExcluded,
            staffIds: [...editEntryStaffIds]
          };
        }
        return t;
      });
      saveMemoryData({ timetableEntries: updatedTT });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('timetable_entries')
            .update({
              subject_code: editEntrySubjectCode.trim().toUpperCase(),
              is_lab: editEntryIsLab,
              excluded_from_substitution: editEntryExcluded,
              staff_ids: editEntryStaffIds
            })
            .eq('id', entryId);
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase timetable update notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      setEditingEntryId(null);
      showToast('Timetable entry updated successfully.', 'success');
    } catch (err: any) {
      console.error('Error updating timetable entry:', err);
      showToast(`Failed to update entry: ${err?.message || 'Unknown error'}`, 'info');
    } finally {
      setIsSavingEntry(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    setIsDeletingEntry(true);
    try {
      // 1. Update resilient local memory immediately
      const currentMemory = loadMemoryData();
      const baseTT = currentMemory.timetableEntries.length > 0 ? currentMemory.timetableEntries : timetableEntries;
      const updatedTT = baseTT.filter(t => t.id !== entryId);
      saveMemoryData({ timetableEntries: updatedTT });

      // 2. Persist to Supabase if configured
      if (isSupabaseConfigured) {
        try {
          const { error } = await supabase
            .from('timetable_entries')
            .delete()
            .eq('id', entryId);
          if (error && !isExpectedSupabaseFallbackError(error)) {
            console.warn('Supabase timetable delete notice:', error.message);
          }
        } catch {
          // Local memory already updated
        }
      }

      await onRefreshData();
      setDeletingEntryId(null);
      showToast('Timetable period entry deleted.', 'success');
    } catch (err: any) {
      console.error('Error deleting timetable entry:', err);
      showToast(`Failed to delete entry: ${err?.message || 'Unknown error'}`, 'info');
    } finally {
      setIsDeletingEntry(false);
    }
  };

  // Toggle staff in multi-select for new entry
  const toggleNewStaffSelection = (staffId: string) => {
    setNewEntryStaffIds(prev =>
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    );
  };

  // Toggle staff in multi-select for edit entry
  const toggleEditStaffSelection = (staffId: string) => {
    setEditEntryStaffIds(prev =>
      prev.includes(staffId) ? prev.filter(id => id !== staffId) : [...prev, staffId]
    );
  };

  // =========================================================================
  // HANDLERS: DANGER ZONE
  // =========================================================================
  const handleReseedOriginalData = async (bypassConfirm = true) => {
    if (!bypassConfirm && reseedConfirmText.trim() !== 'REUPLOAD') {
      showToast('Please type REUPLOAD exactly into the confirmation box.', 'info');
      return;
    }

    setIsReseeding(true);
    try {
      // Automatic pre-action backup before reseed
      try {
        await createDatabaseBackup({
          label: 'Auto-backup before Reseed with all data',
          createdBy: currentUserFullName
        });
        setBackupRefreshTrigger(prev => prev + 1);
      } catch {
        // Fallback auto-backup handled quietly
      }

      if (onSeedDatabase) {
        await onSeedDatabase();
        await onRefreshData();
      } else {
        const result = await seedDatabaseWithPastData({
          staffList,
          classesList,
          timetableEntries,
          logSheets,
          substitutions
        });
        await onRefreshData();
        showToast(
          result ? result.message : 'Database and memory successfully seeded with all current and past data!',
          result?.syncedToSupabase !== false ? 'success' : 'info'
        );
      }

      setReseedConfirmText('');
    } catch (err: any) {
      console.error('Reseed error:', err);
      showToast(`Reseed failed: ${err?.message || 'Database error'}`, 'info');
    } finally {
      setIsReseeding(false);
    }
  };

  const handleDeleteAllData = async (bypassConfirm = true) => {
    if (!bypassConfirm && deleteAllConfirmText.trim() !== 'DELETE ALL') {
      showToast('Please type DELETE ALL or click the button directly.', 'info');
      return;
    }

    setIsDeletingAll(true);
    try {
      // Automatic pre-action backup before delete all (silently preserved in resilient local memory / cloud)
      try {
        await createDatabaseBackup({
          label: 'Auto-backup before Delete all data',
          createdBy: currentUserFullName
        });
        setBackupRefreshTrigger(prev => prev + 1);
      } catch {
        // Fallback auto-backup handled quietly
      }

      // FK-safe deletion order from Supabase:
      if (isSupabaseConfigured) {
        try {
          await supabase.from('substitutions').delete().not('id', 'is', null);
          await supabase.from('log_sheets').delete().not('id', 'is', null);
          await supabase.from('timetable_entries').delete().not('id', 'is', null);
          await supabase.from('class_sections').delete().not('id', 'is', null);
          await supabase.from('staff').delete().not('id', 'is', null);
        } catch {
          // Ignored
        }
      }

      // Clear local memory storage
      clearMemoryData();

      await onRefreshData();
      setDeleteAllConfirmText('');
      showToast('All database records have been automatically deleted. Touch "Seed Database" anytime to restore past data.', 'success');
    } catch (err: any) {
      showToast(`Delete notice: ${err?.message || 'Error deleting data'}`, 'info');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Filtered staff list
  const filteredStaff = staffList.filter(
    s =>
      s.code.toLowerCase().includes(staffSearch.toLowerCase()) ||
      (s.fullName && s.fullName.toLowerCase().includes(staffSearch.toLowerCase()))
  );

  // Filtered timetable entries
  const currentClassObj = classesList.find(c => c.id === filterClassId) || classesList[0];
  const activeClassId = currentClassObj?.id || '';

  const filteredEntries = timetableEntries
    .filter(
      entry =>
        entry.classId === activeClassId &&
        (filterDayOrder === 0 || entry.dayOrder === filterDayOrder)
    )
    .sort((a, b) => {
      if (a.dayOrder !== b.dayOrder) return a.dayOrder - b.dayOrder;
      return a.period - b.period;
    });

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#556B2F] text-white rounded-lg shadow-xs">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-serif font-black text-xl text-[#161b27] tracking-tight">
                Admin Data Management
              </h2>
              <p className="text-xs text-[#556B2F] font-bold uppercase tracking-wider">
                Direct Supabase Database Management
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-500 mt-2 max-w-2xl font-sans">
            Manage live faculty records, class sections, and weekly master timetable periods directly. Changes write immediately to your connected Supabase database.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-semibold text-slate-700">Connected Project:</span>
            {isSupabaseConfigured && getActiveSupabaseUrl() ? (
              <code className="font-mono text-[11px] bg-slate-100 text-[#556B2F] font-bold px-2 py-0.5 rounded border border-slate-200">
                {getActiveSupabaseUrl()}
              </code>
            ) : (
              <span className="italic text-amber-700 font-medium">Operating in Resilient Local Memory Mode</span>
            )}
            {getActiveSupabaseUrl() && getSupabaseProjectRef(getActiveSupabaseUrl()) && (
              <span className="text-[11px] text-slate-400 font-mono">
                (Ref: {getSupabaseProjectRef(getActiveSupabaseUrl())})
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onRefreshData}
          title="Refresh Data from Supabase"
          className="px-4 py-2 border border-[#556B2F] text-[#556B2F] hover:bg-[#556B2F]/10 text-xs font-bold rounded-lg flex items-center gap-2 transition-all self-start md:self-auto cursor-pointer shadow-2xs"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh Database</span>
        </button>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-[#cbc4cd] pb-3">
        <button
          onClick={() => setActiveTab('staff')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'staff'
              ? 'bg-[#556B2F] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-[#cbc4cd]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Faculty Staff ({staffList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-[#556B2F] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-[#cbc4cd]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Class Sections ({classesList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('timetable')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'timetable'
              ? 'bg-[#556B2F] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-[#cbc4cd]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Timetable Schedule ({timetableEntries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('danger')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'danger'
              ? 'bg-[#ba1a1a] text-white shadow-xs'
              : 'bg-white text-[#ba1a1a] hover:bg-[#ba1a1a]/10 border border-[#ba1a1a]/30'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Danger Zone</span>
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'backups'
              ? 'bg-[#556B2F] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-[#cbc4cd]'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Database Backups</span>
        </button>

        <button
          onClick={() => setActiveTab('schema')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
            activeTab === 'schema'
              ? 'bg-[#556B2F] text-white shadow-xs'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-[#cbc4cd]'
          }`}
        >
          <Terminal className="w-4 h-4" />
          <span>Database Health & SQL</span>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* 1. STAFF MANAGEMENT TAB */}
      {/* ===================================================================== */}
      {activeTab === 'staff' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-[#cbc4cd] rounded-xl shadow-xs">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search staff code or full name..."
                value={staffSearch}
                onChange={e => setStaffSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs border border-[#cbc4cd] rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20"
              />
            </div>

            <button
              onClick={() => setIsAddingStaff(!isAddingStaff)}
              className="px-4 py-2 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {isAddingStaff ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isAddingStaff ? 'Cancel' : 'Add New Faculty Member'}</span>
            </button>
          </div>

          {/* Add Staff Form */}
          {isAddingStaff && (
            <form
              onSubmit={handleAddStaff}
              className="bg-emerald-50/50 border border-[#556B2F]/30 p-5 rounded-xl space-y-4 shadow-xs animate-in fade-in duration-200"
            >
              <h3 className="font-serif font-bold text-sm text-[#161b27] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#556B2F]" />
                <span>Add New Faculty Member to Database</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Staff Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. SK, DR, Rp"
                    value={newStaffCode}
                    onChange={e => setNewStaffCode(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 font-bold"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. S. Kabilan, M.Com., Ph.D."
                    value={newStaffFullName}
                    onChange={e => setNewStaffFullName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20"
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newStaffIsActive}
                      onChange={e => setNewStaffIsActive(e.target.checked)}
                      className="rounded text-[#556B2F] focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>Active</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newStaffOnLeave}
                      onChange={e => setNewStaffOnLeave(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-0 w-4 h-4 cursor-pointer"
                    />
                    <span>On Leave</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingStaff(false)}
                  className="px-3 py-1.5 border border-[#cbc4cd] text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStaff}
                  className="px-4 py-1.5 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {isSubmittingStaff && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Faculty Member</span>
                </button>
              </div>
            </form>
          )}

          {/* Staff Table */}
          <div className="bg-white border border-[#cbc4cd] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5F4F0] border-b border-[#cbc4cd] text-[#161b27]">
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-24">Staff Code</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Full Name</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-28 text-center">Status</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-28 text-center">Leave</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-36 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbc4cd]">
                  {filteredStaff.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-semibold">
                        No faculty members found matching your search.
                      </td>
                    </tr>
                  ) : (
                    filteredStaff.map(staff => {
                      const isEditing = editingStaffId === staff.id;

                      if (isEditing) {
                        return (
                          <tr key={staff.id} className="bg-amber-50/60">
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editStaffCode}
                                onChange={e => setEditStaffCode(e.target.value)}
                                className="w-20 px-2 py-1 border border-amber-400 rounded bg-white font-bold text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editStaffFullName}
                                onChange={e => setEditStaffFullName(e.target.value)}
                                className="w-full px-2 py-1 border border-amber-400 rounded bg-white text-xs"
                                placeholder="Faculty Full Name"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <label className="inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editStaffIsActive}
                                  onChange={e => setEditStaffIsActive(e.target.checked)}
                                  className="rounded text-[#556B2F] w-4 h-4 cursor-pointer"
                                />
                              </label>
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <label className="inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={editStaffOnLeave}
                                  onChange={e => setEditStaffOnLeave(e.target.checked)}
                                  className="rounded text-rose-600 w-4 h-4 cursor-pointer"
                                />
                              </label>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveEditStaff(staff.id)}
                                  title="Save Changes"
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingStaffId(null)}
                                  title="Cancel"
                                  className="p-1.5 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={staff.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-[#556B2F]">
                            {staff.code}
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#161b27]">
                            {staff.fullName || <span className="text-slate-400 italic">No name provided</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                staff.isActive
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-slate-100 text-slate-600 border border-slate-300'
                              }`}
                            >
                              {staff.isActive ? 'ACTIVE' : 'INACTIVE'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {staff.onLeave ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                                ON LEAVE
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">Present</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditStaff(staff)}
                                title="Edit Staff"
                                className="p-1.5 text-slate-600 hover:text-[#556B2F] hover:bg-slate-100 rounded cursor-pointer transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingStaffId(staff.id)}
                                title="Delete Staff"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. CLASS SECTIONS MANAGEMENT TAB */}
      {/* ===================================================================== */}
      {activeTab === 'classes' && (
        <div className="space-y-6">
          {/* Action Bar */}
          <div className="flex items-center justify-between bg-white p-4 border border-[#cbc4cd] rounded-xl shadow-xs">
            <div>
              <h3 className="font-serif font-bold text-sm text-[#161b27]">
                Class Sections Directory ({classesList.length} total)
              </h3>
              <p className="text-[11px] text-slate-500">
                Manage academic degree years, sections, room numbers, and staff in-charges.
              </p>
            </div>

            <button
              onClick={() => setIsAddingClass(!isAddingClass)}
              className="px-4 py-2 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {isAddingClass ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isAddingClass ? 'Cancel' : 'Add Class Section'}</span>
            </button>
          </div>

          {/* Add Class Form */}
          {isAddingClass && (
            <form
              onSubmit={handleAddClass}
              className="bg-emerald-50/50 border border-[#556B2F]/30 p-5 rounded-xl space-y-4 shadow-xs animate-in fade-in duration-200"
            >
              <h3 className="font-serif font-bold text-sm text-[#161b27] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#556B2F]" />
                <span>Add New Class Section to Database</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Year Label *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. I B.COM AF"
                    value={newClassYearLabel}
                    onChange={e => setNewClassYearLabel(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Section *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. A, B, C"
                    value={newClassSection}
                    onChange={e => setNewClassSection(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Room No
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 301, 302"
                    value={newClassRoomNo}
                    onChange={e => setNewClassRoomNo(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Incharge Staff Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. DR, SK, GVR"
                    value={newClassInchargeName}
                    onChange={e => setNewClassInchargeName(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Display Order
                  </label>
                  <input
                    type="number"
                    value={newClassDisplayOrder}
                    onChange={e => setNewClassDisplayOrder(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingClass(false)}
                  className="px-3 py-1.5 border border-[#cbc4cd] text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingClass}
                  className="px-4 py-1.5 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {isSubmittingClass && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Class Section</span>
                </button>
              </div>
            </form>
          )}

          {/* Classes Table */}
          <div className="bg-white border border-[#cbc4cd] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5F4F0] border-b border-[#cbc4cd] text-[#161b27]">
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-16 text-center">Order</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Year Label</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-24">Section</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-28">Room No</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Staff In-Charge</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-32 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbc4cd]">
                  {classesList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        No class sections configured.
                      </td>
                    </tr>
                  ) : (
                    classesList.map(cls => {
                      const isEditing = editingClassId === cls.id;

                      if (isEditing) {
                        return (
                          <tr key={cls.id} className="bg-amber-50/60">
                            <td className="py-2.5 px-4 text-center">
                              <input
                                type="number"
                                value={editClassDisplayOrder}
                                onChange={e => setEditClassDisplayOrder(Number(e.target.value))}
                                className="w-12 px-1 py-1 border border-amber-400 rounded bg-white text-center text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editClassYearLabel}
                                onChange={e => setEditClassYearLabel(e.target.value)}
                                className="w-full px-2 py-1 border border-amber-400 rounded bg-white font-bold text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editClassSection}
                                onChange={e => setEditClassSection(e.target.value)}
                                className="w-16 px-2 py-1 border border-amber-400 rounded bg-white font-bold text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editClassRoomNo}
                                onChange={e => setEditClassRoomNo(e.target.value)}
                                className="w-20 px-2 py-1 border border-amber-400 rounded bg-white text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editClassInchargeName}
                                onChange={e => setEditClassInchargeName(e.target.value)}
                                className="w-full px-2 py-1 border border-amber-400 rounded bg-white text-xs"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveEditClass(cls.id)}
                                  title="Save Changes"
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingClassId(null)}
                                  title="Cancel"
                                  className="p-1.5 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={cls.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-400">
                            {cls.displayOrder}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#161b27]">
                            {cls.yearLabel}
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-[#556B2F]">
                            Sec {cls.section}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {cls.roomNo ? `Room ${cls.roomNo}` : '—'}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-600">
                            {cls.inchargeName || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditClass(cls)}
                                title="Edit Class"
                                className="p-1.5 text-slate-600 hover:text-[#556B2F] hover:bg-slate-100 rounded cursor-pointer transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingClassId(cls.id)}
                                title="Delete Class"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 3. TIMETABLE SCHEDULE MANAGEMENT TAB */}
      {/* ===================================================================== */}
      {activeTab === 'timetable' && (
        <div className="space-y-6">
          {/* Filter & Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 border border-[#cbc4cd] rounded-xl shadow-xs">
            <div className="flex flex-wrap items-center gap-4">
              {/* Class Select */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                  Class:
                </label>
                <select
                  value={filterClassId}
                  onChange={e => setFilterClassId(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold border border-[#cbc4cd] rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20"
                >
                  {classesList.map(cls => (
                    <option key={cls.id} value={cls.id}>
                      {cls.yearLabel} - Sec {cls.section} (Rm {cls.roomNo})
                    </option>
                  ))}
                </select>
              </div>

              {/* Day Order Select */}
              <div className="flex items-center gap-2">
                <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                  Day Order:
                </label>
                <select
                  value={filterDayOrder}
                  onChange={e => setFilterDayOrder(Number(e.target.value))}
                  className="px-3 py-1.5 text-xs font-bold border border-[#cbc4cd] rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20"
                >
                  <option value={0}>All Day Orders (1-6)</option>
                  <option value={1}>Day Order I</option>
                  <option value={2}>Day Order II</option>
                  <option value={3}>Day Order III</option>
                  <option value={4}>Day Order IV</option>
                  <option value={5}>Day Order V</option>
                  <option value={6}>Day Order VI</option>
                </select>
              </div>
            </div>

            <button
              onClick={() => {
                setNewEntryClassId(activeClassId);
                setNewEntryDayOrder(filterDayOrder === 0 ? 1 : filterDayOrder);
                setIsAddingEntry(!isAddingEntry);
              }}
              className="px-4 py-2 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-2 transition-all cursor-pointer shadow-xs"
            >
              {isAddingEntry ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isAddingEntry ? 'Cancel' : 'Add Period Slot'}</span>
            </button>
          </div>

          {/* Add Period Entry Form */}
          {isAddingEntry && (
            <form
              onSubmit={handleAddEntry}
              className="bg-emerald-50/50 border border-[#556B2F]/30 p-5 rounded-xl space-y-4 shadow-xs animate-in fade-in duration-200"
            >
              <h3 className="font-serif font-bold text-sm text-[#161b27] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#556B2F]" />
                <span>Add Period Slot to Master Timetable</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Target Class
                  </label>
                  <select
                    value={newEntryClassId}
                    onChange={e => setNewEntryClassId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold"
                  >
                    {classesList.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.yearLabel} - Sec {c.section}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Day Order
                  </label>
                  <select
                    value={newEntryDayOrder}
                    onChange={e => setNewEntryDayOrder(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold"
                  >
                    {[1, 2, 3, 4, 5, 6].map(d => (
                      <option key={d} value={d}>
                        Day Order {['I', 'II', 'III', 'IV', 'V', 'VI'][d - 1]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Period (1 - 5)
                  </label>
                  <select
                    value={newEntryPeriod}
                    onChange={e => setNewEntryPeriod(Number(e.target.value))}
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold"
                  >
                    {[1, 2, 3, 4, 5].map(p => (
                      <option key={p} value={p}>
                        Period {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Subject Code *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. CA, FM, IT, AUD"
                    value={newEntrySubjectCode}
                    onChange={e => setNewEntrySubjectCode(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 text-xs border border-[#cbc4cd] rounded-lg bg-white font-bold uppercase"
                  />
                </div>
              </div>

              {/* Flags & Assigned Staff */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newEntryIsLab}
                      onChange={e => setNewEntryIsLab(e.target.checked)}
                      className="rounded text-[#556B2F] w-4 h-4 cursor-pointer"
                    />
                    <span>Is Computer Lab / Practical</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newEntryExcluded}
                      onChange={e => setNewEntryExcluded(e.target.checked)}
                      className="rounded text-amber-600 w-4 h-4 cursor-pointer"
                    />
                    <span>Exclude from Substitution</span>
                  </label>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                    Assigned Staff ({newEntryStaffIds.length} selected)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 bg-white border border-[#cbc4cd] rounded-lg">
                    {staffList.map(st => {
                      const isSelected = newEntryStaffIds.includes(st.id);
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => toggleNewStaffSelection(st.id)}
                          className={`px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[#556B2F] text-white shadow-2xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {st.code} {st.fullName ? `(${st.fullName.split(' ')[0]})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingEntry(false)}
                  className="px-3 py-1.5 border border-[#cbc4cd] text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEntry}
                  className="px-4 py-1.5 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-60"
                >
                  {isSubmittingEntry && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Timetable Slot</span>
                </button>
              </div>
            </form>
          )}

          {/* Timetable Entries Table */}
          <div className="bg-white border border-[#cbc4cd] rounded-xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#F5F4F0] border-b border-[#cbc4cd] text-[#161b27]">
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-24">Day Order</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-20 text-center">Period</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-32">Subject Code</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-28 text-center">Type</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px]">Assigned Faculty</th>
                    <th className="py-3 px-4 font-bold uppercase tracking-wider text-[10px] w-32 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbc4cd]">
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-semibold">
                        No timetable entries found for this class and day order filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map(entry => {
                      const isEditing = editingEntryId === entry.id;

                      if (isEditing) {
                        return (
                          <tr key={entry.id} className="bg-amber-50/60">
                            <td className="py-2.5 px-4 font-bold text-slate-700">
                              Day {['I', 'II', 'III', 'IV', 'V', 'VI'][entry.dayOrder - 1]}
                            </td>
                            <td className="py-2.5 px-4 text-center font-bold font-mono">
                              P{entry.period}
                            </td>
                            <td className="py-2.5 px-4">
                              <input
                                type="text"
                                value={editEntrySubjectCode}
                                onChange={e => setEditEntrySubjectCode(e.target.value)}
                                className="w-24 px-2 py-1 border border-amber-400 rounded bg-white font-bold text-xs uppercase"
                              />
                            </td>
                            <td className="py-2.5 px-4 text-center">
                              <div className="flex flex-col gap-1 items-center">
                                <label className="flex items-center gap-1 text-[11px] font-semibold">
                                  <input
                                    type="checkbox"
                                    checked={editEntryIsLab}
                                    onChange={e => setEditEntryIsLab(e.target.checked)}
                                    className="rounded text-[#556B2F] w-3.5 h-3.5 cursor-pointer"
                                  />
                                  <span>Lab</span>
                                </label>
                                <label className="flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                                  <input
                                    type="checkbox"
                                    checked={editEntryExcluded}
                                    onChange={e => setEditEntryExcluded(e.target.checked)}
                                    className="rounded text-amber-600 w-3.5 h-3.5 cursor-pointer"
                                  />
                                  <span>Exclude</span>
                                </label>
                              </div>
                            </td>
                            <td className="py-2.5 px-4">
                              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1 bg-white border border-amber-300 rounded">
                                {staffList.map(st => {
                                  const isSelected = editEntryStaffIds.includes(st.id);
                                  return (
                                    <button
                                      key={st.id}
                                      type="button"
                                      onClick={() => toggleEditStaffSelection(st.id)}
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                        isSelected
                                          ? 'bg-[#556B2F] text-white'
                                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                      }`}
                                    >
                                      {st.code}
                                    </button>
                                  );
                                })}
                              </div>
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleSaveEditEntry(entry.id)}
                                  disabled={isSavingEntry}
                                  title="Save Changes"
                                  className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded cursor-pointer"
                                >
                                  {isSavingEntry ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  onClick={() => setEditingEntryId(null)}
                                  title="Cancel"
                                  className="p-1.5 bg-slate-300 hover:bg-slate-400 text-slate-800 rounded cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-700">
                            Day {['I', 'II', 'III', 'IV', 'V', 'VI'][entry.dayOrder - 1]}
                          </td>
                          <td className="py-3 px-4 text-center font-bold font-mono text-[#556B2F]">
                            Period {entry.period}
                          </td>
                          <td className="py-3 px-4 font-bold text-[#161b27]">
                            <span className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono">
                              {entry.subjectCode || '—'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {entry.isLab && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                  LAB
                                </span>
                              )}
                              {entry.excludedFromSubstitution && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                  EXCLUDED
                                </span>
                              )}
                              {!entry.isLab && !entry.excludedFromSubstitution && (
                                <span className="text-slate-400 text-[10px]">Standard</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-wrap gap-1">
                              {entry.staffIds && entry.staffIds.length > 0 ? (
                                entry.staffIds.map(sid => {
                                  const staffObj = staffMap.get(sid);
                                  return (
                                    <span
                                      key={sid}
                                      className="px-2 py-0.5 bg-[#556B2F]/10 text-[#556B2F] font-bold rounded text-[10px] border border-[#556B2F]/20"
                                      title={staffObj?.fullName || undefined}
                                    >
                                      {staffObj?.code || sid}
                                    </span>
                                  );
                                })
                              ) : (
                                <span className="text-slate-400 italic text-[11px]">No staff assigned</span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => startEditEntry(entry)}
                                title="Edit Timetable Entry"
                                className="p-1.5 text-slate-600 hover:text-[#556B2F] hover:bg-slate-100 rounded cursor-pointer transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setDeletingEntryId(entry.id)}
                                title="Delete Entry"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 4. DANGER ZONE TAB */}
      {/* ===================================================================== */}
      {activeTab === 'danger' && (
        <div className="space-y-6">
          {/* Warning Banner */}
          <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-5 flex items-start gap-4 shadow-xs">
            <div className="p-2 bg-rose-600 text-white rounded-lg shrink-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-serif font-black text-base text-rose-950">
                Administrative Danger Zone
              </h3>
              <p className="text-xs text-rose-800 mt-1 font-sans leading-relaxed">
                Actions executed here directly modify or purge core records in your Supabase database. Strict typed confirmations are required to prevent unintended data loss.
              </p>
            </div>
          </div>

          {/* Quick Action: Instant Feed All Data & Seed Database */}
          <div className="bg-emerald-50/70 border-2 border-emerald-300 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h4 className="font-serif font-bold text-base text-emerald-950 flex items-center gap-2">
                  <Database className="w-5 h-5 text-emerald-700" />
                  <span>Feed Current & Past Data (Seed Database)</span>
                </h4>
                <p className="text-xs text-emerald-900 mt-1 max-w-2xl font-sans leading-relaxed">
                  <strong>Need to restore or feed everything?</strong> Touch this button to automatically feed all current data (today's live log sheet, day order, substitutions) and verified academic records (18 Faculty in Staff Directory, 11 Classes, 330 Timetable Periods, and daily history) directly into local active memory and Supabase database.
                </p>
              </div>
              <button
                id="admin-quick-seed-database-btn"
                type="button"
                disabled={isReseeding}
                onClick={() => handleReseedOriginalData(true)}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs shrink-0 self-start sm:self-auto"
              >
                {isReseeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                <span>{isReseeding ? 'Feeding All Data...' : 'Feed All Data & Seed Database'}</span>
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-emerald-800 font-sans border-t border-emerald-200/80 pt-3">
              <span className="flex items-center gap-1.5 font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> 18 Staff Directory Records
              </span>
              <span className="flex items-center gap-1.5 font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> 11 Class Sections
              </span>
              <span className="flex items-center gap-1.5 font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> 330 Timetable Periods
              </span>
              <span className="flex items-center gap-1.5 font-bold">
                <Check className="w-3.5 h-3.5 text-emerald-600" /> Current & Historical Log Sheets
              </span>
            </div>
          </div>

          {/* Action 1: Reseed from Original Data */}
          <div className="bg-white border border-amber-300/80 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-serif font-bold text-base text-[#161b27] flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-amber-600" />
                  <span>Reseed Database from Master Seed Data</span>
                </h4>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl font-sans">
                  Upserts the official Department of Accounting & Finance dataset (18 verified faculty, 11 class sections, 330 timetable periods, today's log sheet, and history) into Supabase using <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-900 font-mono text-[11px]">onConflict: 'id'</code>. This updates rows and preserves all current data.
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-lg space-y-3">
              <label className="block text-xs font-bold text-amber-950">
                Click below to feed immediately, or type <span className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300 text-amber-900">REUPLOAD</span>:
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="text"
                  placeholder="Optional: Type REUPLOAD"
                  value={reseedConfirmText}
                  onChange={e => setReseedConfirmText(e.target.value)}
                  className="px-3 py-2 text-xs font-bold border border-amber-400 rounded-lg bg-white text-[#161b27] focus:outline-none focus:ring-2 focus:ring-amber-500/20 max-w-xs"
                />
                <button
                  id="admin-reseed-data-btn"
                  type="button"
                  disabled={isReseeding}
                  onClick={() => handleReseedOriginalData(true)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                >
                  {isReseeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  <span>{isReseeding ? 'Feeding Supabase...' : 'Feed Current & Master Data'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action 2: Delete All Data */}
          <div className="bg-white border-2 border-rose-300 rounded-xl p-6 shadow-xs space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h4 className="font-serif font-bold text-base text-rose-950 flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-rose-600" />
                  <span>Purge All Database Records</span>
                </h4>
                <p className="text-xs text-slate-600 mt-1 max-w-2xl font-sans">
                  Deletes all rows from <code className="font-mono text-rose-900 bg-rose-50 px-1">substitutions</code>, <code className="font-mono text-rose-900 bg-rose-50 px-1">log_sheets</code>, <code className="font-mono text-rose-900 bg-rose-50 px-1">timetable_entries</code>, <code className="font-mono text-rose-900 bg-rose-50 px-1">class_sections</code>, and <code className="font-mono text-rose-900 bg-rose-50 px-1">staff</code> in FK-safe cascading order.
                </p>
              </div>
            </div>

            <div className="p-4 bg-rose-50/80 border border-rose-300 rounded-lg space-y-3">
              <p className="text-[11px] font-bold text-rose-800 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>This action completely clears all academic data in Supabase & memory. (An automatic safety backup snapshot is taken first).</span>
              </p>

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isDeletingAll}
                    onClick={() => handleDeleteAllData(true)}
                    className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-bold text-xs rounded-lg flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                    title="Automatically delete all database records immediately"
                  >
                    {isDeletingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    <span>{isDeletingAll ? 'Deleting All Records...' : 'DELETE ALL'}</span>
                  </button>
                  <span className="text-[11px] text-rose-800 font-medium">
                    Click <strong>DELETE ALL</strong> to automatically delete all records immediately.
                  </span>
                </div>

                <div className="text-[11px] text-slate-500 font-sans italic">
                  To restore data after deleting, touch <strong>Seed Database</strong> above.
                </div>
              </div>
            </div>
          </div>

          {/* ===================================================================== */}
          {/* DATABASE BACKUPS SECTION (BELOW DANGER ZONE) */}
          {/* ===================================================================== */}
          <DatabaseBackupsSection
            staffList={staffList}
            classesList={classesList}
            timetableEntries={timetableEntries}
            logSheets={logSheets}
            substitutions={substitutions}
            currentUserFullName={currentUserFullName}
            onRefreshData={onRefreshData}
            showToast={showToast}
            refreshTrigger={backupRefreshTrigger}
          />
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. DATABASE BACKUPS TAB */}
      {/* ===================================================================== */}
      {activeTab === 'backups' && (
        <DatabaseBackupsSection
          staffList={staffList}
          classesList={classesList}
          timetableEntries={timetableEntries}
          logSheets={logSheets}
          substitutions={substitutions}
          currentUserFullName={currentUserFullName}
          onRefreshData={onRefreshData}
          showToast={showToast}
          refreshTrigger={backupRefreshTrigger}
        />
      )}

      {/* ===================================================================== */}
      {/* 6. SQL SCHEMA & SETUP TAB */}
      {/* ===================================================================== */}
      {activeTab === 'schema' && (
        <DatabaseSchemaSection showToast={showToast} onSeedDatabase={onSeedDatabase} />
      )}

      {/* Delete Staff Confirmation Modal */}
      {deletingStaffId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-[#161b27]">Delete Faculty Member?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete staff member <strong>{staffMap.get(deletingStaffId)?.code}</strong> ({staffMap.get(deletingStaffId)?.fullName || 'No Name'})? This will remove them directly from the Supabase <code className="font-mono bg-slate-100 px-1">staff</code> table.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingStaff}
                onClick={() => setDeletingStaffId(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingStaff}
                onClick={() => handleDeleteStaff(deletingStaffId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-2"
              >
                {isDeletingStaff && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {deletingClassId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-[#161b27]">Delete Class Section?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this class section? This will remove the record from Supabase <code className="font-mono bg-slate-100 px-1">class_sections</code>.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={() => setDeletingClassId(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingClass}
                onClick={() => handleDeleteClass(deletingClassId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-2"
              >
                {isDeletingClass && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Timetable Entry Confirmation Modal */}
      {deletingEntryId && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-[#161b27]">Delete Period Slot?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to remove this timetable slot from the Supabase <code className="font-mono bg-slate-100 px-1">timetable_entries</code> table?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={isDeletingEntry}
                onClick={() => setDeletingEntryId(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingEntry}
                onClick={() => handleDeleteEntry(deletingEntryId)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center gap-2"
              >
                {isDeletingEntry && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
