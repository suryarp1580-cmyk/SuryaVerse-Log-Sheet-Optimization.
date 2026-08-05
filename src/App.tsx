import React, { useState, useEffect } from 'react';
import { initialStaff, initialClasses, getInitialTimetableEntries } from './data/seedData';
import { Staff, ClassSection, TimetableEntry, LogSheet, Substitution } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Letterhead from './components/Letterhead';
import LogSheetGrid from './components/LogSheetGrid';
import SubstitutionDrawer from './components/SubstitutionDrawer';
import DashboardView from './components/DashboardView';
import StaffDirectory from './components/StaffDirectory';
import SubstitutionHistory from './components/SubstitutionHistory';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { Printer, CheckCircle, RefreshCw, Calendar, Layers, Sparkles, X, AlertTriangle, Info, FileDown } from 'lucide-react';

export default function App() {
  // Authentication State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('accfin_authenticated') === 'true';
  });
  const [authId, setAuthId] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (authId === 'Rp@amjc') {
      setIsAuthenticated(true);
      localStorage.setItem('accfin_authenticated', 'true');
      setAuthError('');
    } else {
      setAuthError('Please enter correct ID');
    }
  };

  // Navigation State
  const [currentView, setCurrentView] = useState<string>('log_sheets');

  // Core Data States
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [classesList] = useState<ClassSection[]>(initialClasses);
  const [timetableEntries, setTimetableEntries] = useState<TimetableEntry[]>([]);
  const [logSheets, setLogSheets] = useState<LogSheet[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);

  // Selection/Input States
  const [selectedDate, setSelectedDate] = useState<string>('2024-05-20');
  const [selectedDayOrder, setSelectedDayOrder] = useState<number>(3); // Day Order III (3)

  // Interactive UI States
  const [activeCell, setActiveCell] = useState<{
    classId: string;
    period: number;
    entry: TimetableEntry;
  } | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState<boolean>(false);
  const [isPrintHelpOpen, setIsPrintHelpOpen] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Lazy Initialization & LocalStorage Load
  useEffect(() => {
    // 1. Staff
    const savedStaff = localStorage.getItem('accfin_staff');
    if (savedStaff) {
      const parsed = JSON.parse(savedStaff);
      const mapped = parsed.map((s: any) => {
        const found = initialStaff.find(is => is.id === s.id);
        return {
          ...s,
          ...(found ? { fullName: found.fullName, code: found.code } : {}),
          onLeave: s.onLeave !== undefined ? s.onLeave : false
        };
      });
      setStaffList(mapped);
      localStorage.setItem('accfin_staff', JSON.stringify(mapped));
    } else {
      setStaffList(initialStaff);
      localStorage.setItem('accfin_staff', JSON.stringify(initialStaff));
    }

    // 2. Timetable Entries
    const savedTimetable = localStorage.getItem('accfin_timetable');
    if (savedTimetable) {
      setTimetableEntries(JSON.parse(savedTimetable));
    } else {
      const initialTt = getInitialTimetableEntries();
      setTimetableEntries(initialTt);
      localStorage.setItem('accfin_timetable', JSON.stringify(initialTt));
    }

    // 3. Log Sheets & Presets
    const savedLogSheets = localStorage.getItem('accfin_log_sheets');
    const defaultLogSheet: LogSheet = {
      id: 'log-sheet-preset',
      logDate: '2024-05-20',
      dayOrder: 3,
      status: 'draft'
    };

    if (savedLogSheets) {
      setLogSheets(JSON.parse(savedLogSheets));
    } else {
      setLogSheets([defaultLogSheet]);
      localStorage.setItem('accfin_log_sheets', JSON.stringify([defaultLogSheet]));
    }

    // 4. Substitutions & Presets
    const savedSubs = localStorage.getItem('accfin_substitutions');

    if (savedSubs) {
      const parsed = JSON.parse(savedSubs);
      // Filter out preset substitutions containing fake IDs or preset IDs
      const cleaned = parsed.filter((sub: any) => !sub.id.startsWith('sub-preset-'));
      setSubstitutions(cleaned);
      localStorage.setItem('accfin_substitutions', JSON.stringify(cleaned));
    } else {
      setSubstitutions([]);
      localStorage.setItem('accfin_substitutions', JSON.stringify([]));
    }
  }, []);

  // Sync state changes to LocalStorage
  const saveStaff = (updated: Staff[]) => {
    setStaffList(updated);
    localStorage.setItem('accfin_staff', JSON.stringify(updated));
  };

  const saveLogSheets = (updated: LogSheet[]) => {
    setLogSheets(updated);
    localStorage.setItem('accfin_log_sheets', JSON.stringify(updated));
  };

  const saveSubstitutions = (updated: Substitution[]) => {
    setSubstitutions(updated);
    localStorage.setItem('accfin_substitutions', JSON.stringify(updated));
  };

  // Find or create a log sheet for the currently selected Date
  const currentLogSheet = logSheets.find(sheet => sheet.logDate === selectedDate) || null;

  // Sync Day Order when changing Date if a log sheet exists, or create one
  useEffect(() => {
    if (currentLogSheet) {
      setSelectedDayOrder(currentLogSheet.dayOrder);
    }
  }, [selectedDate, logSheets]);

  // Handle active cell click (open drawer)
  const handleCellClick = (classId: string, period: number, entry: TimetableEntry) => {
    // Check if the current log sheet is finalized. If so, block edits!
    if (currentLogSheet && currentLogSheet.status === 'finalized') {
      showToast('This log sheet is finalized and locked from further edits.', 'info');
      return;
    }
    setActiveCell({ classId, period, entry });
  };

  // Get active substitutions for today's selected log sheet
  const activeSubstitutions = currentLogSheet
    ? substitutions.filter(sub => sub.logSheetId === currentLogSheet.id)
    : [];

  // Toggle active status in Staff Directory
  const handleToggleStaffStatus = (staffId: string) => {
    const updated = staffList.map(s => {
      if (s.id === staffId) {
        return { ...s, isActive: !s.isActive };
      }
      return s;
    });
    saveStaff(updated);
    showToast('Staff active status updated successfully.', 'success');
  };

  // Toggle leave status in Staff Directory
  const handleToggleStaffLeave = (staffId: string) => {
    const updated = staffList.map(s => {
      if (s.id === staffId) {
        return { ...s, onLeave: !s.onLeave };
      }
      return s;
    });
    saveStaff(updated);
    showToast('Staff leave status updated successfully.', 'success');
  };

  // Create or Update Substitution
  const handleConfirmSubstitution = (
    subData: Omit<Substitution, 'id' | 'logSheetId'> | Omit<Substitution, 'id' | 'logSheetId'>[] | null
  ) => {
    // 1. Ensure log sheet exists. If not, create one
    let targetSheet = currentLogSheet;
    let updatedSheets = [...logSheets];

    if (!targetSheet) {
      targetSheet = {
        id: `log-${Date.now()}`,
        logDate: selectedDate,
        dayOrder: selectedDayOrder,
        status: 'draft'
      };
      updatedSheets.push(targetSheet);
      saveLogSheets(updatedSheets);
    }

    let updatedSubs = [...substitutions];

    // If subData is null (request to clear/reset)
    if (!subData) {
      const existingSub = substitutions.find(
        s => s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && s.period === activeCell!.period
      );
      if (existingSub?.isSwap && existingSub.swapWithPeriod) {
        // Clear both sides of the swap
        updatedSubs = updatedSubs.filter(
          s => !(s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && (s.period === activeCell!.period || s.period === existingSub.swapWithPeriod))
        );
        showToast('Period swap successfully cleared and reset.', 'info');
      } else {
        // Clear single substitution
        updatedSubs = updatedSubs.filter(
          s => !(s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && s.period === activeCell!.period)
        );
        showToast('Adjustment cleared/reset successfully.', 'info');
      }
      saveSubstitutions(updatedSubs);
      setActiveCell(null);
      return;
    }

    // If subData is an array (representing a swap)
    if (Array.isArray(subData)) {
      // Find all periods involved in this swap to clear their existing substitutions
      const swapPeriods = subData.map(item => item.period);
      updatedSubs = updatedSubs.filter(
        s => !(s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && swapPeriods.includes(s.period))
      );

      // Add the new swap entries
      subData.forEach(item => {
        updatedSubs.push({
          id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          logSheetId: targetSheet!.id,
          classId: item.classId,
          period: item.period,
          absentStaffId: item.absentStaffId,
          substituteStaffId: item.substituteStaffId,
          remarks: item.remarks,
          isSwap: item.isSwap,
          swapWithPeriod: item.swapWithPeriod,
          swappedSubjectCode: item.swappedSubjectCode,
          swappedStaffIds: item.swappedStaffIds
        });
      });

      showToast('Period swap successfully applied.', 'success');
    } else {
      // Normal single substitution
      // If there's an existing swap on either side, we should clear both sides first to avoid corrupted state
      const existingSub = substitutions.find(
        s => s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && s.period === activeCell!.period
      );
      if (existingSub?.isSwap && existingSub.swapWithPeriod) {
        updatedSubs = updatedSubs.filter(
          s => !(s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && (s.period === activeCell!.period || s.period === existingSub.swapWithPeriod))
        );
      } else {
        updatedSubs = updatedSubs.filter(
          s => !(s.logSheetId === targetSheet!.id && s.classId === activeCell!.classId && s.period === activeCell!.period)
        );
      }

      updatedSubs.push({
        id: `sub-${Date.now()}`,
        logSheetId: targetSheet.id,
        classId: subData.classId,
        period: subData.period,
        absentStaffId: subData.absentStaffId,
        substituteStaffId: subData.substituteStaffId,
        remarks: subData.remarks
      });
      showToast('Staff substitution successfully processed.', 'success');
    }

    saveSubstitutions(updatedSubs);
    setActiveCell(null);
  };

  // Finalize (Lock) Log Sheet
  const handleFinalizeLog = () => {
    let targetSheet = currentLogSheet;
    let updatedSheets = [...logSheets];

    if (!targetSheet) {
      targetSheet = {
        id: `log-${Date.now()}`,
        logDate: selectedDate,
        dayOrder: selectedDayOrder,
        status: 'draft'
      };
      updatedSheets.push(targetSheet);
    }

    updatedSheets = updatedSheets.map(s => {
      if (s.id === targetSheet!.id) {
        return { ...s, status: 'finalized' as const };
      }
      return s;
    });

    saveLogSheets(updatedSheets);
    showToast('Daily Log Sheet successfully finalized and locked.', 'success');
  };

  // Trigger browser print
  const handlePrint = () => {
    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error("Browser print block/error:", e);
    }
    setIsPrintHelpOpen(true);
  };

  // Download high-quality PDF using html2canvas & jsPDF
  const handleDownloadPDF = async () => {
    const element = document.getElementById('printable-log-sheet-content');
    if (!element) {
      showToast('Error: Log sheet content not found.', 'info');
      return;
    }

    setIsGeneratingPDF(true);
    showToast('Preparing high-quality PDF document...', 'info');

    try {
      // Small timeout to let any dynamic renders settle
      await new Promise(resolve => setTimeout(resolve, 300));

      // Capture with custom settings to ensure clean, high-DPI rendering
      const canvas = await html2canvas(element, {
        scale: 2.5, // High resolution crisp text and vectors
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        windowWidth: 1200, // Fixed width snapshotting for precise responsive column alignment
        onclone: (clonedDoc) => {
          // Find the info banner in the cloned document and force it to be visible
          const banner = clonedDoc.getElementById('pdf-info-banner');
          if (banner) {
            banner.classList.remove('hidden');
            banner.classList.add('flex');
            banner.style.display = 'flex';
          }

          // Inject custom styles into the snapshot clone to make the print layout extremely compact,
          // beautifully proportioned, and perfectly fitted for standard landscape page margins
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            #printable-log-sheet-content {
              width: 1120px !important;
              max-width: 1120px !important;
              padding: 24px !important;
              margin: 0 auto !important;
              border: none !important;
              box-shadow: none !important;
              background-color: #ffffff !important;
            }

            /* Ensure the letterhead is structured and fits perfectly */
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

            /* Make the Info Banner compact */
            #pdf-info-banner {
              margin-bottom: 12px !important;
              padding-bottom: 6px !important;
              font-size: 10px !important;
            }

            /* Compact the table cells for high-density landscape print */
            .log-sheet-table-wrapper {
              box-shadow: none !important;
              border-radius: 4px !important;
              border: 1px solid #cbc4cd !important;
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

            /* Class label column size and styles */
            .class-column-header, .class-column-cell {
              width: 130px !important;
              max-width: 130px !important;
              padding-left: 6px !important;
              padding-right: 6px !important;
            }
            
            /* BREAK spacer column size and styles */
            .break-column-header, .break-column-cell {
              width: 56px !important;
              max-width: 56px !important;
            }
            .break-column-cell {
              height: 52px !important;
            }
            .break-column-cell div {
              font-size: 8px !important;
              gap: 0px !important;
              line-height: 1.1 !important;
            }

            /* Room column size and styles */
            .room-column-header, .room-column-cell {
              width: 65px !important;
              max-width: 65px !important;
            }
            .room-column-cell {
              padding: 4px !important;
            }

            /* Text elements sizing inside grid cell */
            .log-sheet-grid-cell div {
              font-size: 10px !important;
            }
            .log-sheet-grid-cell .h-12 {
              height: 32px !important;
            }
            
            /* Badges sizes inside grid cell */
            .log-sheet-grid-cell .inline-flex {
              font-size: 8px !important;
              padding: 0.5px 3px !important;
              line-height: 1 !important;
            }

            /* Compact signature section */
            .signature-section {
              margin-top: 16px !important;
              padding-bottom: 0 !important;
            }
            .signature-section .grid, .signature-section div.grid {
              margin-top: 10px !important;
              gap: 24px !important;
            }
            .signature-section div {
              font-size: 9px !important;
            }
            .signature-section .h-8 {
              height: 16px !important;
              margin-bottom: 4px !important;
            }

            /* Compact legal and generation stamp footer */
            .signature-section + div, .mt-8 {
              margin-top: 12px !important;
              padding-top: 4px !important;
              font-size: 8px !important;
            }
          `;
          clonedDoc.head.appendChild(style);
        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      
      // Initialize landscape A4 document
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
      });

      // Get precise document dimensions
      const pageWidth = pdf.internal.pageSize.getWidth(); // 297mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 210mm

      // Standard consistent margins of 10mm
      const margin = 10;
      const maxPrintWidth = pageWidth - (margin * 2);
      const maxPrintHeight = pageHeight - (margin * 2);

      // Determine the best layout dimensions preserving aspect ratio
      const contentRatio = canvas.width / canvas.height;
      const printableRatio = maxPrintWidth / maxPrintHeight;

      let printWidth = maxPrintWidth;
      let printHeight = maxPrintHeight;

      if (contentRatio > printableRatio) {
        // Limited by available printable width
        printWidth = maxPrintWidth;
        printHeight = maxPrintWidth / contentRatio;
      } else {
        // Limited by available printable height
        printHeight = maxPrintHeight;
        printWidth = maxPrintHeight * contentRatio;
      }

      // Compute centered horizontal & vertical offsets
      const xOffset = margin + (maxPrintWidth - printWidth) / 2;
      const yOffset = margin + (maxPrintHeight - printHeight) / 2;

      // Render the image on standard A4 page perfectly aligned
      pdf.addImage(imgData, 'JPEG', xOffset, yOffset, printWidth, printHeight);

      const formattedDate = new Date(selectedDate).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).replace(/ /g, '_');
      
      const fileName = `AMJC_ShiftII_LogSheet_${formattedDate}_DayOrder_${selectedDayOrder}.pdf`;
      pdf.save(fileName);
      showToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      console.error('PDF export failed:', err);
      showToast('Failed to generate PDF. Please try printing to PDF instead.', 'info');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Reset database state to pristine seeds
  const handleResetData = () => {
    localStorage.removeItem('accfin_staff');
    localStorage.removeItem('accfin_timetable');
    localStorage.removeItem('accfin_log_sheets');
    localStorage.removeItem('accfin_substitutions');

    // Restore state
    setStaffList(initialStaff);
    const initialTt = getInitialTimetableEntries();
    setTimetableEntries(initialTt);
    
    const defaultLog: LogSheet = {
      id: 'log-sheet-preset',
      logDate: '2024-05-20',
      dayOrder: 3,
      status: 'draft'
    };
    setLogSheets([defaultLog]);

    setSubstitutions([]);

    setSelectedDate('2024-05-20');
    setSelectedDayOrder(3);
    setCurrentView('log_sheets');
    
    setIsResetConfirmOpen(false);
    showToast('Database reset to pristine academic seed values.', 'success');
  };

  // Remove individual substitution from the historical registry log
  const handleRemoveSubstitution = (id: string) => {
    const updated = substitutions.filter(s => s.id !== id);
    saveSubstitutions(updated);
    showToast('Substitution removed from historical registry.', 'info');
  };

  // Handle Day Order select change
  const handleDayOrderChange = (dayOrder: number) => {
    setSelectedDayOrder(dayOrder);

    // If log sheet exists, update it, otherwise create one
    let targetSheet = currentLogSheet;
    let updatedSheets = [...logSheets];

    if (targetSheet) {
      updatedSheets = updatedSheets.map(s => {
        if (s.id === targetSheet!.id) {
          return { ...s, dayOrder };
        }
        return s;
      });
    } else {
      targetSheet = {
        id: `log-${Date.now()}`,
        logDate: selectedDate,
        dayOrder,
        status: 'draft'
      };
      updatedSheets.push(targetSheet);
    }

    saveLogSheets(updatedSheets);
    showToast(`Day Order set to ${dayOrder} for this date.`, 'info');
  };

  // Helper to trigger small status toasts
  const showToast = (message: string, type: 'success' | 'info') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Map header title
  const getViewTitle = () => {
    switch (currentView) {
      case 'log_sheets':
        return 'Daily Log Sheets';
      case 'sub_mgmt':
        return 'Substitution Registry Log';
      case 'dashboard':
        return 'Timetable Master';
      case 'staff_dir':
        return 'Staff Directory';
      default:
        return 'ACCFIN Portal';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-4 font-sans select-none">
        <div className="w-full max-w-md bg-white border border-[#cbc4cd] rounded-xl shadow-2xl p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex w-14 h-14 bg-[#556B2F]/10 rounded-full items-center justify-center text-[#556B2F] mb-2">
              <Sparkles className="w-7 h-7" />
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
                Admin Login ID
              </label>
              <input
                type="password"
                placeholder="Enter Admin Login ID"
                value={authId}
                onChange={e => {
                  setAuthId(e.target.value);
                  if (authError) setAuthError('');
                }}
                className="w-full px-4 py-2.5 border border-[#cbc4cd] rounded-lg bg-slate-50 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 text-[#161b27] text-center tracking-widest placeholder:tracking-normal placeholder:text-slate-400"
                autoFocus
              />
              {authError && (
                <p className="text-[11px] text-rose-600 font-bold flex items-center justify-center gap-1 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {authError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-[#556B2F] hover:opacity-95 text-white font-bold text-xs uppercase tracking-widest rounded-lg shadow-md transition-all active:scale-98 cursor-pointer"
            >
              Enter Portal
            </button>
          </form>

          <div className="pt-4 border-t border-slate-100 text-center">
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">
              Protected Administrative Session
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] text-[#161b27] flex">
      {/* Sidebar (Hidden during browser prints for print readiness!) */}
      <div className="print:hidden">
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          onResetData={() => setIsResetConfirmOpen(true)}
          onLogout={() => {
            setIsAuthenticated(false);
            localStorage.removeItem('accfin_authenticated');
            setAuthId('');
          }}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
        />
      </div>

      {/* Main Canvas Area */}
      <div className={`flex-1 ${isSidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 print:ml-0 min-h-screen flex flex-col relative`}>
        {/* Top App Bar (Hidden during prints) */}
        <div className="print:hidden">
          <Header
            viewTitle={getViewTitle()}
            status={currentView === 'log_sheets' ? (currentLogSheet?.status || 'draft') : null}
            isSidebarCollapsed={isSidebarCollapsed}
            onToggleSidebar={() => setIsSidebarCollapsed(prev => !prev)}
          />
        </div>

        {/* View Routing */}
        <main className="flex-1 p-8 print:p-0">
          {currentView === 'log_sheets' && (
            <div id="printable-log-sheet-content" className="max-w-[1200px] mx-auto bg-white border border-[#cbc4cd] p-8 shadow-md rounded-lg print:border-none print:shadow-none print:p-0">
              
              {/* Professional Classical Letterhead */}
              <Letterhead />

              {/* Administrative Control Dashboard Row (Hidden during print/PDF export) */}
              <div data-html2canvas-ignore="true" className="flex flex-wrap items-end justify-between gap-4 mb-8 bg-[#FFF0F5] p-4 border border-[#cbc4cd] rounded-lg print:hidden select-none">
                <div className="flex flex-wrap gap-6">
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

                {/* Print & Finalize Controls */}
                <div className="flex gap-3">
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
                    className={`px-4 py-1.5 text-white text-xs font-bold flex items-center gap-1.5 rounded transition-all shadow-xs cursor-pointer ${
                      isGeneratingPDF
                        ? 'bg-slate-400 cursor-wait'
                        : currentLogSheet?.status === 'finalized'
                        ? 'bg-[#8B0000] hover:bg-[#a00000] active:scale-98 animate-pulse'
                        : 'bg-[#556B2F] hover:opacity-90 active:scale-98'
                    }`}
                    title={currentLogSheet?.status === 'finalized' ? 'Download Official Finalized PDF' : 'Download PDF Copy'}
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>{isGeneratingPDF ? 'GENERATING...' : 'DOWNLOAD PDF'}</span>
                  </button>

                  <button
                    disabled={currentLogSheet?.status === 'finalized'}
                    onClick={handleFinalizeLog}
                    className={`px-4 py-1.5 text-white text-xs font-bold flex items-center gap-1.5 rounded transition-all shadow-xs cursor-pointer ${
                      currentLogSheet?.status === 'finalized'
                        ? 'bg-slate-300 border border-slate-300 text-slate-500 cursor-not-allowed'
                        : 'bg-[#556B2F] hover:opacity-90 active:scale-98'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>FINALIZE LOG</span>
                  </button>
                </div>
              </div>

              {/* Day Details Info Banner (Print-Only or visible info) */}
              <div id="pdf-info-banner" className="hidden print:flex justify-between items-center border-b border-[#cbc4cd] pb-2 mb-6 text-xs font-bold text-[#161b27]">
                <span>ATTENDANCE DATE: {new Date(selectedDate).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase()}</span>
                <span className="uppercase text-[#556B2F]">DAY ORDER: {['I', 'II', 'III', 'IV', 'V', 'VI'][selectedDayOrder - 1]}</span>
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
              />

              {/* Footer Legal & Generation Stamp */}
              <div className="mt-8 pt-4 border-t border-[#cbc4cd] text-[10px] text-slate-400 font-semibold flex flex-col sm:flex-row justify-between items-center sm:items-end gap-2 select-none print:mt-4 print:pt-2">
                <p className="text-center sm:text-left text-slate-500">GENERATED ON: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()} {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })} IST</p>
                <div className="text-center sm:text-right">
                  <p className="font-mono text-slate-500">AMJC-AF-SLS-2026-SV1.0</p>
                  <p className="text-[9px] font-bold text-[#203978] mt-0.5 tracking-wide">Powered by SuryaVerse Studio</p>
                </div>
              </div>
            </div>
          )}

          {currentView === 'sub_mgmt' && (
            <SubstitutionHistory
              substitutions={substitutions}
              staffList={staffList}
              classes={classesList}
              onRemoveSubstitution={handleRemoveSubstitution}
            />
          )}

          {currentView === 'dashboard' && (
            <DashboardView
              classes={classesList}
              staffList={staffList}
              timetableEntries={timetableEntries}
            />
          )}

          {currentView === 'staff_dir' && (
            <StaffDirectory
              staffList={staffList}
              timetableEntries={timetableEntries}
              onToggleStatus={handleToggleStaffStatus}
              onToggleLeave={handleToggleStaffLeave}
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
                  s => s.logSheetId === currentLogSheet.id && s.classId === activeCell.classId && s.period === activeCell.period
                ) || null
              : null
          }
          onConfirm={handleConfirmSubstitution}
          onClose={() => setActiveCell(null)}
          substitutions={substitutions}
          currentLogSheet={currentLogSheet}
        />
      )}

      {/* Quick Interactive Toasts */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-[#161b27] text-[#faf9ff] border border-slate-700 px-4 py-3 rounded-lg shadow-2xl text-xs font-bold animate-in fade-in slide-in-from-bottom-5 duration-200">
          <Sparkles className="w-4 h-4 text-[#cbeb8a]" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Reset Database Confirmation Modal */}
      {isResetConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none print:hidden">
          <div className="bg-white border border-[#cbc4cd] rounded-lg shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <header className="bg-red-50 border-b border-red-100 p-5 flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-bold text-lg text-slate-900">Reset Database?</h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">This action cannot be undone</p>
              </div>
            </header>
            <div className="p-6 space-y-3">
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                Are you sure you want to reset all substitutions and restore the original seeded timetable?
              </p>
              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-100 p-3 rounded font-medium italic">
                All customized staff changes, leave updates, and substitution historical entries will be cleared and restored to default values.
              </p>
            </div>
            <footer className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end gap-3">
              <button
                onClick={() => setIsResetConfirmOpen(false)}
                className="px-4 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded hover:bg-slate-50 active:scale-98 transition-all cursor-pointer"
              >
                CANCEL
              </button>
              <button
                onClick={handleResetData}
                className="px-4 py-2 bg-red-600 text-white text-xs font-bold rounded hover:bg-red-700 active:scale-98 transition-all cursor-pointer shadow-sm"
              >
                CONFIRM RESET
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Print Instruction & Helper Modal */}
      {isPrintHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none print:hidden">
          <div className="bg-white border border-[#cbc4cd] rounded-lg shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <header className="bg-[#E6E6FA] border-b border-slate-200 p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white border border-[#556B2F]/10 rounded-full flex items-center justify-center text-[#556B2F] shrink-0">
                  <Printer className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-lg text-slate-900">Print Daily Log Sheet</h3>
                  <p className="text-xs text-[#556B2F] font-bold uppercase tracking-wider">Shift II Administrative Portal</p>
                </div>
              </div>
              <button 
                onClick={() => setIsPrintHelpOpen(false)}
                className="p-1.5 hover:bg-[#FFF0F5] text-slate-500 hover:text-slate-800 transition-colors rounded-full cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </header>
            
            <div className="p-6 space-y-4">
              <div className="bg-[#FFF0F5] border border-[#556B2F]/10 p-4 rounded-md text-xs font-medium text-slate-700 leading-relaxed">
                <span className="font-bold text-[#556B2F] block mb-1">💡 Iframe Printing Note</span>
                Because the application runs inside a secure sandboxed preview frame, some browsers may prevent the direct print dialog from popping up immediately, or might try to print the entire workspace.
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">How to Print perfectly:</h4>
                <ol className="list-decimal list-inside space-y-2 text-xs text-slate-600 font-semibold leading-relaxed">
                  <li>Click <span className="text-[#556B2F] font-bold">"Open in New Tab"</span> at the top-right corner of the AI Studio preview.</li>
                  <li>In the new tab, click <span className="text-[#556B2F] font-bold">"Print Sheet"</span> or press <kbd className="bg-slate-100 border border-slate-300 px-1 rounded text-slate-700">Ctrl + P</kbd> (<kbd className="bg-slate-100 border border-slate-300 px-1 rounded text-slate-700">Cmd + P</kbd> on Mac).</li>
                  <li>The print styles will automatically hide the Sidebar, Header, and administrative buttons to produce a <strong>perfectly clean, professional academic letterhead page</strong>!</li>
                </ol>
              </div>
            </div>

            <footer className="bg-slate-50 border-t border-slate-100 p-4 flex justify-end">
              <button
                onClick={() => setIsPrintHelpOpen(false)}
                className="px-5 py-2 bg-[#556B2F] text-white text-xs font-bold rounded hover:opacity-90 active:scale-98 transition-all cursor-pointer"
              >
                UNDERSTOOD
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
