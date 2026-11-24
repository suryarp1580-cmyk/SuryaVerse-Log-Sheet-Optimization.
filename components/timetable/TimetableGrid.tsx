'use client';

// ============================================================================
// ACCFIN Timetable Generator — Timetable Grid (Part 4 restyle)
// ----------------------------------------------------------------------------
// Renders the 6 Day Order x 5 Period grid exactly like the printed AMJ
// College sheet, including the break column. Shared by both the class view
// and the staff view — `renderCellContent` decides what text shows in a
// filled cell (subject only, or class + subject, etc.).
// ============================================================================

import { DAY_ORDERS, DAY_ORDER_LABELS, PERIOD_TIMES } from '@/lib/timetable/constants';
import type { GridCellMap } from '@/lib/timetable/grid-types';

interface Props {
  cells: GridCellMap;
  renderCellContent: (cellKey: string) => React.ReactNode;
  onCellClick?: (dayOrder: number, period: number) => void;
  onClashClick?: (slotId: string) => void;
}

export default function TimetableGrid({ cells, renderCellContent, onCellClick, onClashClick }: Props) {
  return (
    <div className="overflow-x-auto border border-[#B8A98A]">
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border border-[#B8A98A] bg-[#3A0D0D] px-3 py-2 font-serif font-medium text-[#D4AF37] sticky left-0">
              Day Order
            </th>
            {PERIOD_TIMES.map((pt) => (
              <th
                key={pt.period}
                className={`border border-[#B8A98A] px-3 py-2 font-medium whitespace-nowrap ${
                  pt.period === 'BREAK' ? 'bg-[#EDE7D8] text-[#9C917A]' : 'bg-[#F1EBDE] text-[#4A4038]'
                }`}
              >
                {pt.period === 'BREAK' ? 'Break' : `Period ${pt.period}`}
                <div className="text-[11px] font-normal text-[#8A806D]">{pt.label}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAY_ORDERS.map((day, idx) => (
            <tr key={day} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAF7F1]'}>
              <td className="border border-[#B8A98A] bg-[#F6EFD6] px-3 py-3 font-serif font-medium text-center text-[#3A0D0D] sticky left-0">
                {DAY_ORDER_LABELS[day]}
              </td>
              {PERIOD_TIMES.map((pt) => {
                if (pt.period === 'BREAK') {
                  return (
                    <td
                      key="break"
                      className="border border-[#B8A98A] bg-[#EDE7D8] text-center text-[#B8A98A] text-xs"
                    >
                      —
                    </td>
                  );
                }
                const key = `${day}_${pt.period}`;
                const cell = cells[key];
                return (
                  <td
                    key={key}
                    onClick={() => {
                      if (cell?.isClash && onClashClick) onClashClick(cell.slotId);
                      else if (!cell && onCellClick) onCellClick(day, pt.period as number);
                    }}
                    className={`border border-[#B8A98A] px-2 py-3 text-center align-middle min-w-[110px] ${
                      cell?.isClash
                        ? 'bg-[#FBEAEA] border-l-4 border-l-[#8C1F1F] cursor-pointer hover:bg-[#F5D9D9]'
                        : cell
                          ? ''
                          : onCellClick
                            ? 'cursor-pointer hover:bg-[#F6EFD6]/60'
                            : ''
                    }`}
                    title={cell?.isClash ? (cell.clashReason ?? 'Clash — click to remove') : undefined}
                  >
                    {renderCellContent(key)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
