// ============================================================================
// ACCFIN Timetable Generator — View Data Layer (Vite port)
// Merges Step 0 Fixed Periods (LANG, ENG, LAB) into Class Timetable View
// and supports both live Supabase and resilient local storage fallback.
// ============================================================================

import { supabase, getActiveSupabaseUrl, getActiveSupabaseAnonKey } from '../supabaseClient';
import type { ClassTimetableData, StaffTimetableData, GridCell, GridCellMap } from './grid-types';
import { slotKey } from './grid-types';
import type { FixedPeriodsByClass, FormActionResult, TTClass, TTFixedPeriodSlot, TTStaff, TTWorkload } from './types';
import {
  getFixedSlotsForClass,
  mergeLabBlockStaffInSlots,
  parseFixedSlotStaffIds,
  resolveActiveClassId,
} from './fixed-periods-api';
import {
  isFixedPeriodsInitialized,
  loadFixedPeriodsMemory,
  loadGeneratedSlotsMemory,
  loadTTStaffMemory,
  loadWorkloadMemory,
} from '../memoryStorage';
import { findTTStaff } from '../staffUtils';
import { initialClasses, initialStaff } from '../../data/seedData';

function fixedTypeLabel(slotType: string): string {
  if (slotType === 'LANG') return 'Language (Fixed)';
  if (slotType === 'ENG') return 'English (Fixed)';
  return 'Lab / Practical (Fixed)';
}

function getFallbackTTClasses(): TTClass[] {
  return initialClasses.map((c, i) => ({
    id: c.id,
    code: c.id.replace('class-', ''),
    display_name: `${c.yearLabel} - ${c.section}`,
    sort_order: i + 1,
  }));
}

function getFallbackTTStaff(): TTStaff[] {
  const mem = loadTTStaffMemory() as TTStaff[];
  if (mem.length > 0) return mem;
  return initialStaff.map((s) => ({
    id: s.id,
    short_code: s.code,
    full_name: s.fullName || s.code,
    status: s.isActive ? 'ACTIVE' : 'INACTIVE',
    is_hod: false,
  }));
}

function resolveStaffMatchSet(staffId: string, staffList: TTStaff[], staffShortCode?: string): Set<string> {
  const matched = findTTStaff(staffList, staffId);
  const set = new Set<string>();
  const add = (val: string | undefined | null) => {
    const t = (val || '').trim().toUpperCase();
    if (!t) return;
    set.add(t);
    set.add(t.startsWith('STAFF-') ? t.slice(6) : `STAFF-${t}`);
  };
  add(staffId);
  add(staffShortCode);
  add(matched?.id);
  add(matched?.short_code);
  return set;
}

function mergeStep0FixedCellsAndLegend(
  classId: string,
  classCode: string,
  classDisplayName: string,
  cells: GridCellMap,
  legend: ClassTimetableData['legend'],
  fixedSlots: TTFixedPeriodSlot[],
  staffList: TTStaff[] = []
) {
  const mergedSlots = mergeLabBlockStaffInSlots(fixedSlots, staffList).slots;
  const counts: Record<string, number> = {};
  const staffLabelsByType: Record<string, Set<string>> = {};

  for (const fs of mergedSlots) {
    const key = slotKey(fs.day_order, fs.period);
    const parsedIds = parseFixedSlotStaffIds(fs, staffList);
    const resolvedStaff = parsedIds
      .map((id) => findTTStaff(staffList, id))
      .filter((s): s is TTStaff => Boolean(s));
    const staffCodes = parsedIds
      .map((id, idx) => resolvedStaff[idx]?.short_code || id.replace(/^staff-/i, ''))
      .filter(Boolean);
    const staffNames = resolvedStaff.map((s) => s.full_name).filter(Boolean);

    const staffShortCode = staffCodes.length > 0 ? staffCodes.join('/') : 'FIXED';
    const staffName = staffNames.length > 0 ? staffNames.join(', ') : 'Step 0 Fixed Period';

    if (!cells[key]) {
      cells[key] = {
        slotId: `fixed-step0-${classId}-${fs.day_order}-${fs.period}`,
        workloadId: '',
        subjectCode: fs.slot_type,
        subjectName: fixedTypeLabel(fs.slot_type),
        staffShortCode,
        staffName,
        classCode,
        classDisplayName,
        isFixed: true,
        isClash: false,
        clashReason: null,
      };
    } else if (cells[key].isFixed && staffCodes.length > 0 && (cells[key].staffShortCode === 'FIXED' || !cells[key].staffShortCode)) {
      cells[key] = {
        ...cells[key],
        staffShortCode,
        staffName,
      };
    }

    counts[fs.slot_type] = (counts[fs.slot_type] ?? 0) + 1;
    if (!staffLabelsByType[fs.slot_type]) staffLabelsByType[fs.slot_type] = new Set<string>();
    for (const code of staffCodes) {
      staffLabelsByType[fs.slot_type].add(code);
    }
  }

  for (const [stype, hrs] of Object.entries(counts)) {
    const alreadyInLegend = legend.some((l) => l.subjectCode.toUpperCase() === stype);
    if (!alreadyInLegend) {
      const assigned = staffLabelsByType[stype];
      legend.push({
        subjectCode: stype,
        subjectName: fixedTypeLabel(stype),
        hoursPerWeek: hrs,
        staffName:
          assigned && assigned.size > 0
            ? Array.from(assigned).join(', ')
            : 'College Fixed (Step 0)',
      });
    }
  }
}

