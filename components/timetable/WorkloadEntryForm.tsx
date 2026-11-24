'use client';

// ============================================================================
// ACCFIN Timetable Generator — Workload Entry Form (Part 4 restyle)
// ----------------------------------------------------------------------------
// Same logic as Part 1/2 — pick a class, add subject rows, mark language
// hours as Fixed with a Day Order + Period. Only the visual layer changed:
// now uses the shared design system (components/timetable/ui.tsx).
// ============================================================================

import { useState, useTransition } from 'react';
import type { TTClass, TTStaff, TTWorkload } from '@/lib/timetable/types';
import { DAY_ORDERS, DAY_ORDER_LABELS, PERIODS, DEFAULT_FIXED_SUBJECT_CODES, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK } from '@/lib/timetable/constants';
import { addWorkloadEntry, deleteWorkloadEntry } from '../../lib/timetable/workload-api';
import { PageHeader, Panel, StatusBanner, PrimaryButton, Badge, inputClass, labelClass } from './ui';

interface Props {
  classes: TTClass[];
  staff: TTStaff[];
  initialWorkloadByClass: Record<string, TTWorkload[]>;
}

export default function WorkloadEntryForm({ classes, staff, initialWorkloadByClass }: Props) {
  const [selectedClassId, setSelectedClassId] = useState<string>(classes[0]?.id ?? '');
  const [workloadByClass, setWorkloadByClass] = useState(initialWorkloadByClass);
  const [isPending, startTransition] = useTransition();
  const [statusMessage, setStatusMessage] = useState<{ text: string; ok: boolean } | null>(null);

  const [subjectCode, setSubjectCode] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState('');
  const [staffId, setStaffId] = useState('');
  const [isFixed, setIsFixed] = useState(false);
  const [fixedDayOrder, setFixedDayOrder] = useState('');
  const [fixedPeriod, setFixedPeriod] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const currentWorkload = workloadByClass[selectedClassId] ?? [];
  const currentTotalHours = currentWorkload.reduce((sum, w) => sum + w.hours_per_week, 0);
  const remainingHours = TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - currentTotalHours;

  function resetRowInputs() {
    setSubjectCode('');
    setSubjectName('');
    setHoursPerWeek('');
    setStaffId('');
    setIsFixed(false);
    setFixedDayOrder('');
    setFixedPeriod('');
    setFieldErrors({});
  }

  function handleSubjectCodeBlur() {
    if (DEFAULT_FIXED_SUBJECT_CODES.includes(subjectCode.trim().toUpperCase())) {
      setIsFixed(true);
    }
  }

  function handleAddRow() {
    if (!selectedClassId) {
      setStatusMessage({ text: 'Select a class first.', ok: false });
      return;
    }

    if (isFixed && (!fixedDayOrder || !fixedPeriod)) {
      setFieldErrors({ fixedSlot: 'Select both a Day Order and a Period for a fixed subject.' });
      return;
    }

    startTransition(async () => {
      const result = await addWorkloadEntry({
        classId: selectedClassId,
        subjectCode,
        subjectName,
        hoursPerWeek: Number(hoursPerWeek),
        staffId,
        isFixed,
        fixedDayOrder: isFixed ? Number(fixedDayOrder) : null,
        fixedPeriod: isFixed ? Number(fixedPeriod) : null,
      });

      setStatusMessage({ text: result.message, ok: result.success });
      setFieldErrors(result.fieldErrors ?? {});

      if (result.success) {
        const matchedStaff = staff.find((s) => s.id === staffId);
        const newRow: TTWorkload = {
          id: crypto.randomUUID(),
          class_id: selectedClassId,
          subject_code: subjectCode.trim().toUpperCase(),
          subject_name: subjectName.trim().toUpperCase(),
          hours_per_week: Number(hoursPerWeek),
          staff_id: staffId,
          is_fixed: isFixed,
          fixed_day_order: isFixed ? Number(fixedDayOrder) : null,
          fixed_period: isFixed ? Number(fixedPeriod) : null,
          staff: matchedStaff,
        };
        setWorkloadByClass((prev) => ({
          ...prev,
          [selectedClassId]: [...(prev[selectedClassId] ?? []), newRow],
        }));
        resetRowInputs();
      }
    });
  }

  function handleDeleteRow(workloadId: string) {
    startTransition(async () => {
      const result = await deleteWorkloadEntry(workloadId);
      setStatusMessage({ text: result.message, ok: result.success });
      if (result.success) {
        setWorkloadByClass((prev) => ({
          ...prev,
          [selectedClassId]: (prev[selectedClassId] ?? []).filter((w) => w.id !== workloadId),
        }));
      }
    });
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Step 1 of 3"
        title="Workload Entry"
        description="Add each subject taught in a class, its weekly hours, and the assigned staff member. Mark language subjects (English / Tamil) as Fixed and give them the Day Order + Period the college already uses — these are skipped by the auto-generator."
      />

      <div>
        <label className={labelClass}>Class</label>
        <select
          className={`${inputClass} sm:w-72`}
          value={selectedClassId}
          onChange={(e) => setSelectedClassId(e.target.value)}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.display_name}
            </option>
          ))}
        </select>
      </div>

      <StatusBanner tone={remainingHours < 0 ? 'danger' : remainingHours === 0 ? 'success' : 'warning'}>
        <strong>{currentTotalHours}</strong> of <strong>{TOTAL_SCHEDULABLE_SLOTS_PER_WEEK}</strong> weekly slots
        allotted
        {remainingHours >= 0 ? ` — ${remainingHours} remaining.` : ` — ${-remainingHours} over the limit.`}
      </StatusBanner>

      <Panel className="p-4 space-y-4 bg-[#FAF7F1]">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Subject short code</label>
            <input
              type="text"
              placeholder="e.g. BI, HRM, ENG"
              className={`${inputClass} uppercase`}
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
              onBlur={handleSubjectCodeBlur}
            />
            {fieldErrors.subjectCode && <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.subjectCode}</p>}
          </div>

          <div>
            <label className={labelClass}>Full subject name</label>
            <input
              type="text"
              placeholder="e.g. BANKING AND INSURANCE"
              className={inputClass}
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
            />
            {fieldErrors.subjectName && <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.subjectName}</p>}
          </div>

          <div>
            <label className={labelClass}>Hours per week</label>
            <input
              type="number"
              min={1}
              max={30}
              placeholder="e.g. 5"
              className={inputClass}
              value={hoursPerWeek}
              onChange={(e) => setHoursPerWeek(e.target.value)}
            />
            {fieldErrors.hoursPerWeek && <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.hoursPerWeek}</p>}
          </div>

          <div>
            <label className={labelClass}>Staff</label>
            <select className={inputClass} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">Select staff…</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.short_code} — {s.full_name}
                  {s.is_hod ? ' (HOD)' : ''}
                </option>
              ))}
            </select>
            {fieldErrors.staffId && <p className="text-xs text-[#8C1F1F] mt-1">{fieldErrors.staffId}</p>}
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-[#4A4038]">
          <input
            type="checkbox"
            className="rounded border-[#C9BEA4] text-[#3A0D0D] focus:ring-[#3A0D0D]/30"
            checked={isFixed}
            onChange={(e) => setIsFixed(e.target.checked)}
          />
          Fixed / language hour (placed manually, excluded from auto-generation)
        </label>

        {isFixed && (
          <div className="grid grid-cols-2 gap-4 border border-[#D4AF37] bg-[#F6EFD6] p-3">
            <div>
              <label className={labelClass}>Day Order</label>
              <select className={inputClass} value={fixedDayOrder} onChange={(e) => setFixedDayOrder(e.target.value)}>
                <option value="">Select…</option>
                {DAY_ORDERS.map((d) => (
                  <option key={d} value={d}>
                    {DAY_ORDER_LABELS[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Period</label>
              <select className={inputClass} value={fixedPeriod} onChange={(e) => setFixedPeriod(e.target.value)}>
                <option value="">Select…</option>
                {PERIODS.map((p) => (
                  <option key={p} value={p}>
                    Period {p}
                  </option>
                ))}
              </select>
            </div>
            {fieldErrors.fixedSlot && <p className="col-span-2 text-xs text-[#8C1F1F]">{fieldErrors.fixedSlot}</p>}
          </div>
        )}

        <PrimaryButton type="button" onClick={handleAddRow} disabled={isPending}>
          {isPending ? 'Saving…' : 'Add subject'}
        </PrimaryButton>

        {statusMessage && (
          <p className={`text-sm ${statusMessage.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'}`}>{statusMessage.text}</p>
        )}
      </Panel>

      <Panel>
        <table className="min-w-full divide-y divide-[#E4DCC9] text-sm">
          <thead className="bg-[#F1EBDE]">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Code</th>
              <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Subject</th>
              <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Hours</th>
              <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Staff</th>
              <th className="px-4 py-2 text-left font-medium text-[#4A4038]">Fixed</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE7D8] bg-white">
            {currentWorkload.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-[#9C917A]">
                  No subjects added yet for this class.
                </td>
              </tr>
            )}
            {currentWorkload.map((w) => (
              <tr
                key={w.id}
                className="transition-opacity duration-300 ease-out animate-[fadeIn_300ms_ease-in-out]"
                style={{ animation: 'fadeIn 300ms ease-in-out' }}
              >
                <td className="px-4 py-2 font-medium tracking-wide">{w.subject_code}</td>
                <td className="px-4 py-2">{w.subject_name}</td>
                <td className="px-4 py-2">{w.hours_per_week}</td>
                <td className="px-4 py-2">{w.staff ? `${w.staff.short_code} — ${w.staff.full_name}` : '—'}</td>
                <td className="px-4 py-2">
                  {w.is_fixed ? (
                    <Badge tone="gold">
                      Fixed · DO{w.fixed_day_order} P{w.fixed_period}
                    </Badge>
                  ) : (
                    <span className="text-[#B8A98A]">—</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => handleDeleteRow(w.id)}
                    disabled={isPending}
                    className="text-[#8C1F1F] hover:underline text-xs font-medium"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(2px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
