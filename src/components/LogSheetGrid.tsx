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
          className="log-sheet-grid-cell border-r border-[#cbc4cd] text-xs text-slate-400 italic text-center font-sans p-4 h-20 select-none"
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
          className="log-sheet-grid-cell border-r border-[#cbc4cd] bg-blue-50/40 text-blue-700 italic text-center font-semibold text-xs p-4 h-20 select-none"
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
          className={`log-sheet-grid-cell border-r border-[#cbc4cd] p-4 bg-white h-20 ${
            isClickable
              ? 'cursor-pointer hover:bg-slate-50'
              : 'select-none'
          }`}
        >
          <div className="h-12 border border-dashed border-[#556B2F]/45 hover:border-[#556B2F] rounded-sm transition-colors flex items-center justify-center" />
        </td>
      );
    }

    return (
      <td
        key={`${classSection.id}-${period}`}
        onClick={() => isClickable && onCellClick(classSection.id, period, entry)}
        className={`log-sheet-grid-cell border-r border-[#cbc4cd] text-center p-4 transition-colors h-20 ${
          activeSub
            ? activeSub.isSwap
              ? 'bg-blue-50/60'
              : activeSub.substituteStaffId
                ? 'bg-amber-50/60'
                : 'bg-red-50/70'
            : ''
        } ${
          isClickable
            ? 'cursor-pointer hover:bg-[#FFF0F5] active:bg-[#FFF0F5]/80'
            : 'select-none'
        }`}
      >
        <div className="font-sans text-xs flex flex-col justify-center h-full">
          {/* Subject Header */}
          <div className="font-bold text-[#161b27] uppercase tracking-wide">
            {activeSub && activeSub.isSwap ? activeSub.swappedSubjectCode : subjectCode}
          </div>

          {/* Staff list rendering */}
          {activeSub ? (
            activeSub.isSwap ? (
              <div className="mt-1 flex flex-col items-center justify-center gap-0.5">
                <div className="flex flex-wrap items-center justify-center gap-1 text-[11px] text-[#161b27] font-bold">
                  {(activeSub.swappedStaffIds || (activeSub.substituteStaffId ? [activeSub.substituteStaffId] : [])).map(
                    id => staffList.find(s => s.id === id)?.code || '?'
                  ).join(', ') || 'FREE'}
                </div>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs bg-blue-100 text-blue-800 text-[9px] font-extrabold shadow-2xs border border-blue-200">
                    SWAP (P{activeSub.swapWithPeriod})
                  </span>
                  {activeSub.substituteStaffId && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs bg-[#cbeb8a] text-[#374e00] text-[9px] font-extrabold shadow-2xs border border-[#516b19]/10">
                      SUB
                    </span>
                  )}
                </div>
              </div>
            ) : (
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
            )
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
    <div className="log-sheet-table-wrapper w-full bg-white border border-[#cbc4cd] shadow-md overflow-hidden rounded-md">
      {/* Dense Grid Table */}
      <div className="overflow-x-auto">
        <table className="log-sheet-table w-full border-collapse text-left min-w-[950px]">
          <thead>
            <tr className="bg-[#556B2F] text-white select-none">
              <th className="class-column-header p-3 border-r border-[#cbc4cd] font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-48 shrink-0">
                CLASS SECTION
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 1</div>
                <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">8:30 TO 9:20</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 2</div>
                <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">9:20 TO 10:10</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 3</div>
                <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">10:10 TO 11:00</div>
              </th>
              
              {/* Interval column header */}
              <th className="break-column-header p-1 border-r border-[#cbc4cd] w-14 bg-[#E6E6FA] text-center text-[#161b27]">
                <div className="flex flex-col items-center justify-center font-sans">
                  <div className="font-bold text-[10px] tracking-wider uppercase text-[#161b27]">BREAK</div>
                  <div className="text-[8px] font-bold text-slate-600 mt-0.5 whitespace-nowrap">11.00-11.30</div>
                </div>
              </th>
              
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 4</div>
                <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">11:30 TO 12:20</div>
              </th>
              <th className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]">
                <div className="font-bold tracking-tight">PERIOD 5</div>
                <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">12:20 TO 1:10</div>
              </th>
              <th className="room-column-header p-3 font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-24">
                ROOM
              </th>
            </tr>
          </thead>
          
          <tbody className="divide-y divide-[#cbc4cd]">
            {sortedClasses.map(cls => (
              <tr
                key={cls.id}
                className="hover:bg-slate-50 transition-colors h-20"
              >
                {/* Class label column */}
                <td className="class-column-cell log-sheet-grid-cell p-4 font-sans font-bold border-r border-[#cbc4cd] bg-[#FFF0F5] text-[#556B2F] text-xs h-20">
                  <div className="flex flex-col justify-center h-full">
                    <span className="font-serif text-[#161b27]">{cls.yearLabel}</span>
                    <span className="text-[10px] text-[#556B2F]/80 font-bold mt-0.5">SEC: {cls.section}</span>
                  </div>
                </td>

                {/* Periods 1 to 3 */}
                {renderCell(cls, 1)}
                {renderCell(cls, 2)}
                {renderCell(cls, 3)}

                {/* Interval spacer */}
                <td className="break-column-cell p-0 border-r border-[#cbc4cd] bg-[#d5d9ea]/20 select-none text-center h-20">
                  <div className="flex flex-col items-center justify-center h-full text-[10px] font-extrabold text-blue-700 leading-none tracking-widest gap-0.5">
                    <span>B</span>
                    <span>R</span>
                    <span>E</span>
                    <span>A</span>
                    <span>K</span>
                  </div>
                </td>

                {/* Periods 4 to 5 */}
                {renderCell(cls, 4)}
                {renderCell(cls, 5)}

                {/* Room code column */}
                <td className="room-column-cell log-sheet-grid-cell p-4 text-center font-sans font-extrabold text-xs text-[#161b27] bg-[#F5F4F0] select-none h-20">
                  <div className="flex flex-col justify-center h-full">
                    {cls.roomNo}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daily Substitution & Adjustment Log Table (Included in PDF & Print) */}
      <div className="substitution-summary-section mt-6 border-t border-[#cbc4cd] pt-5 px-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className="font-serif font-bold text-xs md:text-sm text-[#203978] uppercase tracking-wide print:text-[11px]">
              Daily Substitution &amp; Faculty Adjustment Log — Day Order {['I', 'II', 'III', 'IV', 'V', 'VI'][activeDayOrder - 1]}
            </h3>
          </div>
          <span className="text-[10px] font-bold text-[#203978] bg-[#E6E6FA] border border-[#203978]/20 px-2.5 py-0.5 rounded-full print:text-[8px]">
            {substitutions.length} {substitutions.length === 1 ? 'Substitution Record' : 'Substitution Records'}
          </span>
        </div>

        {substitutions.length > 0 ? (
          <div className="overflow-x-auto border border-[#cbc4cd] rounded-sm">
            <table className="w-full border-collapse text-left text-xs print:text-[9px]">
              <thead>
                <tr className="bg-[#203978] text-white select-none">
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center w-10 bg-[#203978]">SL.</th>
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center w-32 bg-[#203978]">CLASS &amp; SEC</th>
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center w-24 bg-[#203978]">PERIOD</th>
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center w-20 bg-[#203978]">SUBJECT</th>
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center bg-[#203978]">ABSENT / REGULAR FACULTY</th>
                  <th className="p-2 border-r border-[#cbc4cd] font-bold text-center bg-[#203978]">SUBSTITUTE FACULTY</th>
                  <th className="p-2 font-bold text-center bg-[#203978]">REMARKS / MENTIONED BY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbc4cd]">
                {substitutions.map((sub, index) => {
                  const classInfo = classes.find(c => c.id === sub.classId);
                  const classLabel = classInfo ? `${classInfo.yearLabel} (${classInfo.section})` : '—';
                  const absentStaff = staffList.find(s => s.id === sub.absentStaffId);
                  const absentLabel = absentStaff ? `${absentStaff.code} - ${absentStaff.fullName || 'Faculty'}` : '—';
                  const subStaff = sub.substituteStaffId ? staffList.find(s => s.id === sub.substituteStaffId) : null;
                  
                  const ttEntry = timetableEntries.find(
                    e => e.classId === sub.classId && e.dayOrder === activeDayOrder && e.period === sub.period
                  );
                  const subjectCode = ttEntry ? ttEntry.subjectCode : '—';

                  let substituteLabel = '—';
                  if (sub.isSwap) {
                    const swappedStaffNames = (sub.swappedStaffIds || [])
                      .map(id => staffList.find(s => s.id === id)?.code || '?')
                      .join(', ');
                    substituteLabel = `Period Swap (P${sub.swapWithPeriod}: ${swappedStaffNames || 'Swapped'})`;
                  } else if (subStaff) {
                    substituteLabel = `${subStaff.code} - ${subStaff.fullName || 'Faculty'}`;
                  } else {
                    substituteLabel = 'Free Period (Unassigned)';
                  }

                  return (
                    <tr key={sub.id || index} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2 border-r border-[#cbc4cd] text-center font-bold text-slate-600">
                        {index + 1}
                      </td>
                      <td className="p-2 border-r border-[#cbc4cd] font-bold text-[#203978]">
                        {classLabel}
                      </td>
                      <td className="p-2 border-r border-[#cbc4cd] text-center font-semibold text-slate-700">
                        Period {sub.period}
                      </td>
                      <td className="p-2 border-r border-[#cbc4cd] text-center font-bold text-slate-800">
                        {subjectCode}
                      </td>
                      <td className="p-2 border-r border-[#cbc4cd] text-slate-800 font-medium">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-red-50 text-red-800 font-semibold border border-red-200 text-[10px] print:text-[8px] mr-1">
                          ABSENT
                        </span>
                        {absentLabel}
                      </td>
                      <td className="p-2 border-r border-[#cbc4cd] text-slate-800 font-medium">
                        {sub.isSwap ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 font-semibold border border-blue-200 text-[10px] print:text-[8px]">
                            {substituteLabel}
                          </span>
                        ) : subStaff ? (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200 text-[10px] print:text-[8px]">
                            {substituteLabel}
                          </span>
                        ) : (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 font-semibold border border-amber-200 text-[10px] print:text-[8px]">
                            Free Period
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-slate-600 italic font-medium">
                        {sub.remarks || `Substituted for ${absentStaff?.code || 'Faculty'}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="border border-dashed border-[#cbc4cd] rounded-sm p-3 text-center text-xs text-slate-500 italic bg-slate-50/50 print:py-2 print:text-[9px]">
            No substitutions or period adjustments recorded for Day Order {['I', 'II', 'III', 'IV', 'V', 'VI'][activeDayOrder - 1]}. All classes running as per master schedule.
          </div>
        )}
      </div>

      {/* Signature & Print Footer - Displayed neatly */}
      <div className="signature-section mt-10 px-8 pb-6 select-none">
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
