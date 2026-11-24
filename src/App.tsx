import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Staff, ClassSection, TimetableEntry, LogSheet, Substitution } from './types';
import { supabase, isSupabaseConfigured, supabaseUrl, getActiveSupabaseUrl, getSupabaseProjectRef, isExpectedSupabaseFallbackError } from './lib/supabaseClient';
import {
  fetchAllAppData,
  seedDatabaseWithPastData,
  resetDatabaseToFactoryDefaults,
  mapLogSheetToDB,
  mapSubstitutionToDB,
  formatSupabaseError,
  syncFacultyMemberToDatabase,
  deleteFacultyMemberFromDatabase,
  toggleFacultyStatusInDatabase,
  toggleFacultyLeaveInDatabase
} from './lib/database';
import { loadMemoryData, saveMemoryData, upsertLogSheetInList } from './lib/memoryStorage';
import { generateUUID, isValidUUID, ensureUUID } from './lib/uuid';
import { CONSOLIDATED_MIGRATION_SQL } from './components/DatabaseSchemaSection';

// Helper to resolve user profile cleanly without locking out if profiles table is not yet created
function resolveUserProfile(user: any, profileRow?: any) {
  const userEmail = (user?.email || '').toLowerCase();
  let defaultFullName = user?.user_metadata?.full_name || '';
  let defaultRole = user?.user_metadata?.role || '';

  if (!defaultFullName) {
    if (userEmail.includes('surya') || userEmail === 'suryaverseofficials@gmail.com') {
      defaultFullName = 'SuryaVerse (Creator)';
      defaultRole = 'Creator';
    } else if (
      userEmail.includes('hod') ||
      userEmail.includes('rp@') ||
      userEmail.includes('rajendraprasad')
    ) {
      defaultFullName = 'DR. P. RAJENDRA PRASAD';
      defaultRole = 'Head of Department';
    } else if (userEmail.includes('admin')) {
      defaultFullName = 'Administrator';
      defaultRole = 'Administrator';
    } else {
      const emailName = (user?.email || 'staff').split('@')[0];
      defaultFullName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
      defaultRole = 'Staff';
    }
  }

  return {
    fullName: profileRow?.full_name || defaultFullName,
    role: profileRow?.role || defaultRole || 'Staff',
  };
}
import Sidebar from './Sidebar';
import Header from './components/Header';
import Letterhead from './components/Letterhead';
import LogSheetGrid from './components/LogSheetGrid';
import SubstitutionDrawer from './components/SubstitutionDrawer';
import DashboardView from './components/DashboardView';
import StaffDirectory from './components/StaffDirectory';
import SubstitutionHistory from './components/SubstitutionHistory';
import AdminDataManagement from './components/AdminDataManagement';
import FacultyWorkloadView from './components/FacultyWorkloadView';
import NewLogSheetModal from './components/NewLogSheetModal';
import VideoIntroAnimation from './components/VideoIntroAnimation';
import TimetableGeneratorModule from './components/timetable/TimetableGeneratorModule';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { Printer, CheckCircle, Sparkles, X, AlertTriangle, FileDown, Film, Loader2, RefreshCw, Database, Copy, ExternalLink, CalendarPlus } from 'lucide-react';

