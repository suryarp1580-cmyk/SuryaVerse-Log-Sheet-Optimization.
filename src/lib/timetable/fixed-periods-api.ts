// ============================================================================
// ACCFIN Timetable Generator — Step 0 Fixed Periods Data Layer
// Manages college-mandated fixed slots (LANG, ENG, LAB) per class/section
// before Workload Entry and Auto-Generation.
// Persists immediately to local memory and synchronizes with Supabase
// (`tt_fixed_periods`), with automatic one-time migration of legacy fixed rows
// and sensible AMJC ACCFIN year-group defaults.
// ============================================================================

import { supabase, isExpectedSupabaseFallbackError } from '../supabaseClient';
import { rawTimetable } from '../../data/seedData';
import {
  isFixedPeriodsInitialized,
  loadFixedPeriodsMemory,
  saveFixedPeriodsMemory,
  loadWorkloadMemory,
} from '../memoryStorage';
import type {
  FixedPeriodType,
  FixedPeriodsByClass,
  TTClass,
  TTFixedPeriodSlot,
  TTWorkload,
} from './types';

function normalizeClassToken(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/^CLASS-/, '')
    .replace(/-AF-/, '-')
    .replace(/-AF$/, '')
    .replace(/\s+/g, '-');
}

/**
 * Matches a raw classId/code (such as "class-I-BCOM-AF-A", "I-BCOM-A", or a UUID)
 * to the active TTClass.id in the current session.
 */
export function resolveActiveClassId(rawClassKey: string, classes: TTClass[]): string {
  if (!rawClassKey) return rawClassKey;
  const direct = classes.find((c) => c.id === rawClassKey || c.code === rawClassKey);
  if (direct) return direct.id;

  const targetToken = normalizeClassToken(rawClassKey);
  const byToken = classes.find(
    (c) =>
      normalizeClassToken(c.id) === targetToken ||
      normalizeClassToken(c.code) === targetToken ||
      normalizeClassToken(c.display_name.replace(/\s*-\s*/g, '-')) === targetToken
  );
  return byToken ? byToken.id : rawClassKey;
}

/**
 * Helper to look up fixed period slots for a specific classId (tolerant to ID vs code variants).
 */
export function getFixedSlotsForClass(
  fixedByClass: FixedPeriodsByClass,
  classId: string,
  classes: TTClass[] = []
): TTFixedPeriodSlot[] {
  if (!fixedByClass || !classId) return [];
  if (Array.isArray(fixedByClass[classId])) {
    return fixedByClass[classId];
  }
  const targetToken = normalizeClassToken(classId);
  const matchedClass = classes.find((c) => c.id === classId);
  const codeToken = matchedClass ? normalizeClassToken(matchedClass.code) : targetToken;

  for (const [k, list] of Object.entries(fixedByClass)) {
    const kt = normalizeClassToken(k);
    if (kt === targetToken || kt === codeToken) {
      return Array.isArray(list) ? list : [];
    }
  }
  return [];
}

/**
 * Checks whether a year group normally uses LANG & ENG (I & II B.COM AF) vs Lab-only (III B.COM AF, PG).
 */
export function getYearGroupPolicy(groupIdOrCode: string): {
  allowsLangEngByDefault: boolean;
  hasLabDefault: boolean;
  hintText: string;
} {
  const upper = groupIdOrCode.toUpperCase();
  const isFirstOrSecondUG =
    (upper.startsWith('I-BCOM') || upper.startsWith('II-BCOM')) && !upper.startsWith('III-BCOM');
  const isPG = upper.includes('MCOM');

  if (isFirstOrSecondUG) {
    return {
      allowsLangEngByDefault: true,
      hasLabDefault: upper.startsWith('I-BCOM'),
      hintText:
        'I & II B.COM AF typically have college-set LANG and ENG hours (plus optional LAB/Practical slots).',
    };
  }
  if (isPG) {
    return {
      allowsLangEngByDefault: false,
      hasLabDefault: upper.includes('II-MCOM'),
      hintText:
        'PG classes (I & II M.COM AF) do not have LANG/ENG — typically only LAB / Practical hours are fixed here.',
    };
  }
  return {
    allowsLangEngByDefault: false,
    hasLabDefault: false,
    hintText:
      'III B.COM AF does not have LANG/ENG — leave open or mark optional LAB / Practical fixed slots only.',
  };
}