async function fetchFixedPeriodsForClass(
  classId: string,
  classCode?: string,
  staffList: TTStaff[] = []
): Promise<TTFixedPeriodSlot[]> {
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const mockClasses: TTClass[] = classCode
    ? [{ id: classId, code: classCode, display_name: classCode, sort_order: 0 }]
    : [];
  const localSlots = mergeLabBlockStaffInSlots(
    getFixedSlotsForClass(memFixed, classId, mockClasses),
    staffList
  ).slots;

  try {
    const { data, error } = await supabase
      .from('tt_fixed_periods')
      .select('*')
      .eq('class_id', classId);
    if (!error && Array.isArray(data) && data.length > 0) {
      return mergeLabBlockStaffInSlots(data as TTFixedPeriodSlot[], staffList).slots;
    }
  } catch {
    // Silent fallback to local memory
  }
  return localSlots;
}

async function fetchAllFixedPeriodsForView(
  classes: TTClass[],
  staffList: TTStaff[]
): Promise<FixedPeriodsByClass> {
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const localInitialized = isFixedPeriodsInitialized();
  const hasLocal =
    localInitialized &&
    Object.values(memFixed || {}).some((arr) => Array.isArray(arr) && arr.length > 0);

  if (hasLocal) {
    const out: FixedPeriodsByClass = {};
    for (const [cid, arr] of Object.entries(memFixed)) {
      const activeCid = resolveActiveClassId(cid, classes);
      out[activeCid] = mergeLabBlockStaffInSlots(arr ?? [], staffList).slots;
    }
    return out;
  }

  try {
    const { data, error } = await supabase.from('tt_fixed_periods').select('*');
    if (!error && Array.isArray(data) && data.length > 0) {
      const out: FixedPeriodsByClass = {};
      for (const row of data as TTFixedPeriodSlot[]) {
        const activeCid = resolveActiveClassId(row.class_id, classes);
        if (!out[activeCid]) out[activeCid] = [];
        out[activeCid].push(row);
      }
      for (const cid of Object.keys(out)) {
        out[cid] = mergeLabBlockStaffInSlots(out[cid], staffList).slots;
      }
      return out;
    }
  } catch {
    // Fallback to memory
  }

  const out: FixedPeriodsByClass = {};
  for (const [cid, arr] of Object.entries(memFixed || {})) {
    const activeCid = resolveActiveClassId(cid, classes);
    out[activeCid] = mergeLabBlockStaffInSlots(arr ?? [], staffList).slots;
  }
  return out;
}

