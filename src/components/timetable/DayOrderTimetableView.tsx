import { useMemo, useState } from 'react';
import { DAY_ORDERS, DAY_ORDER_LABELS, PERIOD_TIMES } from '../../lib/timetable/constants';
import type { ClassTimetableData } from '../../lib/timetable/grid-types';
import type { TTClass, TTStaff } from '../../lib/timetable/types';
import {
  buildDayOrderTimetableData,
  downloadDayOrderTimetablePdf,
} from '../../lib/timetable/export-pdf';
import { formatDayOrderCellLabel } from './TimetablePdfTemplates';
import { PrimaryButton } from './ui';
import { Download, Loader2 } from 'lucide-react';

interface Props {
  classTimetables: ClassTimetableData[];
  classes: TTClass[];
  staff: TTStaff[];
}

export default function DayOrderTimetableView({ classTimetables, classes, staff }: Props) {
  const [activeDayOrder, setActiveDayOrder] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const dayOrderData = useMemo(
    () => buildDayOrderTimetableData(activeDayOrder, classTimetables, classes, staff),
    [activeDayOrder, classTimetables, classes, staff]
  );

  const dayRoman = DAY_ORDER_LABELS[activeDayOrder] || String(activeDayOrder);

  async function handleDownload() {
    if (isDownloading) return;
    setIsDownloading(true);
    setStatusMessage(null);
    try {
      const fileName = await downloadDayOrderTimetablePdf(dayOrderData);
      setStatusMessage({ text: `Downloaded ${fileName} to your PC.`, ok: true });
    } catch (err: any) {
      setStatusMessage({
        text: err?.message || `Failed to download Day Order ${dayRoman} PDF.`,
        ok: false,
      });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Six Day Order Sub-Tabs (I to VI) + Single Day Order PDF Button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Day Order Tabs">
          {DAY_ORDERS.map((day) => {
            const active = day === activeDayOrder;
            return (
              <button
                key={day}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setActiveDayOrder(day);
                  setStatusMessage(null);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                  active
                    ? 'bg-[#3A0D0D] text-white border-[#3A0D0D] shadow-2xs'
                    : 'bg-white text-[#4A4038] border-[#E4DCC9] hover:bg-[#FAF7F1]'
                }`}
              >
                Day Order {DAY_ORDER_LABELS[day]}
              </button>
            );
          })}
        </div>

        <PrimaryButton
          type="button"
          onClick={handleDownload}
          disabled={isDownloading || dayOrderData.rows.length === 0}
          title={`Download Day Order ${dayRoman} as 1-page PDF`}
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-1.5" />
          )}
          <span>{isDownloading ? 'Generating PDF…' : 'Download Day Order (PDF)'}</span>
        </PrimaryButton>
      </div>

      {statusMessage && (
        <p className={`text-sm ${statusMessage.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'}`}>
          {statusMessage.text}
        </p>
      )}

      {/* Master Day Order Grid (All 11 classes, matching Daily Log Sheet layout) */}
      <div className="w-full bg-white border border-[#cbc4cd] shadow-sm overflow-hidden rounded-md">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left min-w-[900px]">
            <thead>
              <tr className="bg-[#556B2F] text-white select-none">
                <th className="p-2.5 border-r border-[#cbc4cd] font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-44">
                  CLASS SECTION
                </th>
                {PERIOD_TIMES.map((pt) =>
                  pt.period === 'BREAK' ? (
                    <th
                      key="hdr-brk"
                      className="p-1 border-r border-[#cbc4cd] w-14 bg-[#E6E6FA] text-center text-[#161b27]"
                    >
                      <div className="font-bold text-[10px] tracking-wider uppercase">BREAK</div>
                      <div className="text-[8px] font-bold text-slate-600 mt-0.5 whitespace-nowrap">
                        11.00-11.30
                      </div>
                    </th>
                  ) : (
                    <th
                      key={`hdr-p${pt.period}`}
                      className="p-2 border-r border-[#cbc4cd] font-sans text-xs text-center bg-[#B2D274] text-[#141f00]"
                    >
                      <div className="font-bold tracking-tight">PERIOD {pt.period}</div>
                      <div className="text-[9px] opacity-90 font-bold mt-0.5 whitespace-nowrap">
                        {pt.label.replace('–', ' TO ')}
                      </div>
                    </th>
                  )
                )}
                <th className="p-2.5 font-serif text-xs font-bold tracking-wider text-center bg-[#556B2F] w-24">
                  ROOM
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#cbc4cd]">
              {dayOrderData.rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-sm text-[#8A806D]">
                    No classes available for Day Order {dayRoman}.
                  </td>
                </tr>
              ) : (
                dayOrderData.rows.map((row, rIdx) => (
                  <tr key={row.classId} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2.5 border-r border-[#cbc4cd] bg-[#FFF0F5] text-[#161b27] font-serif font-bold text-xs whitespace-nowrap">
                      {row.classDisplayName}
                    </td>

                    {PERIOD_TIMES.map((pt) => {
                      if (pt.period === 'BREAK') {
                        if (rIdx !== 0) return null;
                        return (
                          <td
                            key="merged-break"
                            rowSpan={dayOrderData.rows.length}
                            className="p-0 border-r border-[#cbc4cd] bg-[#d5d9ea]/20 select-none text-center align-middle"
                          >
                            <div className="flex flex-col items-center justify-center text-[10px] font-extrabold text-blue-700 leading-none tracking-widest gap-1.5">
                              <span>B</span>
                              <span>R</span>
                              <span>E</span>
                              <span>A</span>
                              <span>K</span>
                            </div>
                          </td>
                        );
                      }

                      const cell = row.periods[pt.period as number] ?? null;
                      const label = formatDayOrderCellLabel(cell);
                      const isStep0Fixed = Boolean(cell?.isFixed);

                      return (
                        <td
                          key={`${row.classId}-p${pt.period}`}
                          className={`px-2 py-2.5 border-r border-[#cbc4cd] text-center text-xs font-semibold ${
                            isStep0Fixed
                              ? 'bg-[#F6EFD6]/55 text-[#3A0D0D]'
                              : 'bg-white text-[#161b27]'
                          }`}
                        >
                          {label || <span className="text-slate-300 font-normal">—</span>}
                        </td>
                      );
                    })}

                    <td className="px-2 py-2.5 text-center font-sans font-extrabold text-xs text-[#161b27] bg-[#F5F4F0] whitespace-nowrap">
                      {row.roomNo || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