function inferFixedTypeFromSubjectCode(subjectCode: string): FixedPeriodType {
  const code = (subjectCode || '').trim().toUpperCase();
  if (code.startsWith('ENG')) return 'ENG';
  if (code.includes('LAB') || code === 'CAB' || code === 'SEC') return 'LAB';
  return 'LANG';
}

/**
 * Builds canonical AMJ College defaults for a single class from rawTimetable.
 * - I & II B.COM AF: LANG, ENG, and LAB (where marked isLab)
 * - III B.COM AF & I M.COM AF: none (30h open for subjects)
 * - II M.COM AF: LAB slots (CAB practicals)
 */
export function buildDefaultFixedSlotsForClass(classObj: TTClass): TTFixedPeriodSlot[] {
  const targetToken = normalizeClassToken(classObj.code || classObj.id);
  const matchingRawKey = Object.keys(rawTimetable).find(
    (k) => normalizeClassToken(k) === targetToken
  );
  if (!matchingRawKey) return [];

  const dayMap = rawTimetable[matchingRawKey];
  const slots: TTFixedPeriodSlot[] = [];

  for (const [dayStr, periods] of Object.entries(dayMap)) {
    const dayOrder = parseInt(dayStr, 10);
    periods.forEach((rawPeriod, idx) => {
      const period = idx + 1;
      const subj = (rawPeriod.subject || '').toUpperCase();
      let slotType: FixedPeriodType | null = null;
      if (subj === 'LANG' || subj === 'TAM') {
        slotType = 'LANG';
      } else if (subj === 'ENG') {
        slotType = 'ENG';
      } else if (rawPeriod.isLab || subj.includes('LAB') || subj === 'CAB') {
        slotType = 'LAB';
      }

      if (slotType) {
        slots.push({
          class_id: classObj.id,
          day_order: dayOrder,
          period,
          slot_type: slotType,
        });
      }
    });
  }

  return slots;
}

/**
 * Re-keys a FixedPeriodsByClass dictionary so every entry's class_id uses active TTClass IDs.
 */
function normalizeFixedPeriodsMap(
  rawMap: Record<string, any[]>,
  classes: TTClass[]
): FixedPeriodsByClass {
  const normalized: FixedPeriodsByClass = {};
  for (const c of classes) {
    normalized[c.id] = [];
  }

  for (const [rawCid, rawSlots] of Object.entries(rawMap || {})) {
    if (!Array.isArray(rawSlots)) continue;
    const activeCid = resolveActiveClassId(rawCid, classes);
    if (!normalized[activeCid]) normalized[activeCid] = [];

    for (const s of rawSlots) {
      if (!s || !s.day_order || !s.period || !s.slot_type) continue;
      const existingIdx = normalized[activeCid].findIndex(
        (x) => x.day_order === Number(s.day_order) && x.period === Number(s.period)
      );
      const cleanSlot: TTFixedPeriodSlot = {
        id: s.id,
        class_id: activeCid,
        day_order: Number(s.day_order),
        period: Number(s.period),
        slot_type: s.slot_type as FixedPeriodType,
        assigned_staff_id: s.assigned_staff_id ?? s.assignedStaffId ?? null,
      };
      if (existingIdx >= 0) {
        normalized[activeCid][existingIdx] = cleanSlot;
      } else {
        normalized[activeCid].push(cleanSlot);
      }
    }
  }

  return normalized;
}

/**
 * Loads all Step 0 fixed periods from Supabase + local persistent memory.
 * On first run (or before Step 0 was ever initialized), automatically migrates any
 * legacy `is_fixed` workload rows / `tt_fixed_slots` entries and seeds AMJC defaults.
 */