function mergeStep0StaffSlotsAndLegend(
  staffId: string,
  staffShortCode: string,
  staffName: string,
  fixedByClass: FixedPeriodsByClass,
  classes: TTClass[],
  staffList: TTStaff[],
  cells: GridCellMap,
  legend: StaffTimetableData['legend']
): number {
  const targetTokens = resolveStaffMatchSet(staffId, staffList, staffShortCode);
  let addedHours = 0;

  const groupedByClassType = new Map<
    string,
    { classDisplayName: string; subjectCode: string; subjectName: string; hoursPerWeek: number }
  >();

  for (const cls of classes) {
    const fixedSlots = mergeLabBlockStaffInSlots(
      getFixedSlotsForClass(fixedByClass, cls.id, classes),
      staffList
    ).slots;

    for (const fs of fixedSlots) {
      const parsedIds = parseFixedSlotStaffIds(fs, staffList);
      const isAssigned = parsedIds.some((id) => {
        const resolved = findTTStaff(staffList, id);
        return (
          targetTokens.has(id.trim().toUpperCase()) ||
          (resolved ? targetTokens.has(resolved.short_code.trim().toUpperCase()) : false)
        );
      });
      if (!isAssigned) continue;

      const key = slotKey(fs.day_order, fs.period);
      if (!cells[key]) {
        cells[key] = {
          slotId: fs.id || `fixed-step0-${cls.id}-${fs.day_order}-${fs.period}`,
          workloadId: '',
          subjectCode: fs.slot_type,
          subjectName: fixedTypeLabel(fs.slot_type),
          staffShortCode,
          staffName,
          classCode: cls.code,
          classDisplayName: cls.display_name,
          isFixed: true,
          isClash: false,
          clashReason: null,
        };
        addedHours += 1;
      }

      const gKey = `${cls.display_name}::${fs.slot_type}`;
      const prev = groupedByClassType.get(gKey);
      if (prev) {
        prev.hoursPerWeek += 1;
      } else {
        groupedByClassType.set(gKey, {
          classDisplayName: cls.display_name,
          subjectCode: fs.slot_type,
          subjectName: fixedTypeLabel(fs.slot_type),
          hoursPerWeek: 1,
        });
      }
    }
  }

  for (const item of groupedByClassType.values()) {
    const alreadyExists = legend.some(
      (l) =>
        l.classDisplayName === item.classDisplayName &&
        l.subjectCode.trim().toUpperCase() === item.subjectCode.trim().toUpperCase()
    );
    if (!alreadyExists) {
      legend.push(item);
    }
  }

  return addedHours;
}

