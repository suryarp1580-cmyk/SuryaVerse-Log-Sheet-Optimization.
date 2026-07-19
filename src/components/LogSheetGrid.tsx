import React from 'react';
import { ClassSection, Staff, TimetableEntry, Substitution } from '../types';

interface LogSheetGridProps {
  classes: ClassSection[];
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  substitutions: Substitution[];
  isFinalized: boolean;
  activeDayOrder: number;
  onCellClick: (classId: string, period: number, entry: TimetableEntry) => void;
}

export default function LogSheetGrid({
  classes,
  staffList,
  timetableEntries,
  substitutions,
  isFinalized,
  activeDayOrder,
  onCellClick
}: LogSheetGridProps) {
  // Sort classes by display order
  const sortedClasses = [...classes].sort((a, b) => a.displayOrder - b.displayOrder);

  // Helper to render cell content
  const renderCell = (classSection: ClassSection, period: number) => {
    // Find master entry
    const entry = timetableEntries.find(
      e => e.classId === classSection.id && e.dayOrder === activeDayOrder && e.period === period
    );

    if (!entry) {
      return (
        <td
          key={`${classSection.id}-${period}`}
          className="border-r border-[#cbc4cd] text-xs text-slate-400 italic text-center font-sans py-2 select-none"
        >
          No Period
        </td>
      );
    }

    const { subjectCode, excludedFromSubstitution, isLab, staffIds } = entry;

    // Get staff objects
    const originalStaff = staffIds
      .map(id => staffList.find(s => s.id === id))
      .filter((s): s is Staff => !!s);

    if (excludedFromSubstitution) {
      return (
        <td
          key={`${classSection.id}-${period}`}
          className="border-r border-[#cbc4cd] bg-blue-50/40 text-blue-700 italic text-center font-semibold text-xs py-3 select-none"
        >
          {subjectCode}
        </td>
      );
    }

    // Find if there is an active substitution for this class/period
    const activeSub = substitutions.find(
      s => s.classId === classSection.id && s.period === period
    );

    const isClickable = !isFinalized;

    // Render as blank if original staff is on leave and there's no active substitute
    if (!activeSub && originalStaff.some(s => s.onLeave === true)) {
      return (
        <td
          key={`${classSection.id}-${period}`}
          onClick={() => isClickable && onCellClick(classSection.id, period, entry)}
          className={`border-r border-[#cbc4cd] p-2 bg-white ${
            isClickable
              ? 'cursor-pointer hover:bg-slate-50'
              : 'select-none'
          }`}
        >
          <div className="h-10 border border-dashed border-[#556B2F]/45 hover:border-[#556B2F] rounded-sm transition-colors" />
        </td>
      );
    }

    return (
      <td
        key={`${classSection.id}-${period}`}
        onClick={() => isClickable && onCellClick(classSection.id, period, entry)}
        className={`border-r border-[#cbc4cd] text-center p-2.5 transition-colors ${
          activeSub
            ? activeSub.substituteStaffId
              ? 'bg-amber-50/60'
              : 'bg-red-50/70'
            : ''
        } ${
          isClickable
            ? 'cursor-pointer hover:bg-[#FFF0F5] active:bg-[#FFF0F5]/80'
            : 'select-none'
        }`}
      >
        <div className="font-sans text-xs">
          {/* Subject Header */}
          <div className="font-bold text-[#161b27] uppercase tracking-wide">
            {subjectCode}
          </div>

          {/* Staff list rendering */}
          {activeSub ? (
            <div className="mt-1 flex flex-col items-center justify-center gap-0.5">
              {/* Render original staff, striking through the absent one */}
              <div className="flex flex-wrap items-center justify-center gap-1 text-[10px] text-slate-400 font-medium">
                {originalStaff.map((s, i) => {
                  const isAbsent = s.id === activeSub.absentStaffId;
                  return (
                    <span
                      key={s.id}
                      className={isAbsent ? 'line-through text-red-400 font-bold' : ''}
                    >
                      {s.code}
                      {i < originalStaff.length - 1 ? ',' : ''}
                    </span>
                  );
                })}
              </div>

              {/* Render substitute staff */}
              {activeSub.substituteStaffId ? (
                <div className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-xs bg-[#cbeb8a] text-[#374e00] text-[10px] font-extrabold shadow-2xs border border-[#516b19]/10">
                  SUB: {staffList.find(s => s.id === activeSub.substituteStaffId)?.code || '?'}
                </div>
              ) : (
                <div className="mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-xs bg-red-100 text-red-800 text-[10px] font-bold">
                  FREE PERIOD
                </div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-[#49454d] font-semibold mt-0.5">
              {originalStaff.length > 0
                ? `(${originalStaff.map(s => s.code).join(', ')})`
                : '(Nil)'}
            </div>
          )}
        </div>
      </td>
    );
  };

  return (
    <div className="w-full bg-white border border-[#cbc4cd] shadow-md overflow-hidden rounded-md">
      {/* Dense Grid Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left min-w-[950px]">
          <thead>
            <tr className="bg-[#556B2F] text-white select-none">
              <th className="p-3 border-r border-[#cbc4cd] font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-48 shrink-0">
                CLASS SECTION
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 1</div>
                <div className="text-[9px] opacity-75 font-medium mt-0.5">01:30 - 02:25</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 2</div>
                <div className="text-[9px] opacity-75 font-medium mt-0.5">02:25 - 03:20</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 3</div>
                <div className="text-[9px] opacity-75 font-medium mt-0.5">03:20 - 04:15</div>
              </th>
              
              {/* Interval column header */}
              <th className="p-0 border-r border-[#cbc4cd] w-8 bg-[#E6E6FA] text-center">
                <div className="writing-mode-vertical text-[9px] font-bold text-[#161b27] uppercase tracking-widest py-2 mx-auto rotate-180 flex items-center justify-center">
                  INTERVAL
                </div>
              </th>
              
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 4</div>
                <div className="text-[9px] opacity-75 font-medium mt-0.5">04:35 - 05:30</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 5</div>
                <div className="text-[9px] opacity-75 font-medium mt-0.5">05:30 - 06:25</div>
              </th>
              <th className="p-3 font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-24">
                ROOM
              </th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-[#cbc4cd]">
            {sortedClasses.map(cls => (
              <tr
                key={cls.id}
                className="hover:bg-slate-50 transition-colors h-14"
              >
                {/* Class label column */}
                <td className="p-3 font-sans font-bold border-r border-[#cbc4cd] bg-[#FFF0F5] text-[#556B2F] text-xs">
                  <div className="flex flex-col">
                    <span className="font-serif text-[#161b27]">{cls.yearLabel}</span>
                    <span className="text-[10px] text-[#556B2F]/80 font-bold mt-0.5">SEC: {cls.section}</span>
                  </div>
                </td>

                {/* Periods 1 to 3 */}
                {renderCell(cls, 1)}
                {renderCell(cls, 2)}
                {renderCell(cls, 3)}

                {/* Interval spacer */}
                <td className="p-0 border-r border-[#cbc4cd] bg-[#d5d9ea]/30 select-none"></td>

                {/* Periods 4 to 5 */}
                {renderCell(cls, 4)}
                {renderCell(cls, 5)}

                {/* Room code column */}
                <td className="p-3 text-center font-sans font-extrabold text-xs text-[#161b27] bg-[#F5F4F0] select-none">
                  {cls.roomNo}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Signature & Print Footer - Displayed neatly */}
      <div className="mt-10 px-8 pb-6 select-none">
        <div className="grid grid-cols-3 gap-12 mt-12 text-center text-xs">
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[180px] border-b border-[#cbc4cd] mb-2 h-8"></div>
            <p className="font-sans font-bold text-[#49454d] uppercase tracking-wider text-[10px]">
              Admin In-Charge
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[180px] border-b border-[#cbc4cd] mb-2 h-8"></div>
            <p className="font-sans font-bold text-[#49454d] uppercase tracking-wider text-[10px]">
              Department Coordinator
            </p>
          </div>
          <div className="flex flex-col items-center">
            <div className="w-full max-w-[180px] border-b border-[#cbc4cd] mb-2 h-8"></div>
            <p className="font-sans font-bold text-[#49454d] uppercase tracking-wider text-[10px]">
              Head of Department
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
