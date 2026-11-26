'use client';

// ============================================================================
// ACCFIN Timetable Generator — Staff Timetable View (Part 4 restyle)
// ============================================================================

import { useRef, useState } from 'react';
import TimetableGrid from './TimetableGrid';
import type { StaffTimetableData } from '../../lib/timetable/grid-types';
import type { TTClass, TTStaff } from '../../lib/timetable/types';
import { downloadStaffTimetablePdf } from '../../lib/timetable/export-pdf';
import { Panel, PrimaryButton, SecondaryButton } from './ui';
import { Download, Loader2, Printer } from 'lucide-react';

interface Props {
  data: StaffTimetableData;
  classes?: TTClass[];
  staff?: TTStaff[];
}

export default function StaffTimetableView({ data, classes = [], staff = [] }: Props) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  async function handleDownload() {
    if (isDownloading) return;
    setIsDownloading(true);
    setStatusMessage(null);
    try {
      const fileName = await downloadStaffTimetablePdf(data, classes, staff);
      setStatusMessage({ text: `Downloaded ${fileName} to your PC.`, ok: true });
    } catch (err: any) {
      setStatusMessage({ text: err?.message || 'Failed to download Staff Timetable PDF.', ok: false });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div>
          <h2 className="font-serif text-xl text-[#201A17]">{data.staffName}</h2>
          <span className="text-sm text-[#8A806D]">Total hours allotted: {data.totalHours}</span>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton type="button" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-1.5" />
            <span>Print</span>
          </SecondaryButton>
          <PrimaryButton
            type="button"
            onClick={handleDownload}
            disabled={isDownloading}
            title="Download Individual Staff Timetable as A4 Portrait PDF"
          >
            {isDownloading ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            <span>{isDownloading ? 'Generating PDF…' : 'Download Staff Timetable (PDF)'}</span>
          </PrimaryButton>
        </div>
      </div>

      {statusMessage && (
        <p className={`text-sm no-print ${statusMessage.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'}`}>
          {statusMessage.text}
        </p>
      )}

      <div ref={exportRef} className="space-y-6 timetable-print-area">
        <div className="print-only-letterhead">
          <p className="text-xs">Agurchand Manmull Jain College — Shift II</p>
          <p className="text-sm font-semibold">Department of Accounting &amp; Finance</p>
          <h2 className="text-lg font-serif mt-1">{data.staffName} — Faculty Timetable</h2>
          <p className="text-xs text-[#5B534B] mt-0.5">Total hours allotted: {data.totalHours}</p>
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
    </div>
  );
}