export async function getClassList(): Promise<TTClass[]> {
  const { data, error } = await supabase.from('tt_classes').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getStaffList(): Promise<TTStaff[]> {
  const { data, error } = await supabase.from('tt_staff').select('*').eq('status', 'ACTIVE').order('full_name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getClassTimetable(classId: string, forceLive = false): Promise<ClassTimetableData> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        };
        const [classRes, workloadRes, slotsRes, staffRes] = await Promise.all([
          fetch(`${url}/rest/v1/tt_classes?id=eq.${classId}&select=*&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_workload?class_id=eq.${classId}&select=*,staff:tt_staff(*)&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_slots?class_id=eq.${classId}&select=*,workload:tt_workload(*,staff:tt_staff(*))&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_staff?select=*&_ts=${Date.now()}`, { headers }),
        ]);

        if (classRes.ok && workloadRes.ok && slotsRes.ok) {
          const classRows = await classRes.json();
          const classRow = classRows?.[0];
          if (classRow) {
            const workload = await workloadRes.json();
            const slots = await slotsRes.json();
            const staffList: TTStaff[] = staffRes.ok
              ? ((await staffRes.json()) as TTStaff[])
              : getFallbackTTStaff();

            const cells: GridCellMap = {};
            const placedHoursByWorkload = new Map<string, number>();

            for (const slot of slots ?? []) {
              const w = slot.workload as any;
              if (!w) continue;
              const key = slotKey(slot.day_order, slot.period);
              const cell: GridCell = {
                slotId: slot.id,
                workloadId: w.id,
                subjectCode: w.subject_code,
                subjectName: w.subject_name,
                staffShortCode: w.staff?.short_code ?? '?',
                staffName: w.staff?.full_name ?? 'Unknown',
                classCode: classRow.code,
                classDisplayName: classRow.display_name,
                isFixed: w.is_fixed,
                isClash: slot.is_clash,
                clashReason: slot.clash_reason,
              };
              cells[key] = cell;
              placedHoursByWorkload.set(w.id, (placedHoursByWorkload.get(w.id) ?? 0) + 1);
            }

            const unresolved = (workload ?? [])
              .map((w: any) => {
                const placed = placedHoursByWorkload.get(w.id) ?? 0;
                const missingHours = w.hours_per_week - placed;
                return {
                  workloadId: w.id,
                  subjectCode: w.subject_code,
                  subjectName: w.subject_name,
                  staffShortCode: w.staff?.short_code ?? '?',
                  staffName: w.staff?.full_name ?? 'Unknown',
                  missingHours,
                };
              })
              .filter((u: any) => u.missingHours > 0);

            const legend: ClassTimetableData['legend'] = (workload ?? []).map((w: any) => ({
              subjectCode: w.subject_code,
              subjectName: w.subject_name,
              hoursPerWeek: w.hours_per_week,
              staffName:
                w.staff?.full_name ?? findTTStaff(staffList, w.staff_id)?.full_name ?? 'Unknown',
            }));

            const fixedSlots = await fetchFixedPeriodsForClass(classId, classRow.code, staffList);
            mergeStep0FixedCellsAndLegend(
              classId,
              classRow.code,
              classRow.display_name,
              cells,
              legend,
              fixedSlots,
              staffList
            );

            return { classId, classDisplayName: classRow.display_name, cells, unresolved, legend };
          }
        }
      } catch {
        // Fall through to standard Supabase / local fallback
      }
    }
  }

  try {
    const [
      { data: classRow, error: classErr },
      { data: workload, error: workloadErr },
      { data: slots, error: slotsErr },
      { data: staffData },
    ] = await Promise.all([
      supabase.from('tt_classes').select('*').eq('id', classId).single(),
      supabase.from('tt_workload').select('*, staff:tt_staff(*)').eq('class_id', classId),
      supabase.from('tt_slots').select('*, workload:tt_workload(*, staff:tt_staff(*))').eq('class_id', classId),
      supabase.from('tt_staff').select('*'),
    ]);

    if (!classErr && !workloadErr && !slotsErr && classRow) {
      const staffList: TTStaff[] =
        staffData && staffData.length > 0 ? (staffData as TTStaff[]) : getFallbackTTStaff();
      const cells: GridCellMap = {};
      const placedHoursByWorkload = new Map<string, number>();

      for (const slot of slots ?? []) {
        const w = slot.workload as any;
        if (!w) continue;
        const key = slotKey(slot.day_order, slot.period);
        const cell: GridCell = {
          slotId: slot.id,
          workloadId: w.id,
          subjectCode: w.subject_code,
          subjectName: w.subject_name,
          staffShortCode: w.staff?.short_code ?? '?',
          staffName: w.staff?.full_name ?? 'Unknown',
          classCode: classRow.code,
          classDisplayName: classRow.display_name,
          isFixed: w.is_fixed,
          isClash: slot.is_clash,
          clashReason: slot.clash_reason,
        };
        cells[key] = cell;
        placedHoursByWorkload.set(w.id, (placedHoursByWorkload.get(w.id) ?? 0) + 1);
      }

      // If DB tt_slots is empty, check local generated slots snapshot
      if (!slots || slots.length === 0) {
        const localGenerated = loadGeneratedSlotsMemory().filter((s: any) => s.class_id === classId);
        for (const s of localGenerated) {
          const key = slotKey(s.day_order, s.period);
          if (!cells[key]) {
            cells[key] = {
              slotId: s.id,
              workloadId: s.workload_id,
              subjectCode: s.subject_code,
              subjectName: s.subject_name,
              staffShortCode: s.staff_short_code ?? '?',
              staffName: s.staff_full_name ?? 'Unknown',
              classCode: classRow.code,
              classDisplayName: classRow.display_name,
              isFixed: Boolean(s.is_fixed),
              isClash: Boolean(s.is_clash),
              clashReason: s.clash_reason ?? null,
            };
            placedHoursByWorkload.set(s.workload_id, (placedHoursByWorkload.get(s.workload_id) ?? 0) + 1);
          }
        }
      }

      const effectiveWorkload =
        workload && workload.length > 0
          ? workload
          : (loadWorkloadMemory()[classId] as unknown as TTWorkload[]) ?? [];

      const unresolved = effectiveWorkload
        .map((w: any) => {
          const placed = placedHoursByWorkload.get(w.id) ?? 0;
          const missingHours = w.hours_per_week - placed;
          return {
            workloadId: w.id,
            subjectCode: w.subject_code,
            subjectName: w.subject_name,
            staffShortCode: w.staff?.short_code ?? '?',
            staffName: w.staff?.full_name ?? 'Unknown',
            missingHours,
          };
        })
        .filter((u) => u.missingHours > 0);

      const legend: ClassTimetableData['legend'] = effectiveWorkload.map((w: any) => ({
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        hoursPerWeek: w.hours_per_week,
        staffName: w.staff?.full_name ?? findTTStaff(staffList, w.staff_id)?.full_name ?? 'Unknown',
      }));

      const fixedSlots = await fetchFixedPeriodsForClass(classId, classRow.code, staffList);
      mergeStep0FixedCellsAndLegend(
        classId,
        classRow.code,
        classRow.display_name,
        cells,
        legend,
        fixedSlots,
        staffList
      );

      return { classId, classDisplayName: classRow.display_name, cells, unresolved, legend };
    }
  } catch {
    // Fall back to local memory below
  }

  // Offline / Unmigrated Supabase Resilient Fallback
  const fallbackClasses = getFallbackTTClasses();
  const fallbackStaff = getFallbackTTStaff();
  const matchedCls = fallbackClasses.find(
    (c) =>
      c.id === classId ||
      c.code === classId ||
      resolveActiveClassId(classId, fallbackClasses) === c.id
  );
  const resolvedClassCode = matchedCls?.code ?? classId;
  const resolvedClassDisplayName = matchedCls?.display_name ?? classId;

  const cells: GridCellMap = {};
  const placedHoursByWorkload = new Map<string, number>();
  const localGenerated = loadGeneratedSlotsMemory().filter((s: any) => s.class_id === classId);
  const localWorkload = (loadWorkloadMemory()[classId] as unknown as TTWorkload[]) ?? [];

  for (const s of localGenerated) {
    const key = slotKey(s.day_order, s.period);
    cells[key] = {
      slotId: s.id,
      workloadId: s.workload_id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      staffShortCode: s.staff_short_code ?? '?',
      staffName: s.staff_full_name ?? 'Unknown',
      classCode: resolvedClassCode,
      classDisplayName: resolvedClassDisplayName,
      isFixed: Boolean(s.is_fixed),
      isClash: Boolean(s.is_clash),
      clashReason: s.clash_reason ?? null,
    };
    placedHoursByWorkload.set(s.workload_id, (placedHoursByWorkload.get(s.workload_id) ?? 0) + 1);
  }

  const unresolved = localWorkload
    .map((w: any) => {
      const placed = placedHoursByWorkload.get(w.id) ?? 0;
      const missingHours = w.hours_per_week - placed;
      return {
        workloadId: w.id,
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        staffShortCode: w.staff?.short_code ?? '?',
        staffName: w.staff?.full_name ?? 'Unknown',
        missingHours,
      };
    })
    .filter((u) => u.missingHours > 0);

  const legend: ClassTimetableData['legend'] = localWorkload.map((w: any) => ({
    subjectCode: w.subject_code,
    subjectName: w.subject_name,
    hoursPerWeek: w.hours_per_week,
    staffName: w.staff?.full_name ?? findTTStaff(fallbackStaff, w.staff_id)?.full_name ?? 'Unknown',
  }));

  const fixedSlots = await fetchFixedPeriodsForClass(classId, resolvedClassCode, fallbackStaff);
  mergeStep0FixedCellsAndLegend(
    classId,
    resolvedClassCode,
    resolvedClassDisplayName,
    cells,
    legend,
    fixedSlots,
    fallbackStaff
  );

  return { classId, classDisplayName: resolvedClassDisplayName, cells, unresolved, legend };
}

