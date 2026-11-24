import React, { useState } from 'react';
import { LogSheet } from '../types';
import { isExpectedSupabaseFallbackError } from '../lib/supabaseClient';
import { Calendar, PlusCircle, AlertTriangle, ArrowRight, X, Check, Loader2, Sparkles } from 'lucide-react';

interface NewLogSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingLogSheets: LogSheet[];
  onCreate: (logDate: string, dayOrder: number) => Promise<void>;
  onOpenExisting: (logDate: string, dayOrder: number) => void;
}

export default function NewLogSheetModal({
  isOpen,
  onClose,
  existingLogSheets,
  onCreate,
  onOpenExisting
}: NewLogSheetModalProps) {
  const [logDate, setLogDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [dayOrder, setDayOrder] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  // Check if a log sheet already exists for the selected date
  const existingSheet = existingLogSheets.find(s => s.logDate === logDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existingSheet) return;

    setIsSubmitting(true);
    try {
      await onCreate(logDate, dayOrder);
      onClose();
    } catch (err) {
      if (!isExpectedSupabaseFallbackError(err)) {
        console.warn('Notice creating log sheet:', err);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const dayOrderRoman = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 select-none font-sans animate-in fade-in duration-150">
      <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-[#556B2F] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/15 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif font-bold text-base tracking-wide">Generate New Log Sheet</h3>
              <p className="text-[11px] text-white/80 font-medium">
                Auto-build day schedule &amp; workload tracker
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Attendance Date Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#161b27] uppercase tracking-wider">
              Attendance Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={logDate}
              onChange={e => setLogDate(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 border border-[#cbc4cd] rounded-lg text-sm font-semibold bg-[#faf9ff] text-[#161b27] focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20"
            />
            <p className="text-[11px] text-slate-500">
              The date for which this daily staff log and substitution schedule applies.
            </p>
          </div>

          {/* Day Order Selection */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-[#161b27] uppercase tracking-wider">
              College Day Order <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map(num => {
                const isSelected = dayOrder === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setDayOrder(num)}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-bold transition-all flex flex-col items-center justify-center gap-0.5 cursor-pointer ${
                      isSelected
                        ? 'bg-[#556B2F] border-[#556B2F] text-white shadow-xs'
                        : 'bg-[#faf9ff] border-[#cbc4cd] text-[#49454d] hover:bg-slate-100'
                    }`}
                  >
                    <span>Day Order {dayOrderRoman[num - 1]}</span>
                    <span className={`text-[9px] font-normal ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                      Day {num}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Selects the master timetable slots for all 11 classes for Day Order {dayOrderRoman[dayOrder - 1]}.
            </p>
          </div>

          {/* Duplicate Date Inline Warning / Conflict Resolution */}
          {existingSheet && (
            <div className="bg-amber-50 border border-amber-300 rounded-lg p-3.5 space-y-2 animate-in fade-in">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold text-amber-900">
                    A log sheet already exists for {logDate}!
                  </p>
                  <p className="text-amber-800 text-[11px] mt-0.5">
                    Configured as <strong>Day Order {dayOrderRoman[existingSheet.dayOrder - 1]}</strong> (Status:{' '}
                    <span className="uppercase font-semibold">{existingSheet.status}</span>).
                  </p>
                </div>
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onOpenExisting(existingSheet.logDate, existingSheet.dayOrder);
                    onClose();
                  }}
                  className="w-full py-2 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-md flex items-center justify-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
                >
                  <span>Open Existing Log Sheet</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={!!existingSheet || isSubmitting}
              className="px-5 py-2 bg-[#556B2F] hover:opacity-95 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Building Sheet...</span>
                </>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>Generate Log Sheet</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
