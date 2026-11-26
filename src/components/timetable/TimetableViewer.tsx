'use client';

// ============================================================================
// ACCFIN Timetable Generator — Timetable Viewer Shell (Part 4 restyle)
// ============================================================================

import { useEffect, useState, useTransition } from 'react';
import type { TTClass, TTStaff } from '../../lib/timetable/types';
import type { ClassTimetableData, StaffTimetableData } from '../../lib/timetable/grid-types';
import {
  getAllClassTimetables,
  getClassTimetable,
  getStaffTimetable,
} from '../../lib/timetable/view-api';
import {
  downloadAllClassesTimetablePdf,
  downloadAllDayOrdersTimetablePdf,
  downloadAllStaffTimetablePdf,
} from '../../lib/timetable/export-pdf';
import { getActiveSupabaseUrl, getSupabaseProjectRef, isSupabaseConfigured } from '../../lib/supabaseClient';
import ClassTimetableView from './ClassTimetableView';
import StaffTimetableView from './StaffTimetableView';
import DayOrderTimetableView from './DayOrderTimetableView';
import { PageHeader, SecondaryButton, inputClass } from './ui';
import { AlertCircle, Download, RefreshCw, Globe, Loader2 } from 'lucide-react';

interface Props {
  classes: TTClass[];
  staff: TTStaff[];
}

type Tab = 'class' | 'staff' | 'dayOrder';

