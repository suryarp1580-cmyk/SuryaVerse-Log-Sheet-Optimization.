import React, { useState } from 'react';
import { Staff, TimetableEntry, Substitution } from '../types';
import { computeStaffWorkload, StaffWorkload } from '../lib/substitutionEngine';
import { Users, BarChart3, AlertCircle, Clock, Award, ArrowUpDown } from 'lucide-react';

interface WorkloadSummaryPanelProps {
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  substitutions: Substitution[];
  dayOrder: number;
  logSheetId?: string;
}

interface StaffWorkloadRow {
  staff: Staff;
  workload: StaffWorkload;
}

export default function WorkloadSummaryPanel({
  staffList,
  timetableEntries,
  substitutions,
  dayOrder,
  logSheetId
}: WorkloadSummaryPanelProps) {
  const [sortField, setSortField] = useState<'total' | 'regular' | 'sub' | 'code'>('total');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Compute workload for all active faculty staff
  const activeStaff = staffList.filter(s => s.isActive);

  const workloadRows: StaffWorkloadRow[] = activeStaff.map(staff => ({
    staff,
    workload: computeStaffWorkload(staff.id, dayOrder, timetableEntries, substitutions, logSheetId)
  }));

  // Sort rows based on sort preference (default: totalPeriods descending)
  const sortedRows = [...workloadRows].sort((a, b) => {
    let comparison = 0;
    if (sortField === 'total') {
      comparison = b.workload.totalPeriods - a.workload.totalPeriods;
    } else if (sortField === 'regular') {
      comparison = b.workload.regularPeriods - a.workload.regularPeriods;
    } else if (sortField === 'sub') {
      comparison = b.workload.substitutionPeriods - a.workload.substitutionPeriods;
    } else if (sortField === 'code') {
      comparison = a.staff.code.localeCompare(b.staff.code);
    }

    if (comparison === 0) {
      // Secondary tiebreaker: staff code alphabetically
      comparison = a.staff.code.localeCompare(b.staff.code);
    }

    return sortAsc ? -comparison : comparison;
  });

  const handleToggleSort = (field: 'total' | 'regular' | 'sub' | 'code') => {
    if (sortField === field) {
      setSortAsc(prev => !prev);
    } else {
      setSortField(field);
      setSortAsc(false); // default descending for new numerical sort
    }
  };

  // High-level statistics
  const totalStaffCount = activeStaff.length;
  const staffWithClasses = workloadRows.filter(r => r.workload.totalPeriods > 0).length;
  const totalSubPeriods = workloadRows.reduce((acc, r) => acc + r.workload.substitutionPeriods, 0);
  const totalTaughtPeriods = workloadRows.reduce((acc, r) => acc + r.workload.totalPeriods, 0);
  const heavyLoadCount = workloadRows.filter(r => r.workload.totalPeriods >= 4).length;

  return (
    <div className="workload-summary-section mt-6 border-t border-[#cbc4cd] pt-5 px-6 font-sans">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-[#556B2F] text-white rounded-md">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif font-bold text-xs md:text-sm text-[#161b27] uppercase tracking-wide">
              Faculty Daily Workload Tally &amp; Hour Summary
            </h3>
            <p className="text-[10px] text-slate-500 font-medium">
              Live tally of Regular Scheduled Periods, Substitutions, and Total Hours for Day Order {['I', 'II', 'III', 'IV', 'V', 'VI'][dayOrder - 1]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#556B2F] bg-[#556B2F]/10 border border-[#556B2F]/20 px-2.5 py-1 rounded-full">
            {totalTaughtPeriods} Total Hours Taught Today
          </span>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="bg-[#FAF9F5] border border-[#cbc4cd] p-2.5 rounded-lg">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Faculty on Duty</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-black font-serif text-[#161b27]">{staffWithClasses}</span>
            <span className="text-[10px] text-slate-400 font-semibold">/ {totalStaffCount} active</span>
          </div>
        </div>

        <div className="bg-[#FAF9F5] border border-[#cbc4cd] p-2.5 rounded-lg">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Substitutions Covered</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-black font-serif text-emerald-700">{totalSubPeriods}</span>
            <span className="text-[10px] text-slate-400 font-semibold">periods</span>
          </div>
        </div>

        <div className="bg-[#FAF9F5] border border-[#cbc4cd] p-2.5 rounded-lg">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">High Load (&ge;4 Hours)</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className={`text-base font-black font-serif ${heavyLoadCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
              {heavyLoadCount}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">faculty</span>
          </div>
        </div>

        <div className="bg-[#FAF9F5] border border-[#cbc4cd] p-2.5 rounded-lg">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">Avg Teaching Load</span>
          <div className="flex items-baseline gap-1.5 mt-0.5">
            <span className="text-base font-black font-serif text-[#556B2F]">
              {totalStaffCount > 0 ? (totalTaughtPeriods / totalStaffCount).toFixed(1) : 0}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">hrs/staff</span>
          </div>
        </div>
      </div>

      {/* Workload Table */}
      <div className="overflow-x-auto border border-[#cbc4cd] rounded-lg shadow-2xs bg-white">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#F5F4F0] border-b border-[#cbc4cd] text-[#161b27] select-none">
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] w-12 text-center">Rank</th>
              <th
                onClick={() => handleToggleSort('code')}
                className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center gap-1">
                  <span>Faculty</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleToggleSort('regular')}
                className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-center w-28 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Regular</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th
                onClick={() => handleToggleSort('sub')}
                className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-center w-28 cursor-pointer hover:bg-slate-200/60 transition-colors"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Substitutions</span>
                  <ArrowUpDown className="w-3 h-3 text-slate-400" />
                </div>
              </th>
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-center w-24">
                Freed / Absent
              </th>
              <th
                onClick={() => handleToggleSort('total')}
                className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-center w-32 bg-[#556B2F]/10 cursor-pointer hover:bg-[#556B2F]/20 transition-colors"
              >
                <div className="flex items-center justify-center gap-1 text-[#556B2F]">
                  <span>Total Hours</span>
                  <ArrowUpDown className="w-3 h-3 text-[#556B2F]" />
                </div>
              </th>
              <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-center w-24">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#cbc4cd]">
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400 italic">
                  No active faculty members registered.
                </td>
              </tr>
            ) : (
              sortedRows.map((row, idx) => {
                const { staff, workload } = row;
                const isHeavy = workload.totalPeriods >= 4;
                const isMax = workload.totalPeriods >= 5;

                return (
                  <tr
                    key={staff.id}
                    className={`hover:bg-slate-50 transition-colors ${
                      workload.totalPeriods === 0 ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-400 text-[11px]">
                      {idx + 1}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-[#556B2F] bg-[#556B2F]/10 border border-[#556B2F]/20 px-1.5 py-0.5 rounded text-[11px]">
                          {staff.code}
                        </span>
                        <span className="font-semibold text-[#161b27] text-xs">
                          {staff.fullName || `Prof. ${staff.code}`}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                      {workload.regularPeriods > 0 ? (
                        <span>{workload.regularPeriods} hr{workload.regularPeriods > 1 ? 's' : ''}</span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {workload.substitutionPeriods > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px] border border-emerald-300">
                          +{workload.substitutionPeriods} sub
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {workload.freedPeriods > 0 ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                          -{workload.freedPeriods} absent
                        </span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-center bg-[#556B2F]/5">
                      <div className="inline-flex items-center justify-center">
                        {isMax ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-900 font-extrabold text-[11px] border border-rose-300 shadow-2xs">
                            <AlertCircle className="w-3 h-3 text-rose-600" />
                            <span>{workload.totalPeriods} hrs (MAX)</span>
                          </span>
                        ) : isHeavy ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-extrabold text-[11px] border border-amber-300 shadow-2xs">
                            <span>{workload.totalPeriods} hrs</span>
                          </span>
                        ) : workload.totalPeriods > 0 ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#556B2F]/15 text-[#556B2F] font-bold text-[11px]">
                            {workload.totalPeriods} hr{workload.totalPeriods > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-medium text-[11px]">0 hrs (Free)</span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-center">
                      {staff.onLeave ? (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[9px] font-bold">
                          ON LEAVE
                        </span>
                      ) : workload.totalPeriods === 0 ? (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold">
                          FREE TODAY
                        </span>
                      ) : (
                        <span className="inline-flex px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                          ACTIVE
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