export async function getAllFixedPeriods(
  classes: TTClass[],
  workloadByClass?: Record<string, TTWorkload[]>
): Promise<FixedPeriodsByClass> {
  // 1. Try loading from Supabase `tt_fixed_periods`
  let dbRows: TTFixedPeriodSlot[] | null = null;
  try {
    const { data, error } = await supabase.from('tt_fixed_periods').select('*');
    if (!error && Array.isArray(data)) {
      dbRows = data as TTFixedPeriodSlot[];
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Error fetching tt_fixed_periods:', err);
    }
  }

  const localInitialized = isFixedPeriodsInitialized();
  const localMem = loadFixedPeriodsMemory();

  // If DB already has rows and local wasn't customized yet, use DB rows
  if (dbRows && dbRows.length > 0 && !localInitialized) {
    const grouped: Record<string, TTFixedPeriodSlot[]> = {};
    for (const row of dbRows) {
      if (!grouped[row.class_id]) grouped[row.class_id] = [];
      grouped[row.class_id].push(row);
    }
    const normalized = normalizeFixedPeriodsMap(grouped, classes);
    saveFixedPeriodsMemory(normalized);
    return normalized;
  }

  // If local was initialized, prefer local (and merge DB if local is empty while DB has rows)
  if (localInitialized) {
    const normalizedLocal = normalizeFixedPeriodsMap(localMem, classes);
    const totalLocal = Object.values(normalizedLocal).reduce((sum, arr) => sum + arr.length, 0);
    if (totalLocal === 0 && dbRows && dbRows.length > 0) {
      const grouped: Record<string, TTFixedPeriodSlot[]> = {};
      for (const row of dbRows) {
        if (!grouped[row.class_id]) grouped[row.class_id] = [];
        grouped[row.class_id].push(row);
      }
      const normalizedDb = normalizeFixedPeriodsMap(grouped, classes);
      saveFixedPeriodsMemory(normalizedDb);
      return normalizedDb;
    }
    // Re-save if class IDs changed (e.g. switched between offline IDs and DB UUIDs)
    saveFixedPeriodsMemory(normalizedLocal);
    return normalizedLocal;
  }

  // 2. First-run Initialization:
  //    (a) Start with AMJC defaults per class
  //    (b) Merge any legacy `tt_workload` `is_fixed` + `tt_fixed_slots` entries so existing work isn't lost
  const initialMap: FixedPeriodsByClass = {};
  for (const c of classes) {
    initialMap[c.id] = buildDefaultFixedSlotsForClass(c);
  }

  const allWorkload = workloadByClass ?? (loadWorkloadMemory() as Record<string, TTWorkload[]>);
  let legacyFixedSlots: Array<{ workload_id: string; day_order: number; period: number }> = [];
  try {
    const { data, error } = await supabase.from('tt_fixed_slots').select('workload_id, day_order, period');
    if (!error && Array.isArray(data)) {
      legacyFixedSlots = data;
    }
  } catch {
    // Non-fatal
  }

  const slotsByWorkloadId = new Map<string, Array<{ day_order: number; period: number }>>();
  for (const fs of legacyFixedSlots) {
    const arr = slotsByWorkloadId.get(fs.workload_id) ?? [];
    arr.push({ day_order: fs.day_order, period: fs.period });
    slotsByWorkloadId.set(fs.workload_id, arr);
  }

  for (const [rawCid, rows] of Object.entries(allWorkload || {})) {
    if (!Array.isArray(rows)) continue;
    const activeCid = resolveActiveClassId(rawCid, classes);
    if (!initialMap[activeCid]) initialMap[activeCid] = [];

    for (const w of rows) {
      if (!w || !w.is_fixed) continue;
      const slotType = inferFixedTypeFromSubjectCode(w.subject_code);
      const fromTable = slotsByWorkloadId.get(w.id) ?? [];
      const coords =
        fromTable.length > 0
          ? fromTable
          : w.fixed_day_order && w.fixed_period
            ? [{ day_order: w.fixed_day_order, period: w.fixed_period }]
            : [];

      for (const coord of coords) {
        const exists = initialMap[activeCid].some(
          (s) => s.day_order === coord.day_order && s.period === coord.period
        );
        if (!exists) {
          initialMap[activeCid].push({
            class_id: activeCid,
            day_order: coord.day_order,
            period: coord.period,
            slot_type: slotType,
          });
        }
      }
    }
  }

  saveFixedPeriodsMemory(initialMap);

  // Best-effort seed into Supabase `tt_fixed_periods` if table exists
  const allRowsToInsert = Object.values(initialMap).flat();
  if (allRowsToInsert.length > 0) {
    try {
      await supabase
        .from('tt_fixed_periods')
        .upsert(allRowsToInsert, { onConflict: 'class_id,day_order,period' });
    } catch {
      // Silently ignore if table hasn't been created yet
    }
  }

  return initialMap;
}

