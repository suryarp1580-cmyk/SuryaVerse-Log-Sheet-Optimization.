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
  onConfirm: (sub: Omit<Substitution, 'id' | 'logSheetId'> | Omit<Substitution, 'id' | 'logSheetId'>[] | null) => void;
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
    1: '08:30 AM - 09:20 AM',
    2: '09:20 AM - 10:10 AM',
    3: '10:10 AM - 11:00 AM',
    4: '11:30 AM - 12:20 PM',
    5: '12:20 PM - 01:10 PM'
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
  const [activeTab, setActiveTab] = useState<'substitute' | 'swap'>('substitute');
  const [absentStaffId, setAbsentStaffId] = useState<string>('');
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<string>('');
  const [showAllStaff, setShowAllStaff] = useState<boolean>(false);
  const [warningModal, setWarningModal] = useState<{
    total: number;
    staffName: string;
    isSwapConfirm?: boolean;
    swapWithPeriod?: number;
  } | null>(null);

  const confirmAfterWarning = () => {
    setWarningModal(null);
    if (warningModal?.isSwapConfirm && warningModal.swapWithPeriod) {
      executeSwap(warningModal.swapWithPeriod);
    } else {
      onConfirm({
        classId: classSection.id,
        period,
        absentStaffId,
        substituteStaffId: selectedSubId,
        remarks
      });
    }
  };

  // A cell is a "blank cell" if there is no pre-existing substitution and some assigned staff is on leave
  const isBlankCell = !currentSubstitution && slotStaff.some(s => s.onLeave === true);

  // Initialize from existing substitution if present
  useEffect(() => {
    if (currentSubstitution) {
      setAbsentStaffId(currentSubstitution.absentStaffId);
      setSelectedSubId(currentSubstitution.substituteStaffId);
      setRemarks(currentSubstitution.remarks || '');
      if (currentSubstitution.isSwap) {
        setActiveTab('swap');
      } else {
        setActiveTab('substitute');
      }
    } else if (slotStaff.length > 0) {
      const onLeaveStaff = slotStaff.find(s => s.onLeave === true);
      if (onLeaveStaff) {
        setAbsentStaffId(onLeaveStaff.id);
      } else {
        setAbsentStaffId(slotStaff[0].id);
      }
      setSelectedSubId(null);
      setRemarks('');
      setActiveTab('substitute');
    }
  }, [currentSubstitution, entry, staffList]);

  // Find free staff list for this Day Order + Period
  const freeStaff = getFreeStaff(entry.dayOrder, period, staffList, timetableEntries);
  
  // Helper to check if a staff member already teaches this specific class section at any other period/day-order
  const teachesThisClass = (staffId: string): boolean => {
    return timetableEntries.some(e => 
      e.classId === classSection.id && 
      e.staffIds.includes(staffId) &&
      !(e.dayOrder === entry.dayOrder && e.period === period)
    );
  };

  // Helper to get daily workload (own scheduled classes today + substitutions today on this same log sheet)
  // excluding the current slot being configured. Handles standard substitutions and period swaps.
  const getProjectedWorkload = (staffId: string, proposedSubId: string | null, proposedSwapPeriod?: number) => {
    // 1. Master scheduled classes today
    let normalClassesCount = timetableEntries.filter(
      e => e.dayOrder === entry.dayOrder && e.staffIds.includes(staffId)
    ).length;

    // 2. Adjust for periods on currentLogSheet where staffId is absent/replaced
    if (currentLogSheet) {
      substitutions.forEach(sub => {
        if (sub.logSheetId !== currentLogSheet.id) return;
        if (!sub.isSwap && sub.absentStaffId === staffId) {
          const isMasterScheduled = timetableEntries.some(
            e => e.classId === sub.classId && e.dayOrder === entry.dayOrder && e.period === sub.period && e.staffIds.includes(staffId)
          );
          if (isMasterScheduled) {
            normalClassesCount -= 1;
          }
        }
      });
    }

    // 3. Adjustments for swap
    if (proposedSwapPeriod !== undefined) {
      // Find original staff for Period A (period)
      const originalStaffA = entry.staffIds;
      // Find original staff for Period B (proposedSwapPeriod)
      const entryB = timetableEntries.find(
        e => e.classId === classSection.id && e.dayOrder === entry.dayOrder && e.period === proposedSwapPeriod
      );
      const originalStaffB = entryB ? entryB.staffIds : [];

      if (originalStaffA.includes(staffId)) {
        normalClassesCount -= 1;
      }
      if (originalStaffB.includes(staffId)) {
        normalClassesCount -= 1;
      }
    }

    // 4. Other substitutions/swaps count
    const otherSubsCount = currentLogSheet
      ? substitutions.filter(sub => {
          if (sub.logSheetId !== currentLogSheet.id) return false;
          if (sub.classId === classSection.id) {
            if (sub.period === period) return false;
            if (proposedSwapPeriod !== undefined && sub.period === proposedSwapPeriod) return false;
          }
          
          if (sub.isSwap) {
            return sub.swappedStaffIds?.includes(staffId);
          } else {
            return sub.substituteStaffId === staffId;
          }
        }).length
      : 0;

    // 5. Add the current proposed adjustment
    let currentAdjustmentCount = 0;
    if (proposedSwapPeriod !== undefined) {
      const originalStaffA = entry.staffIds;
      const entryB = timetableEntries.find(
        e => e.classId === classSection.id && e.dayOrder === entry.dayOrder && e.period === proposedSwapPeriod
      );
      const originalStaffB = entryB ? entryB.staffIds : [];

      if (originalStaffB.includes(staffId)) {
        currentAdjustmentCount += 1; // teaches Period A now
      }
      if (originalStaffA.includes(staffId)) {
        currentAdjustmentCount += 1; // teaches Period B now
      }
    } else {
      // Normal substitution
      if (proposedSubId === staffId) {
        currentAdjustmentCount = 1;
      }
    }

    return Math.max(0, normalClassesCount) + otherSubsCount + currentAdjustmentCount;
  };

  const getStaffDailyWorkload = (staffId: string) => {
    return getProjectedWorkload(staffId, null);
  };

  const getPeriodCurrentState = (p: number) => {
    // Find master entry
    const mEntry = timetableEntries.find(
      e => e.classId === classSection.id && e.dayOrder === entry.dayOrder && e.period === p
    );
    if (!mEntry) return { subjectCode: 'Free', staffCodes: [], staffIds: [], isSwap: false, isSub: false, sub: null, entry: null };

    // Check if there is an active substitution/swap saved for this period on this log sheet
    const sub = currentLogSheet
      ? substitutions.find(
          s => s.logSheetId === currentLogSheet.id && s.classId === classSection.id && s.period === p
        )
      : null;

    if (sub) {
      if (sub.isSwap) {
        return {
          subjectCode: sub.swappedSubjectCode || '',
          staffIds: sub.swappedStaffIds || [],
          staffCodes: (sub.swappedStaffIds || []).map(id => staffList.find(s => s.id === id)?.code || '?'),
          isSwap: true,
          isSub: false,
          sub,
          entry: mEntry
        };
      } else {
        // Normal substitution
        const subStaff = staffList.find(s => s.id === sub.substituteStaffId);
        return {
          subjectCode: mEntry.subjectCode,
          staffIds: sub.substituteStaffId ? [sub.substituteStaffId] : [],
          staffCodes: subStaff ? [subStaff.code] : ['FREE'],
          isSwap: false,
          isSub: true,
          sub,
          entry: mEntry
        };
      }
    }

    const mStaff = mEntry.staffIds.map(id => staffList.find(s => s.id === id)).filter(Boolean) as Staff[];
    return {
      subjectCode: mEntry.subjectCode,
      staffIds: mEntry.staffIds,
      staffCodes: mStaff.map(s => s.code),
      isSwap: false,
      isSub: false,
      sub: null,
      entry: mEntry
    };
  };

  const executeSwap = (targetPeriod: number) => {
    // Get original states for current period and target period
    const entryA = entry;
    // Find master timetable entry for target period
    const entryB = timetableEntries.find(
      e => e.classId === classSection.id && e.dayOrder === entry.dayOrder && e.period === targetPeriod
    );

    if (!entryB) return;

    // We swap the subjects and staff lists of entryA and entryB
    // Entry A gets:
    const subjectCodeForA = entryB.subjectCode;
    const staffIdsForA = entryB.staffIds;

    // Entry B gets:
    const subjectCodeForB = entryA.subjectCode;
    const staffIdsForB = entryA.staffIds;

    // Create the two substitution entries
    const swapEntryA = {
      classId: classSection.id,
      period: period, // Period A
      absentStaffId: absentStaffId || entryA.staffIds[0],
      substituteStaffId: staffIdsForA[0] || null,
      remarks: `Swapped with Period ${targetPeriod}`,
      isSwap: true,
      swapWithPeriod: targetPeriod,
      swappedSubjectCode: subjectCodeForA,
      swappedStaffIds: staffIdsForA
    };

    const swapEntryB = {
      classId: classSection.id,
      period: targetPeriod, // Period B
      absentStaffId: staffIdsForA[0] || '', // the original staff of Period B is absent in Period B
      substituteStaffId: absentStaffId || entryA.staffIds[0],
      remarks: `Swapped with Period ${period}`,
      isSwap: true,
      swapWithPeriod: period,
      swappedSubjectCode: subjectCodeForB,
      swappedStaffIds: staffIdsForB
    };

    onConfirm([swapEntryA, swapEntryB]);
  };

  const handleSwapClick = (targetPeriod: number) => {
    if (!absentStaffId) {
      alert('Please select an original staff member for the current period first.');
      return;
    }

    const stateB = getPeriodCurrentState(targetPeriod);
    const staffIdsB = stateB.staffIds;

    // Calculate projected workload for both sides
    const workloadA = getProjectedWorkload(absentStaffId, null, targetPeriod);
    
    let warningStaffId: string | null = null;
    let warningStaffName = '';
    let warningTotal = 0;

    if (workloadA === 4 || workloadA === 5 || workloadA > 5) {
      const s = staffList.find(st => st.id === absentStaffId);
      warningStaffId = absentStaffId;
      warningStaffName = s?.fullName || s?.code || '';
      warningTotal = workloadA;
    }

    if (!warningStaffId) {
      for (const id of staffIdsB) {
        const workloadB = getProjectedWorkload(id, null, targetPeriod);
        if (workloadB === 4 || workloadB === 5 || workloadB > 5) {
          const s = staffList.find(st => st.id === id);
          warningStaffId = id;
          warningStaffName = s?.fullName || s?.code || '';
          warningTotal = workloadB;
          break;
        }
      }
    }

    if (warningStaffId) {
      setWarningModal({
        total: warningTotal,
        staffName: warningStaffName,
        isSwapConfirm: true,
        swapWithPeriod: targetPeriod
      });
    } else {
      executeSwap(targetPeriod);
    }
  };

  // Filter and sort available substitutes:
  // 1. Exclude the absent staff member
  // 2. Hard cap at 5 hours/day — exclude if taking this substitution assignment would cause total daily workload to exceed 5 hours (> 5)
  //    (5th hour CAN work. Crossing 5 hours to 6+ hours is excluded and hidden from select substitute)
  // 3. Sort by priority tier (Tier 1: teaches this class, Tier 2: everyone else), then by current hours today ascending (least-loaded first)
  const availableSubstitutes = freeStaff
    .filter(s => s.id !== absentStaffId)
    .filter(s => getProjectedWorkload(s.id, s.id) <= 5)
    .sort((a, b) => {
      const teachesA = teachesThisClass(a.id);
      const teachesB = teachesThisClass(b.id);
      
      if (teachesA && !teachesB) return -1;
      if (!teachesA && teachesB) return 1;
      
      return getStaffDailyWorkload(a.id) - getStaffDailyWorkload(b.id);
    });

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
        const projectedWorkload = getProjectedWorkload(selectedSub.id, selectedSub.id);

        if (projectedWorkload === 4 || projectedWorkload === 5 || projectedWorkload > 5) {
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
          {/* Action Tabs Selector */}
          <div className="flex border-b border-[#cbc4cd] mb-6">
            <button
              onClick={() => setActiveTab('substitute')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'substitute'
                  ? 'border-[#556B2F] text-[#556B2F]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Assign Substitute
            </button>
            <button
              onClick={() => setActiveTab('swap')}
              className={`flex-1 pb-3 text-sm font-bold border-b-2 transition-colors cursor-pointer ${
                activeTab === 'swap'
                  ? 'border-[#556B2F] text-[#556B2F]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Switch Periods
            </button>
          </div>

          {activeTab === 'swap' ? (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-600 bg-slate-100 p-3 rounded border border-slate-200">
                Switching periods within <span className="text-[#556B2F] font-extrabold">{classSection.yearLabel} — SEC {classSection.section}</span> only
              </div>

              {/* Selection info */}
              <div className="p-3 bg-blue-50 border border-blue-200 text-blue-950 rounded-lg text-xs font-semibold leading-relaxed">
                <span className="font-bold block mb-1">🔄 Period Swapping Guide</span>
                You are swapping <span className="underline">Period {period} ({entry.subjectCode})</span> with another class period of your choice below. Both periods' subjects and teachers will be swapped.
              </div>

              {/* List of periods */}
              <div className="border border-[#cbc4cd] rounded-lg overflow-hidden bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-[#cbc4cd] text-[10px] font-bold text-[#49454d] uppercase tracking-wider">
                      <th className="p-3">Period</th>
                      <th className="p-3">Subject</th>
                      <th className="p-3">Staff</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#cbc4cd]">
                    {[1, 2, 3, 4, 5].map(p => {
                      const pState = getPeriodCurrentState(p);
                      const isCurrent = p === period;
                      const hasOnLeave = pState.staffIds.some(id => {
                        const s = staffList.find(st => st.id === id);
                        return s?.onLeave === true;
                      });

                      const currentStaffIsOnLeave = absentStaffId ? staffList.find(s => s.id === absentStaffId)?.onLeave === true : false;
                      const isEligible = !isCurrent && !!pState.entry && !hasOnLeave && !currentStaffIsOnLeave;

                      return (
                        <tr key={p} className={`text-xs font-medium ${isCurrent ? 'bg-amber-50/40' : ''}`}>
                          <td className="p-3 font-bold text-slate-900">
                            P{p}
                            <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                              {getPeriodTime(p)}
                            </span>
                          </td>
                          <td className="p-3 font-semibold uppercase text-slate-700">
                            {pState.subjectCode}
                            {pState.isSwap && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[9px] font-bold bg-blue-100 text-blue-800 rounded">
                                Swapped
                              </span>
                            )}
                            {pState.isSub && (
                              <span className="ml-1.5 inline-flex px-1.5 py-0.5 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">
                                Substituted
                              </span>
                            )}
                          </td>
                          <td className="p-3 text-slate-600 font-semibold">
                            {pState.staffCodes.join(', ') || 'Free'}
                          </td>
                          <td className="p-3 text-right">
                            {isCurrent ? (
                              <span className="inline-flex px-2 py-1 bg-amber-100 text-amber-800 font-bold text-[10px] rounded uppercase tracking-wider">
                                Current Period
                              </span>
                            ) : !pState.entry ? (
                              <span className="text-slate-400 text-[10px] italic">
                                No entry
                              </span>
                            ) : hasOnLeave ? (
                              <span className="inline-flex px-2 py-1 bg-red-50 text-red-700 border border-red-200 font-bold text-[10px] rounded uppercase tracking-wider">
                                Staff on Leave
                              </span>
                            ) : currentStaffIsOnLeave ? (
                              <span className="inline-flex px-2 py-1 bg-red-50 text-red-700 border border-red-200 font-bold text-[10px] rounded uppercase tracking-wider">
                                Current Staff on Leave
                              </span>
                            ) : (
                              <button
                                onClick={() => handleSwapClick(p)}
                                className="px-3 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 text-[10px] font-extrabold rounded uppercase tracking-wider transition-colors cursor-pointer"
                              >
                                Swap with this
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <>
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
                      const currentHours = getStaffDailyWorkload(s.id);
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
                          <span className="text-[10px] text-[#49454d]/80 font-bold uppercase tracking-wider block mt-0.5">
                            {getDepartmentName(s.code)}
                          </span>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {teachesThisClass(s.id) && (
                              <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1 select-none shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                Already teaches this class
                              </span>
                            )}
                            <span className="text-[9px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full shrink-0 select-none">
                              {currentHours === 0 ? 'Free all day' : `${currentHours} hr${currentHours > 1 ? 's' : ''} today`}
                            </span>
                          </div>
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
            </>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="p-6 border-t border-[#cbc4cd] bg-white flex flex-col gap-3">
          {activeTab === 'substitute' && (
            <button
              onClick={handleConfirm}
              className="w-full h-11 bg-[#556B2F] text-white font-bold tracking-wide hover:opacity-90 active:scale-[0.99] transition-all flex items-center justify-center gap-2 rounded cursor-pointer text-sm shadow-xs"
            >
              <Save className="w-4 h-4" />
              <span>CONFIRM SUBSTITUTION</span>
            </button>
          )}
          
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
          ) : warningModal.total === 5 ? (
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
                  onClick={() => setWarningModal(null)}
                  className="px-4 py-2 bg-white border border-rose-300 rounded text-xs font-bold text-rose-800 hover:bg-rose-100/70 transition-colors cursor-pointer uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmAfterWarning}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors shadow-sm cursor-pointer uppercase tracking-wider"
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
                  <h3 className="font-sans font-bold text-sm uppercase tracking-wide">Daily Limit Exceeded</h3>
                  <p className="text-xs font-semibold leading-relaxed">
                    This assignment would cause <span className="font-bold underline">{warningModal.staffName}</span> to work {warningModal.total} hours today, exceeding the maximum permitted load of 5 hours per day.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setWarningModal(null)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-bold transition-colors shadow-sm cursor-pointer uppercase tracking-wider"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