export default function TimetableViewer({ classes, staff }: Props) {
  const [tab, setTab] = useState<Tab>('class');
  const [selectedClassId, setSelectedClassId] = useState(classes[0]?.id ?? '');
  const [selectedStaffId, setSelectedStaffId] = useState(staff[0]?.id ?? '');
  const [classData, setClassData] = useState<ClassTimetableData | null>(null);
  const [staffData, setStaffData] = useState<StaffTimetableData | null>(null);
  const [dayOrderClassTimetables, setDayOrderClassTimetables] = useState<ClassTimetableData[]>([]);
  const [viewError, setViewError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [isDownloadingAllClasses, setIsDownloadingAllClasses] = useState(false);
  const [isDownloadingAllStaff, setIsDownloadingAllStaff] = useState(false);
  const [isDownloadingAllDayOrders, setIsDownloadingAllDayOrders] = useState(false);
  const [bulkDownloadStatus, setBulkDownloadStatus] = useState<{ text: string; ok: boolean } | null>(null);

  const activeUrl = getActiveSupabaseUrl();
  const projectRef = getSupabaseProjectRef(activeUrl);

  async function handleDownloadAllClasses() {
    if (isDownloadingAllClasses || classes.length === 0) return;
    setIsDownloadingAllClasses(true);
    setBulkDownloadStatus(null);
    try {
      const fileName = await downloadAllClassesTimetablePdf(classes, staff, (cid) =>
        getClassTimetable(cid, retryKey > 0)
      );
      setBulkDownloadStatus({
        text: `Downloaded ${fileName} (${classes.length} classes, 2 pages per class).`,
        ok: true,
      });
    } catch (err: any) {
      setBulkDownloadStatus({
        text: err?.message || 'Failed to download All Classes PDF.',
        ok: false,
      });
    } finally {
      setIsDownloadingAllClasses(false);
    }
  }

  async function handleDownloadAllStaff() {
    if (isDownloadingAllStaff || staff.length === 0) return;
    setIsDownloadingAllStaff(true);
    setBulkDownloadStatus(null);
    try {
      const fileName = await downloadAllStaffTimetablePdf(staff, classes, (sid) =>
        getStaffTimetable(sid, retryKey > 0)
      );
      setBulkDownloadStatus({
        text: `Downloaded ${fileName} (${staff.length} staff members, 1 per page).`,
        ok: true,
      });
    } catch (err: any) {
      setBulkDownloadStatus({
        text: err?.message || 'Failed to download All Staff PDF.',
        ok: false,
      });
    } finally {
      setIsDownloadingAllStaff(false);
    }
  }

  async function handleDownloadAllDayOrders() {
    if (isDownloadingAllDayOrders || classes.length === 0) return;
    setIsDownloadingAllDayOrders(true);
    setBulkDownloadStatus(null);
    try {
      const fileName = await downloadAllDayOrdersTimetablePdf(classes, staff, (cid) =>
        getClassTimetable(cid, retryKey > 0)
      );
      setBulkDownloadStatus({
        text: `Downloaded ${fileName} (Day Orders I–VI, 6 pages).`,
        ok: true,
      });
    } catch (err: any) {
      setBulkDownloadStatus({
        text: err?.message || 'Failed to download All Day Orders PDF.',
        ok: false,
      });
    } finally {
      setIsDownloadingAllDayOrders(false);
    }
  }

  useEffect(() => {
    if (tab === 'class' && selectedClassId) {
      setViewError(null);
      startTransition(async () => {
        try {
          const forceLive = retryKey > 0;
          const data = await getClassTimetable(selectedClassId, forceLive);
          setClassData(data);
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          // If the class is not found in database (e.g. schema cache or local fallback mock class)
          // provide a graceful empty class timetable so user doesn't hit a blocking wall
          const matchedClass = classes.find((c) => c.id === selectedClassId);
          if (matchedClass && (msg.includes('schema cache') || msg.includes('not found') || msg.includes('PGRST205'))) {
            setClassData({
              classId: matchedClass.id,
              classDisplayName: matchedClass.display_name,
              cells: {},
              unresolved: [],
              legend: [],
            });
            setViewError(msg);
          } else {
            setViewError(msg);
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedClassId, retryKey]);

  useEffect(() => {
    if (tab === 'staff' && selectedStaffId) {
      setViewError(null);
      startTransition(async () => {
        try {
          const forceLive = retryKey > 0;
          const data = await getStaffTimetable(selectedStaffId, forceLive);
          setStaffData(data);
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          const matchedStaff = staff.find((s) => s.id === selectedStaffId);
          if (matchedStaff && (msg.includes('schema cache') || msg.includes('not found') || msg.includes('PGRST205'))) {
            setStaffData({
              staffId: matchedStaff.id,
              staffName: matchedStaff.full_name,
              totalHours: 0,
              cells: {},
              legend: [],
            });
            setViewError(msg);
          } else {
            setViewError(msg);
          }
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selectedStaffId, retryKey]);

  useEffect(() => {
    if (tab === 'dayOrder' && classes.length > 0) {
      setViewError(null);
      startTransition(async () => {
        try {
          const forceLive = retryKey > 0;
          const allData = await getAllClassTimetables(classes, forceLive);
          setDayOrderClassTimetables(allData);
        } catch (err: any) {
          const msg = err instanceof Error ? err.message : String(err);
          setViewError(msg);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, retryKey, classes.length]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Step 3 — Timetable Viewer"
        title="Timetable"
        description="View the generated timetable (including Step 0 fixed periods) by class or by staff member. Anything shown in red needs your attention."
      />

      {/* Diagnostics / Error notification if Supabase schema cache or connection needs attention */}
      {viewError && (
        <div className="border border-amber-300 bg-[#FFFDF5] rounded-xl p-4 shadow-xs text-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-amber-900">
                  Supabase Schema Sync Note
                </span>
                <button
                  type="button"
                  onClick={() => setRetryKey((k) => k + 1)}
                  disabled={isPending}
                  className="px-3 py-1 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
                  <span>{isPending ? 'Connecting…' : 'Retry Live Sync'}</span>
                </button>
              </div>
              <p className="text-xs text-[#5D5348] mt-1 leading-relaxed">
                Supabase reported: <code className="px-1.5 py-0.5 bg-white border border-[#E4DCC9] rounded font-mono text-[11px] text-[#8C1F1F]">{viewError}</code>
              </p>
              <p className="text-xs text-[#5D5348] mt-1">
                Displaying interactive schedule viewer. If you just created tables or ran migrations, PostgREST schema cache updates automatically or you can click <strong>Retry Live Sync</strong>.
              </p>
              <div className="mt-2 text-[11px] text-[#7A7062] flex flex-wrap items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                <span>Target Project: <code className="bg-white px-1 py-0.5 rounded border border-[#E4DCC9]">{isSupabaseConfigured && activeUrl ? activeUrl : 'Local Workspace'}</code></span>
                {projectRef && <span>(Ref: <strong>{projectRef}</strong>)</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-2 border-b border-[#E4DCC9]">
        <button
          onClick={() => {
            setTab('class');
            setBulkDownloadStatus(null);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'class' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#8A806D] hover:text-[#4A4038]'
          }`}
        >
          Class Wise
        </button>
        <button
          onClick={() => {
            setTab('staff');
            setBulkDownloadStatus(null);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'staff' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#8A806D] hover:text-[#4A4038]'
          }`}
        >
          Staff Wise
        </button>
        <button
          onClick={() => {
            setTab('dayOrder');
            setBulkDownloadStatus(null);
          }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === 'dayOrder' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#8A806D] hover:text-[#4A4038]'
          }`}
        >
          Day Order Wise
        </button>
      </div>

      {bulkDownloadStatus && (
        <p className={`text-sm ${bulkDownloadStatus.ok ? 'text-[#3F6634]' : 'text-[#8C1F1F]'}`}>
          {bulkDownloadStatus.text}
        </p>
      )}

      {tab === 'class' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
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
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                disabled={isPending}
                title="Refresh and sync timetable directly from Supabase"
                className="p-2 border border-[#E4DCC9] bg-white text-[#4A4038] hover:bg-[#FAF7F1] rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-[#8A806D] ${isPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <SecondaryButton
              type="button"
              onClick={handleDownloadAllClasses}
              disabled={isDownloadingAllClasses || classes.length === 0}
              title="Download all class timetables in a single PDF (1 class per page)"
            >
              {isDownloadingAllClasses ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              <span>{isDownloadingAllClasses ? 'Generating All Classes…' : 'Download All Classes'}</span>
            </SecondaryButton>
          </div>
          {isPending && !classData && <p className="text-sm text-[#8A806D]">Loading schedule…</p>}
          {classData && <ClassTimetableView initialData={classData} classes={classes} staff={staff} />}
        </div>
      )}

      {tab === 'staff' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className={`${inputClass} sm:w-72`}
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.short_code} — {s.full_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                disabled={isPending}
                title="Refresh and sync timetable directly from Supabase"
                className="p-2 border border-[#E4DCC9] bg-white text-[#4A4038] hover:bg-[#FAF7F1] rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-[#8A806D] ${isPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <SecondaryButton
              type="button"
              onClick={handleDownloadAllStaff}
              disabled={isDownloadingAllStaff || staff.length === 0}
              title="Download all staff timetables in a single PDF (1 staff member per page)"
            >
              {isDownloadingAllStaff ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              <span>{isDownloadingAllStaff ? 'Generating All Staff…' : 'Download All Staff'}</span>
            </SecondaryButton>
          </div>
          {isPending && !staffData && <p className="text-sm text-[#8A806D]">Loading schedule…</p>}
          {staffData && <StaffTimetableView data={staffData} classes={classes} staff={staff} />}
        </div>
      )}

      {tab === 'dayOrder' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-[#5D5348]">
                Combined schedule across all {classes.length} classes (live generated master timetable)
              </span>
              <button
                type="button"
                onClick={() => setRetryKey((k) => k + 1)}
                disabled={isPending}
                title="Refresh and sync timetable directly from Supabase"
                className="p-2 border border-[#E4DCC9] bg-white text-[#4A4038] hover:bg-[#FAF7F1] rounded-lg transition-colors"
              >
                <RefreshCw className={`w-4 h-4 text-[#8A806D] ${isPending ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <SecondaryButton
              type="button"
              onClick={handleDownloadAllDayOrders}
              disabled={isDownloadingAllDayOrders || classes.length === 0}
              title="Download Day Orders I–VI in a single 6-page PDF (1 Day Order per page)"
            >
              {isDownloadingAllDayOrders ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-1.5" />
              )}
              <span>{isDownloadingAllDayOrders ? 'Generating All Day Orders…' : 'Download All Day Orders'}</span>
            </SecondaryButton>
          </div>
          {isPending && dayOrderClassTimetables.length === 0 && (
            <p className="text-sm text-[#8A806D]">Loading schedule…</p>
          )}
          <DayOrderTimetableView
            classTimetables={dayOrderClassTimetables}
            classes={classes}
            staff={staff}
          />
        </div>
      )}
    </div>
  );
}
