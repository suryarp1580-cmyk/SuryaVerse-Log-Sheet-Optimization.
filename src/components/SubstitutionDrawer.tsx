import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, BookOpen, AlertCircle, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Staff, ClassSection, TimetableEntry, Substitution, LogSheet } from '../types';
import { getFreeStaff } from '../lib/substitutionEngine';

interface SubstitutionDrawerProps {
  classSection: ClassSection;
  period: number;
  entry: TimetableEntry;
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  currentSubstitution: Substitution | null;
  onConfirm: (sub: Omit<Substitution, 'id' | 'logSheetId'> | null) => void;
  onClose: () => void;
  substitutions: Substitution[];
  currentLogSheet: LogSheet | null;
}

// Maps staff initials to realistic department names for authentic visuals
const getDepartmentName = (code: string): string => {
  const mapping: Record<string, string> = {
    'AJ': 'Dept. Economics',
    'BBS': 'Dept. Accounting and Finance',
    'BS': 'Dept. Accounting and Finance.',
    'DA': 'Dept. Accounting and Finance',
    'DJ': 'Dept. Accounting and Finance',
    'FND': 'Dept. Accounting and Finance',
    'GS': 'Dept. Accounting and Finance.',
    'JP': 'Dept. Accounting and Finance',
    'KB': 'Dept. Accounting and Finance',
    'KM': 'Dept. Accounting and Finance',
    'KS': 'Dept. Accounting and Finance',
    'MJ': 'Dept. Accounting and Finance',
    'OJ': 'Dept. Accounting and Finance',
    'PM': 'Dept. Accounting and Finance',
    'PS': 'Dept. Accounting and Finance.',
    'PSK': 'Dept. Accounting and Finance',
    'RP': 'Dept. Accounting and Finance',
    'RT': 'Dept. Accounting and Finance',
    'SN': 'Dept. Accounting and Finance',
    'SS': 'Dept. Accounting and Finance',
    'TP': 'Dept. Accounting and Finance'
  };
  return mapping[code] || 'Dept. Accounting and Finance';
};

const getPeriodTime = (p: number): string => {
  const times = {
    1: '01:30 PM - 02:25 PM',
    2: '02:25 PM - 03:20 PM',
    3: '03:20 PM - 04:15 PM',
    4: '04:35 PM - 05:30 PM',
    5: '05:30 PM - 06:25 PM'
  };
  return times[p as keyof typeof times] || '';
};

