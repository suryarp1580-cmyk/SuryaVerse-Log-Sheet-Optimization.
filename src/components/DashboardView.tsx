import React, { useState } from 'react';
import { ClassSection, Staff, TimetableEntry } from '../types';
import { Calendar, Search, Users, BookOpen } from 'lucide-react';

interface DashboardViewProps {
  classes: ClassSection[];
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  onNewLogSheet?: () => void;
}

export default function DashboardView({ classes, staffList, timetableEntries, onNewLogSheet }: DashboardViewProps) {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id || '');
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');

  // Day order titles
  const dayOrders = [
    { num: 1, label: 'Day Order I' },
    { num: 2, label: 'Day Order II' },
    { num: 3, label: 'Day Order III' },
    { num: 4, label: 'Day Order IV' },
    { num: 5, label: 'Day Order V' },
    { num: 6, label: 'Day Order VI' }
  ];

  const periods = [1, 2, 3, 4, 5];

  // Helper to get timetable entry
  const getEntry = (classId: string, dayOrder: number, period: number) => {
    return timetableEntries.find(
      e => e.classId === classId && e.dayOrder === dayOrder && e.period === period
    );
  };

  // Helper to format staff codes
  const getStaffInitials = (entry: TimetableEntry) => {
    if (entry.excludedFromSubstitution) return 'External Faculty';
    return entry.staffIds
      .map(id => staffList.find(s => s.id === id)?.code || '?')
      .join(', ');
  };

  // Calculate statistics
  const totalClasses = classes.length;
  const totalStaff = staffList.length;
  const activeStaff = staffList.filter(s => s.isActive).length;
  const totalSlots = timetableEntries.length;
  const labSlots = timetableEntries.filter(e => e.isLab).length;

  return (
    <div className="p-6 space-y-6 select-none font-sans max-w-6xl mx-auto">
      {/* Quick Overview Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-[#cbc4cd] p-4 rounded-lg shadow-sm">
          <p className="text-[10px] font-bold text-[#556B2F] uppercase tracking-wider font-mono">Class Sections</p>
          <p className="text-2xl font-bold text-[#161b27] mt-1">{totalClasses} Sections</p>
          <p className="text-xs text-slate-500 mt-1">Full 11 sections tracked</p>
        </div>
        <div className="bg-white border border-[#cbc4cd] p-4 rounded-lg shadow-sm">
          <p className="text-[10px] font-bold text-[#556B2F] uppercase tracking-wider font-mono">Faculty Directory</p>
          <p className="text-2xl font-bold text-[#161b27] mt-1">{totalStaff} Registered</p>
          <p className="text-xs text-[#556B2F] font-semibold mt-1">{activeStaff} Active Department staff</p>
        </div>
        <div className="bg-white border border-[#cbc4cd] p-4 rounded-lg shadow-sm">
          <p className="text-[10px] font-bold text-[#556B2F] uppercase tracking-wider font-mono">Master Schedule Slots</p>
          <p className="text-2xl font-bold text-[#161b27] mt-1">{totalSlots} Periods</p>
          <p className="text-xs text-slate-500 mt-1">6 Day Orders x 5 Periods</p>
        </div>
        <div className="bg-white border border-[#cbc4cd] p-4 rounded-lg shadow-sm">
          <p className="text-[10px] font-bold text-[#556B2F] uppercase tracking-wider font-mono">Practical Labs</p>
          <p className="text-2xl font-bold text-[#161b27] mt-1">{labSlots} Sessions</p>
          <p className="text-xs text-[#556B2F] font-semibold mt-1">Multiple simultaneous staff</p>
        </div>
      </div>

      {/* Main Grid: Schedule Viewer */}
      <div className="bg-white border border-[#cbc4cd] rounded-lg shadow-md p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-[#cbc4cd] pb-4 mb-6 gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[#556B2F]" />
            <h3 className="font-serif font-bold text-lg text-[#161b27]">Timetable Master Viewer</h3>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Class filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#49454d] uppercase tracking-wider">Section:</label>
              <select
                value={selectedClassId}
                onChange={e => {
                  setSelectedClassId(e.target.value);
                  setSelectedStaffId('');
                }}
                className="border border-[#cbc4cd] text-xs font-semibold text-[#161b27] px-2 py-1.5 rounded bg-[#faf9ff]"
              >
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.yearLabel} - {c.section}
                  </option>
                ))}
              </select>
            </div>

            <span className="text-xs font-bold text-slate-300 hidden sm:inline">|</span>

            {/* Staff filter */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-[#49454d] uppercase tracking-wider">Faculty:</label>
              <select
                value={selectedStaffId}
                onChange={e => {
                  setSelectedStaffId(e.target.value);
                  if (e.target.value) {
                    setSelectedClassId('');
                  } else {
                    setSelectedClassId(classes[0]?.id || '');
                  }
                }}
                className="border border-[#cbc4cd] text-xs font-semibold text-[#161b27] px-2 py-1.5 rounded bg-[#faf9ff]"
              >
                <option value="">-- View by Staff --</option>
                {staffList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} ({s.fullName || 'No Name'})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dynamic Display Table */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[#556B2F] text-white">
                <th className="p-3 border border-[#cbc4cd] font-serif font-bold text-center w-36 bg-[#556B2F]">
                  DAY ORDER
                </th>
                {periods.map(p => (
                  <th key={p} className="p-3 border border-[#cbc4cd] font-sans font-bold text-center bg-[#B2D274] text-[#141f00]">
                    PERIOD {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayOrders.map(day => (
                <tr key={day.num} className="hover:bg-slate-50 transition-colors h-14">
                  {/* Day order label */}
                  <td className="p-3 border border-[#cbc4cd] font-sans font-bold bg-[#FFF0F5] text-[#556B2F] text-center text-xs">
                    {day.label}
                  </td>

                  {/* Render Period Cells */}
                  {periods.map(period => {
                    if (selectedClassId) {
                      const entry = getEntry(selectedClassId, day.num, period);
                      if (!entry) {
                        return (
                          <td key={period} className="p-3 border border-[#cbc4cd] text-center text-slate-400 italic text-xs">
                            (Empty)
                          </td>
                        );
                      }

                      return (
                        <td
                          key={period}
                          className={`p-3 border border-[#cbc4cd] text-center ${
                            entry.excludedFromSubstitution ? 'bg-blue-50/40 text-blue-700 italic' : ''
                          }`}
                        >
                          <div className="font-bold text-xs text-[#161b27]">{entry.subjectCode}</div>
                          <div className="text-[10px] font-semibold text-[#556B2F] mt-0.5">
                            {getStaffInitials(entry)}
                          </div>
                        </td>
                      );
                    } else if (selectedStaffId) {
                      // Find which classes this staff is teaching at this day order & period
                      const teachingEntries = timetableEntries.filter(
                        e => e.dayOrder === day.num && e.period === period && e.staffIds.includes(selectedStaffId)
                      );

                      if (teachingEntries.length === 0) {
                        return (
                          <td key={period} className="p-3 border border-[#cbc4cd] text-center text-slate-400 italic text-xs bg-[#cbeb8a]/10">
                            <span className="text-[#374e00] font-bold text-[10px] tracking-wide uppercase bg-[#cbeb8a] px-1.5 py-0.5 rounded">FREE</span>
                          </td>
                        );
                      }

                      return (
                        <td key={period} className="p-2 border border-[#cbc4cd] text-center bg-[#FFF0F5]/40">
                          {teachingEntries.map(entry => {
                            const cls = classes.find(c => c.id === entry.classId);
                            return (
                              <div key={entry.id} className="text-center py-1">
                                <div className="font-bold text-[10px] text-[#556B2F]">
                                  {cls?.yearLabel} - {cls?.section}
                                </div>
                                <div className="text-[10px] font-extrabold text-[#161b27] uppercase mt-0.5">
                                  {entry.subjectCode}
                                </div>
                              </div>
                            );
                          })}
                        </td>
                      );
                    }

                    return null;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
