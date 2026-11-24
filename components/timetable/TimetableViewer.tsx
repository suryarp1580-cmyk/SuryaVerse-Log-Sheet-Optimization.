'use client';

// ============================================================================
// ACCFIN Timetable Generator — Timetable Viewer Shell (Part 4 restyle)
// ============================================================================

import { useEffect, useState, useTransition } from 'react';
import type { TTClass, TTStaff } from '@/lib/timetable/types';
import type { ClassTimetableData, StaffTimetableData } from '@/lib/timetable/grid-types';
import { getClassTimetable, getStaffTimetable } from '../../lib/timetable/view-api';
import ClassTimetableView from './ClassTimetableView';
import StaffTimetableView from './StaffTimetableView';
import { PageHeader, inputClass } from './ui';

interface Props {
  classes: TTClass[];
  staff: TTStaff[];
}

type Tab = 'class' | 'staff';

export default function TimetableViewer({ classes, staff }: Props) {
  const [tab, setTab] = useState<Tab>('class');
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '');
  const [selectedStaffId, setSelectedStaffId] = useState(staff[0]?.id ?? '');
  const [classData, setClassData] = useState<ClassTimetableData | null>(null);
  const [staffData, setStaffData] = useState<StaffTimetableData | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (tab === 'class' && selectedClassId) {
      startTransition(async () => {
        const data = await getClassTimetable(selectedClassId);
        setClassData(data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedClassId]);

  useEffect(() => {
    if (tab === 'staff' && selectedStaffId) {
      startTransition(async () => {
        const data = await getStaffTimetable(selectedStaffId);
        setStaffData(data);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedStaffId]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Step 3 of 3"
        title="Timetable"
        description="View the generated timetable by class or by staff member. Anything shown in red needs your attention."
      />

      <div className="flex gap-2 border-b border-[#E4DCC9]">
        <button
          onClick={() => setTab('class')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'class' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#8A806D] hover:text-[#4A4038]'
          }`}
        >
          Class View
        </button>
        <button
          onClick={() => setTab('staff')}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'staff' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#8A806D] hover:text-[#4A4038]'
          }`}
        >
          Staff View
        </button>
      </div>

      {tab === 'class' && (
        <div className="space-y-4">
          <select className={`${inputClass} sm:w-72`} value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </select>
          {isPending && !classData && <p className="text-sm text-[#8A806D]">Loading…</p>}
          {classData && <ClassTimetableView initialData={classData} />}
        </div>
      )}

      {tab === 'staff' && (
        <div className="space-y-4">
          <select className={`${inputClass} sm:w-72`} value={selectedStaffId} onChange={(e) => setSelectedStaffId(e.target.value)}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.short_code} — {s.full_name}
              </option>
            ))}
          </select>
          {isPending && !staffData && <p className="text-sm text-[#8A806D]">Loading…</p>}
          {staffData && <StaffTimetableView data={staffData} />}
        </div>
      )}
    </div>
  );
}