export async function getAllClassTimetables(
  classes: TTClass[],
  forceLive = false
): Promise<ClassTimetableData[]> {
  const sorted = [...classes].sort((a, b) => a.sort_order - b.sort_order);
  return Promise.all(sorted.map((cls) => getClassTimetable(cls.id, forceLive)));
}

export async function getStaffTimetable(staffId: string, forceLive = false): Promise<StaffTimetableData> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const headers = {
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        };
        const [staffRes, slotsRes, workloadRes, classesRes, allStaffRes] = await Promise.all([
          fetch(`${url}/rest/v1/tt_staff?id=eq.${staffId}&select=*&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_slots?select=*,workload:tt_workload(*,class:tt_classes(*))&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_workload?staff_id=eq.${staffId}&select=*,class:tt_classes(*)&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_classes?select=*&order=sort_order&_ts=${Date.now()}`, { headers }),
          fetch(`${url}/rest/v1/tt_staff?select=*&_ts=${Date.now()}`, { headers }),
        ]);

        if (staffRes.ok && slotsRes.ok && workloadRes.ok) {
          const staffRows = await staffRes.json();
          const staffRow = staffRows?.[0];
          if (staffRow) {
            const allSlots = await slotsRes.json();
            const workload = await workloadRes.json();
            const classesList: TTClass[] = classesRes.ok
              ? ((await classesRes.json()) as TTClass[])
              : getFallbackTTClasses();
            const staffList: TTStaff[] = allStaffRes.ok
              ? ((await allStaffRes.json()) as TTStaff[])
              : getFallbackTTStaff();

            const cells: GridCellMap = {};
            let totalHours = 0;

            for (const slot of allSlots ?? []) {
              const w = slot.workload as any;
              if (!w || w.staff_id !== staffId) continue;
              const key = slotKey(slot.day_order, slot.period);
              cells[key] = {
                slotId: slot.id,
                workloadId: w.id,
                subjectCode: w.subject_code,
                subjectName: w.subject_name,
                staffShortCode: staffRow.short_code ?? '',
                staffName: staffRow.full_name,
                classCode: w.class?.code ?? '',
                classDisplayName: w.class?.display_name ?? 'Unknown class',
                isFixed: w.is_fixed,
                isClash: slot.is_clash,
                clashReason: slot.clash_reason,
              };
              totalHours += 1;
            }

            const legend: StaffTimetableData['legend'] = (workload ?? []).map((w: any) => ({
              classDisplayName: w.class?.display_name ?? 'Unknown class',
              subjectCode: w.subject_code,
              subjectName: w.subject_name,
              hoursPerWeek: w.hours_per_week,
            }));

            const fixedByClass = await fetchAllFixedPeriodsForView(classesList, staffList);
            totalHours += mergeStep0StaffSlotsAndLegend(
              staffId,
              staffRow.short_code ?? '',
              staffRow.full_name,
              fixedByClass,
              classesList,
              staffList,
              cells,
              legend
            );

            return { staffId, staffName: staffRow.full_name, totalHours, cells, legend };
          }
        }
      } catch {
        // Fall through
      }
    }
  }

  try {
    const [
      { data: staffRow, error: staffErr },
      { data: slots, error: slotsErr },
      { data: workload, error: workloadErr },
      { data: classesData },
      { data: allStaffData },
    ] = await Promise.all([
      supabase.from('tt_staff').select('*').eq('id', staffId).single(),
      supabase.from('tt_slots').select('*, workload:tt_workload(*, class:tt_classes(*))').eq('workload.staff_id', staffId),
      supabase.from('tt_workload').select('*, class:tt_classes(*)').eq('staff_id', staffId),
      supabase.from('tt_classes').select('*').order('sort_order'),
      supabase.from('tt_staff').select('*'),
    ]);

    if (!staffErr && !slotsErr && !workloadErr && staffRow) {
      const classesList: TTClass[] =
        classesData && classesData.length > 0 ? (classesData as TTClass[]) : getFallbackTTClasses();
      const staffList: TTStaff[] =
        allStaffData && allStaffData.length > 0 ? (allStaffData as TTStaff[]) : getFallbackTTStaff();

      const cells: GridCellMap = {};
      let totalHours = 0;

      for (const slot of slots ?? []) {
        const w = slot.workload as any;
        if (!w || w.staff_id !== staffId) continue;
        const key = slotKey(slot.day_order, slot.period);
        cells[key] = {
          slotId: slot.id,
          workloadId: w.id,
          subjectCode: w.subject_code,
          subjectName: w.subject_name,
          staffShortCode: staffRow.short_code ?? '',
          staffName: staffRow.full_name,
          classCode: w.class?.code ?? '',
          classDisplayName: w.class?.display_name ?? 'Unknown class',
          isFixed: w.is_fixed,
          isClash: slot.is_clash,
          clashReason: slot.clash_reason,
        };
        totalHours += 1;
      }

      // If DB tt_slots is empty, also check local generated slots snapshot
      if (!slots || slots.length === 0) {
        const localGenerated = loadGeneratedSlotsMemory().filter((s: any) => s.staff_id === staffId);
        for (const s of localGenerated) {
          const key = slotKey(s.day_order, s.period);
          if (!cells[key]) {
            const matchedCls = classesList.find(
              (c) => c.id === s.class_id || resolveActiveClassId(s.class_id, classesList) === c.id
            );
            cells[key] = {
              slotId: s.id,
              workloadId: s.workload_id,
              subjectCode: s.subject_code,
              subjectName: s.subject_name,
              staffShortCode: staffRow.short_code ?? '',
              staffName: staffRow.full_name,
              classCode: matchedCls?.code ?? s.class_id,
              classDisplayName: matchedCls?.display_name ?? s.class_id,
              isFixed: Boolean(s.is_fixed),
              isClash: Boolean(s.is_clash),
              clashReason: s.clash_reason ?? null,
            };
            totalHours += 1;
          }
        }
      }

      const legend: StaffTimetableData['legend'] = (workload ?? []).map((w: any) => ({
        classDisplayName: w.class?.display_name ?? 'Unknown class',
        subjectCode: w.subject_code,
        subjectName: w.subject_name,
        hoursPerWeek: w.hours_per_week,
      }));

      const fixedByClass = await fetchAllFixedPeriodsForView(classesList, staffList);
      totalHours += mergeStep0StaffSlotsAndLegend(
        staffId,
        staffRow.short_code ?? '',
        staffRow.full_name,
        fixedByClass,
        classesList,
        staffList,
        cells,
        legend
      );

      return { staffId, staffName: staffRow.full_name, totalHours, cells, legend };
    }
  } catch {
    // Offline fallback below
  }

  const fallbackStaffList = getFallbackTTStaff();
  const fallbackClasses = getFallbackTTClasses();
  const memStaff = findTTStaff(fallbackStaffList, staffId);
  const staffName = memStaff?.full_name ?? staffId;
  const staffShortCode = memStaff?.short_code ?? staffId.replace(/^staff-/i, '');
  const staffTokens = resolveStaffMatchSet(staffId, fallbackStaffList, staffShortCode);

  const localSlots = loadGeneratedSlotsMemory().filter((s: any) => {
    const sid = String(s.staff_id || '').trim().toUpperCase();
    const scode = String(s.staff_short_code || '').trim().toUpperCase();
    return staffTokens.has(sid) || (scode ? staffTokens.has(scode) : false);
  });

  const cells: GridCellMap = {};
  let totalHours = 0;

  for (const s of localSlots) {
    const key = slotKey(s.day_order, s.period);
    const matchedCls = fallbackClasses.find(
      (c) => c.id === s.class_id || resolveActiveClassId(s.class_id, fallbackClasses) === c.id
    );
    cells[key] = {
      slotId: s.id,
      workloadId: s.workload_id,
      subjectCode: s.subject_code,
      subjectName: s.subject_name,
      staffShortCode,
      staffName,
      classCode: matchedCls?.code ?? s.class_id,
      classDisplayName: matchedCls?.display_name ?? s.class_id,
      isFixed: Boolean(s.is_fixed),
      isClash: Boolean(s.is_clash),
      clashReason: s.clash_reason ?? null,
    };
    totalHours += 1;
  }

  // Group regular generated slots into legend rows
  const legendMap = new Map<
    string,
    { classDisplayName: string; subjectCode: string; subjectName: string; hoursPerWeek: number }
  >();
  for (const cell of Object.values(cells)) {
    const gKey = `${cell.classDisplayName}::${cell.subjectCode}`;
    const existing = legendMap.get(gKey);
    if (existing) {
      existing.hoursPerWeek += 1;
    } else {
      legendMap.set(gKey, {
        classDisplayName: cell.classDisplayName,
        subjectCode: cell.subjectCode,
        subjectName: cell.subjectName || cell.subjectCode,
        hoursPerWeek: 1,
      });
    }
  }
  const legend: StaffTimetableData['legend'] = Array.from(legendMap.values());

  const fixedByClass = await fetchAllFixedPeriodsForView(fallbackClasses, fallbackStaffList);
  totalHours += mergeStep0StaffSlotsAndLegend(
    staffId,
    staffShortCode,
    staffName,
    fixedByClass,
    fallbackClasses,
    fallbackStaffList,
    cells,
    legend
  );

  return { staffId, staffName, totalHours, cells, legend };
}