export default function App() {
  // Supabase Authentication & Profile State
  const [session, setSession] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<{ fullName: string; role: string } | null>(null);
  const [userId, setUserId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string>('');
  const [showIntro, setShowIntro] = useState<boolean>(true);

  // Startup Database Connectivity Check State
  const [isCheckingConnectivity, setIsCheckingConnectivity] = useState<boolean>(true);
  const [connectivityError, setConnectivityError] = useState<string | null>(null);

  // Loading & Error State for Supabase Data
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Navigation State
  const [currentView, setCurrentView] = useState<string>('log_sheets');

  // Core Data States (Connected to local persistent memory and Supabase)
  const [staffList, setStaffList] = useState<Staff[]>(() => loadMemoryData().staffList);
  const [classesList, setClassesList] = useState<ClassSection[]>(() => loadMemoryData().classesList);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>(() => loadMemoryData().timetableEntries);
  const [logSheets, setLogSheets] = useState<LogSheet[]>(() => loadMemoryData().logSheets);
  const [substitutions, setSubstitutions] = useState<Substitution[]>(() => loadMemoryData().substitutions);

  // Sync state modifications automatically to local memory storage
  useEffect(() => {
    saveMemoryData({
      staffList,
      classesList,
      timetableEntries,
      logSheets,
      substitutions
    });
  }, [staffList, classesList, timetableEntries, logSheets, substitutions]);

  // Selection/Input States
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedDayOrder, setSelectedDayOrder] = useState<number>(1);

  // Interactive UI States
  const [activeCell, setActiveCell] = useState<{
    classId: string;
    period: number;
    entry: TimetableEntry;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Helper to trigger small status toasts
  const showToast = useCallback((message: string, type: 'success' | 'info' | 'error') => {
    setToast({ message, type });
  }, []);

  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isPrintHelpOpen, setIsPrintHelpOpen] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [isNewLogSheetOpen, setIsNewLogSheetOpen] = useState<boolean>(false);

  // 1. One-time Startup Connectivity Check (Requirement 5)
  const checkDatabaseConnectivity = useCallback(async () => {
    setIsCheckingConnectivity(true);
    setConnectivityError(null);
    try {
      if (!isSupabaseConfigured) {
        setConnectivityError('Operating in local memory mode. Supabase credentials not set in environment or settings.');
        return;
      }
      const { error } = await supabase.from('staff').select('id').limit(1);
      if (error) {
        setConnectivityError(error.message || 'Unable to query the staff table.');
      } else {
        setConnectivityError(null);
      }
    } catch (err: any) {
      setConnectivityError(err?.message || 'Failed to connect to Supabase database.');
    } finally {
      setIsCheckingConnectivity(false);
    }
  }, []);

  useEffect(() => {
    checkDatabaseConnectivity();
  }, [checkDatabaseConnectivity]);

  // Fetch all application data from Supabase or local memory
  const loadDatabaseData = useCallback(async () => {
    setIsLoadingData(true);
    setDbError(null);
    try {
      const data = await fetchAllAppData();
      setStaffList(data.staffList);
      setClassesList(data.classesList);
      setTimetableEntries(data.timetableEntries);
      setLogSheets(data.logSheets);
      setSubstitutions(data.substitutions);

      // If log sheets exist, align selected date to most recent log sheet or today
      if (data.logSheets && data.logSheets.length > 0) {
        const latestSheet = data.logSheets[0];
        setSelectedDate(latestSheet.logDate);
        setSelectedDayOrder(latestSheet.dayOrder);
      }

      if (!data.isSupabaseLive && data.statusMessage) {
        setDbError(data.statusMessage);
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Fallback to local memory storage:', err);
      }
      const mem = loadMemoryData();
      setStaffList(mem.staffList);
      setClassesList(mem.classesList);
      setTimetableEntries(mem.timetableEntries);
      setLogSheets(mem.logSheets);
      setSubstitutions(mem.substitutions);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Listen for timetable updates triggered by Timetable Generator or backfills
  useEffect(() => {
    const handleTimetableUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<TimetableEntry[]>;
      if (customEvent.detail && Array.isArray(customEvent.detail)) {
        setTimetableEntries(customEvent.detail);
      }
    };
    window.addEventListener('accfin-timetable-updated', handleTimetableUpdate);
    return () => {
      window.removeEventListener('accfin-timetable-updated', handleTimetableUpdate);
    };
  }, []);

  // Restore existing session and verify profile on app load
  useEffect(() => {
    const initSession = async () => {
      let restored = false;
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession?.user) {
          let profileRow = null;
          try {
            const { data, error: profileError } = await supabase
              .from('profiles')
              .select('id, full_name, role')
              .eq('id', existingSession.user.id)
              .maybeSingle();

            if (!profileError) {
              profileRow = data;
            }
          } catch {
            // Non-blocking: table may be reloading in schema cache
          }

          const userProfileData = resolveUserProfile(existingSession.user, profileRow);
          setSession(existingSession);
          setUserProfile(userProfileData);
          loadDatabaseData();
          restored = true;
        }
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Notice verifying remote session:', err?.message || err);
        }
      }

      // If remote Supabase session is not found or unreachable, check resilient local session
      if (!restored && typeof window !== 'undefined') {
        try {
          const savedLocal = localStorage.getItem('accfin_local_session');
          if (savedLocal) {
            const parsed = JSON.parse(savedLocal);
            if (parsed?.user) {
              const userProfileData = resolveUserProfile(parsed.user);
              setSession(parsed);
              setUserProfile(userProfileData);
              loadDatabaseData();
            }
          }
        } catch {
          // Ignore parse errors on corrupted local cache
        }
      }
    };

    initSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setUserProfile(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accfin_local_session');
        }
      } else if (event === 'SIGNED_IN' && currentSession?.user) {
        setSession(currentSession);
        setUserProfile(resolveUserProfile(currentSession.user));
        if (typeof window !== 'undefined') {
          localStorage.setItem('accfin_local_session', JSON.stringify(currentSession));
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadDatabaseData]);

  // 2. Authentication Flow (Requirement 4 & Resilient Local Fallback)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId.trim() || !password) {
      setAuthError('Please enter both User ID and Password.');
      return;
    }

    setIsLoggingIn(true);
    setAuthError('');

    const trimmedUser = userId.trim();
    const email = trimmedUser.includes('@') ? trimmedUser : `${trimmedUser}@accfin.local`;

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (!error && data?.session && data?.user) {
        // Fetch matching profile row if profiles table exists
        const uid = data.user.id;
        let profileRow = null;
        try {
          const { data: pData, error: profileError } = await supabase
            .from('profiles')
            .select('id, full_name, role')
            .eq('id', uid)
            .maybeSingle();

          if (!profileError) {
            profileRow = pData;
          }
        } catch {
          // Non-blocking if profiles table is missing
        }

        const resolvedProfile = resolveUserProfile(data.user, profileRow);

        setUserId('');
        setPassword('');
        setAuthError('');
        setSession(data.session);
        setUserProfile(resolvedProfile);
        if (typeof window !== 'undefined') {
          localStorage.setItem('accfin_local_session', JSON.stringify(data.session));
        }
        await loadDatabaseData();
        return;
      }

      // Check if failure is due to remote database being offline / unreachable
      const errMsg = (error?.message || '').toLowerCase();
      const isUnreachable =
        errMsg.includes('unreachable') ||
        errMsg.includes('offline') ||
        errMsg.includes('failed to fetch') ||
        errMsg.includes('service_unavailable') ||
        errMsg.includes('bad request') ||
        errMsg.includes('network');

      // If remote Supabase is unreachable or paused, provide resilient local login
      if (isUnreachable || !errMsg.includes('invalid login credentials')) {
        const lower = trimmedUser.toLowerCase();
        const role = lower.includes('admin')
          ? 'Administrator'
          : lower.includes('hod') || lower === 'rp'
          ? 'Head of Department'
          : lower.includes('surya')
          ? 'Creator'
          : 'Staff';

        const localUser = {
          id: generateUUID(),
          email,
          user_metadata: {
            full_name: trimmedUser.toUpperCase(),
            role,
          },
        };

        const localSession = {
          user: localUser,
          access_token: 'local-resilient-token',
          expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
          token_type: 'bearer',
          isOffline: true,
        };

        setUserId('');
        setPassword('');
        setAuthError('');
        setSession(localSession);
        setUserProfile(resolveUserProfile(localUser));
        if (typeof window !== 'undefined') {
          localStorage.setItem('accfin_local_session', JSON.stringify(localSession));
        }
        showToast('Signed in to ACCFIN Portal (Active Local Storage Mode)', 'info');
        await loadDatabaseData();
        return;
      }

      setAuthError(error?.message || 'Invalid User ID or Password.');
    } catch {
      // Graceful local authentication fallback on network interruption
      const lower = trimmedUser.toLowerCase();
      const role = lower.includes('admin')
        ? 'Administrator'
        : lower.includes('hod') || lower === 'rp'
        ? 'Head of Department'
        : lower.includes('surya')
        ? 'Creator'
        : 'Staff';

      const localUser = {
        id: generateUUID(),
        email,
        user_metadata: {
          full_name: trimmedUser.toUpperCase(),
          role,
        },
      };

      const localSession = {
        user: localUser,
        access_token: 'local-resilient-token',
        expires_at: Math.floor(Date.now() / 1000) + 86400 * 30,
        token_type: 'bearer',
        isOffline: true,
      };

      setUserId('');
      setPassword('');
      setAuthError('');
      setSession(localSession);
      setUserProfile(resolveUserProfile(localUser));
      if (typeof window !== 'undefined') {
        localStorage.setItem('accfin_local_session', JSON.stringify(localSession));
      }
      showToast('Signed in to ACCFIN Portal (Active Local Storage Mode)', 'info');
      await loadDatabaseData();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice during sign out:', err);
      }
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accfin_local_session');
    }
    setSession(null);
    setUserProfile(null);
    setUserId('');
    setPassword('');
    setShowIntro(true);
  };

  // Find log sheet for the currently selected Date
  const currentLogSheet = logSheets.find(sheet => sheet.logDate === selectedDate) || null;

  // Auto-save state and refs for 30-second background persistence to Supabase
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved' | 'idle'>('saved');
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(new Date());
  const [hasUnsavedDraftChanges, setHasUnsavedDraftChanges] = useState<boolean>(false);

  const logSheetsRef = useRef(logSheets);
  const substitutionsRef = useRef(substitutions);
  const selectedDateRef = useRef(selectedDate);
  const selectedDayOrderRef = useRef(selectedDayOrder);
  const currentLogSheetRef = useRef(currentLogSheet);
  const sessionRef = useRef(session);
  const hasUnsavedDraftChangesRef = useRef(hasUnsavedDraftChanges);
  const isSavingRef = useRef(false);

  useEffect(() => {
    logSheetsRef.current = logSheets;
  }, [logSheets]);

  useEffect(() => {
    substitutionsRef.current = substitutions;
  }, [substitutions]);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    selectedDayOrderRef.current = selectedDayOrder;
  }, [selectedDayOrder]);

  useEffect(() => {
    currentLogSheetRef.current = currentLogSheet;
  }, [currentLogSheet]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    hasUnsavedDraftChangesRef.current = hasUnsavedDraftChanges;
  }, [hasUnsavedDraftChanges]);

  // Persist draft changes to Supabase and Log Sheet History every 30 seconds
  const persistDraftToSupabase = useCallback(async (isManual = false) => {
    if (isSavingRef.current) return;

    // Do not attempt to write if user is not signed in (Supabase RLS requires authentication)
    if (!sessionRef.current) {
      if (isManual) {
        showToast('Please sign in to save drafts to the database.', 'info');
      }
      return;
    }

    const curDate = selectedDateRef.current;
    const curDayOrder = selectedDayOrderRef.current;
    const allSheets = logSheetsRef.current;
    const allSubs = substitutionsRef.current;

    let targetSheet = allSheets.find(s => s.logDate === curDate);

    // If target sheet exists and is already finalized, skip auto-saving as draft
    if (targetSheet && targetSheet.status === 'finalized') {
      setSaveStatus('saved');
      setHasUnsavedDraftChanges(false);
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      if (!targetSheet) {
        targetSheet = {
          id: generateUUID(),
          logDate: curDate,
          dayOrder: curDayOrder,
          status: 'draft',
          totalAbsentees: 0,
          totalSubstitutions: 0
        };
      } else if (!isValidUUID(targetSheet.id)) {
        targetSheet = { ...targetSheet, id: generateUUID() };
      }

      // Calculate absentees and substitutions for this draft
      const currentSubs = allSubs.filter(s => s.logSheetId === targetSheet!.id);
      const absentStaffIds = Array.from(
        new Set(currentSubs.map(s => s.absentStaffId).filter(Boolean))
      );
      const updatedSheet: LogSheet = {
        ...targetSheet,
        dayOrder: curDayOrder,
        status: 'draft',
        totalAbsentees: absentStaffIds.length,
        totalSubstitutions: currentSubs.length
      };

      // 1. Keep local logSheets state in sync first
      setLogSheets(prev => upsertLogSheetInList(prev, updatedSheet));

      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setHasUnsavedDraftChanges(false);

      // 2. Persist draft log sheet to Supabase in background
      const { error: sheetErr } = await supabase
        .from('log_sheets')
        .upsert(mapLogSheetToDB(updatedSheet));
      if (sheetErr) throw sheetErr;

      // 3. Persist current sheet's substitutions to Supabase if any
      if (currentSubs.length > 0) {
        const { error: subsErr } = await supabase
          .from('substitutions')
          .upsert(currentSubs.map(mapSubstitutionToDB));
        if (subsErr) throw subsErr;
      }

      if (isManual) {
        showToast(`Draft for ${curDate} saved to Supabase & Log Sheet History.`, 'success');
      }
    } catch (err: any) {
      const isFallback = isExpectedSupabaseFallbackError(err);
      const friendlyMsg = isFallback
        ? 'Draft safely preserved in active local memory.'
        : (err?.message || 'Database notice');

      if (!isFallback) {
        console.warn('Draft save notice:', err);
      }
      if (isManual) {
        showToast(friendlyMsg, 'info');
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [showToast]);

  // 30-Second Auto-Save Interval while in draft mode
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      const currentSheet = currentLogSheetRef.current;
      const isFinalized = currentSheet?.status === 'finalized';
      const hasChanges = hasUnsavedDraftChangesRef.current;
      const isAuthed = !!sessionRef.current;

      // Auto-save every 30 seconds only if authenticated, draft mode, and has pending unsaved changes
      if (!isFinalized && isAuthed && hasChanges) {
        persistDraftToSupabase(false);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(autoSaveInterval);
  }, [persistDraftToSupabase]);

  // Sync Day Order when changing Date if a log sheet exists
  useEffect(() => {
    if (currentLogSheet) {
      setSelectedDayOrder(currentLogSheet.dayOrder);
    }
  }, [selectedDate, logSheets]);

  // Handle active cell click (open drawer)
  const handleCellClick = (classId: string, period: number, entry: TimetableEntry) => {
    if (currentLogSheet && currentLogSheet.status === 'finalized') {
      showToast('This log sheet is finalized and locked from further edits.', 'info');
      return;
    }
    setActiveCell({ classId, period, entry: { ...entry, staffIds: [...entry.staffIds] } });
  };

  // Get active substitutions for today's selected log sheet
  const activeSubstitutions = currentLogSheet
    ? substitutions.filter(sub => sub.logSheetId === currentLogSheet.id)
    : [];

  // Toggle active status in Staff Directory (persists to Supabase & tt_staff)
  const handleToggleStaffStatus = async (staffId: string) => {
    const target = staffList.find(s => s.id === staffId);
    if (!target) return;

    const newActive = !target.isActive;
    setStaffList(prev => prev.map(s => (s.id === staffId ? { ...s, isActive: newActive } : s)));
    try {
      await toggleFacultyStatusInDatabase(staffId, newActive, target.code);
      showToast(`Staff ${target.code} status updated to ${newActive ? 'Active' : 'Inactive'}.`, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice updating staff status:', err);
      }
      showToast(`Notice: Updated in memory (${err?.message || 'Database sync pending'})`, 'info');
    }
  };

  // Toggle leave status in Staff Directory (persists to Supabase)
  const handleToggleStaffLeave = async (staffId: string) => {
    const target = staffList.find(s => s.id === staffId);
    if (!target) return;

    const newLeave = !target.onLeave;
    setStaffList(prev => prev.map(s => (s.id === staffId ? { ...s, onLeave: newLeave } : s)));
    try {
      await toggleFacultyLeaveInDatabase(staffId, newLeave);
      showToast(`Staff ${target.code} ${newLeave ? 'marked on leave' : 'returned to duty'}.`, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice updating staff leave:', err);
      }
      showToast(`Notice: Updated in memory (${err?.message || 'Database sync pending'})`, 'info');
    }
  };

  // Add new faculty member from Staff Directory (persists to Supabase & tt_staff)
  const handleAddStaffFromDirectory = async (newStaff: Staff, isHOD = false) => {
    setStaffList(prev => [...prev.filter(s => s.code.toUpperCase() !== newStaff.code.toUpperCase()), newStaff]);
    try {
      await syncFacultyMemberToDatabase(newStaff, isHOD);
      showToast(`Faculty ${newStaff.code} (${newStaff.fullName || ''}) added successfully.`, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice adding faculty member:', err);
      }
      showToast(`Notice: Saved to memory (${err?.message || 'Database sync pending'})`, 'info');
    }
  };

  // Edit existing faculty member from Staff Directory
  const handleEditStaffFromDirectory = async (updatedStaff: Staff, isHOD = false) => {
    setStaffList(prev => prev.map(s => (s.id === updatedStaff.id ? updatedStaff : s)));
    try {
      await syncFacultyMemberToDatabase(updatedStaff, isHOD);
      showToast(`Faculty ${updatedStaff.code} updated successfully.`, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice updating faculty member:', err);
      }
      showToast(`Notice: Updated in memory (${err?.message || 'Database sync pending'})`, 'info');
    }
  };

  // Delete faculty member from Staff Directory
  const handleDeleteStaffFromDirectory = async (staffId: string, staffCode?: string) => {
    setStaffList(prev => prev.filter(s => s.id !== staffId && (!staffCode || s.code !== staffCode)));
    try {
      await deleteFacultyMemberFromDatabase(staffId, staffCode);
      showToast(`Faculty member removed from directory.`, 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice deleting faculty member:', err);
      }
      showToast(`Notice: Removed from memory (${err?.message || 'Database sync pending'})`, 'info');
    }
  };

  // Sync log sheet statistics (total absentees and substitutions) to Supabase and state
  const syncLogSheetStats = async (sheetId: string, currentSubs: Substitution[]) => {
    const sheetSubs = currentSubs.filter(s => s.logSheetId === sheetId);
    const totalAbsentees = new Set(sheetSubs.map(s => s.absentStaffId).filter(Boolean)).size;
    const totalSubstitutions = sheetSubs.filter(s => s.substituteStaffId || s.isSwap).length;

    // 1. Immediately update React state
    let updatedLogSheets: LogSheet[] = [];
    setLogSheets(prev => {
      updatedLogSheets = prev.map(sheet =>
        sheet.id === sheetId
          ? { ...sheet, totalAbsentees, totalSubstitutions }
          : sheet
      );
      return updatedLogSheets;
    });

    // 2. Persist to active local memory
    if (updatedLogSheets.length > 0) {
      saveMemoryData({ logSheets: updatedLogSheets, substitutions: currentSubs });
    }

    // 3. Persist to Supabase if table is created, handling schema cache gracefully
    try {
      const { error } = await supabase
        .from('log_sheets')
        .update({
          total_absentees: totalAbsentees,
          total_substitutions: totalSubstitutions
        })
        .eq('id', sheetId);

      if (error && !isExpectedSupabaseFallbackError(error)) {
        console.warn('Notice syncing log sheet stats to Supabase:', error.message);
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice syncing log sheet stats:', err?.message || err);
      }
    }
  };

  // Create, Update or Clear Substitution (persists to Supabase & local memory)
  const handleConfirmSubstitution = async (
    subData: Omit<Substitution, 'id' | 'logSheetId'> | Omit<Substitution, 'id' | 'logSheetId'>[] | null
  ) => {
    // 1. Ensure log sheet exists in state & memory
    let targetSheet = currentLogSheet;

    if (!targetSheet) {
      targetSheet = {
        id: generateUUID(),
        logDate: selectedDate,
        dayOrder: selectedDayOrder,
        status: 'draft',
        totalAbsentees: 0,
        totalSubstitutions: 0
      };
      setLogSheets(prev => upsertLogSheetInList(prev, targetSheet!));

      try {
        await supabase.from('log_sheets').upsert(mapLogSheetToDB(targetSheet));
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Supabase log sheet init notice:', err);
        }
      }
    } else if (!isValidUUID(targetSheet.id)) {
      const oldId = targetSheet.id;
      const validId = generateUUID();
      targetSheet = { ...targetSheet, id: validId };
      setLogSheets(prev => upsertLogSheetInList(prev, targetSheet!, oldId));
      setSubstitutions(prev => prev.map(s => (s.logSheetId === oldId ? { ...s, logSheetId: validId } : s)));

      try {
        await supabase.from('log_sheets').upsert(mapLogSheetToDB(targetSheet));
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Supabase log sheet UUID sync notice:', err);
        }
      }
    }

    const currentSheetId = targetSheet.id;
    const targetClassId = activeCell!.classId;
    const targetPeriod = activeCell!.period;

    // A. Clear / Reset Substitution
    if (!subData) {
      const existingSub = substitutions.find(
        s => s.logSheetId === currentSheetId && s.classId === targetClassId && s.period === targetPeriod
      );

      let updatedSubs: Substitution[] = [];

      if (existingSub?.isSwap && existingSub.swapWithPeriod) {
        const swapPeriod = existingSub.swapWithPeriod;
        updatedSubs = substitutions.filter(
          s => !(s.logSheetId === currentSheetId && s.classId === targetClassId && (s.period === targetPeriod || s.period === swapPeriod))
        );
        setSubstitutions(updatedSubs);
        showToast('Period swap successfully cleared and reset.', 'info');

        try {
          await supabase
            .from('substitutions')
            .delete()
            .eq('log_sheet_id', currentSheetId)
            .eq('class_id', targetClassId)
            .in('period', [targetPeriod, swapPeriod]);
        } catch (err: any) {
          if (!isExpectedSupabaseFallbackError(err)) {
            console.warn('Supabase period swap clear notice:', err);
          }
        }
      } else {
        updatedSubs = substitutions.filter(
          s => !(s.logSheetId === currentSheetId && s.classId === targetClassId && s.period === targetPeriod)
        );
        setSubstitutions(updatedSubs);
        showToast('Adjustment cleared/reset successfully.', 'info');

        try {
          await supabase
            .from('substitutions')
            .delete()
            .eq('log_sheet_id', currentSheetId)
            .eq('class_id', targetClassId)
            .eq('period', targetPeriod);
        } catch (err: any) {
          if (!isExpectedSupabaseFallbackError(err)) {
            console.warn('Supabase clear adjustment notice:', err);
          }
        }
      }

      await syncLogSheetStats(currentSheetId, updatedSubs);
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setHasUnsavedDraftChanges(false);
      setActiveCell(null);
      return;
    }

    // B. Apply Swap Substitutions (Array)
    if (Array.isArray(subData)) {
      const swapPeriods = subData.map(item => item.period);

      const newSwapEntries: Substitution[] = subData.map(item => ({
        id: generateUUID(),
        logSheetId: currentSheetId,
        classId: item.classId,
        period: item.period,
        absentStaffId: item.absentStaffId,
        substituteStaffId: item.substituteStaffId,
        remarks: item.remarks,
        isSwap: item.isSwap,
        swapWithPeriod: item.swapWithPeriod,
        swappedSubjectCode: item.swappedSubjectCode,
        swappedStaffIds: item.swappedStaffIds ? [...item.swappedStaffIds] : undefined
      }));

      const updatedSubs = [
        ...substitutions.filter(
          s => !(s.logSheetId === currentSheetId && s.classId === targetClassId && swapPeriods.includes(s.period))
        ),
        ...newSwapEntries
      ];
      setSubstitutions(updatedSubs);
      await syncLogSheetStats(currentSheetId, updatedSubs);
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setHasUnsavedDraftChanges(false);
      setActiveCell(null);

      try {
        await supabase
          .from('substitutions')
          .delete()
          .eq('log_sheet_id', currentSheetId)
          .eq('class_id', targetClassId)
          .in('period', swapPeriods);

        const { error: insError } = await supabase
          .from('substitutions')
          .insert(newSwapEntries.map(mapSubstitutionToDB));

        if (insError) throw insError;
        showToast('Period swap successfully applied and saved.', 'success');
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Supabase swap save notice:', err);
        }
        showToast('Period swap saved in local memory.', 'success');
      }
      return;
    }

    // C. Apply Single Substitution
    const existingSub = substitutions.find(
      s => s.logSheetId === currentSheetId && s.classId === targetClassId && s.period === targetPeriod
    );

    const newSub: Substitution = {
      id: generateUUID(),
      logSheetId: currentSheetId,
      classId: subData.classId,
      period: subData.period,
      absentStaffId: subData.absentStaffId,
      substituteStaffId: subData.substituteStaffId,
      remarks: subData.remarks
    };

    const periodsToDelete = existingSub?.isSwap && existingSub.swapWithPeriod
      ? [targetPeriod, existingSub.swapWithPeriod]
      : [targetPeriod];

    const updatedSubs = [
      ...substitutions.filter(
        s => !(s.logSheetId === currentSheetId && s.classId === targetClassId && periodsToDelete.includes(s.period))
      ),
      newSub
    ];
    setSubstitutions(updatedSubs);
    await syncLogSheetStats(currentSheetId, updatedSubs);
    setSaveStatus('saved');
    setLastSavedTime(new Date());
    setHasUnsavedDraftChanges(false);
    setActiveCell(null);

    try {
      await supabase
        .from('substitutions')
        .delete()
        .eq('log_sheet_id', currentSheetId)
        .eq('class_id', targetClassId)
        .in('period', periodsToDelete);

      const { error: insError } = await supabase
        .from('substitutions')
        .insert(mapSubstitutionToDB(newSub));

      if (insError) throw insError;
      showToast('Staff substitution successfully processed and saved.', 'success');
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase substitution save notice:', err);
      }
      showToast('Staff substitution saved in local memory.', 'success');
    }
  };

  // Generate / Create New Log Sheet workflow (local-first resilient)
  const handleCreateNewLogSheet = async (logDate: string, dayOrder: number) => {
    // Check if sheet exists
    const existing = logSheets.find(s => s.logDate === logDate);
    if (existing) {
      setSelectedDate(existing.logDate);
      setSelectedDayOrder(existing.dayOrder);
      setCurrentView('log_sheets');
      showToast(`Loaded existing Log Sheet for ${logDate}.`, 'info');
      return;
    }

    const newSheet: LogSheet = {
      id: generateUUID(),
      logDate,
      dayOrder,
      status: 'draft',
      totalAbsentees: 0,
      totalSubstitutions: 0
    };

    setLogSheets(prev => {
      const next = upsertLogSheetInList(prev, newSheet);
      saveMemoryData({ logSheets: next });
      return next;
    });
    setSelectedDate(logDate);
    setSelectedDayOrder(dayOrder);
    setCurrentView('log_sheets');
    showToast(`Generated new Log Sheet for ${logDate} (Day Order ${['I', 'II', 'III', 'IV', 'V', 'VI'][dayOrder - 1]}).`, 'success');

    try {
      await supabase
        .from('log_sheets')
        .insert(mapLogSheetToDB(newSheet));
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase create log sheet notice:', err);
      }
    }
  };

  // Finalize (Lock) Log Sheet (local-first resilient)
  const handleFinalizeLog = async () => {
    setSaveStatus('saving');
    let targetSheet = currentLogSheet;

    let updatedSubsForState = substitutions;
    if (!targetSheet) {
      targetSheet = {
        id: generateUUID(),
        logDate: selectedDate,
        dayOrder: selectedDayOrder,
        status: 'draft'
      };
    } else if (!isValidUUID(targetSheet.id)) {
      const oldId = targetSheet.id;
      const validId = generateUUID();
      targetSheet = { ...targetSheet, id: validId };
      updatedSubsForState = substitutions.map(s => (s.logSheetId === oldId ? { ...s, logSheetId: validId } : s));
      setSubstitutions(updatedSubsForState);
    }

    const currentSubs = updatedSubsForState.filter(s => s.logSheetId === targetSheet!.id);
    const absentStaffIds = Array.from(
      new Set(currentSubs.map(s => s.absentStaffId).filter(Boolean))
    );

    const finalizedSheet: LogSheet = {
      ...targetSheet,
      dayOrder: selectedDayOrder,
      status: 'finalized',
      finalizedAt: new Date().toISOString(),
      totalAbsentees: absentStaffIds.length,
      totalSubstitutions: currentSubs.length
    };

    setLogSheets(prev => {
      const next = upsertLogSheetInList(prev, finalizedSheet);
      saveMemoryData({ logSheets: next, substitutions: updatedSubsForState });
      return next;
    });

    setSaveStatus('saved');
    setLastSavedTime(new Date());
    setHasUnsavedDraftChanges(false);
    showToast(`Log Sheet for ${selectedDate} finalized and saved!`, 'success');

    try {
      // 1. Persist finalized log sheet to Supabase
      const { error: sheetErr } = await supabase
        .from('log_sheets')
        .upsert(mapLogSheetToDB(finalizedSheet));

      if (sheetErr) throw sheetErr;

      // 2. Persist all current substitutions for this sheet to Supabase
      if (currentSubs.length > 0) {
        const { error: subsErr } = await supabase
          .from('substitutions')
          .upsert(currentSubs.map(mapSubstitutionToDB));

        if (subsErr) throw subsErr;
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase finalize notice:', err);
      }
    }
  };

  // Select log sheet from history and switch to Daily Log Sheet view
  const handleSelectLogSheetFromHistory = (date: string, dayOrder: number) => {
    setSelectedDate(date);
    setSelectedDayOrder(dayOrder);
    setCurrentView('log_sheets');
    showToast(`Loaded Log Sheet for ${date}.`, 'info');
  };

  // Unlock / Re-open finalized log sheet for editing (local-first resilient)
  const handleUnlockLogSheet = async (sheetId: string) => {
    const target = logSheets.find(s => s.id === sheetId);

    setLogSheets(prev => {
      const next = prev.map(s => (s.id === sheetId ? { ...s, status: 'draft' as const } : s));
      saveMemoryData({ logSheets: next });
      return next;
    });
    if (target) {
      setSelectedDate(target.logDate);
      setSelectedDayOrder(target.dayOrder);
    }
    showToast('Log Sheet unlocked and opened in Daily Grid for editing.', 'info');

    try {
      await supabase
        .from('log_sheets')
        .update({ status: 'draft' })
        .eq('id', sheetId);
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase unlock notice:', err);
      }
    }
  };

  // Delete finalized log sheet and all its associated substitutions (local-first resilient)
  const handleDeleteLogSheet = async (sheetId: string) => {
    const target = logSheets.find(s => s.id === sheetId);
    const dateStr = target?.logDate || '';

    setLogSheets(prev => {
      const next = prev.filter(s => s.id !== sheetId);
      saveMemoryData({ logSheets: next });
      return next;
    });
    setSubstitutions(prev => {
      const next = prev.filter(s => s.logSheetId !== sheetId);
      saveMemoryData({ substitutions: next });
      return next;
    });
    showToast(`Log Sheet for ${dateStr} and its records deleted from History.`, 'info');

    try {
      if (isValidUUID(sheetId)) {
        await supabase.from('substitutions').delete().eq('log_sheet_id', sheetId);
        await supabase.from('log_sheets').delete().eq('id', sheetId);
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase delete log sheet notice:', err);
      }
    }
  };

  // Remove individual substitution from the historical registry log (local-first resilient)
  const handleRemoveSubstitution = async (id: string) => {
    setSubstitutions(prev => {
      const next = prev.filter(s => s.id !== id);
      saveMemoryData({ substitutions: next });
      return next;
    });
    showToast('Substitution removed from historical registry.', 'info');

    try {
      if (isValidUUID(id)) {
        await supabase.from('substitutions').delete().eq('id', id);
      }
    } catch (err: any) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Supabase remove substitution notice:', err);
      }
    }
  };

  // Handle Day Order select change (local-first resilient)
  const handleDayOrderChange = async (dayOrder: number) => {
    setSelectedDayOrder(dayOrder);

    let targetSheet = currentLogSheet;

    if (targetSheet) {
      if (!isValidUUID(targetSheet.id)) {
        const oldId = targetSheet.id;
        const validId = generateUUID();
        const updated = { ...targetSheet, id: validId, dayOrder };
        setLogSheets(prev => upsertLogSheetInList(prev, updated, oldId));
        setSubstitutions(prev => prev.map(s => (s.logSheetId === oldId ? { ...s, logSheetId: validId } : s)));

        try {
          await supabase.from('log_sheets').upsert(mapLogSheetToDB(updated));
        } catch (err: any) {
          if (!isExpectedSupabaseFallbackError(err)) {
            console.warn('Supabase day order change notice:', err);
          }
        }
      } else {
        const updatedSheet: LogSheet = { ...targetSheet, dayOrder };
        setLogSheets(prev => upsertLogSheetInList(prev, updatedSheet));

        try {
          await supabase
            .from('log_sheets')
            .update({ day_order: dayOrder })
            .eq('id', targetSheet.id);
        } catch (err: any) {
          if (!isExpectedSupabaseFallbackError(err)) {
            console.warn('Supabase day order update notice:', err);
          }
        }
      }
    } else {
      const newSheet: LogSheet = {
        id: generateUUID(),
        logDate: selectedDate,
        dayOrder,
        status: 'draft',
        totalAbsentees: 0,
        totalSubstitutions: 0
      };
      setLogSheets(prev => upsertLogSheetInList(prev, newSheet));

      try {
        await supabase.from('log_sheets').insert(mapLogSheetToDB(newSheet));
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Supabase day order new sheet notice:', err);
        }
      }
    }

    setSaveStatus('saved');
    setLastSavedTime(new Date());
    setHasUnsavedDraftChanges(false);
    showToast(`Day Order set to ${dayOrder} for this date.`, 'info');
  };

  // Start New Day: Archives the finalized sheet in Log Sheet History and opens a fresh blank working sheet
  const handleStartNewDay = async () => {
    if (!currentLogSheet || currentLogSheet.status !== 'finalized') {
      return;
    }

    // 1. Preserve finalized sheet & all substitutions/swaps in memory and Log Sheet History
    saveMemoryData({ logSheets, substitutions });

    // 2. Clear only temporary daily on-leave flags so all faculty start available for the new day
    //    (Never modifies master timetableEntries, classesList, staff roster/codes, or workload data)
    const freshStaff = staffList.map(s => ({ ...s, onLeave: false }));
    setStaffList(freshStaff);
    saveMemoryData({ staffList: freshStaff });

    if (isSupabaseConfigured) {
      try {
        await supabase.from('staff').update({ on_leave: false }).not('id', 'is', null);
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Notice clearing daily staff leave flags:', err);
        }
      }
    }

    // 3. Pick the next available unused date so the working log sheet starts completely blank
    const existingDates = new Set(logSheets.map(s => s.logDate));
    const todayStr = new Date().toISOString().split('T')[0];

    let nextDate = todayStr;
    if (existingDates.has(todayStr)) {
      const anchorStr = selectedDate >= todayStr ? selectedDate : todayStr;
      const parts = anchorStr.split('-').map(Number);
      let y = parts[0];
      let m = parts[1];
      let d = parts[2];
      if (!y || !m || !d) {
        const now = new Date();
        y = now.getUTCFullYear();
        m = now.getUTCMonth() + 1;
        d = now.getUTCDate();
      }
      for (let offset = 1; offset <= 365; offset++) {
        const candidate = new Date(Date.UTC(y, m - 1, d + offset)).toISOString().split('T')[0];
        if (!existingDates.has(candidate)) {
          nextDate = candidate;
          break;
        }
      }
    }

    setSelectedDate(nextDate);
    setSelectedDayOrder(prev => (prev % 6) + 1);
    setActiveCell(null);
    setHasUnsavedDraftChanges(false);
    hasUnsavedDraftChangesRef.current = false;
    setSaveStatus('saved');
    setLastSavedTime(new Date());

    showToast(`Finalized log archived in History. Ready for new day (${nextDate})!`, 'success');
  };

  // Full Factory Reset & Reseed Database (Wipes all history, substitutions, and custom edits back to factory defaults)
  const handleResetDatabase = async () => {
    if (isResetting) return;
    setIsResetting(true);

    try {
      const result = await resetDatabaseToFactoryDefaults();

      if (!result.success) {
        setIsResetConfirmOpen(false);
        setDbError(result.error || result.message);
        showToast(result.message, 'error');
        return;
      }

      // Force an authoritative hard refetch from Supabase (not cached state) before confirming reset
      const freshData = await fetchAllAppData({ forceRemoteSync: true });

      if (result.syncedToSupabase && !freshData.isSupabaseLive) {
        setIsResetConfirmOpen(false);
        const msg = `Database reset could not be verified via remote refetch: ${freshData.statusMessage || 'Supabase unreachable.'}`;
        setDbError(msg);
        showToast(msg, 'error');
        return;
      }

      const nextData = freshData.isSupabaseLive ? freshData : result.data;
      saveMemoryData(nextData);

      setStaffList(nextData.staffList);
      setClassesList(nextData.classesList);
      setTimetableEntries(nextData.timetableEntries);
      setLogSheets(nextData.logSheets);
      setSubstitutions(nextData.substitutions);
      logSheetsRef.current = nextData.logSheets;
      substitutionsRef.current = nextData.substitutions;

      const todayStr = new Date().toISOString().split('T')[0];
      setSelectedDate(todayStr);
      setSelectedDayOrder(1);
      selectedDateRef.current = todayStr;
      selectedDayOrderRef.current = 1;

      setHasUnsavedDraftChanges(false);
      hasUnsavedDraftChangesRef.current = false;
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setActiveCell(null);

      setIsResetConfirmOpen(false);
      setDbError(result.syncedToSupabase ? null : freshData.statusMessage || null);
      showToast(result.message, 'success');
    } catch (err: any) {
      setIsResetConfirmOpen(false);
      const errMsg = err?.message || 'Unexpected error while resetting database.';
      setDbError(errMsg);
      showToast(`Reset Database failed: ${errMsg}`, 'error');
    } finally {
      setIsResetting(false);
    }
  };

  // Database seed handler: automatically feeds all current and past data and refills the app
  const handleSeedDatabase = async () => {
    if (isSeeding) return;
    setIsSeeding(true);

    try {
      const result = await seedDatabaseWithPastData({
        staffList,
        classesList,
        timetableEntries,
        logSheets,
        substitutions,
      });

      // Immediately sync state with the newly fed current & past data
      setStaffList(result.data.staffList);
      setClassesList(result.data.classesList);
      setTimetableEntries(result.data.timetableEntries);
      setLogSheets(result.data.logSheets);
      setSubstitutions(result.data.substitutions);

      setHasUnsavedDraftChanges(false);
      hasUnsavedDraftChangesRef.current = false;
      setSaveStatus('saved');
      setLastSavedTime(new Date());
      setActiveCell(null);

      // Prioritize current date (today) so current log sheet is instantly active and fed
      const todayStr = new Date().toISOString().split('T')[0];
      const todaySheet = result.data.logSheets.find(s => s.logDate === todayStr);
      if (todaySheet) {
        setSelectedDate(todayStr);
        setSelectedDayOrder(todaySheet.dayOrder);
      } else if (result.data.logSheets && result.data.logSheets.length > 0) {
        const latestSheet = result.data.logSheets[0];
        setSelectedDate(latestSheet.logDate);
        setSelectedDayOrder(latestSheet.dayOrder);
      }

      showToast(result.message, result.syncedToSupabase ? 'success' : 'info');
      setDbError(null);
    } catch (err: any) {
      console.error('Database seeding error:', err);
      showToast(err?.message || 'Error seeding database.', 'info');
    } finally {
      setIsSeeding(false);
    }
  };

  // Trigger browser print
  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error('Browser print block/error:', e);
    }
    setIsPrintHelpOpen(true);
  };

  // Download high-quality PDF using html2canvas & jsPDF with full-height capture and multi-page pagination
  const handleDownloadPDF = async () => {
    if (isGeneratingPDF) return;

    const element = document.getElementById('printable-log-sheet-content');
    if (!element) {
      showToast('Error: Log sheet content not found.', 'info');
      return;
    }

    setIsGeneratingPDF(true);
    showToast('Preparing high-quality PDF document...', 'info');

    try {
      await new Promise(resolve => setTimeout(resolve, 250));

      const captureHeight = Math.max(element.scrollHeight, element.offsetHeight, 1800);

      const renderPromise = html2canvas(element, {
        scale: 2.5,
        useCORS: true,
        logging: false,
        imageTimeout: 10000,
        backgroundColor: '#ffffff',
        windowWidth: 1200,
        windowHeight: captureHeight + 1000,
        scrollY: 0,
        scrollX: 0,
        onclone: clonedDoc => {
          // Explicitly set height: 'auto' and overflow: 'visible' on #printable-log-sheet-content and all ancestor containers
          const clonedTarget = clonedDoc.getElementById('printable-log-sheet-content');
          if (clonedTarget) {
            clonedTarget.style.height = 'auto';
            clonedTarget.style.minHeight = '0px';
            clonedTarget.style.maxHeight = 'none';
            clonedTarget.style.overflow = 'visible';

            let parent = clonedTarget.parentElement;
            while (parent && parent !== clonedDoc.body) {
              parent.style.height = 'auto';
              parent.style.minHeight = '0px';
              parent.style.maxHeight = 'none';
              parent.style.overflow = 'visible';
              parent = parent.parentElement;
            }
          }

          if (clonedDoc.body) {
            clonedDoc.body.style.height = 'auto';
            clonedDoc.body.style.minHeight = '0px';
            clonedDoc.body.style.maxHeight = 'none';
            clonedDoc.body.style.overflow = 'visible';
          }

          if (clonedDoc.documentElement) {
            clonedDoc.documentElement.style.height = 'auto';
            clonedDoc.documentElement.style.minHeight = '0px';
            clonedDoc.documentElement.style.maxHeight = 'none';
            clonedDoc.documentElement.style.overflow = 'visible';
          }

          const banner = clonedDoc.getElementById('pdf-info-banner');
          if (banner) {
            banner.classList.remove('hidden');
            banner.classList.add('flex');
            banner.style.display = 'flex';
          }

          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            #printable-log-sheet-content {
              width: 1120px !important;
              max-width: 1120px !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              padding: 24px !important;
              margin: 0 auto !important;
              border: none !important;
              box-shadow: none !important;
              background-color: #ffffff !important;
            }
            .letterhead-container {
              display: flex !important;
              flex-direction: row !important;
              align-items: center !important;
              justify-content: space-between !important;
              margin-bottom: 10px !important;
              padding-bottom: 6px !important;
              border-bottom: 2px solid #1C3A70 !important;
            }
            .letterhead-container img {
              height: 48px !important;
              margin-bottom: 2px !important;
            }
            .letterhead-container h1 {
              font-size: 18px !important;
              line-height: 1.1 !important;
              color: #203978 !important;
            }
            .letterhead-container p {
              font-size: 8.5px !important;
              margin-top: 1px !important;
            }
            #pdf-info-banner {
              margin-bottom: 12px !important;
              padding-bottom: 6px !important;
              font-size: 10px !important;
            }
            .log-sheet-table-wrapper {
              box-shadow: none !important;
              border-radius: 4px !important;
              border: 1px solid #cbc4cd !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
            }
            .log-sheet-table {
              min-width: 100% !important;
              width: 100% !important;
              table-layout: fixed !important;
            }
            .log-sheet-table .log-sheet-grid-cell, .log-sheet-table td, .log-sheet-table th {
              height: 52px !important;
              padding: 4px 2px !important;
              font-size: 10px !important;
              border-bottom: 1px solid #cbc4cd !important;
              border-right: 1px solid #cbc4cd !important;
            }
            .class-column-header, .class-column-cell {
              width: 130px !important;
              max-width: 130px !important;
              padding-left: 6px !important;
              padding-right: 6px !important;
            }
            .break-column-header, .break-column-cell {
              width: 56px !important;
              max-width: 56px !important;
            }
            .break-column-cell {
              height: 52px !important;
            }
            .break-column-cell div {
              font-size: 8px !important;
            }
            .substitution-summary-section {
              display: block !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
              margin-top: 18px !important;
              padding-top: 14px !important;
            }
            .substitution-summary-section .overflow-x-auto,
            .substitution-summary-section table {
              overflow: visible !important;
              height: auto !important;
              max-height: none !important;
              width: 100% !important;
            }
            .signature-section {
              display: block !important;
              height: auto !important;
              max-height: none !important;
              overflow: visible !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF rendering timed out. Please try again or use Print Sheet.')), 20000)
      );

      const canvas = await Promise.race([renderPromise, timeoutPromise]);

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 6;
      const maxPrintWidth = pdfWidth - margin * 2;
      const maxPrintHeight = pdfHeight - margin * 2;

      // Calculate standard scaled height at full printable width
      let printWidth = maxPrintWidth;
      let totalScaledHeight = (canvas.height * printWidth) / canvas.width;

      // Compute number of landscape A4 pages needed at standard scale
      const standardNumPages = Math.ceil(totalScaledHeight / maxPrintHeight);
      let effectivePages = standardNumPages;

      // Bug 2 Fix: If last page content height is < 20% of a full page's printable height,
      // shrink the overall image scale slightly so the entire capture fits on one fewer page
      // (e.g. reclaim small overflow from signatures/footer without creating a near-empty page)
      if (standardNumPages > 1) {
        const fullPagesHeight = (standardNumPages - 1) * maxPrintHeight;
        const lastPageContentHeight = totalScaledHeight - fullPagesHeight;
        const lastPageFraction = lastPageContentHeight / maxPrintHeight;

        if (lastPageFraction < 0.20) {
          effectivePages = standardNumPages - 1;
          const targetTotalHeight = effectivePages * maxPrintHeight;
          totalScaledHeight = targetTotalHeight;
          printWidth = (canvas.width * targetTotalHeight) / canvas.height;
        }
      }

      if (effectivePages <= 1) {
        // Fits completely on a single landscape A4 page
        // Bug 1 Fix: Explicitly fill entire canvas with white before converting to JPEG
        const singleCanvas = document.createElement('canvas');
        singleCanvas.width = canvas.width;
        singleCanvas.height = canvas.height;
        const sCtx = singleCanvas.getContext('2d');
        if (sCtx) {
          sCtx.fillStyle = '#ffffff';
          sCtx.fillRect(0, 0, singleCanvas.width, singleCanvas.height);
          sCtx.drawImage(canvas, 0, 0);
        }

        const imgData = singleCanvas.toDataURL('image/jpeg', 0.95);
        const horizontalOffset = Math.max(margin, (pdfWidth - printWidth) / 2);
        const verticalOffset = Math.max(margin, (pdfHeight - totalScaledHeight) / 2);

        pdf.addImage(imgData, 'JPEG', horizontalOffset, verticalOffset, printWidth, totalScaledHeight);
      } else {
        // Genuine multi-page split: slice source canvas by height per landscape A4 page
        const sourcePageHeightPx = Math.floor((maxPrintHeight * canvas.width) / printWidth);
        let renderedHeightPx = 0;
        let pageIndex = 0;

        while (renderedHeightPx < canvas.height && pageIndex < effectivePages) {
          const currentSliceHeightPx = Math.min(canvas.height - renderedHeightPx, sourcePageHeightPx);
          if (currentSliceHeightPx <= 0) break;

          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = canvas.width;
          pageCanvas.height = currentSliceHeightPx;

          const ctx = pageCanvas.getContext('2d');
          if (ctx) {
            // Bug 1 Fix: Explicitly fill entire slice canvas with white BEFORE drawing sliced portion
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
            ctx.drawImage(
              canvas,
              0,
              renderedHeightPx,
              canvas.width,
              currentSliceHeightPx,
              0,
              0,
              canvas.width,
              currentSliceHeightPx
            );
          }

          const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
          const sliceHeightMm = (currentSliceHeightPx * printWidth) / canvas.width;

          if (pageIndex > 0) {
            pdf.addPage('a4', 'landscape');
          }

          const horizontalOffset = Math.max(margin, (pdfWidth - printWidth) / 2);
          const isFinalPage = (renderedHeightPx + currentSliceHeightPx) >= canvas.height || pageIndex === effectivePages - 1;
          const verticalOffset = isFinalPage
            ? Math.max(margin, (pdfHeight - sliceHeightMm) / 2)
            : margin;

          pdf.addImage(pageImgData, 'JPEG', horizontalOffset, verticalOffset, printWidth, sliceHeightMm);

          renderedHeightPx += currentSliceHeightPx;
          pageIndex++;
        }
      }

      const fileName = `AMJC_LogSheet_${selectedDate}_DayOrder_${selectedDayOrder}.pdf`;
      pdf.save(fileName);
      showToast(`Downloaded official PDF: ${fileName}`, 'success');
    } catch (error: any) {
      console.error('PDF Generation failed:', error);
      showToast(`PDF generation failed: ${error?.message || 'Unable to export PDF'}. Please try Print Sheet.`, 'info');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  useEffect(() => {
    if (toast) {
      const duration = toast.type === 'error' ? 6000 : 3000;
      const timer = setTimeout(() => setToast(null), duration);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Map header title
  const getViewTitle = () => {
    switch (currentView) {
      case 'log_sheets':
        return 'Daily Log Sheets';
      case 'faculty_workload':
        return 'Faculty Workload Tally & Summary';
      case 'sub_mgmt':
        return 'Log Sheet History & Archives';
      case 'dashboard':
        return 'Timetable Master';
      case 'timetable_generator':
        return 'Timetable Generator';
      case 'staff_dir':
        return 'Staff Directory';
      case 'admin':
        return 'Admin Data Management';
      default:
        return 'ACCFIN Portal';
    }
  };

  const isAuthenticated = !!session;

  if (!isAuthenticated) {
    if (showIntro) {
      return <VideoIntroAnimation onComplete={() => setShowIntro(false)} />;
    }

    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4 font-sans select-none">
        <div className="w-full max-w-md bg-white border border-[#cbc4cd] rounded-xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            {/* Round Shape Logo Emblem */}
            <div className="relative inline-flex items-center justify-center mb-2 group">
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-500 via-[#556B2F] to-amber-600 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-500"></div>

              <div className="relative w-20 h-20 rounded-full bg-[#0A0D06] border-2 border-amber-400/80 shadow-lg flex items-center justify-center overflow-hidden">
                <img
                  src="https://res.cloudinary.com/oomxhs6j/image/upload/v1785955932/ChatGPT_Image_Aug_5_2026_12_40_26_PM_zrruvh.png"
                  alt="ACCFIN Logo"
                  className="w-full h-full object-cover rounded-full"
                  referrerPolicy="no-referrer"
                />
              </div>
            </div>
            <h1 className="font-serif font-black text-2xl text-[#161b27] tracking-tight">
              A.M.J.C. Shift II
            </h1>
            <p className="text-xs font-bold text-[#556B2F] uppercase tracking-widest">
              Department of Accounting & Finance
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
              Staff Log & Substitution System
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-wider">
                User ID
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter User ID"
                  value={userId}
                  onChange={e => {
                    setUserId(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  required
                  className="w-full px-4 py-2.5 border border-[#cbc4cd] rounded-lg bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 text-[#161b27] tracking-wide placeholder:tracking-normal placeholder:text-slate-400"
                  autoFocus
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="Enter Password"
                  value={password}
                  onChange={e => {
                    setPassword(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  required
                  className="w-full px-4 py-2.5 border border-[#cbc4cd] rounded-lg bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 text-[#161b27] tracking-wide placeholder:tracking-normal placeholder:text-slate-400"
                />
              </div>
            </div>

            {authError && (
              <p className="text-[11px] text-rose-600 font-bold flex items-center justify-center gap-1.5 pt-1">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </p>
            )}

            <button
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-2.5 bg-[#556B2F] hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-md transition-all active:scale-98 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoggingIn ? 'Verifying...' : 'Enter Portal'}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Protected Administrative Session
            </p>
            <button
              type="button"
              onClick={() => setShowIntro(true)}
              className="text-[10px] font-extrabold text-[#556B2F] hover:underline cursor-pointer tracking-wider uppercase mt-1 flex items-center gap-1.5"
            >
              <Film className="w-3 h-3" />
              Replay Logo Opening Video
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Loading Screen while fetching database tables
  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6 font-sans select-none">
        <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-lg p-8 flex flex-col items-center gap-4 max-w-sm w-full text-center">
          <div className="w-12 h-12 rounded-full border-3 border-[#556B2F]/20 border-t-[#556B2F] animate-spin flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-[#556B2F] animate-spin opacity-50" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-[#161b27]">
              Loading Academic Database
            </h3>
            <p className="text-xs text-[#556B2F] font-bold uppercase tracking-wider mt-1">
              Department of Accounting & Finance
            </p>
            <p className="text-[11px] text-slate-400 font-semibold mt-1">
              Synchronizing faculty roster & log records...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#161b27] flex">
      {/* Sidebar */}
      <div className="print:hidden">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          onResetData={() => setIsResetConfirmOpen(true)}
          onLogout={handleLogout}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          userProfile={userProfile}
          onSeedDatabase={handleSeedDatabase}
          isSeeding={isSeeding}
          onNewLogSheet={() => setIsNewLogSheetOpen(true)}
        />
      </div>

      {/* Main Canvas Area */}
      <div
        className={`flex-1 ${
          isSidebarCollapsed ? 'ml-16' : 'ml-64'
        } transition-all duration-300 print:ml-0 min-h-screen flex flex-col relative`}
      >
        {/* Top App Bar */}
        <div className="print:hidden">
          <Header
            viewTitle={getViewTitle()}
            status={currentView === 'log_sheets' ? currentLogSheet?.status || 'draft' : null}
            saveStatus={saveStatus}
            lastSavedTime={lastSavedTime}
            onManualSave={() => persistDraftToSupabase(true)}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
            userProfile={userProfile}
            userEmail={session?.user?.email}
          />
        </div>

        {/* Resilient Memory & Database Status Banner */}
        {dbError && (
          <div className="mx-8 mt-4 p-3 bg-amber-50/95 border border-amber-300 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-amber-950 print:hidden shadow-xs">
            <div className="flex items-start sm:items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 sm:mt-0" />
              <span>
                <strong>Active Local Storage Mode:</strong> {dbError} All faculty, timetable entries, and substitutions are safely stored in your local memory.
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(CONSOLIDATED_MIGRATION_SQL);
                    showToast('Full Migration SQL copied to clipboard! Paste and Run in Supabase SQL Editor.', 'success');
                  } catch {
                    showToast('Could not copy automatically. You can copy the SQL from Admin > Schema tab.', 'info');
                  }
                }}
                className="px-3 py-1.5 text-[11px] font-bold bg-amber-200/90 hover:bg-amber-300 text-amber-950 rounded-lg cursor-pointer transition-all flex items-center gap-1.5"
                title="Copy complete migration SQL script to clipboard"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Migration SQL</span>
              </button>
              <a
                href={`https://supabase.com/dashboard/project/${getSupabaseProjectRef(getActiveSupabaseUrl())}/sql/new`}
                target="_blank"
                rel="noreferrer noopener"
                className="px-3 py-1.5 text-[11px] font-bold bg-[#556B2F] hover:bg-[#435424] text-white rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                title="Open Supabase SQL Editor in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open SQL Editor</span>
              </a>
              <button
                type="button"
                onClick={() => setCurrentView('admin')}
                className="px-3 py-1.5 text-[11px] font-bold bg-white/90 hover:bg-white text-stone-800 border border-amber-300 rounded-lg cursor-pointer transition-all"
              >
                Schema Details
              </button>
              <button
                type="button"
                onClick={handleSeedDatabase}
                disabled={isSeeding}
                className="px-3 py-1.5 text-[11px] font-bold bg-stone-700 hover:bg-stone-800 text-white rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
              >
                {isSeeding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
                <span>{isSeeding ? 'Feeding...' : 'Seed Data'}</span>
              </button>
            </div>
          </div>
        )}

        {/* View Routing */}
        <main className="flex-1 p-8 print:p-0">
          {currentView === 'log_sheets' && (
            <div
              id="printable-log-sheet-content"
              className="max-w-[1200px] mx-auto bg-white border border-[#cbc4cd] p-8 shadow-md rounded-lg print:border-none print:shadow-none print:p-0"
            >
              {/* Professional Classical Letterhead */}
              <Letterhead />

              {/* Administrative Control Dashboard Row */}
              <div
                data-html2canvas-ignore="true"
                className="flex flex-wrap items-end justify-between gap-4 mb-8 bg-[#FFF0F5] p-4 border border-[#cbc4cd] rounded-lg print:hidden select-none"
              >
                <div className="flex flex-wrap items-end gap-6">
                  {/* Date Input */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                      Attendance Date
                    </label>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={e => setSelectedDate(e.target.value)}
                      className="border border-[#cbc4cd] px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#556B2F]/20 outline-none bg-white rounded text-[#161b27]"
                    />
                  </div>

                  {/* Day Order Selection */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-sans font-bold text-[#556B2F] uppercase tracking-wider">
                      Day Order
                    </label>
                    <select
                      value={selectedDayOrder}
                      onChange={e => handleDayOrderChange(parseInt(e.target.value, 10))}
                      className="border border-[#cbc4cd] px-3 py-1.5 text-xs font-semibold focus:ring-2 focus:ring-[#556B2F]/20 outline-none bg-white rounded text-[#161b27] min-w-[130px]"
                    >
                      <option value={1}>Day Order I</option>
                      <option value={2}>Day Order II</option>
                      <option value={3}>Day Order III</option>
                      <option value={4}>Day Order IV</option>
                      <option value={5}>Day Order V</option>
                      <option value={6}>Day Order VI</option>
                    </select>
                  </div>
                </div>

                {/* Print, Download, Finalize & Start New Day Controls */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handlePrint}
                    className="px-4 py-1.5 border border-[#556B2F] text-[#556B2F] text-xs font-bold flex items-center gap-1.5 hover:bg-[#FFF0F5] rounded transition-all cursor-pointer shadow-2xs"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>PRINT SHEET</span>
                  </button>

                  <button
                    onClick={handleDownloadPDF}
                    disabled={isGeneratingPDF}
                    className={`px-4 py-1.5 text-white text-xs font-bold flex items-center gap-1.5 rounded transition-all shadow-xs ${
                      isGeneratingPDF
                        ? 'bg-slate-400 cursor-wait'
                        : currentLogSheet?.status === 'finalized'
                        ? 'bg-[#8B0000] hover:bg-[#a00000] active:scale-98 cursor-pointer'
                        : 'bg-[#556B2F] hover:opacity-90 active:scale-98 cursor-pointer'
                    }`}
                    title={
                      currentLogSheet?.status === 'finalized'
                        ? 'Download Official Finalized PDF'
                        : 'Download PDF Copy'
                    }
                  >
                    {isGeneratingPDF ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileDown className="w-3.5 h-3.5" />
                    )}
                    <span>{isGeneratingPDF ? 'GENERATING...' : 'DOWNLOAD PDF'}</span>
                  </button>

                  <button
                    disabled={currentLogSheet?.status === 'finalized'}
                    onClick={handleFinalizeLog}
                    className={`px-4 py-1.5 text-white text-xs font-bold flex items-center gap-1.5 rounded transition-all shadow-xs ${
                      currentLogSheet?.status === 'finalized'
                        ? 'bg-slate-300 border border-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#556B2F] hover:opacity-90 active:scale-98 cursor-pointer'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>FINALIZE LOG</span>
                  </button>

                  {currentLogSheet?.status === 'finalized' && (
                    <button
                      type="button"
                      onClick={handleStartNewDay}
                      title="Archive this finalized log sheet to History and clear the working sheet for a new date"
                      className="px-4 py-1.5 bg-[#203978] hover:bg-[#182c5c] text-white text-xs font-bold flex items-center gap-1.5 rounded transition-all shadow-xs cursor-pointer active:scale-98"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>START NEW DAY</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Day Details Info Banner */}
              <div
                id="pdf-info-banner"
                className="hidden print:flex justify-between items-center border-b border-[#cbc4cd] pb-2 mb-6 text-xs font-bold text-[#161b27]"
              >
                <span>
                  ATTENDANCE DATE:{' '}
                  {new Date(selectedDate)
                    .toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })
                    .toUpperCase()}
                </span>
                <span className="uppercase text-[#556B2F]">
                  DAY ORDER: {['I', 'II', 'III', 'IV', 'V', 'VI'][selectedDayOrder - 1]}
                </span>
                <span>STATUS: {(currentLogSheet?.status || 'DRAFT').toUpperCase()}</span>
              </div>

              {/* Master 11x5 Timetable Log Grid */}
              <LogSheetGrid
                classes={classesList}
                staffList={staffList}
                timetableEntries={timetableEntries}
                substitutions={activeSubstitutions}
                isFinalized={currentLogSheet?.status === 'finalized'}
                activeDayOrder={selectedDayOrder}
                onCellClick={handleCellClick}
                logSheetId={currentLogSheet?.id}
              />

              {/* Footer Legal & Generation Stamp */}
              <div className="mt-8 pt-4 border-t border-[#cbc4cd] text-[10px] text-slate-400 font-semibold flex flex-col sm:flex-row justify-between items-center sm:items-end gap-2 select-none print:mt-4 print:pt-2">
                <p className="text-center sm:text-left text-slate-500">
                  GENERATED ON:{' '}
                  {new Date()
                    .toLocaleDateString('en-GB', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric'
                    })
                    .toUpperCase()}{' '}
                  {new Date().toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                  })}{' '}
                  IST
                </p>
                <div className="text-center sm:text-right">
                  <p className="font-mono text-slate-500">AMJC-AF-SLS-2026-SV1.6</p>
                  <p className="text-[9px] font-bold text-[#203978] mt-0.5 tracking-wide">
                    Powered by SuryaVerse Studio
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentView === 'faculty_workload' && (
            <FacultyWorkloadView
              staffList={staffList}
              timetableEntries={timetableEntries}
              substitutions={substitutions}
              logSheets={logSheets}
              onNavigateToLogSheets={() => setCurrentView('log_sheets')}
            />
          )}

          {currentView === 'sub_mgmt' && (
            <SubstitutionHistory
              logSheets={logSheets}
              substitutions={substitutions}
              staffList={staffList}
              classes={classesList}
              onSelectLogSheet={handleSelectLogSheetFromHistory}
              onUnlockLogSheet={handleUnlockLogSheet}
              onDeleteLogSheet={handleDeleteLogSheet}
              onRemoveSubstitution={handleRemoveSubstitution}
            />
          )}

          {currentView === 'dashboard' && (
            <DashboardView
              classes={classesList}
              staffList={staffList}
              timetableEntries={timetableEntries}
              onNewLogSheet={() => setIsNewLogSheetOpen(true)}
            />
          )}

          {currentView === 'timetable_generator' && (
            <TimetableGeneratorModule
              liveStaffList={staffList}
              onStaffChanged={loadDatabaseData}
            />
          )}

          {currentView === 'staff_dir' && (
            <StaffDirectory
              staffList={staffList}
              timetableEntries={timetableEntries}
              onToggleStatus={handleToggleStaffStatus}
              onToggleLeave={handleToggleStaffLeave}
              onAddStaff={handleAddStaffFromDirectory}
              onEditStaff={handleEditStaffFromDirectory}
              onDeleteStaff={handleDeleteStaffFromDirectory}
            />
          )}

          {currentView === 'admin' && (
            <AdminDataManagement
              staffList={staffList}
              classesList={classesList}
              timetableEntries={timetableEntries}
              logSheets={logSheets}
              substitutions={substitutions}
              currentUserFullName={userProfile?.fullName || 'Administrator'}
              onRefreshData={loadDatabaseData}
              showToast={showToast}
              onSeedDatabase={handleSeedDatabase}
            />
          )}
        </main>
      </div>

      {/* Real-time Substitution Drawer Overlay */}
      {activeCell && (
        <SubstitutionDrawer
          classSection={classesList.find(c => c.id === activeCell.classId)!}
          period={activeCell.period}
          entry={activeCell.entry}
          staffList={staffList}
          timetableEntries={timetableEntries}
          currentSubstitution={
            currentLogSheet
              ? substitutions.find(
                  s =>
                    s.logSheetId === currentLogSheet.id &&
                    s.classId === activeCell.classId &&
                    s.period === activeCell.period
                ) || null
              : null
          }
          onConfirm={handleConfirmSubstitution}
          onClose={() => setActiveCell(null)}
          substitutions={substitutions}
          currentLogSheet={currentLogSheet}
        />
      )}

      {/* Generate New Daily Log Sheet Modal */}
      <NewLogSheetModal
        isOpen={isNewLogSheetOpen}
        onClose={() => setIsNewLogSheetOpen(false)}
        existingLogSheets={logSheets}
        onCreate={handleCreateNewLogSheet}
        onOpenExisting={handleSelectLogSheetFromHistory}
      />

      {/* Quick Interactive Toasts */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-5 duration-200 max-w-md ${
            toast.type === 'error'
              ? 'bg-[#ba1a1a] text-white border border-red-300'
              : 'bg-[#161b27] text-[#faf9ff] border border-slate-700'
          }`}
        >
          {toast.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-white shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[#cbeb8a] shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Full Factory Reset Confirmation Modal */}
      {isResetConfirmOpen && (
        <div id="factory-reset-modal" className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#ba1a1a]/40 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-[#ba1a1a]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-serif font-bold text-lg text-[#161b27]">Full Factory Reset &amp; Reseed Database?</h3>
            </div>
            <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed font-sans">
              <p className="text-[#ba1a1a] font-bold bg-red-50 border border-red-200 rounded-lg p-3">
                Warning: This permanently wipes ALL Log Sheet History, finalized records, substitutions, period swaps, and custom edits, and reseeds the entire database from factory defaults.
              </p>
              <p>
                If you only want to start a fresh working log sheet for a new date while keeping today&apos;s finalized corrections in Log Sheet History, click <strong>Cancel</strong> and use the <strong>START NEW DAY</strong> button on the Daily Log Sheet instead.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                id="cancel-factory-reset-btn"
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                id="confirm-factory-reset-btn"
                type="button"
                disabled={isResetting}
                onClick={handleResetDatabase}
                className="px-4 py-2 bg-[#ba1a1a] hover:bg-[#93000a] text-white font-bold text-xs rounded shadow-xs transition-all cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isResetting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isResetting ? 'Wiping & Reseeding...' : 'Wipe & Reset Everything'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Print Instructions Dialog Modal */}
      {isPrintHelpOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-[#556B2F]">
                <Printer className="w-5 h-5" />
                <h3 className="font-serif font-bold text-base text-[#161b27]">
                  Optimal Printing Settings
                </h3>
              </div>
              <button
                onClick={() => setIsPrintHelpOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p className="font-semibold text-slate-800">
                For best quality single-page PDF output:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px]">
                <li>
                  <strong>Destination:</strong> Save as PDF or your departmental printer
                </li>
                <li>
                  <strong>Layout:</strong> Landscape
                </li>
                <li>
                  <strong>Paper size:</strong> A4
                </li>
                <li>
                  <strong>Margins:</strong> None or Minimum
                </li>
                <li>
                  <strong>Options:</strong> Check <em>"Background graphics"</em> to ensure header and class colors appear
                </li>
              </ul>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setIsPrintHelpOpen(false)}
                className="px-4 py-1.5 bg-[#556B2F] text-white font-bold text-xs rounded hover:opacity-90 transition-all cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
