'use client';

// ============================================================================
// ACCFIN Timetable Generator — Staff Timetable View (Part 4 restyle)
// ============================================================================

import TimetableGrid from './TimetableGrid';
import type { StaffTimetableData } from '@/lib/timetable/grid-types';
import { Panel } from './ui';

interface Props {
  data: StaffTimetableData;
}

export default function StaffTimetableView({ data }: Props) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="font-serif text-xl text-[#201A17]">{data.staffName}</h2>
        <span className="text-sm text-[#8A806D]">Total hours allotted: {data.totalHours}</span>
      </div>

      <TimetableGrid
        cells={data.cells}
        renderCellContent={(key) => {
          const cell = data.cells[key];
          if (!cell) return null;
          return (
            <div>
              <div className="font-medium tracking-wide text-[#201A17]">{cell.classCode}</div>
              <div className="text-[11px] text-[#8A806D]">{cell.subjectCode}</div>
              {cell.isClash && <div className="text-[10px] text-[#8C1F1F] font-medium mt-0.5">Clash</div>}
            </div>
          );
        }}
      />

      <div>
        <h3 className="text-sm font-medium text-[#4A4038] mb-2">Class &amp; subject legend</h3>
        <Panel>
          <table className="min-w-full divide-y divide-[#E4DCC9] text-sm">
            <thead className="bg-[#F6EFD6]">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Class &amp; Section</th>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Subject Name</th>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7D8] bg-white">
              {data.legend.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">{l.classDisplayName}</td>
                  <td className="px-4 py-2">{l.subjectName}</td>
                  <td className="px-4 py-2">{l.hoursPerWeek}</td>
                </tr>
              ))}
              <tr className="font-medium bg-[#FAF7F1]">
                <td className="px-4 py-2" colSpan={2}>
                  Total Hours
                </td>
                <td className="px-4 py-2">{data.legend.reduce((sum, l) => sum + l.hoursPerWeek, 0)}</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
