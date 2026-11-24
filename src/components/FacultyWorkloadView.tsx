import React, { useState, useMemo } from 'react';
import { Staff, TimetableEntry, LogSheet, Substitution } from '../types';
import { computeStaffWorkload, StaffWorkload } from '../lib/substitutionEngine';
import {
  BarChart3,
  Calendar,
  Users,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Award,
  AlertCircle,
  PlusCircle,
  Layers,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface FacultyWorkloadViewProps {
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  substitutions: Substitution[];
  logSheets: LogSheet[];
  onNavigateToLogSheets: () => void;
}

type Mode = 'single_day' | 'date_range';
type SortField = 'rank' | 'name' | 'regularPeriods' | 'substitutionPeriods' | 'freedPeriods' | 'totalPeriods';
type SortDirection = 'asc' | 'desc';

interface StaffAggregatedWorkload extends StaffWorkload {
  staff: Staff;
  isHighestLoad?: boolean;
}

export default function FacultyWorkloadView({
  staffList,
  timetableEntries,
  substitutions,
  logSheets,
  onNavigateToLogSheets
}: FacultyWorkloadViewProps) {
  // Sort log sheets descending by date to find most recent
  const sortedLogSheets = useMemo(() => {
    return [...logSheets].sort((a, b) => b.logDate.localeCompare(a.logDate));
  }, [logSheets]);

  // Mode: 'single_day' or 'date_range'
  const [mode, setMode] = useState<Mode>('single_day');

  // Single Day selection: default to most recent log sheet date or today
  const [singleDate, setSingleDate] = useState<string>(() => {
    if (sortedLogSheets.length > 0) {
      return sortedLogSheets[0].logDate;
    }
    return new Date().toISOString().split('T')[0];
  });

  // Date Range selection: default to earliest and latest log sheet, or last 7 days
  const [fromDate, setFromDate] = useState<string>(() => {
    if (sortedLogSheets.length > 0) {
      return sortedLogSheets[sortedLogSheets.length - 1].logDate;
    }
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });

  const [toDate, setToDate] = useState<string>(() => {
    if (sortedLogSheets.length > 0) {
      return sortedLogSheets[0].logDate;
    }
    return new Date().toISOString().split('T')[0];
  });

  // Sorting state: defaults to Total Periods descending
  const [sortField, setSortField] = useState<SortField>('totalPeriods');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Active staff only
  const activeStaffList = useMemo(() => {
    return staffList
      .filter(s => s.isActive)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [staffList]);

  // Determine which log sheets match the current filter
  const coveredLogSheets = useMemo(() => {
    if (mode === 'single_day') {
      const match = sortedLogSheets.find(s => s.logDate === singleDate);
      return match ? [match] : [];
    } else {
      return sortedLogSheets.filter(
        s => s.logDate >= fromDate && s.logDate <= toDate
      );
    }
  }, [mode, singleDate, fromDate, toDate, sortedLogSheets]);

  // Compute workload for each active staff member across covered log sheets
  const staffWorkloadData: StaffAggregatedWorkload[] = useMemo(() => {
    if (coveredLogSheets.length === 0) {
      return [];
    }

    return activeStaffList.map(staff => {
      let regularPeriods = 0;
      let substitutionPeriods = 0;
      let freedPeriods = 0;
      let totalPeriods = 0;

      coveredLogSheets.forEach(sheet => {
        const sheetLoad = computeStaffWorkload(
          staff.id,
          sheet.dayOrder,
          timetableEntries,
          substitutions,
          sheet.id
        );
        regularPeriods += sheetLoad.regularPeriods;
        substitutionPeriods += sheetLoad.substitutionPeriods;
        freedPeriods += sheetLoad.freedPeriods;
        totalPeriods += sheetLoad.totalPeriods;
      });

      return {
        staff,
        regularPeriods,
        substitutionPeriods,
        freedPeriods,
        totalPeriods
      };
    });
  }, [coveredLogSheets, activeStaffList, timetableEntries, substitutions]);

  // Find the single staff member with the highest Total Periods (if > 0)
  const highestLoadStaff = useMemo(() => {
    if (staffWorkloadData.length === 0) return null;
    let highest = staffWorkloadData[0];
    for (const item of staffWorkloadData) {
      if (item.totalPeriods > highest.totalPeriods) {
        highest = item;
      }
    }
    return highest.totalPeriods > 0 ? highest : null;
  }, [staffWorkloadData]);

  // Total substitutions department-wide in the selected period
  const totalSubstitutionsCount = useMemo(() => {
    if (coveredLogSheets.length === 0) return 0;
    const coveredSheetIds = new Set(coveredLogSheets.map(s => s.id));
    return substitutions.filter(sub => coveredSheetIds.has(sub.logSheetId)).length;
  }, [coveredLogSheets, substitutions]);

  // High Load faculty count (>= 4 periods/hours on average or in single day)
  const heavyLoadCount = useMemo(() => {
    const threshold = mode === 'single_day' ? 4 : Math.max(4, 4 * coveredLogSheets.length);
    return staffWorkloadData.filter(r => r.totalPeriods >= threshold).length;
  }, [staffWorkloadData, mode, coveredLogSheets]);

  // Staff with classes on duty
  const staffWithClassesCount = useMemo(() => {
    return staffWorkloadData.filter(r => r.totalPeriods > 0).length;
  }, [staffWorkloadData]);

  // Total teaching periods department-wide in the selected period
  const totalDepartmentPeriods = useMemo(() => {
    return staffWorkloadData.reduce((acc, curr) => acc + curr.totalPeriods, 0);
  }, [staffWorkloadData]);

  // Sorted workload rows
  const sortedWorkloadRows = useMemo(() => {
    const rows = [...staffWorkloadData];
    rows.sort((a, b) => {
      let valA: any = a[sortField === 'rank' ? 'totalPeriods' : sortField];
      let valB: any = b[sortField === 'rank' ? 'totalPeriods' : sortField];

      if (sortField === 'name') {
        valA = (a.staff.fullName || a.staff.code).toLowerCase();
        valB = (b.staff.fullName || b.staff.code).toLowerCase();
        return sortDirection === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }

      if (valA === valB) {
        // secondary sort by staff code
        return a.staff.code.localeCompare(b.staff.code);
      }

      return sortDirection === 'asc' ? valA - valB : valB - valA;
    });

    return rows.map(r => ({
      ...r,
      isHighestLoad: highestLoadStaff ? r.staff.id === highestLoadStaff.staff.id : false
    }));
  }, [staffWorkloadData, sortField, sortDirection, highestLoadStaff]);

  // Header click handler for sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' || field === 'rank' ? 'asc' : 'desc');
    }
  };

  // Helper to render sort icon
  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 opacity-60 group-hover:opacity-100" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3.5 h-3.5 text-[#556B2F]" />
    ) : (
      <ArrowDown className="w-3.5 h-3.5 text-[#556B2F]" />
    );
  };

  // Quick date presets for range mode
  const setPresetRange = (days: number) => {
    if (sortedLogSheets.length === 0) return;
    const latestDateStr = sortedLogSheets[0].logDate;
    const latestDate = new Date(latestDateStr);
    const from = new Date(latestDate);
    from.setDate(from.getDate() - days);
    setFromDate(from.toISOString().split('T')[0]);
    setToDate(latestDateStr);
  };

  const setAllRange = () => {
    if (sortedLogSheets.length === 0) return;
    setFromDate(sortedLogSheets[sortedLogSheets.length - 1].logDate);
    setToDate(sortedLogSheets[0].logDate);
  };

  return (
    <div id="faculty-workload-view" className="max-w-[1200px] mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#cbc4cd] rounded-xl p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-[#556B2F] text-white rounded-xl shadow-xs shrink-0">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="font-serif font-black text-xl text-[#161b27]">
                  Faculty Daily Workload Tally &amp; Hour Summary
                </h2>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded text-[11px] font-bold bg-[#556B2F]/10 text-[#556B2F]">
                  Department Report
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl font-sans leading-relaxed">
                Aggregated teaching hours and period accounting for all active faculty members across daily log sheets. Accurately accounts for scheduled regular periods, substitution additions, and absent freed periods.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="bg-slate-100 p-1 rounded-lg border border-[#cbc4cd] flex items-center gap-1">
              <button
                onClick={() => setMode('single_day')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  mode === 'single_day'
                    ? 'bg-white text-[#161b27] shadow-xs'
                    : 'text-slate-600 hover:text-[#161b27]'
                }`}
              >
                Single Day
              </button>
              <button
                onClick={() => setMode('date_range')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  mode === 'date_range'
                    ? 'bg-white text-[#161b27] shadow-xs'
                    : 'text-slate-600 hover:text-[#161b27]'
                }`}
              >
                Date Range
              </button>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-6 pt-6 border-t border-slate-100 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          {mode === 'single_day' ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-[#556B2F]" />
                  <span>Select Log Sheet Date:</span>
                </label>
                {sortedLogSheets.length > 0 ? (
                  <select
                    value={singleDate}
                    onChange={e => setSingleDate(e.target.value)}
                    className="border border-[#cbc4cd] bg-white rounded-lg px-3.5 py-2 text-xs font-bold text-[#161b27] focus:ring-2 focus:ring-[#556B2F]/20 outline-none cursor-pointer"
                  >
                    {sortedLogSheets.map(sheet => (
                      <option key={sheet.id} value={sheet.logDate}>
                        {sheet.logDate} (Day Order {sheet.dayOrder}) — {sheet.status === 'finalized' ? 'Finalized' : 'Draft'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="date"
                    value={singleDate}
                    onChange={e => setSingleDate(e.target.value)}
                    className="border border-[#cbc4cd] bg-white rounded-lg px-3.5 py-2 text-xs font-bold text-[#161b27] focus:ring-2 focus:ring-[#556B2F]/20 outline-none"
                  />
                )}
              </div>

              {coveredLogSheets.length > 0 && (
                <div className="text-xs text-slate-600 font-sans flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>
                    Evaluating <strong>{singleDate}</strong> (Day Order {coveredLogSheets[0].dayOrder})
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[#556B2F]" />
                    <span>Date Range:</span>
                  </span>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">From</span>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => setFromDate(e.target.value)}
                      className="border border-[#cbc4cd] bg-white rounded-lg px-3 py-1.5 text-xs font-bold text-[#161b27] focus:ring-2 focus:ring-[#556B2F]/20 outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">To</span>
                    <input
                      type="date"
                      value={toDate}
                      onChange={e => setToDate(e.target.value)}
                      className="border border-[#cbc4cd] bg-white rounded-lg px-3 py-1.5 text-xs font-bold text-[#161b27] focus:ring-2 focus:ring-[#556B2F]/20 outline-none"
                    />
                  </div>
                </div>

                {sortedLogSheets.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                      Quick:
                    </span>
                    <button
                      onClick={() => setPresetRange(7)}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white border border-[#cbc4cd] rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      Last 7 Days
                    </button>
                    <button
                      onClick={() => setPresetRange(30)}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white border border-[#cbc4cd] rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      Last 30 Days
                    </button>
                    <button
                      onClick={setAllRange}
                      className="px-2.5 py-1 text-[11px] font-bold bg-white border border-[#cbc4cd] rounded hover:bg-slate-100 text-slate-700 cursor-pointer"
                    >
                      All Log Sheets
                    </button>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-500 font-sans flex items-center justify-between pt-1">
                <span>
                  Summing totals across <strong>{coveredLogSheets.length}</strong> log sheet{coveredLogSheets.length === 1 ? '' : 's'} in range.
                </span>
                {coveredLogSheets.length > 0 && (
                  <span className="text-[11px] text-[#556B2F] font-semibold">
                    Dates covered: {coveredLogSheets.map(s => s.logDate).join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Empty State when no log sheets match */}
      {coveredLogSheets.length === 0 ? (
        <div className="bg-white border border-[#cbc4cd] rounded-xl p-12 text-center shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="font-serif font-bold text-lg text-[#161b27]">
              No Log Sheets Found in Selected Period
            </h3>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              {mode === 'single_day'
                ? `There is no log sheet created for ${singleDate}. Please select an existing log sheet or generate a daily log sheet first.`
                : `No log sheets exist between ${fromDate} and ${toDate}. Create a log sheet in Daily Log Sheets to generate workload reports.`}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={onNavigateToLogSheets}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#556B2F] hover:bg-[#435624] text-white text-xs font-bold uppercase tracking-wider rounded-lg shadow-xs transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Go to Daily Log Sheets</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards Row */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {/* Card 1: Faculty on Duty */}
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Faculty on Duty
                </span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="font-serif font-black text-2xl text-[#161b27]">
                  {staffWithClassesCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">
                  / {activeStaffList.length} active
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Teaching or covering</p>
            </div>

            {/* Card 2: Substitutions Covered */}
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Substitutions Covered
                </span>
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="font-serif font-black text-2xl text-purple-700">
                  {totalSubstitutionsCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">periods</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Department-wide in period</p>
            </div>

            {/* Card 3: High Load Faculty */}
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  High Load (&ge;4 Hrs)
                </span>
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className={`font-serif font-black text-2xl ${heavyLoadCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                  {heavyLoadCount}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">faculty</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Heavy teaching schedule</p>
            </div>

            {/* Card 4: Highest Load Staff */}
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-4 shadow-xs overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-900">
                  Highest Load
                </span>
                <Award className="w-4 h-4 text-amber-700" />
              </div>
              {highestLoadStaff ? (
                <div className="mt-1">
                  <h4 className="font-serif font-bold text-xs text-[#161b27] truncate mt-1">
                    {highestLoadStaff.staff.fullName || highestLoadStaff.staff.code}
                  </h4>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="font-serif font-black text-lg text-amber-900">
                      {highestLoadStaff.totalPeriods}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      hrs ({highestLoadStaff.regularPeriods} reg + {highestLoadStaff.substitutionPeriods} sub)
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-medium mt-2">No periods recorded</p>
              )}
            </div>

            {/* Card 5: Total Department Teaching Hours */}
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Teaching Hours
                </span>
                <Clock className="w-4 h-4 text-[#556B2F]" />
              </div>
              <div className="flex items-baseline gap-1.5 mt-2">
                <span className="font-serif font-black text-2xl text-[#556B2F]">
                  {totalDepartmentPeriods}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">hrs total</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                Avg {(totalDepartmentPeriods / (activeStaffList.length || 1)).toFixed(1)} hrs / staff
              </p>
            </div>
          </div>

          {/* Main Workload Table */}
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-[#cbc4cd] bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                <h3 className="font-serif font-bold text-sm text-[#161b27]">
                  Faculty Daily Workload Tally &amp; Hour Summary
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#556B2F]/10 text-[#556B2F]">
                  {sortedWorkloadRows.length} Faculty
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-sans">
                Click any column header to sort. Default sort: Total Periods (descending).
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#cbc4cd] bg-slate-100/70 text-[10px] uppercase tracking-wider text-slate-600 font-bold font-sans select-none">
                    {/* Rank */}
                    <th
                      onClick={() => handleSort('rank')}
                      className="py-3 px-3 text-center w-12 cursor-pointer hover:bg-slate-200/60 transition-colors group"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Rank</span>
                        {renderSortIndicator('rank')}
                      </div>
                    </th>

                    {/* Column 1: Staff Name and Code */}
                    <th
                      onClick={() => handleSort('name')}
                      className="py-3 px-4 cursor-pointer hover:bg-slate-200/60 transition-colors group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>Faculty Member &amp; Code</span>
                        {renderSortIndicator('name')}
                      </div>
                    </th>

                    {/* Column 2: Regular Periods */}
                    <th
                      onClick={() => handleSort('regularPeriods')}
                      className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors group w-28"
                      title="Scheduled classes on timetable minus absent periods"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Regular</span>
                        {renderSortIndicator('regularPeriods')}
                      </div>
                    </th>

                    {/* Column 3: Substitution Periods */}
                    <th
                      onClick={() => handleSort('substitutionPeriods')}
                      className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors group w-32"
                      title="Additional periods assigned as substitute or swap"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Substitutions</span>
                        {renderSortIndicator('substitutionPeriods')}
                      </div>
                    </th>

                    {/* Column 4: Freed Periods */}
                    <th
                      onClick={() => handleSort('freedPeriods')}
                      className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors group w-28"
                      title="Periods where this staff was marked absent and covered"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>Freed / Absent</span>
                        {renderSortIndicator('freedPeriods')}
                      </div>
                    </th>

                    {/* Column 5: Total Periods */}
                    <th
                      onClick={() => handleSort('totalPeriods')}
                      className="py-3 px-4 text-center cursor-pointer hover:bg-slate-200/60 transition-colors group bg-slate-200/40 w-36"
                      title="Regular Periods + Substitution Periods"
                    >
                      <div className="flex items-center justify-center gap-1.5 font-black text-[#161b27]">
                        <span>Total Hours</span>
                        {renderSortIndicator('totalPeriods')}
                      </div>
                    </th>

                    {/* Column 6: Status Tag */}
                    <th className="py-3 px-4 text-center w-28">
                      <span>Status</span>
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 font-sans">
                  {sortedWorkloadRows.map((row, idx) => {
                    const isMax = row.totalPeriods >= (mode === 'single_day' ? 5 : 5 * coveredLogSheets.length);
                    const isHeavy = row.totalPeriods >= (mode === 'single_day' ? 4 : 4 * coveredLogSheets.length);

                    return (
                      <tr
                        key={row.staff.id}
                        className={`hover:bg-slate-50/80 transition-colors ${
                          row.isHighestLoad ? 'bg-amber-50/40' : idx % 2 === 1 ? 'bg-slate-50/30' : ''
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3 px-3 text-center font-mono font-bold text-slate-400 text-xs">
                          {idx + 1}
                        </td>

                        {/* Staff Name and Code */}
                        <td className="py-3 px-4 font-medium text-[#161b27]">
                          <div className="flex items-center gap-2.5">
                            <span className="font-mono font-bold text-[#556B2F] bg-[#556B2F]/10 border border-[#556B2F]/20 px-2 py-0.5 rounded text-xs">
                              {row.staff.code}
                            </span>
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-2">
                                <span>{row.staff.fullName || `Prof. ${row.staff.code}`}</span>
                                {row.isHighestLoad && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Award className="w-3 h-3 text-amber-700" />
                                    Highest Load
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-400 block mt-0.5">
                                Faculty ID: <strong>{row.staff.code}</strong>
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Regular Periods */}
                        <td className="py-3 px-4 text-center font-mono font-bold text-slate-700">
                          {row.regularPeriods > 0 ? (
                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded font-bold text-xs bg-slate-100 text-slate-800 border border-slate-200">
                              {row.regularPeriods} hr{row.regularPeriods > 1 ? 's' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>

                        {/* Substitution Periods */}
                        <td className="py-3 px-4 text-center">
                          {row.substitutionPeriods > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
                              +{row.substitutionPeriods} sub
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>

                        {/* Freed Periods */}
                        <td className="py-3 px-4 text-center">
                          {row.freedPeriods > 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                              -{row.freedPeriods} absent
                            </span>
                          ) : (
                            <span className="text-slate-300 font-normal">—</span>
                          )}
                        </td>

                        {/* Total Periods */}
                        <td className="py-3 px-4 text-center bg-slate-50/40">
                          <div className="inline-flex items-center justify-center">
                            {isMax ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 font-extrabold text-xs border border-rose-300 shadow-2xs">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>{row.totalPeriods} hrs (MAX)</span>
                              </span>
                            ) : isHeavy ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 font-extrabold text-xs border border-amber-300 shadow-2xs">
                                <span>{row.totalPeriods} hrs</span>
                              </span>
                            ) : row.totalPeriods > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-[#556B2F] text-white font-bold text-xs shadow-xs">
                                {row.totalPeriods} hr{row.totalPeriods > 1 ? 's' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium text-xs bg-slate-100 px-2 py-0.5 rounded">
                                0 hrs (Free)
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-4 text-center">
                          {row.staff.onLeave ? (
                            <span className="inline-flex px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold border border-rose-200">
                              ON LEAVE
                            </span>
                          ) : row.totalPeriods === 0 ? (
                            <span className="inline-flex px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold border border-slate-200">
                              FREE TODAY
                            </span>
                          ) : row.substitutionPeriods > 0 ? (
                            <span className="inline-flex px-2 py-0.5 rounded bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200">
                              SUB ASSIGNED
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-200">
                              ACTIVE
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Table Footer Summary Note */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between text-xs text-slate-500 gap-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#556B2F]" />
                <span>
                  Formula: <strong>Total Hours = Regular Hours + Substitution Hours</strong> (Freed periods already deducted from regular schedule).
                </span>
              </div>
              <span className="font-semibold text-slate-700">
                Department Total: {totalDepartmentPeriods} Hours
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
