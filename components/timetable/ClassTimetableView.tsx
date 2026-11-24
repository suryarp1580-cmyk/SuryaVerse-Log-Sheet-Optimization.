// ============================================================================
// ACCFIN Timetable Generator — Class Timetable View (Vite port)
// PORTED FROM: components/timetable/ClassTimetableView.tsx (Next.js version)
// Adds a Print button (window.print with a print-only stylesheet in
// src/styles/timetable-fonts.css) — recreating what was attempted in the
// AI Studio session, done properly against this ported architecture.
// ============================================================================

import { useState, useTransition } from 'react';
import TimetableGrid from './TimetableGrid';
import type { ClassTimetableData } from '../../lib/timetable/grid-types';
import { manuallyPlaceSlot, removeSlot, getClassTimetable } from '../../lib/timetable/view-api';
import { Panel, PrimaryButton, SecondaryButton, inputClass } from './ui';

interface Props {
  initialData: ClassTimetableData;
}

export default function ClassTimetableView({ initialData }: Props) {
  const [data, setData] = useState(initialData);
  const [isPending, startTransition] = useTransition();
  const [pendingCell, setPendingCell] = useState<{ dayOrder: number; period: number } | null>(null);
  const [selectedWorkloadId, setSelectedWorkloadId] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function refresh() {
    startTransition(async () => {
      const fresh = await getClassTimetable(data.classId);
      setData(fresh);
    });
  }

  function handleCellClick(dayOrder: number, period: number) {
    if (data.unresolved.length === 0) return;
    setPendingCell({ dayOrder, period });
    setSelectedWorkloadId(data.unresolved[0]?.workloadId ?? '');
  }

  function handleConfirmPlacement() {
    if (!pendingCell || !selectedWorkloadId) return;
    startTransition(async () => {
      const result = await manuallyPlaceSlot(data.classId, pendingCell.dayOrder, pendingCell.period, selectedWorkloadId);
      setStatusMessage({ text: result.message, ok: result.success });
      if (result.success) {
        setPendingCell(null);
        refresh();
      }
    });
  }

  function handleClashClick(slotId: string) {
    if (!confirm('Remove this clashing entry so you can place it somewhere else?')) return;
    startTransition(async () => {
      const result = await removeSlot(slotId);
      setStatusMessage({ text: result.message, ok: result.success });
      if (result.success) refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between no-print">
        <h2 className="font-serif text-xl text-[#201A17]">{data.classDisplayName}</h2>
        <SecondaryButton type="button" onClick={() => window.print()}>
          🖨 Print
        </SecondaryButton>
      </div>

      {/* Print-only letterhead — hidden on screen, shown via @media print in timetable-fonts.css */}
      <div className="print-only-letterhead">
        <p className="text-xs">Agurchand Manmull Jain College — Shift II</p>
        <p className="text-sm font-semibold">Department of Accounting &amp; Finance</p>
        <h2 className="text-lg font-serif mt-1">{data.classDisplayName}</h2>
      </div>

      <TimetableGrid
        cells={data.cells}
        onCellClick={data.unresolved.length > 0 ? handleCellClick : undefined}
        onClashClick={handleClashClick}
        renderCellContent={(key) => {
          const cell = data.cells[key];
          if (!cell) return data.unresolved.length > 0 ? <span className="text-[#C9BEA4] text-xs no-print">+ Add</span> : null;
          return (
            <div>
              <div className="font-medium tracking-wide text-[#201A17]">{cell.subjectCode}</div>
              <div className="text-[11px] text-[#8A806D]">{cell.staffShortCode}</div>
              {cell.isClash && <div className="text-[10px] text-[#8C1F1F] font-medium mt-0.5 no-print">Clash</div>}
            </div>
          );
        }}
      />

      {statusMessage && <p className={`text-sm no-print ${statusMessage.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'}`}>{statusMessage.text}</p>}

      {pendingCell && (
        <Panel className="border-[#3A0D0D]/40 bg-[#F6EFD6] p-4 space-y-3 no-print">
          <p className="text-sm font-medium text-[#201A17]">
            Placing into Day Order {pendingCell.dayOrder}, Period {pendingCell.period}
          </p>
          <select className={`${inputClass} sm:w-96`} value={selectedWorkloadId} onChange={(e) => setSelectedWorkloadId(e.target.value)}>
            {data.unresolved.map((u) => (
              <option key={u.workloadId} value={u.workloadId}>
                {u.subjectCode} — {u.subjectName} ({u.staffShortCode}, {u.missingHours}h remaining)
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <PrimaryButton onClick={handleConfirmPlacement} disabled={isPending}>
              {isPending ? 'Placing…' : 'Place here'}
            </PrimaryButton>
            <SecondaryButton onClick={() => setPendingCell(null)}>Cancel</SecondaryButton>
          </div>
        </Panel>
      )}

      {data.unresolved.length > 0 && (
        <div className="no-print">
          <h3 className="text-sm font-medium text-[#A9631A] mb-2">Needs manual placement — click any empty cell above to fill</h3>
          <ul className="space-y-1 text-sm">
            {data.unresolved.map((u) => (
              <li key={u.workloadId} className="border-l-4 border-[#A9631A] bg-[#FBF1E6] px-3 py-2 text-[#7A480F]">
                {u.subjectCode} — {u.subjectName} ({u.staffShortCode}) — {u.missingHours} hour(s) remaining
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="timetable-print-area">
        <h3 className="text-sm font-medium text-[#4A4038] mb-2">Subject legend</h3>
        <Panel>
          <table className="min-w-full divide-y divide-[#E4DCC9] text-sm">
            <thead className="bg-[#F6EFD6]">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Code</th>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Subject Name</th>
                <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Hours</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EDE7D8] bg-white">
              {data.legend.map((l, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 font-medium tracking-wide">{l.subjectCode}</td>
                  <td className="px-4 py-2">
                    {l.subjectName} <span className="text-[#9C917A]">({l.staffName})</span>
                  </td>
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
