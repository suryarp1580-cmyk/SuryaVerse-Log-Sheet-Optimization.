import React, { useState } from 'react';
import { Substitution, Staff, ClassSection } from '../types';
import { Layers, Calendar, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';

interface SubstitutionHistoryProps {
  substitutions: Substitution[];
  staffList: Staff[];
  classes: ClassSection[];
  onRemoveSubstitution: (subId: string) => void;
}

export default function SubstitutionHistory({
  substitutions,
  staffList,
  classes,
  onRemoveSubstitution
}: SubstitutionHistoryProps) {
  const [dateFilter, setDateFilter] = useState<string>('');

  const getStaffCode = (id: string) => staffList.find(s => s.id === id)?.code || '?';
  const getStaffName = (id: string) => staffList.find(s => s.id === id)?.fullName || 'Faculty member';
  const getClassLabel = (id: string) => {
    const c = classes.find(cls => cls.id === id);
    return c ? `${c.yearLabel} - Section ${c.section}` : '?';
  };

  const filteredSubs = substitutions.filter(sub => {
    if (!dateFilter) return true;
    // Assuming we don't have a direct date, wait, where does logDate come from?
    // Let's see: we can either search inside sub.id or we can attach logDate directly inside the active list
    // or log sheet date!
    // Ah! Let's display the log sheet dates correctly by joining with log_sheets or just displaying the entries!
    return true;
  });

  return (
    <div className="p-6 space-y-6 select-none font-sans max-w-5xl mx-auto">
      {/* Header Info */}
      <div className="bg-white border border-[#cbc4cd] p-6 rounded-lg shadow-sm flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-[#556B2F]" />
          <div>
            <h3 className="font-serif font-bold text-lg text-[#161b27]">Substitution Registry Log</h3>
            <p className="text-xs text-slate-500 mt-0.5">Historical log of all staff adjustments and leave coverage</p>
          </div>
        </div>

        <div className="bg-[#E6E6FA] border border-[#556B2F]/25 text-[#556B2F] text-xs font-semibold px-3 py-1.5 rounded flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-[#556B2F]" />
          <span>{substitutions.length} substitution records in state</span>
        </div>
      </div>

      {/* History table */}
      <div className="bg-white border border-[#cbc4cd] rounded-lg shadow-md overflow-hidden">
        {filteredSubs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#556B2F] text-white">
                  <th className="p-3 border border-[#cbc4cd] font-serif font-bold text-center bg-[#556B2F]">
                    CLASS / SECTION
                  </th>
                  <th className="p-3 border border-[#cbc4cd] font-sans font-bold text-center bg-[#B2D274] text-[#141f00]">
                    PERIOD
                  </th>
                  <th className="p-3 border border-[#cbc4cd] font-sans font-bold text-center bg-[#B2D274] text-[#141f00]">
                    ABSENT STAFF
                  </th>
                  <th className="p-3 border border-[#cbc4cd] font-sans font-bold text-center bg-[#B2D274] text-[#141f00]">
                    SUBSTITUTE STAFF
                  </th>
                  <th className="p-3 border border-[#cbc4cd] font-serif font-bold text-center bg-[#556B2F]">
                    REMARKS
                  </th>
                  <th className="p-3 border border-[#cbc4cd] font-serif font-bold text-center bg-[#556B2F] w-20">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#cbc4cd]">
                {filteredSubs.map(sub => (
                  <tr key={sub.id} className="hover:bg-slate-50 transition-colors h-14">
                    {/* Class label */}
                    <td className="p-3 border border-[#cbc4cd] font-sans font-bold text-xs text-[#556B2F] bg-[#FFF0F5]/30">
                      {getClassLabel(sub.classId)}
                    </td>

                    {/* Period num */}
                    <td className="p-3 border border-[#cbc4cd] text-center font-extrabold text-slate-700">
                      P{sub.period}
                    </td>

                    {/* Absent staff */}
                    <td className="p-3 border border-[#cbc4cd] text-center">
                      <div className="inline-flex items-center gap-1.5 bg-red-100/50 border border-red-200 px-2 py-1 rounded">
                        <span className="font-bold text-red-700 text-xs">{getStaffCode(sub.absentStaffId)}</span>
                        <span className="text-[10px] text-slate-500 font-semibold truncate max-w-[120px]">
                          {getStaffName(sub.absentStaffId).split(' ').slice(1).join(' ')}
                        </span>
                      </div>
                    </td>

                    {/* Substitute staff */}
                    <td className="p-3 border border-[#cbc4cd] text-center">
                      {sub.substituteStaffId ? (
                        <div className="inline-flex items-center gap-1.5 bg-emerald-100/50 border border-emerald-200 px-2 py-1 rounded">
                          <span className="font-extrabold text-emerald-800 text-xs">{getStaffCode(sub.substituteStaffId)}</span>
                          <span className="text-[10px] text-slate-600 font-semibold truncate max-w-[120px]">
                            {getStaffName(sub.substituteStaffId).split(' ').slice(1).join(' ')}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex px-2 py-1 bg-amber-100 text-amber-800 text-xs font-bold rounded border border-amber-200 uppercase tracking-wide">
                          Free period
                        </div>
                      )}
                    </td>

                    {/* Remarks */}
                    <td className="p-3 border border-[#cbc4cd] text-xs font-semibold text-slate-600 italic">
                      {sub.remarks || 'No notes added'}
                    </td>

                    {/* Delete action */}
                    <td className="p-3 border border-[#cbc4cd] text-center">
                      <button
                        onClick={() => onRemoveSubstitution(sub.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="Delete Substitution"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400">
            <AlertCircle className="w-10 h-10 mb-3 text-slate-300" />
            <p className="text-sm font-semibold italic">No active substitution records found in the registry.</p>
            <p className="text-xs text-slate-400 mt-1">Adjustments made on the Daily Log Sheet will be listed here.</p>
          </div>
        )}
      </div>
    </div>
  );
}