export default function SubstitutionDrawer({
  classSection,
  period,
  entry,
  staffList,
  timetableEntries,
  currentSubstitution,
  onConfirm,
  onClose,
  substitutions,
  currentLogSheet
}: SubstitutionDrawerProps) {
  // Get all staff assigned to this timetable slot
  const slotStaff = entry.staffIds
    .map(id => staffList.find(s => s.id === id))
    .filter((s): s is Staff => !!s);

  // States
  const [absentStaffId, setAbsentStaffId] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<string>('');
  const [showAllStaff, setShowAllStaff] = useState<boolean>(false);
  const [warningModal, setWarningModal] = useState<{
    total: number;
    staffName: string;
  } | null>(null);

  const confirmAfterWarning = () => {
    setWarningModal(null);
    onConfirm({
      classId: classSection.id,
      period,
      absentStaffId,
      substituteStaffId: selectedSubId,
      remarks
    });
  };

  // A cell is a "blank cell" if there is no pre-existing substitution and some assigned staff is on leave
  const isBlankCell = !currentSubstitution && slotStaff.some(s => s.onLeave === true);

  // Initialize from existing substitution if present
  useEffect(() => {
    if (currentSubstitution) {
      setAbsentStaffId(currentSubstitution.absentStaffId);
      setSelectedSubId(currentSubstitution.substituteStaffId);
      setRemarks(currentSubstitution.remarks || '');
    } else if (slotStaff.length > 0) {
      const onLeaveStaff = slotStaff.find(s => s.onLeave === true);
      if (onLeaveStaff) {
        setAbsentStaffId(onLeaveStaff.id);
      } else {
        setAbsentStaffId(slotStaff[0].id);
      }
      setSelectedSubId(null);
      setRemarks('');
    }
  }, [currentSubstitution, entry, staffList]);

  // Find free staff list for this Day Order + Period
  const freeStaff = getFreeStaff(entry.dayOrder, period, staffList, timetableEntries);
  
  // Exclude the absent staff member from the substitute choices
  const availableSubstitutes = freeStaff.filter(s => s.id !== absentStaffId);

  // Render cards list: showing either a limited grid or the full grid
  const displayedSubs = showAllStaff
    ? availableSubstitutes
    : availableSubstitutes.slice(0, 4);

  const handleConfirm = () => {
    if (!absentStaffId) {
      alert('Please mark an absent staff member.');
      return;
    }

    if (selectedSubId) {
      const selectedSub = staffList.find(s => s.id === selectedSubId);
      if (selectedSub) {
        // 1. Count own originally-scheduled classes on this day order from the timetable
        const normalClassesCount = timetableEntries.filter(
          e => e.dayOrder === entry.dayOrder && e.staffIds.includes(selectedSub.id)
        ).length;

        // 2. Count other substitutions already confirmed for them on this same log sheet
        // (excluding the current class and period being edited, if any)
        const otherSubsCount = currentLogSheet
          ? substitutions.filter(
              s =>
                s.logSheetId === currentLogSheet.id &&
                s.substituteStaffId === selectedSub.id &&
                !(s.classId === classSection.id && s.period === period)
            ).length
          : 0;

        const projectedWorkload = normalClassesCount + otherSubsCount + 1;

        if (projectedWorkload === 4) {
          setWarningModal({
            total: 4,
            staffName: selectedSub.fullName || selectedSub.code
          });
          return;
        } else if (projectedWorkload >= 5) {
          setWarningModal({
            total: projectedWorkload,
            staffName: selectedSub.fullName || selectedSub.code
          });
          return;
        }
      }
    }

    onConfirm({
      classId: classSection.id,
      period,
      absentStaffId,
      substituteStaffId: selectedSubId,
      remarks
    });
  };

  const handleClear = () => {
    onConfirm(null); // Passing null will delete/clear the substitution
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center items-center backdrop-blur-xs bg-[#161b27]/40 p-4 select-none">
      <div
        className="w-full max-w-2xl bg-[#faf9ff] border border-[#cbc4cd] shadow-2xl flex flex-col rounded-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Section */}
        <header className="p-6 border-b border-[#cbc4cd] bg-[#E6E6FA]">
          <div className="flex justify-between items-start mb-3">
            <div>
              <span className="font-sans text-[10px] font-bold text-[#556B2F] tracking-widest block mb-1 uppercase">
                LOG ENTRY ADJUSTMENT
              </span>
              <h2 className="font-serif text-2xl font-bold text-[#161b27]">
                {classSection.yearLabel} — SEC {classSection.section}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-[#FFF0F5] text-slate-500 hover:text-slate-800 transition-colors rounded-full cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#49454d]">
            <div className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#556B2F]" />
              <span>Period {period} ({getPeriodTime(period)})</span>
            </div>
            <div className="flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#556B2F]" />
              <span className="uppercase">Subject: {entry.subjectCode}</span>
            </div>
            {isBlankCell && absentStaffId && (
              <div className="flex items-center gap-1.5 text-red-700 bg-red-100/50 border border-red-200 px-2.5 py-0.5 rounded-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                <span className="font-bold text-[10px]">ON LEAVE: {staffList.find(s => s.id === absentStaffId)?.code}</span>
              </div>
            )}
          </div>
        </header>

        {/* Content Scroll Area */}
        <div className="flex-1 overflow-y-auto p-6 max-h-[60vh] space-y-6">
          {/* Section 1: Absentee Selection */}
          {!isBlankCell && (
            <section className="bg-white p-4 rounded-lg border border-[#cbc4cd]">
              <label className="block text-xs font-bold text-[#49454d] uppercase tracking-wider mb-2">
              Original Staff (Marked Absent)
            </label>
            
            {slotStaff.length > 1 ? (
              <select
                value={absentStaffId}
                onChange={e => {
                  setAbsentStaffId(e.target.value);
                  if (selectedSubId === e.target.value) {
                    setSelectedSubId(null);
                  }
                }}
                className="w-full h-11 border border-[#cbc4cd] px-3 bg-[#faf9ff] hover:bg-white rounded focus:ring-2 focus:ring-[#556B2F]/20 focus:outline-none text-sm text-[#161b27]"
              >
                <option value="" disabled>Select absent staff</option>
                {slotStaff.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.fullName || `PROF. ${s.code}`} ({s.code})
                  </option>
                ))}
              </select>
            ) : slotStaff.length === 1 ? (
              <div className="p-3 bg-[#FFF0F5] rounded border border-[#556B2F]/10 font-sans text-sm font-semibold text-[#161b27] flex items-center justify-between">
                <span>{slotStaff[0].fullName || `PROF. ${slotStaff[0].code}`} ({slotStaff[0].code})</span>
                <span className="text-xs font-bold text-[#556B2F] uppercase tracking-wider bg-[#E6E6FA] px-2 py-0.5 rounded">
                  Primary
                </span>
              </div>
            ) : (
              <p className="text-sm text-red-500">Error: No staff registered for this slot.</p>
            )}

            <p className="mt-2.5 text-[11px] text-[#ba1a1a] font-semibold flex items-center gap-1.5 bg-red-50 p-2 rounded border border-red-100">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>This staff is currently flagged as 'On Leave' in the daily attendance ledger.</span>
            </p>
          </section>
          )}

          {/* Section 2: Free Staff Selection */}
          <section className="bg-white p-4 rounded-lg border border-[#cbc4cd]">
            <div className="flex justify-between items-end mb-3">
              <div>
                <label className="block text-xs font-bold text-[#49454d] uppercase tracking-wider">
                  Select Substitute
                </label>
                <p className="text-[11px] text-[#49454d]/75 italic mt-0.5">
                  Showing department staff with no assigned class for this hour.
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-[#cbeb8a] text-[#141f00] border border-[#516b19]/25 px-2.5 py-1 rounded-sm">
                {availableSubstitutes.length} Available
              </span>
            </div>

            {availableSubstitutes.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {displayedSubs.map(s => {
                  const isSelected = selectedSubId === s.id;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSubId(isSelected ? null : s.id)}
                      className={`border p-3 flex flex-col gap-1 cursor-pointer hover:bg-[#FFF0F5] transition-all rounded-lg select-none relative ${
                        isSelected
                          ? 'border-[#556B2F] bg-[#FFF0F5] ring-1 ring-[#556B2F]'
                          : 'border-[#cbc4cd] bg-[#faf9ff]'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span
                          className={`w-8 h-8 rounded flex items-center justify-center font-bold text-xs ${
                            isSelected
                              ? 'bg-[#556B2F] text-white shadow-xs'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {s.code}
                        </span>
                        {isSelected && (
                          <CheckCircle2 className="w-5 h-5 text-[#556B2F] shrink-0" />
                        )}
                      </div>
                      <span className="font-sans font-bold text-sm text-[#161b27] leading-tight mt-1">
                        {s.fullName?.split(' ').slice(1).join(' ') || s.fullName || `Prof. ${s.code}`}
                      </span>
                      <span className="text-[10px] text-[#49454d]/80 font-bold uppercase tracking-wider">
                        {getDepartmentName(s.code)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-sm text-slate-400 italic font-sans">
                No active staff are free at this hour.
              </div>
            )}

            {availableSubstitutes.length > 4 && (
              <button
                onClick={() => setShowAllStaff(!showAllStaff)}
                className="w-full mt-4 py-2 text-[#556B2F] hover:text-[#556B2F]/80 font-sans text-xs font-bold hover:underline flex items-center justify-center gap-1 cursor-pointer"
              >
                {showAllStaff ? 'Show Less Available Staff' : 'View All Available Staff'}
              </button>
            )}
          </section>

          {/* Section 3: Remarks */}
          <section className="bg-white p-4 rounded-lg border border-[#cbc4cd]">
            <label className="block text-xs font-bold text-[#49454d] uppercase tracking-wider mb-2">
              Administrative Note / Remarks
            </label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              className="w-full p-3 border border-[#cbc4cd] bg-[#faf9ff] focus:bg-white focus:ring-2 focus:ring-[#556B2F]/20 focus:outline-none text-xs rounded-md text-[#161b27]"
              placeholder="e.g. Cleared for personal leave, mutual exchange, external university duty..."
              rows={2}
            />
          </section>
        </div>

        {/* Footer Actions */}
        <footer className="p-6 border-t border-[#cbc4cd] bg-white flex flex-col gap-3">
          <button
            onClick={handleConfirm}
            className="w-full h-11 bg-[#556B2F] text-white font-bold tracking-wide hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 rounded cursor-pointer text-sm shadow-xs"
          >
            <Save className="w-4 h-4" />
            <span>CONFIRM SUBSTITUTION</span>
          </button>
          
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onClose}
              className="h-11 border border-[#cbc4cd] text-[#49454d] font-bold hover:bg-slate-50 transition-colors rounded cursor-pointer text-xs"
            >
              CANCEL
            </button>
            <button
              onClick={handleClear}
              className="h-11 border border-[#ba1a1a] text-[#ba1a1a] font-bold hover:bg-red-50 transition-colors rounded cursor-pointer text-xs"
            >
              CLEAR CELL / RESET
            </button>
          </div>
          
          <p className="text-[10px] text-center text-[#49454d]/60 uppercase tracking-wide mt-1">
            Action will be logged under: Head of Department (HOD_CS_01)
          </p>
        </footer>
      </div>

      {warningModal && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-6 rounded-xl animate-in fade-in duration-150">
          {warningModal.total === 4 ? (
            <div className="w-full max-w-sm bg-amber-50 border border-amber-300 p-6 rounded-xl shadow-2xl space-y-4 text-amber-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-sans font-bold text-sm uppercase tracking-wide">Workload Warning</h3>
                  <p className="text-xs font-semibold leading-relaxed">
                    This will be <span className="font-bold underline">{warningModal.staffName}</span>'s 4th hour today. Continue or Cancel?
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setWarningModal(null)}
                  className="px-4 py-2 bg-white border border-amber-300 rounded text-xs font-bold text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAfterWarning}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold transition-colors shadow-sm cursor-pointer uppercase tracking-wider"
                >
                  Continue
                </button>
              </div>
            </div>
          ) : (
            <div className="w-full max-w-sm bg-rose-50 border border-rose-300 p-6 rounded-xl shadow-2xl space-y-4 text-rose-950">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-1">
                  <h3 className="font-sans font-bold text-sm uppercase tracking-wide">Maximum Load Alert</h3>
                  <p className="text-xs font-semibold leading-relaxed">
                    This will be <span className="font-bold underline">{warningModal.staffName}</span>'s 5th hour today. Continue or Cancel?
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={confirmAfterWarning}
                  className="px-4 py-2 bg-white border border-rose-300 rounded text-xs font-bold text-rose-800 hover:bg-rose-100/70 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Continue
                </button>
                <button
                  onClick={() => setWarningModal(null)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors shadow-sm cursor-pointer uppercase tracking-wider"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