export async function manuallyPlaceSlot(
  classId: string,
  dayOrder: number,
  period: number,
  workloadId: string
): Promise<FormActionResult> {
  // Block placement into Step 0 Fixed Period slots
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const fixedForClass = getFixedSlotsForClass(memFixed, classId);
  const step0Match = fixedForClass.find(
    (s) => s.day_order === dayOrder && s.period === period
  );
  if (step0Match) {
    return {
      success: false,
      message: `Day Order ${dayOrder}, Period ${period} is locked as ${step0Match.slot_type} in Step 0. Choose an open slot instead.`,
    };
  }

  const { data: existing, error: existingErr } = await supabase
    .from('tt_slots')
    .select('id')
    .eq('class_id', classId)
    .eq('day_order', dayOrder)
    .eq('period', period)
    .maybeSingle();

  if (existingErr) return { success: false, message: `Could not check slot: ${existingErr.message}` };
  if (existing) return { success: false, message: 'That slot is already occupied. Remove it first, then place here.' };

  const { data: workloadRow, error: workloadErr } = await supabase
    .from('tt_workload')
    .select('*')
    .eq('id', workloadId)
    .single();

  if (workloadErr || !workloadRow) return { success: false, message: 'Could not find that subject.' };

  const { data: staffConflicts, error: conflictErr } = await supabase
    .from('tt_slots')
    .select('id, class_id, workload:tt_workload!inner(staff_id)')
    .eq('day_order', dayOrder)
    .eq('period', period)
    .eq('workload.staff_id', workloadRow.staff_id)
    .neq('class_id', classId);

  if (conflictErr) return { success: false, message: `Could not check for clashes: ${conflictErr.message}` };

  const isClash = (staffConflicts?.length ?? 0) > 0;
  const clashReason = isClash
    ? `This staff member is already teaching a different class at Day Order ${dayOrder}, Period ${period}.`
    : null;

  const { error: insertErr } = await supabase.from('tt_slots').insert({
    class_id: classId,
    day_order: dayOrder,
    period: period,
    workload_id: workloadId,
    is_clash: isClash,
    clash_reason: clashReason,
  });

  if (insertErr) return { success: false, message: `Failed to place: ${insertErr.message}` };

  if (isClash && staffConflicts) {
    const counterpartIds = staffConflicts.map((c) => c.id);
    const { error: counterpartErr } = await supabase
      .from('tt_slots')
      .update({
        is_clash: true,
        clash_reason: `This staff member is also placed into a different class at Day Order ${dayOrder}, Period ${period}.`,
      })
      .in('id', counterpartIds);
    if (counterpartErr) {
      return {
        success: true,
        message: `Placed, but this creates a staff clash — shown in red. (Note: the other class's cell may not have been re-flagged: ${counterpartErr.message})`,
      };
    }
  }

  return {
    success: true,
    message: isClash
      ? 'Placed, but this creates a staff clash — shown in red on both classes involved. Move it to resolve.'
      : 'Placed successfully.',
  };
}

export async function removeSlot(slotId: string): Promise<FormActionResult> {
  const { data: removedSlot, error: fetchErr } = await supabase
    .from('tt_slots')
    .select('id, day_order, period, class_id, workload:tt_workload(staff_id)')
    .eq('id', slotId)
    .maybeSingle();

  if (fetchErr) return { success: false, message: `Could not look up slot: ${fetchErr.message}` };

  const { error } = await supabase.from('tt_slots').delete().eq('id', slotId);
  if (error) return { success: false, message: `Failed to remove: ${error.message}` };

  const staffId = (removedSlot?.workload as any)?.staff_id;
  if (removedSlot && staffId) {
    const { data: remaining, error: remainingErr } = await supabase
      .from('tt_slots')
      .select('id, workload:tt_workload!inner(staff_id)')
      .eq('day_order', removedSlot.day_order)
      .eq('period', removedSlot.period)
      .eq('workload.staff_id', staffId);

    if (!remainingErr && remaining && remaining.length <= 1) {
      const remainingIds = remaining.map((r) => r.id);
      if (remainingIds.length > 0) {
        await supabase.from('tt_slots').update({ is_clash: false, clash_reason: null }).in('id', remainingIds);
      }
    }
  }

  return { success: true, message: 'Removed.' };
}
