// ============================================================================
// ACCFIN Timetable Generator — Step 0 Fixed Periods Data Layer
// Manages college-mandated fixed slots (LANG, ENG, LAB) per class/section
// before Workload Entry and Auto-Generation.
// Consecutive LAB cells on the same Day Order within [1,2,3] or [4,5]
// (never bridging Break between P3 and P4) form a single Lab Block sharing
// one optional multi-staff list.
// ============================================================================

import { supabase, isExpectedSupabaseFallbackError } from '../supabaseClient';
import { rawTimetable } from '../../data/seedData';
import {
  isFixedPeriodsInitialized,
  loadFixedPeriodsMemory,
  saveFixedPeriodsMemory,
  loadWorkloadMemory,
  loadMemoryData,
  saveMemoryData,
} from '../memoryStorage';
import type {
  FixedPeriodType,
  FixedPeriodsByClass,
  TTClass,
  TTFixedPeriodSlot,
  TTStaff,
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

function matchTTStaffToken(allStaff: TTStaff[], idOrCode: string): TTStaff | undefined {
  const raw = (idOrCode || '').trim();
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  const withoutPrefix = upper.startsWith('STAFF-') ? upper.slice(6) : upper;

  return (
    allStaff.find((s) => s.id.trim() === raw) ??
    allStaff.find((s) => s.id.trim().toUpperCase() === upper) ??
    allStaff.find((s) => s.short_code.trim().toUpperCase() === upper) ??
    allStaff.find((s) => s.short_code.trim().toUpperCase() === withoutPrefix) ??
    allStaff.find((s) => s.id.trim().toUpperCase() === `STAFF-${withoutPrefix}`)
  );
}

/**
 * Parses assigned staff IDs/codes from a TTFixedPeriodSlot.
 * Supports both the array `assigned_staff_ids` and comma/slash-delimited `assigned_staff_id`.
 */
export function parseFixedSlotStaffIds(
  slot: Pick<TTFixedPeriodSlot, 'assigned_staff_id' | 'assigned_staff_ids'> | null | undefined,
  staffList?: TTStaff[]
): string[] {
  if (!slot) return [];
  const rawTokens: string[] = [];

  if (Array.isArray(slot.assigned_staff_ids) && slot.assigned_staff_ids.length > 0) {
    for (const item of slot.assigned_staff_ids) {
      if (typeof item === 'string' && item.trim()) {
        rawTokens.push(item.trim());
      }
    }
  } else if (typeof slot.assigned_staff_id === 'string' && slot.assigned_staff_id.trim()) {
    const parts = slot.assigned_staff_id
      .split(/[,/]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    rawTokens.push(...parts);
  }

  const out: string[] = [];
  const seenKeys = new Set<string>();

  for (const tok of rawTokens) {
    const resolved = staffList && staffList.length > 0 ? matchTTStaffToken(staffList, tok) : undefined;
    const canonical = resolved ? resolved.id : tok;
    const dedupKey = (resolved ? resolved.short_code : tok.replace(/^staff-/i, '')).trim().toUpperCase();
    if (!seenKeys.has(dedupKey)) {
      seenKeys.add(dedupKey);
      out.push(canonical);
    }
  }

  return out;
}

/**
 * Serializes a list of staff IDs into the backward-compatible string column `assigned_staff_id`.
 */
export function serializeFixedSlotStaffIds(staffIds: string[]): string | null {
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const id of staffIds) {
    const t = (id || '').trim();
    if (!t) continue;
    const key = t.toUpperCase();
    if (!seen.has(key)) {
      seen.add(key);
      cleaned.push(t);
    }
  }
  return cleaned.length > 0 ? cleaned.join(',') : null;
}

/**
 * Period segments separated by the 11:00–11:30 Break.
 * P3 and P4 are never contiguous.
 */
function getPeriodSegment(period: number): number[] {
  if (period >= 1 && period <= 3) return [1, 2, 3];
  if (period === 4 || period === 5) return [4, 5];
  return [];
}

/**
 * Returns the maximal contiguous run of LAB slots on `dayOrder` containing `period`,
 * strictly respecting the Break boundary between P3 and P4.
 */
export function getContiguousLabBlock(
  slots: TTFixedPeriodSlot[],
  dayOrder: number,
  period: number
): TTFixedPeriodSlot[] {
  const segment = getPeriodSegment(period);
  if (segment.length === 0) return [];

  const byPeriod = new Map<number, TTFixedPeriodSlot>();
  for (const s of slots) {
    if (s.day_order === dayOrder && s.slot_type === 'LAB' && segment.includes(s.period)) {
      byPeriod.set(s.period, s);
    }
  }

  if (!byPeriod.has(period)) return [];

  let start = period;
  while (segment.includes(start - 1) && byPeriod.has(start - 1)) {
    start--;
  }
  let end = period;
  while (segment.includes(end + 1) && byPeriod.has(end + 1)) {
    end++;
  }

  const block: TTFixedPeriodSlot[] = [];
  for (let p = start; p <= end; p++) {
    const slot = byPeriod.get(p);
    if (slot) block.push(slot);
  }
  return block;
}

/**
 * Formats a lab block's period range (e.g. "P2–P3", "P1–P3", "P4").
 */
export function formatLabBlockPeriodRange(blockSlots: TTFixedPeriodSlot[]): string {
  if (!blockSlots || blockSlots.length === 0) return '';
  const sorted = [...blockSlots].sort((a, b) => a.period - b.period);
  if (sorted.length === 1) return `P${sorted[0].period}`;
  return `P${sorted[0].period}–P${sorted[sorted.length - 1].period}`;
}

/**
 * Migrates & normalizes contiguous LAB blocks in a single class's slot list:
 * Any contiguous LAB block (same Day Order, within [1,2,3] or [4,5]) shares the
 * ordered union of all staff across cells in that block without losing any existing staff.
 */
export function mergeLabBlockStaffInSlots(
  slots: TTFixedPeriodSlot[],
  staffList?: TTStaff[]
): { slots: TTFixedPeriodSlot[]; changed: boolean } {
  if (!slots || slots.length === 0) return { slots: [], changed: false };

  const cloned = slots.map((s) => {
    const parsed = parseFixedSlotStaffIds(s, staffList);
    const serialized = serializeFixedSlotStaffIds(parsed);
    return {
      ...s,
      assigned_staff_id: serialized,
      assigned_staff_ids: parsed,
    };
  });

  let changed = false;

  // Group LAB slots by day_order and check maximal contiguous runs inside [1,2,3] and [4,5]
  const visited = new Set<string>();
  for (const s of cloned) {
    if (s.slot_type !== 'LAB') continue;
    const coord = `${s.day_order}_${s.period}`;
    if (visited.has(coord)) continue;

    const block = getContiguousLabBlock(cloned, s.day_order, s.period);
    for (const b of block) {
      visited.add(`${b.day_order}_${b.period}`);
    }

    if (block.length <= 1) continue;

    // Union staff across all cells in this contiguous LAB block
    const mergedIds: string[] = [];
    const seenKeys = new Set<string>();
    for (const cell of block) {
      const cellIds = parseFixedSlotStaffIds(cell, staffList);
      for (const id of cellIds) {
        const resolved = staffList && staffList.length > 0 ? matchTTStaffToken(staffList, id) : undefined;
        const canonical = resolved ? resolved.id : id;
        const dedupKey = (resolved ? resolved.short_code : id.replace(/^staff-/i, ''))
          .trim()
          .toUpperCase();
        if (!seenKeys.has(dedupKey)) {
          seenKeys.add(dedupKey);
          mergedIds.push(canonical);
        }
      }
    }

    const mergedSerialized = serializeFixedSlotStaffIds(mergedIds);
    for (const cell of block) {
      const prevSerialized = cell.assigned_staff_id ?? null;
      if (prevSerialized !== mergedSerialized) {
        changed = true;
      }
      cell.assigned_staff_id = mergedSerialized;
      cell.assigned_staff_ids = [...mergedIds];
    }
  }

  return { slots: cloned, changed };
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
 * Helper to look up fixed period slots for a specific classId (tolerant to ID vs code variants),
 * guaranteeing contiguous LAB blocks are always merged.
 */
export function getFixedSlotsForClass(
  fixedByClass: FixedPeriodsByClass,
  classId: string,
  classes: TTClass[] = []
): TTFixedPeriodSlot[] {
  if (!fixedByClass || !classId) return [];
  if (Array.isArray(fixedByClass[classId])) {
    return mergeLabBlockStaffInSlots(fixedByClass[classId]).slots;
  }
  const targetToken = normalizeClassToken(classId);
  const matchedClass = classes.find((c) => c.id === classId);
  const codeToken = matchedClass ? normalizeClassToken(matchedClass.code) : targetToken;

  for (const [k, list] of Object.entries(fixedByClass)) {
    const kt = normalizeClassToken(k);
    if (kt === targetToken || kt === codeToken) {
      return Array.isArray(list) ? mergeLabBlockStaffInSlots(list).slots : [];
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
 * Re-keys a FixedPeriodsByClass dictionary so every entry's class_id uses active TTClass IDs,
 * and migrates/merges any contiguous LAB cells so each block carries a unified staff list.
 */
function normalizeFixedPeriodsMap(
  rawMap: Record<string, any[]>,
  classes: TTClass[],
  staffList?: TTStaff[]
): { normalized: FixedPeriodsByClass; migrated: boolean } {
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
      const parsedIds = parseFixedSlotStaffIds(
        {
          assigned_staff_id: s.assigned_staff_id ?? s.assignedStaffId ?? null,
          assigned_staff_ids: s.assigned_staff_ids ?? s.assignedStaffIds,
        },
        staffList
      );
      const cleanSlot: TTFixedPeriodSlot = {
        id: s.id,
        class_id: activeCid,
        day_order: Number(s.day_order),
        period: Number(s.period),
        slot_type: s.slot_type as FixedPeriodType,
        assigned_staff_id: serializeFixedSlotStaffIds(parsedIds),
        assigned_staff_ids: parsedIds,
      };
      if (existingIdx >= 0) {
        normalized[activeCid][existingIdx] = cleanSlot;
      } else {
        normalized[activeCid].push(cleanSlot);
      }
    }
  }

  let migrated = false;
  for (const cid of Object.keys(normalized)) {
    const merged = mergeLabBlockStaffInSlots(normalized[cid], staffList);
    normalized[cid] = merged.slots;
    if (merged.changed) migrated = true;
  }

  return { normalized, migrated };
}

/**
 * Loads all Step 0 fixed periods from Supabase + local persistent memory.
 * Automatically migrates existing single-cell LAB staff into unified contiguous Lab Blocks.
 */
export async function getAllFixedPeriods(
  classes: TTClass[],
  workloadByClass?: Record<string, TTWorkload[]>,
  staffList?: TTStaff[]
): Promise<FixedPeriodsByClass> {
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

  // If DB already has rows and local wasn't customized yet, use DB rows (with lab block migration)
  if (dbRows && dbRows.length > 0 && !localInitialized) {
    const grouped: Record<string, TTFixedPeriodSlot[]> = {};
    for (const row of dbRows) {
      if (!grouped[row.class_id]) grouped[row.class_id] = [];
      grouped[row.class_id].push(row);
    }
    const { normalized, migrated } = normalizeFixedPeriodsMap(grouped, classes, staffList);
    saveFixedPeriodsMemory(normalized);
    if (migrated) {
      void persistFixedPeriodSlotsToSupabase(Object.values(normalized).flat());
    }
    return normalized;
  }

  // If local was initialized, prefer local (and merge DB if local is empty while DB has rows)
  if (localInitialized) {
    const { normalized: normalizedLocal, migrated: localMigrated } = normalizeFixedPeriodsMap(
      localMem,
      classes,
      staffList
    );
    const totalLocal = Object.values(normalizedLocal).reduce((sum, arr) => sum + arr.length, 0);
    if (totalLocal === 0 && dbRows && dbRows.length > 0) {
      const grouped: Record<string, TTFixedPeriodSlot[]> = {};
      for (const row of dbRows) {
        if (!grouped[row.class_id]) grouped[row.class_id] = [];
        grouped[row.class_id].push(row);
      }
      const { normalized: normalizedDb, migrated: dbMigrated } = normalizeFixedPeriodsMap(
        grouped,
        classes,
        staffList
      );
      saveFixedPeriodsMemory(normalizedDb);
      if (dbMigrated) {
        void persistFixedPeriodSlotsToSupabase(Object.values(normalizedDb).flat());
      }
      return normalizedDb;
    }

    saveFixedPeriodsMemory(normalizedLocal);
    if (localMigrated) {
      void persistFixedPeriodSlotsToSupabase(Object.values(normalizedLocal).flat());
    }
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

  const allRowsToInsert = Object.values(initialMap)
    .flat()
    .map((s) => ({
      class_id: s.class_id,
      day_order: s.day_order,
      period: s.period,
      slot_type: s.slot_type,
      assigned_staff_id: s.assigned_staff_id ?? null,
    }));
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
 * Updates a single (classId, dayOrder, period) cell immediately in state + local memory.
 * When adding a LAB cell adjacent to an existing LAB cell (same segment [1,2,3] or [4,5]),
 * merges the contiguous block's staff across all cells of that block automatically.
 */
export function computeNextFixedPeriodsMap(
  currentMap: FixedPeriodsByClass,
  classId: string,
  dayOrder: number,
  period: number,
  slotType: FixedPeriodType | null,
  assignedStaffId?: string | null,
  assignedStaffIds?: string[]
): FixedPeriodsByClass {
  const existingList = Array.isArray(currentMap[classId]) ? currentMap[classId] : [];
  const prevSlot = existingList.find(
    (s) => s.day_order === dayOrder && s.period === period
  );
  const filtered = existingList.filter(
    (s) => !(s.day_order === dayOrder && s.period === period)
  );

  let resolvedIds: string[] = [];
  if (assignedStaffIds !== undefined) {
    resolvedIds = parseFixedSlotStaffIds({ assigned_staff_ids: assignedStaffIds });
  } else if (assignedStaffId !== undefined) {
    resolvedIds = parseFixedSlotStaffIds({ assigned_staff_id: assignedStaffId });
  } else if (prevSlot && prevSlot.slot_type === slotType) {
    resolvedIds = parseFixedSlotStaffIds(prevSlot);
  }

  const rawNextList: TTFixedPeriodSlot[] =
    slotType === null
      ? filtered
      : [
          ...filtered,
          {
            class_id: classId,
            day_order: dayOrder,
            period,
            slot_type: slotType,
            assigned_staff_id: serializeFixedSlotStaffIds(resolvedIds),
            assigned_staff_ids: resolvedIds,
          },
        ];

  const { slots: mergedNextList } = mergeLabBlockStaffInSlots(rawNextList);

  const nextMap: FixedPeriodsByClass = {
    ...currentMap,
    [classId]: mergedNextList,
  };

  saveFixedPeriodsMemory(nextMap);
  return nextMap;
}

/**
 * Sets the optional multi-staff list for an entire contiguous LAB block
 * containing (dayOrder, period), persisting immediately to local memory.
 */
export function computeNextLabBlockStaffMap(
  currentMap: FixedPeriodsByClass,
  classId: string,
  dayOrder: number,
  period: number,
  staffIds: string[]
): { nextMap: FixedPeriodsByClass; updatedBlockSlots: TTFixedPeriodSlot[] } {
  const existingList = Array.isArray(currentMap[classId]) ? currentMap[classId] : [];
  const block = getContiguousLabBlock(existingList, dayOrder, period);
  const blockCoordSet = new Set(block.map((b) => `${b.day_order}_${b.period}`));
  if (blockCoordSet.size === 0) {
    blockCoordSet.add(`${dayOrder}_${period}`);
  }

  const cleanIds = parseFixedSlotStaffIds({ assigned_staff_ids: staffIds });
  const serialized = serializeFixedSlotStaffIds(cleanIds);
  const updatedBlockSlots: TTFixedPeriodSlot[] = [];

  const nextList = existingList.map((s) => {
    if (blockCoordSet.has(`${s.day_order}_${s.period}`)) {
      const updated: TTFixedPeriodSlot = {
        ...s,
        assigned_staff_id: serialized,
        assigned_staff_ids: [...cleanIds],
      };
      updatedBlockSlots.push(updated);
      return updated;
    }
    return s;
  });

  const nextMap: FixedPeriodsByClass = {
    ...currentMap,
    [classId]: nextList,
  };

  saveFixedPeriodsMemory(nextMap);
  return { nextMap, updatedBlockSlots };
}

/**
 * Synchronizes updated Step 0 LAB block staff into any already-generated
 * `LAB` entries in `memoryStorage.timetableEntries` so Daily Log Sheet and
 * Faculty Workload stay aligned immediately.
 */
export function syncStep0LabStaffToTimetableEntries(
  classId: string,
  classCode: string,
  slotsToSync: TTFixedPeriodSlot[],
  ttStaff: TTStaff[]
): void {
  if (typeof window === 'undefined' || slotsToSync.length === 0) return;

  const mem = loadMemoryData();
  const entries = mem.timetableEntries;
  if (!Array.isArray(entries) || entries.length === 0) return;

  const normTargetClass = normalizeClassToken(classCode || classId);
  const memStaff = mem.staffList || [];

  const resolveLogStaffIds = (slot: TTFixedPeriodSlot): string[] => {
    const rawIds = parseFixedSlotStaffIds(slot, ttStaff);
    return rawIds.map((rawId) => {
      const ttMatch = matchTTStaffToken(ttStaff, rawId);
      const code = (ttMatch?.short_code || rawId.replace(/^staff-/i, '')).trim().toUpperCase();
      const memMatch = memStaff.find(
        (m) =>
          m.id === rawId ||
          m.code.trim().toUpperCase() === code ||
          m.id.toUpperCase() === `STAFF-${code}`
      );
      return memMatch?.id ?? ttMatch?.id ?? rawId;
    });
  };

  let changed = false;
  const updatedEntries = entries.map((entry) => {
    if (entry.subjectCode.trim().toUpperCase() !== 'LAB') return entry;
    const entryNormClass = normalizeClassToken(entry.classId);
    if (entry.classId !== classId && entryNormClass !== normTargetClass) return entry;

    const matchingSlot = slotsToSync.find(
      (s) => s.slot_type === 'LAB' && s.day_order === entry.dayOrder && s.period === entry.period
    );
    if (!matchingSlot) return entry;

    const nextStaffIds = resolveLogStaffIds(matchingSlot);
    const prevKey = (entry.staffIds || []).join(',');
    const nextKey = nextStaffIds.join(',');
    if (prevKey === nextKey) return entry;

    changed = true;
    return {
      ...entry,
      isLab: true,
      staffIds: nextStaffIds,
    };
  });

  if (changed) {
    saveMemoryData({ timetableEntries: updatedEntries });
    window.dispatchEvent(new CustomEvent('accfin-timetable-updated', { detail: updatedEntries }));
  }
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

export async function persistFixedPeriodSlotsToSupabase(
  slots: TTFixedPeriodSlot[]
): Promise<void> {
  if (!slots || slots.length === 0) return;
  try {
    const payload = slots.map((s) => ({
      class_id: s.class_id,
      day_order: s.day_order,
      period: s.period,
      slot_type: s.slot_type,
      assigned_staff_id: s.assigned_staff_id ?? serializeFixedSlotStaffIds(s.assigned_staff_ids || []),
    }));
    const { error } = await supabase
      .from('tt_fixed_periods')
      .upsert(payload, { onConflict: 'class_id,day_order,period' });

    if (error && isMissingColumnError(error)) {
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
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Supabase fixed period slots sync notice:', err);
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
        assigned_staff_id: s.assigned_staff_id ?? serializeFixedSlotStaffIds(s.assigned_staff_ids || []),
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