/**
 * Updates a single (classId, dayOrder, period) cell immediately in state + local memory
 * and persists to Supabase `tt_fixed_periods` asynchronously.
 */
export function computeNextFixedPeriodsMap(
  currentMap: FixedPeriodsByClass,
  classId: string,
  dayOrder: number,
  period: number,
  slotType: FixedPeriodType | null,
  assignedStaffId?: string | null
): FixedPeriodsByClass {
  const existingList = Array.isArray(currentMap[classId]) ? currentMap[classId] : [];
  const prevSlot = existingList.find(
    (s) => s.day_order === dayOrder && s.period === period
  );
  const filtered = existingList.filter(
    (s) => !(s.day_order === dayOrder && s.period === period)
  );

  const resolvedStaffId =
    assignedStaffId !== undefined ? assignedStaffId : (prevSlot?.assigned_staff_id ?? null);

  const nextList =
    slotType === null
      ? filtered
      : [
          ...filtered,
          {
            class_id: classId,
            day_order: dayOrder,
            period,
            slot_type: slotType,
            assigned_staff_id: resolvedStaffId,
          },
        ];

  const nextMap: FixedPeriodsByClass = {
    ...currentMap,
    [classId]: nextList,
  };

  saveFixedPeriodsMemory(nextMap);
  return nextMap;
}

function isMissingColumnError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === 'PGRST204' || code === '42703' || msg.includes('assigned_staff_id');
}

export async function persistFixedPeriodCellToSupabase(
  classId: string,
  dayOrder: number,
  period: number,
  slotType: FixedPeriodType | null,
  assignedStaffId?: string | null
): Promise<void> {
  try {
    if (slotType === null) {
      await supabase
        .from('tt_fixed_periods')
        .delete()
        .eq('class_id', classId)
        .eq('day_order', dayOrder)
        .eq('period', period);
    } else {
      const payload = {
        class_id: classId,
        day_order: dayOrder,
        period,
        slot_type: slotType,
        assigned_staff_id: assignedStaffId ?? null,
      };
      const { error } = await supabase
        .from('tt_fixed_periods')
        .upsert(payload, { onConflict: 'class_id,day_order,period' });

      if (error && isMissingColumnError(error)) {
        await supabase
          .from('tt_fixed_periods')
          .upsert(
            { class_id: classId, day_order: dayOrder, period, slot_type: slotType },
            { onConflict: 'class_id,day_order,period' }
          );
      }
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Supabase fixed period update notice:', err);
    }
  }
}

export async function persistFixedPeriodsForClassToSupabase(
  classId: string,
  slots: TTFixedPeriodSlot[]
): Promise<void> {
  try {
    const { error: delErr } = await supabase
      .from('tt_fixed_periods')
      .delete()
      .eq('class_id', classId);

    if (!delErr && slots.length > 0) {
      const payload = slots.map((s) => ({
        class_id: s.class_id,
        day_order: s.day_order,
        period: s.period,
        slot_type: s.slot_type,
        assigned_staff_id: s.assigned_staff_id ?? null,
      }));
      const { error: upsertErr } = await supabase
        .from('tt_fixed_periods')
        .upsert(payload, { onConflict: 'class_id,day_order,period' });

      if (upsertErr && isMissingColumnError(upsertErr)) {
        const legacyPayload = slots.map((s) => ({
          class_id: s.class_id,
          day_order: s.day_order,
          period: s.period,
          slot_type: s.slot_type,
        }));
        await supabase
          .from('tt_fixed_periods')
          .upsert(legacyPayload, { onConflict: 'class_id,day_order,period' });
      }
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Supabase fixed periods bulk sync notice:', err);
    }
  }
}
