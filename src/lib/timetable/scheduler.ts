// ============================================================================
// ACCFIN Timetable Generator — Scheduling Engine
// ----------------------------------------------------------------------------
// Pure functions, no Supabase/DB calls here — this file only knows about
// plain data in and plain data out, so it can be unit-tested and reused.
//
// PRIORITY ORDER OF CONSTRAINTS
// -----------------------------
//   Rule 1 [HARD — NEVER RELAXED]:
//     (a) A class never has two subjects in the same (dayOrder, period).
//     (b) A staff member can teach only one class at any given (dayOrder, period)
//         across all classes/sections, including individual split-hour shares
//         and staff optionally attached to Step 0 fixed LANG/ENG/LAB cells.
//         If no clash-free slot exists, leave the hour unplaced and report it.
//
//   Rule 3 [FIRM — PRIORITIZED OVER RULE 2]:
//     (a) Within a single class and section, the same subject appears at most
//         once on any Day Order (counted by normalized subject across split-hour
//         staff such as MJ(4)/MP(1)).
//     (b) Weekly hours (1–6) are spread evenly across distinct Day Orders.
//     (c) Exempt: Step 0 fixed LANG, ENG, and LAB slots (management-set).
//     (d) Subjects with >6 weekly hours cannot fit once per Day Order and are
//         flagged in overSixHoursSubjects while minimizing repeats.
//
//   Rule 2 [SPACING & SPREAD — APPLIED AS STRICTLY AS POSSIBLE AFTER 1 & 3]:
//     (a) Within one Day Order, a staff member's periods should not be
//         consecutive (P1-P2, P2-P3, P3-P4, P4-P5; P3-P4 is treated as adjacent
//         despite the break). Exemption: Step 0 fixed LAB blocks spanning
//         consecutive periods in the same class are management-set and exempt.
//     (b) Weekly hours for each staff member are spread evenly across
//         Day Orders I–VI rather than stacked on a few days.
// ============================================================================

export const ALL_DAY_ORDERS = [1, 2, 3, 4, 5, 6] as const;
export const ALL_PERIODS = [1, 2, 3, 4, 5] as const;

export interface FixedPlacement {
  workloadId: string;
  classId: string;
  staffId: string;
  subjectCode: string;
  dayOrder: number;
  period: number;
}

export interface SchedulableWorkload {
  workloadId: string;
  classId: string;
  staffId: string;
  subjectCode: string;
  hoursPerWeek: number;
}

export interface SlotAssignment {
  classId: string;
  dayOrder: number;
  period: number;
  workloadId: string;
  staffId: string;
  subjectCode: string;
  isFixed: boolean;
}

export interface UnresolvedHours {
  workloadId: string;
  classId: string;
  subjectCode: string;
  staffId: string;
  missingHours: number;
}

export interface FixedClash {
  reason: string;
  workloadIds: string[];
  classId: string;
  dayOrder: number;
  period: number;
}

export interface ConsecutivePeriodWarning {
  staffId: string;
  dayOrder: number;
  periodA: number;
  periodB: number;
  subjects: [string, string];
}

export interface SameDaySubjectRepeatWarning {
  classId: string;
  subjectCode: string;
  dayOrder: number;
  count: number;
}

export interface OverSixHoursWarning {
  classId: string;
  subjectCode: string;
  totalHours: number;
}

export interface GenerateScheduleResult {
  slots: SlotAssignment[];
  unresolved: UnresolvedHours[];
  fixedClashes: FixedClash[];
  consecutiveWarnings: ConsecutivePeriodWarning[];
  sameDaySubjectRepeats: SameDaySubjectRepeatWarning[];
  overSixHoursSubjects: OverSixHoursWarning[];
  attemptsUsed: number;
}

export interface BlockedClassSlot {
  classId: string;
  dayOrder: number;
  period: number;
  slotType: 'LANG' | 'ENG' | 'LAB';
  assignedStaffId?: string | null;
}

export interface GenerateScheduleOptions {
  maxRestarts?: number;
  blockedSlots?: BlockedClassSlot[];
}

const EXEMPT_SUBJECT_CODES = new Set(['LANG', 'ENG', 'TAM', 'LAB']);

// Minimum possible sum(runLen * (runLen - 1)) when choosing k distinct Day Orders out of 6
const MIN_SUBJ_RUN_SCORE = [0, 0, 0, 0, 2, 8, 30] as const;

export function normalizeSubjectKey(subjectCode: string): string {
  return (subjectCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s*\([^)]+\)$/, '')
    .trim();
}

function isExemptFixedSubject(subjectCode: string): boolean {
  return EXEMPT_SUBJECT_CODES.has(normalizeSubjectKey(subjectCode));
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allSlots(): Array<{ dayOrder: number; period: number }> {
  const slots: Array<{ dayOrder: number; period: number }> = [];
  for (const d of ALL_DAY_ORDERS) {
    for (const p of ALL_PERIODS) {
      slots.push({ dayOrder: d, period: p });
    }
  }
  return slots;
}

// ----------------------------------------------------------------------------
// Detect conflicts among fixed placements (and Step 0 slots with assigned staff)
// ----------------------------------------------------------------------------
export function detectFixedClashes(
  fixedPlacements: FixedPlacement[],
  blockedSlots: BlockedClassSlot[] = []
): FixedClash[] {
  const clashes: FixedClash[] = [];

  type StaffOccupancy = {
    workloadId: string;
    classId: string;
    staffId: string;
    dayOrder: number;
    period: number;
  };

  const byStaffSlot = new Map<string, StaffOccupancy[]>();

  for (const fp of fixedPlacements) {
    if (!fp.staffId) continue;
    const key = `${fp.staffId}_${fp.dayOrder}_${fp.period}`;
    const list = byStaffSlot.get(key) ?? [];
    list.push({
      workloadId: fp.workloadId,
      classId: fp.classId,
      staffId: fp.staffId,
      dayOrder: fp.dayOrder,
      period: fp.period,
    });
    byStaffSlot.set(key, list);
  }

  for (const b of blockedSlots) {
    if (!b.assignedStaffId) continue;
    const key = `${b.assignedStaffId}_${b.dayOrder}_${b.period}`;
    const list = byStaffSlot.get(key) ?? [];
    list.push({
      workloadId: `step0:${b.classId}:${b.dayOrder}:${b.period}`,
      classId: b.classId,
      staffId: b.assignedStaffId,
      dayOrder: b.dayOrder,
      period: b.period,
    });
    byStaffSlot.set(key, list);
  }

  for (const list of byStaffSlot.values()) {
    if (list.length > 1) {
      const distinctClasses = new Set(list.map((l) => l.classId));
      if (distinctClasses.size > 1) {
        clashes.push({
          reason: `Staff member is fixed into ${distinctClasses.size} different classes at Day Order ${list[0].dayOrder}, Period ${list[0].period}.`,
          workloadIds: list.filter((l) => !l.workloadId.startsWith('step0:')).map((l) => l.workloadId),
          classId: list[0].classId,
          dayOrder: list[0].dayOrder,
          period: list[0].period,
        });
      }
    }
  }

  return clashes;
}

// ----------------------------------------------------------------------------
// Detect subjects exceeding 6 weekly hours in any single class/section
// (count by subject across split-hour staff assignments, excluding exempt Step 0 codes)
// ----------------------------------------------------------------------------
function detectOverSixHoursSubjects(
  fixedPlacements: FixedPlacement[],
  schedulableWorkload: SchedulableWorkload[]
): OverSixHoursWarning[] {
  const totals = new Map<string, { classId: string; subjectCode: string; totalHours: number }>();

  const add = (classId: string, subjectCode: string, hours: number) => {
    const keyNorm = normalizeSubjectKey(subjectCode);
    if (!keyNorm || isExemptFixedSubject(keyNorm)) return;
    const mapKey = `${classId}::${keyNorm}`;
    const existing = totals.get(mapKey);
    if (existing) {
      existing.totalHours += hours;
    } else {
      totals.set(mapKey, { classId, subjectCode: subjectCode.trim(), totalHours: hours });
    }
  };

  for (const fp of fixedPlacements) {
    add(fp.classId, fp.subjectCode, 1);
  }
  for (const w of schedulableWorkload) {
    add(w.classId, w.subjectCode, w.hoursPerWeek);
  }

  const out: OverSixHoursWarning[] = [];
  for (const entry of totals.values()) {
    if (entry.totalHours > 6) {
      out.push(entry);
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Internal grid state used inside each scheduling attempt
// ----------------------------------------------------------------------------
interface ClassCellEntry {
  kind: 'BLOCKED' | 'FIXED' | 'GEN';
  workloadId: string;
  staffId: string | null;
  subjectCode: string;
  subjectKey: string;
  isStep0Lab: boolean;
  isRule3Exempt: boolean;
}

interface StaffCellEntry {
  kind: 'BLOCKED' | 'FIXED' | 'GEN';
  classId: string;
  subjectCode: string;
  isStep0Lab: boolean;
}

interface AttemptMetrics {
  missingHours: number;
  sameDayRepeats: number;
  sameDayExcessCost: number;
  adjacentPairs: number;
  spreadImbalance: number;
  subjectDaySpread: number;
}

interface BuiltAttemptState {
  allClassIds: string[];
  allStaffIds: string[];
  classGrid: Map<string, (ClassCellEntry | undefined)[][]>;
  staffGrid: Map<string, (StaffCellEntry | undefined)[][]>;
  staffDayCount: Map<string, number[]>;
  staffTotalTargetHours: Map<string, number>;
  classDaySubjCount: Map<string, number>;
  classSubjects: Map<string, string[]>;
  subjectDisplayByKey: Map<string, string>;
  unresolved: UnresolvedHours[];
  metrics: AttemptMetrics;
}

interface AttemptOutput {
  slots: SlotAssignment[];
  unresolved: UnresolvedHours[];
  consecutiveWarnings: ConsecutivePeriodWarning[];
  sameDaySubjectRepeats: SameDaySubjectRepeatWarning[];
  metrics: AttemptMetrics;
}

function minSpreadScore(totalHours: number): number {
  const r = totalHours % 6;
  return 6 * r * (6 - r);
}

function isExemptLabPair(a: StaffCellEntry | undefined, b: StaffCellEntry | undefined): boolean {
  return Boolean(a && b && a.isStep0Lab && b.isStep0Lab && a.classId === b.classId);
}

function dsKey(classId: string, d: number, subjectKey: string): string {
  return `${classId}_${d}_${subjectKey}`;
}

function computeSubjectDaySpreadForOne(
  classId: string,
  subjectKey: string,
  classDaySubjCount: Map<string, number>
): number {
  let run = 0;
  let score = 0;
  let distinctDays = 0;
  for (let d = 1; d <= 6; d++) {
    const has = (classDaySubjCount.get(dsKey(classId, d, subjectKey)) ?? 0) > 0;
    if (has) {
      distinctDays++;
      run++;
    } else if (run > 0) {
      score += run * (run - 1);
      run = 0;
    }
  }
  if (run > 0) score += run * (run - 1);
  const minForCount = MIN_SUBJ_RUN_SCORE[Math.min(distinctDays, 6)];
  return Math.max(0, score - minForCount);
}

function evaluateAttemptMetrics(
  staffGrid: Map<string, (StaffCellEntry | undefined)[][]>,
  staffTotalTargetHours: Map<string, number>,
  classDaySubjCount: Map<string, number>,
  classSubjects: Map<string, string[]>,
  missingHours: number
): AttemptMetrics {
  let adjacentPairs = 0;
  let spreadImbalance = 0;

  for (const [staffId, days] of staffGrid.entries()) {
    let actualTotal = 0;
    let sumSqScaled = 0;
    const targetTotal = staffTotalTargetHours.get(staffId) ?? 0;

    for (let d = 1; d <= 6; d++) {
      let dayCount = 0;
      const row = days[d];
      for (let p = 1; p <= 5; p++) {
        if (row[p]) dayCount++;
        if (p <= 4 && row[p] && row[p + 1] && !isExemptLabPair(row[p], row[p + 1])) {
          adjacentPairs++;
        }
      }
      actualTotal += dayCount;
      const diff = dayCount * 6 - targetTotal;
      sumSqScaled += diff * diff;
    }

    const baseTotal = actualTotal === targetTotal ? targetTotal : actualTotal;
    spreadImbalance += Math.max(0, sumSqScaled - minSpreadScore(baseTotal));
  }

  let sameDayRepeats = 0;
  let sameDayExcessCost = 0;
  for (const count of classDaySubjCount.values()) {
    if (count > 1) {
      sameDayRepeats += count - 1;
      sameDayExcessCost += (count * (count - 1)) / 2;
    }
  }

  let subjectDaySpread = 0;
  for (const [cid, subjKeys] of classSubjects.entries()) {
    for (const sk of subjKeys) {
      subjectDaySpread += computeSubjectDaySpreadForOne(cid, sk, classDaySubjCount);
    }
  }

  return {
    missingHours,
    sameDayRepeats,
    sameDayExcessCost,
    adjacentPairs,
    spreadImbalance,
    subjectDaySpread,
  };
}

/**
 * Strict Constraint Priority Order:
 *   1. missingHours (Rule 1 clash-free completeness)
 *   2. sameDayRepeats & sameDayExcessCost (Rule 3: one subject per Day Order)
 *   3. adjacentPairs (Rule 2a: no back-to-back periods for same staff)
 *   4. spreadImbalance (Rule 2b: even staff daily spread)
 *   5. subjectDaySpread (Rule 3: even subject spread across Day Orders I–VI)
 */
function isMetricsBetter(a: AttemptMetrics, b: AttemptMetrics): boolean {
  if (a.missingHours !== b.missingHours) return a.missingHours < b.missingHours;
  if (a.sameDayRepeats !== b.sameDayRepeats) return a.sameDayRepeats < b.sameDayRepeats;
  if (a.sameDayExcessCost !== b.sameDayExcessCost) return a.sameDayExcessCost < b.sameDayExcessCost;
  if (a.adjacentPairs !== b.adjacentPairs) return a.adjacentPairs < b.adjacentPairs;
  if (a.spreadImbalance !== b.spreadImbalance) return a.spreadImbalance < b.spreadImbalance;
  return a.subjectDaySpread < b.subjectDaySpread;
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------
export function generateSchedule(
  fixedPlacements: FixedPlacement[],
  schedulableWorkload: SchedulableWorkload[],
  options: GenerateScheduleOptions = {}
): GenerateScheduleResult {
  const maxRestarts = options.maxRestarts ?? 80;
  const blockedSlots = options.blockedSlots ?? [];
  const fixedClashes = detectFixedClashes(fixedPlacements, blockedSlots);

  const clashingWorkloadIds = new Set(fixedClashes.flatMap((c) => c.workloadIds));
  const cleanFixedPlacements = fixedPlacements.filter((fp) => !clashingWorkloadIds.has(fp.workloadId));

  const overSixHoursSubjects = detectOverSixHoursSubjects(
    cleanFixedPlacements,
    schedulableWorkload
  );

  // Stage 1: Multi-restart randomized construction + Rule-3-preserving relocation
  const candidates: BuiltAttemptState[] = [];
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    attemptsUsed = attempt + 1;
    const state = buildConstructiveState(cleanFixedPlacements, schedulableWorkload, attempt, blockedSlots);
    candidates.push(state);
    if (
      state.metrics.missingHours === 0 &&
      state.metrics.sameDayRepeats === 0 &&
      state.metrics.adjacentPairs === 0 &&
      state.metrics.spreadImbalance === 0 &&
      state.metrics.subjectDaySpread === 0
    ) {
      break;
    }
  }

  candidates.sort((a, b) => {
    if (isMetricsBetter(a.metrics, b.metrics)) return -1;
    if (isMetricsBetter(b.metrics, a.metrics)) return 1;
    return 0;
  });

  // Stage 2: Deterministic Rule 3 repair + Simulated Annealing + Greedy Polish on top candidates
  const topCount = Math.min(8, candidates.length);
  let bestOutput: AttemptOutput | null = null;

  for (let i = 0; i < topCount; i++) {
    const state = candidates[i];
    if (
      state.metrics.sameDayRepeats > 0 ||
      state.metrics.adjacentPairs > 0 ||
      state.metrics.spreadImbalance > 0 ||
      state.metrics.subjectDaySpread > 0
    ) {
      optimizeStateWithAnnealing(state, 9001 + i * 3571);
    }
    const output = finalizeAttemptOutput(state);
    if (bestOutput === null || isMetricsBetter(output.metrics, bestOutput.metrics)) {
      bestOutput = output;
    }
    if (
      bestOutput.metrics.missingHours === 0 &&
      bestOutput.metrics.sameDayRepeats === 0 &&
      bestOutput.metrics.adjacentPairs === 0 &&
      bestOutput.metrics.spreadImbalance === 0 &&
      bestOutput.metrics.subjectDaySpread === 0
    ) {
      break;
    }
  }

  return {
    slots: bestOutput!.slots,
    unresolved: bestOutput!.unresolved,
    fixedClashes,
    consecutiveWarnings: bestOutput!.consecutiveWarnings,
    sameDaySubjectRepeats: bestOutput!.sameDaySubjectRepeats,
    overSixHoursSubjects,
    attemptsUsed,
  };
}

// ----------------------------------------------------------------------------
// Stage 1: Randomized constructive placement + Rule-3-first relocation
// ----------------------------------------------------------------------------
function buildConstructiveState(
  fixedPlacements: FixedPlacement[],
  schedulableWorkload: SchedulableWorkload[],
  attemptSeed: number,
  blockedSlots: BlockedClassSlot[] = []
): BuiltAttemptState {
  const rng = mulberry32(1000 + attemptSeed * 7919);

  const allClassIdSet = new Set<string>();
  const allStaffIdSet = new Set<string>();
  const classSubjectsSet = new Map<string, Set<string>>();
  const subjectDisplayByKey = new Map<string, string>();

  const registerSubject = (classId: string, subjectCode: string) => {
    const sk = normalizeSubjectKey(subjectCode);
    if (!sk || isExemptFixedSubject(sk)) return;
    let sset = classSubjectsSet.get(classId);
    if (!sset) {
      sset = new Set<string>();
      classSubjectsSet.set(classId, sset);
    }
    sset.add(sk);
    const dk = `${classId}::${sk}`;
    if (!subjectDisplayByKey.has(dk)) {
      subjectDisplayByKey.set(dk, subjectCode.trim());
    }
  };

  for (const b of blockedSlots) {
    allClassIdSet.add(b.classId);
    if (b.assignedStaffId) allStaffIdSet.add(b.assignedStaffId);
  }
  for (const fp of fixedPlacements) {
    allClassIdSet.add(fp.classId);
    if (fp.staffId) allStaffIdSet.add(fp.staffId);
    registerSubject(fp.classId, fp.subjectCode);
  }
  for (const w of schedulableWorkload) {
    allClassIdSet.add(w.classId);
    if (w.staffId) allStaffIdSet.add(w.staffId);
    registerSubject(w.classId, w.subjectCode);
  }

  const allClassIds = Array.from(allClassIdSet);
  const allStaffIds = Array.from(allStaffIdSet).sort();
  const classSubjects = new Map<string, string[]>();
  for (const cid of allClassIds) {
    classSubjects.set(cid, Array.from(classSubjectsSet.get(cid) ?? []));
  }

  const classGrid = new Map<string, (ClassCellEntry | undefined)[][]>();
  for (const cid of allClassIds) {
    classGrid.set(
      cid,
      Array.from({ length: 7 }, () => Array<ClassCellEntry | undefined>(6).fill(undefined))
    );
  }

  const staffGrid = new Map<string, (StaffCellEntry | undefined)[][]>();
  const staffDayCount = new Map<string, number[]>();
  const ensureStaff = (sid: string) => {
    if (!staffGrid.has(sid)) {
      staffGrid.set(
        sid,
        Array.from({ length: 7 }, () => Array<StaffCellEntry | undefined>(6).fill(undefined))
      );
      staffDayCount.set(sid, new Array<number>(7).fill(0));
    }
  };
  for (const sid of allStaffIds) {
    ensureStaff(sid);
  }

  const classDaySubjCount = new Map<string, number>();

  const setSlot = (classId: string, d: number, p: number, entry: ClassCellEntry) => {
    classGrid.get(classId)![d][p] = entry;
    if (entry.staffId) {
      ensureStaff(entry.staffId);
      const sg = staffGrid.get(entry.staffId)!;
      if (!sg[d][p]) {
        staffDayCount.get(entry.staffId)![d]++;
      }
      sg[d][p] = {
        kind: entry.kind,
        classId,
        subjectCode: entry.subjectCode,
        isStep0Lab: entry.isStep0Lab,
      };
    }
    if (!entry.isRule3Exempt) {
      const k = dsKey(classId, d, entry.subjectKey);
      classDaySubjCount.set(k, (classDaySubjCount.get(k) ?? 0) + 1);
    }
  };

  const removeGenSlot = (classId: string, d: number, p: number): ClassCellEntry | undefined => {
    const cg = classGrid.get(classId)!;
    const entry = cg[d][p];
    if (!entry || entry.kind !== 'GEN') return undefined;
    cg[d][p] = undefined;
    if (entry.staffId) {
      const sg = staffGrid.get(entry.staffId)!;
      if (sg[d][p]) {
        sg[d][p] = undefined;
        staffDayCount.get(entry.staffId)![d]--;
      }
    }
    if (!entry.isRule3Exempt) {
      const k = dsKey(classId, d, entry.subjectKey);
      const cur = classDaySubjCount.get(k) ?? 0;
      if (cur <= 1) classDaySubjCount.delete(k);
      else classDaySubjCount.set(k, cur - 1);
    }
    return entry;
  };

  // 1. Reserve all Step 0 fixed slots (LANG, ENG, LAB) + optional assigned staff
  for (const b of blockedSlots) {
    const cg = classGrid.get(b.classId)!;
    if (cg[b.dayOrder]?.[b.period]) continue;
    const sid = b.assignedStaffId || null;
    const sg = sid ? staffGrid.get(sid) : undefined;
    const canAssignStaff = sid && (!sg || !sg[b.dayOrder][b.period]);

    cg[b.dayOrder][b.period] = {
      kind: 'BLOCKED',
      workloadId: '',
      staffId: sid,
      subjectCode: b.slotType,
      subjectKey: normalizeSubjectKey(b.slotType),
      isStep0Lab: b.slotType === 'LAB',
      isRule3Exempt: true,
    };
    if (canAssignStaff && sid) {
      ensureStaff(sid);
      staffGrid.get(sid)![b.dayOrder][b.period] = {
        kind: 'BLOCKED',
        classId: b.classId,
        subjectCode: b.slotType,
        isStep0Lab: b.slotType === 'LAB',
      };
      staffDayCount.get(sid)![b.dayOrder]++;
    }
  }

  // 2. Place legacy fixed workload placements (if any)
  for (const fp of fixedPlacements) {
    const cg = classGrid.get(fp.classId)!;
    if (cg[fp.dayOrder]?.[fp.period]) continue;
    if (fp.staffId && staffGrid.get(fp.staffId)?.[fp.dayOrder]?.[fp.period]) continue;
    const sk = normalizeSubjectKey(fp.subjectCode);
    setSlot(fp.classId, fp.dayOrder, fp.period, {
      kind: 'FIXED',
      workloadId: fp.workloadId,
      staffId: fp.staffId,
      subjectCode: fp.subjectCode,
      subjectKey: sk,
      isStep0Lab: false,
      isRule3Exempt: isExemptFixedSubject(sk),
    });
  }

  // Compute total target weekly hours per staff and per (class, subjectKey)
  const staffTotalTargetHours = new Map<string, number>();
  for (const [sid, days] of staffGrid.entries()) {
    let fixedCount = 0;
    for (let d = 1; d <= 6; d++) {
      for (let p = 1; p <= 5; p++) {
        if (days[d][p]) fixedCount++;
      }
    }
    if (fixedCount > 0) staffTotalTargetHours.set(sid, fixedCount);
  }
  const classSubjectTotalHours = new Map<string, number>();
  for (const w of schedulableWorkload) {
    staffTotalTargetHours.set(
      w.staffId,
      (staffTotalTargetHours.get(w.staffId) ?? 0) + w.hoursPerWeek
    );
    const sk = normalizeSubjectKey(w.subjectCode);
    const csk = `${w.classId}::${sk}`;
    classSubjectTotalHours.set(csk, (classSubjectTotalHours.get(csk) ?? 0) + w.hoursPerWeek);
  }

  const allSlotList = allSlots();

  const countNewAdjacentIfPlaced = (staffId: string, d: number, p: number): number => {
    const row = staffGrid.get(staffId)?.[d];
    if (!row) return 0;
    let added = 0;
    if (p > 1 && row[p - 1]) added++;
    if (p < 5 && row[p + 1]) added++;
    return added;
  };

  const countAdjacentSubjectDays = (classId: string, subjectKey: string, d: number): number => {
    let adjDays = 0;
    if (d > 1 && (classDaySubjCount.get(dsKey(classId, d - 1, subjectKey)) ?? 0) > 0) adjDays++;
    if (d < 6 && (classDaySubjCount.get(dsKey(classId, d + 1, subjectKey)) ?? 0) > 0) adjDays++;
    return adjDays;
  };

  const scorePlacement = (
    w: SchedulableWorkload & { subjectKey: string },
    d: number,
    p: number,
    withJitter: boolean
  ): number => {
    const newAdj = countNewAdjacentIfPlaced(w.staffId, d, p);
    const sameSubj = classDaySubjCount.get(dsKey(w.classId, d, w.subjectKey)) ?? 0;
    const curDayCount = staffDayCount.get(w.staffId)?.[d] ?? 0;
    const totalStaffHours = staffTotalTargetHours.get(w.staffId) ?? 6;
    const idealCeil = Math.max(1, Math.ceil(totalStaffHours / 6));

    let score = 0;
    // Rule 3 strongly dominates Rule 2
    if (sameSubj > 0) score += 5_000_000 * sameSubj;
    score += newAdj * 100_000;

    // Even subject day-order spread (discourage consecutive-day bunching when alternatives exist)
    if (sameSubj === 0) {
      const subjTotal = classSubjectTotalHours.get(`${w.classId}::${w.subjectKey}`) ?? w.hoursPerWeek;
      if (subjTotal >= 2 && subjTotal <= 5) {
        const adjDays = countAdjacentSubjectDays(w.classId, w.subjectKey, d);
        if (adjDays === 2) score += 1200; // Bridges into a 3-day run
        else if (adjDays === 1) score += subjTotal <= 3 ? 450 : 220;
      }
    }

    if (curDayCount >= idealCeil) {
      score += 2000 * (curDayCount - idealCeil + 1);
    }
    score += curDayCount * 140;

    // Preserve {1, 3, 5} for heavier-load staff; prefer {2, 4} for lighter-load staff
    const row = staffGrid.get(w.staffId)?.[d];
    if (idealCeil >= 3) {
      if (p === 2 || p === 4) {
        const hasEven = Boolean(row?.[2] || row?.[4]);
        if (!hasEven) score += 45;
      }
    } else if (p === 2 || p === 4) {
      score -= 12;
    }

    if (withJitter) {
      score += rng() * 10;
    }
    return score;
  };

  const isClashFree = (classId: string, staffId: string, d: number, p: number): boolean => {
    if (classGrid.get(classId)?.[d]?.[p]) return false;
    if (staffId && staffGrid.get(staffId)?.[d]?.[p]) return false;
    return true;
  };

  const workloadItems = schedulableWorkload.map((w, idx) => ({
    ...w,
    subjectKey: normalizeSubjectKey(w.subjectCode),
    _key: `${w.workloadId}__${idx}`,
  }));
  const itemRemaining = new Map<string, number>();
  for (const item of workloadItems) {
    itemRemaining.set(item._key, item.hoursPerWeek);
  }

  const prioritizeTotalSubjectHoursFirst = attemptSeed % 2 === 1;

  // Phase 1A: Strict Rule 1 + Strict Rule 3 (sameSubj === 0) + Strict Rule 2 (newAdj === 0)
  for (let round = 0; round < 30; round++) {
    const pending = workloadItems.filter((item) => (itemRemaining.get(item._key) ?? 0) > 0);
    if (pending.length === 0) break;

    const ordered = shuffle(pending, rng).sort((a, b) => {
      const sa = classSubjectTotalHours.get(`${a.classId}::${a.subjectKey}`) ?? a.hoursPerWeek;
      const sb = classSubjectTotalHours.get(`${b.classId}::${b.subjectKey}`) ?? b.hoursPerWeek;
      const ha = staffTotalTargetHours.get(a.staffId) ?? 0;
      const hb = staffTotalTargetHours.get(b.staffId) ?? 0;
      if (prioritizeTotalSubjectHoursFirst) {
        if (sb !== sa) return sb - sa;
        return hb - ha;
      }
      if (hb !== ha) return hb - ha;
      return sb - sa;
    });

    let placedAnyInRound = false;
    for (const item of ordered) {
      const left = itemRemaining.get(item._key) ?? 0;
      if (left <= 0) continue;

      let bestSlot: { dayOrder: number; period: number; score: number } | null = null;
      for (const { dayOrder, period } of shuffle(allSlotList, rng)) {
        if (!isClashFree(item.classId, item.staffId, dayOrder, period)) continue;
        if ((classDaySubjCount.get(dsKey(item.classId, dayOrder, item.subjectKey)) ?? 0) > 0) continue;
        if (countNewAdjacentIfPlaced(item.staffId, dayOrder, period) > 0) continue;

        const score = scorePlacement(item, dayOrder, period, true);
        if (!bestSlot || score < bestSlot.score) {
          bestSlot = { dayOrder, period, score };
        }
      }

      if (bestSlot) {
        setSlot(item.classId, bestSlot.dayOrder, bestSlot.period, {
          kind: 'GEN',
          workloadId: item.workloadId,
          staffId: item.staffId,
          subjectCode: item.subjectCode,
          subjectKey: item.subjectKey,
          isStep0Lab: false,
          isRule3Exempt: isExemptFixedSubject(item.subjectKey),
        });
        itemRemaining.set(item._key, left - 1);
        placedAnyInRound = true;
      }
    }

    if (!placedAnyInRound) break;
  }

  // Phase 2 & 3: 1-hop relocation helper
  const tryRelocateAndPlace = (
    item: (typeof workloadItems)[number],
    allowAdjacent: boolean,
    allowSameDayRepeat: boolean
  ): boolean => {
    let bestDirect: { d: number; p: number; score: number } | null = null;
    for (const { dayOrder: d, period: p } of shuffle(allSlotList, rng)) {
      if (!isClashFree(item.classId, item.staffId, d, p)) continue;
      if (!allowSameDayRepeat && (classDaySubjCount.get(dsKey(item.classId, d, item.subjectKey)) ?? 0) > 0) {
        continue;
      }
      if (!allowAdjacent && countNewAdjacentIfPlaced(item.staffId, d, p) > 0) continue;
      const score = scorePlacement(item, d, p, true);
      if (!bestDirect || score < bestDirect.score) {
        bestDirect = { d, p, score };
      }
    }
    if (bestDirect) {
      setSlot(item.classId, bestDirect.d, bestDirect.p, {
        kind: 'GEN',
        workloadId: item.workloadId,
        staffId: item.staffId,
        subjectCode: item.subjectCode,
        subjectKey: item.subjectKey,
        isStep0Lab: false,
        isRule3Exempt: isExemptFixedSubject(item.subjectKey),
      });
      return true;
    }

    const cg = classGrid.get(item.classId)!;
    const shuffledSlots = shuffle(allSlotList, rng);

    // Try moving an existing subject in the same class to (d2, p2) and placing item at (d1, p1)
    for (const { dayOrder: d1, period: p1 } of shuffledSlots) {
      const other = cg[d1][p1];
      if (!other || other.kind !== 'GEN') continue;
      if (item.staffId && staffGrid.get(item.staffId)?.[d1]?.[p1]) continue;
      if (
        !allowSameDayRepeat &&
        (classDaySubjCount.get(dsKey(item.classId, d1, item.subjectKey)) ?? 0) > 0 &&
        other.subjectKey !== item.subjectKey
      ) {
        continue;
      }
      if (!allowAdjacent && countNewAdjacentIfPlaced(item.staffId, d1, p1) > 0) continue;

      for (const { dayOrder: d2, period: p2 } of shuffledSlots) {
        if (d1 === d2 && p1 === p2) continue;
        if (cg[d2][p2]) continue;
        if (other.staffId && staffGrid.get(other.staffId)?.[d2]?.[p2]) continue;
        if (
          !allowSameDayRepeat &&
          d1 !== d2 &&
          (classDaySubjCount.get(dsKey(item.classId, d2, other.subjectKey)) ?? 0) > 0
        ) {
          continue;
        }

        const removed = removeGenSlot(item.classId, d1, p1);
        if (!removed) continue;

        if (
          !allowSameDayRepeat &&
          (classDaySubjCount.get(dsKey(item.classId, d1, item.subjectKey)) ?? 0) > 0
        ) {
          setSlot(item.classId, d1, p1, removed);
          continue;
        }

        const otherAdj = removed.staffId ? countNewAdjacentIfPlaced(removed.staffId, d2, p2) : 0;
        const itemAdj = countNewAdjacentIfPlaced(item.staffId, d1, p1);
        const crossAdj =
          removed.staffId === item.staffId && d1 === d2 && Math.abs(p1 - p2) === 1 ? 1 : 0;

        if (!allowAdjacent && (otherAdj > 0 || itemAdj > 0 || crossAdj > 0)) {
          setSlot(item.classId, d1, p1, removed);
          continue;
        }

        setSlot(item.classId, d2, p2, removed);
        setSlot(item.classId, d1, p1, {
          kind: 'GEN',
          workloadId: item.workloadId,
          staffId: item.staffId,
          subjectCode: item.subjectCode,
          subjectKey: item.subjectKey,
          isStep0Lab: false,
          isRule3Exempt: isExemptFixedSubject(item.subjectKey),
        });
        return true;
      }
    }

    // Try moving a blocker slot of item.staffId in another class c2 to (d2, p2)
    if (item.staffId) {
      for (const { dayOrder: d1, period: p1 } of shuffledSlots) {
        if (cg[d1][p1]) continue;
        if (
          !allowSameDayRepeat &&
          (classDaySubjCount.get(dsKey(item.classId, d1, item.subjectKey)) ?? 0) > 0
        ) {
          continue;
        }
        const busyInfo = staffGrid.get(item.staffId)?.[d1]?.[p1];
        if (!busyInfo || busyInfo.kind !== 'GEN') continue;

        const c2 = busyInfo.classId;
        const cg2 = classGrid.get(c2)!;
        const blocker = cg2[d1][p1];
        if (!blocker || blocker.kind !== 'GEN') continue;

        for (const { dayOrder: d2, period: p2 } of shuffledSlots) {
          if (cg2[d2][p2]) continue;
          if (staffGrid.get(item.staffId)?.[d2]?.[p2]) continue;
          if (
            !allowSameDayRepeat &&
            d1 !== d2 &&
            (classDaySubjCount.get(dsKey(c2, d2, blocker.subjectKey)) ?? 0) > 0
          ) {
            continue;
          }

          const removed = removeGenSlot(c2, d1, p1);
          if (!removed) continue;

          const blockerAdj = countNewAdjacentIfPlaced(item.staffId, d2, p2);
          setSlot(c2, d2, p2, removed);
          const itemAdj = countNewAdjacentIfPlaced(item.staffId, d1, p1);

          if (!allowAdjacent && (blockerAdj > 0 || itemAdj > 0)) {
            removeGenSlot(c2, d2, p2);
            setSlot(c2, d1, p1, removed);
            continue;
          }

          setSlot(item.classId, d1, p1, {
            kind: 'GEN',
            workloadId: item.workloadId,
            staffId: item.staffId,
            subjectCode: item.subjectCode,
            subjectKey: item.subjectKey,
            isStep0Lab: false,
            isRule3Exempt: isExemptFixedSubject(item.subjectKey),
          });
          return true;
        }
      }
    }

    return false;
  };

  // Phase 2A: 1-hop relocation strictly preserving BOTH Rule 3 and Rule 2 BEFORE relaxing Rule 2
  for (const item of workloadItems) {
    let left = itemRemaining.get(item._key) ?? 0;
    while (left > 0) {
      if (tryRelocateAndPlace(item, false, false)) {
        left--;
        itemRemaining.set(item._key, left);
      } else {
        break;
      }
    }
  }

  // Phase 1B: Direct placement strictly preserving Rule 1 + Rule 3 (sameSubj === 0), allowing Rule 2 adjacency only if Phase 2A couldn't relocate
  for (let round = 0; round < 30; round++) {
    const pending = workloadItems.filter((item) => (itemRemaining.get(item._key) ?? 0) > 0);
    if (pending.length === 0) break;

    const ordered = shuffle(pending, rng).sort((a, b) => {
      const sa = classSubjectTotalHours.get(`${a.classId}::${a.subjectKey}`) ?? a.hoursPerWeek;
      const sb = classSubjectTotalHours.get(`${b.classId}::${b.subjectKey}`) ?? b.hoursPerWeek;
      return sb - sa;
    });

    let placedAnyInRound = false;
    for (const item of ordered) {
      const left = itemRemaining.get(item._key) ?? 0;
      if (left <= 0) continue;

      let bestSlot: { dayOrder: number; period: number; score: number } | null = null;
      for (const { dayOrder, period } of shuffle(allSlotList, rng)) {
        if (!isClashFree(item.classId, item.staffId, dayOrder, period)) continue;
        if ((classDaySubjCount.get(dsKey(item.classId, dayOrder, item.subjectKey)) ?? 0) > 0) continue;

        const score = scorePlacement(item, dayOrder, period, true);
        if (!bestSlot || score < bestSlot.score) {
          bestSlot = { dayOrder, period, score };
        }
      }

      if (bestSlot) {
        setSlot(item.classId, bestSlot.dayOrder, bestSlot.period, {
          kind: 'GEN',
          workloadId: item.workloadId,
          staffId: item.staffId,
          subjectCode: item.subjectCode,
          subjectKey: item.subjectKey,
          isStep0Lab: false,
          isRule3Exempt: isExemptFixedSubject(item.subjectKey),
        });
        itemRemaining.set(item._key, left - 1);
        placedAnyInRound = true;
      }
    }

    if (!placedAnyInRound) break;
  }

  // Phase 2B: 1-hop relocation strictly preserving Rule 3, allowing Rule 2 adjacency if needed
  for (const item of workloadItems) {
    let left = itemRemaining.get(item._key) ?? 0;
    while (left > 0) {
      if (tryRelocateAndPlace(item, true, false)) {
        left--;
        itemRemaining.set(item._key, left);
      } else {
        break;
      }
    }
  }

  // Phase 3: Last-resort placement if Rule 3 cannot fit (e.g. >6h/week or blocked-out days),
  // strictly preserving Rule 1 while minimizing same-day repeats
  for (const item of workloadItems) {
    let left = itemRemaining.get(item._key) ?? 0;
    while (left > 0) {
      if (tryRelocateAndPlace(item, false, true) || tryRelocateAndPlace(item, true, true)) {
        left--;
        itemRemaining.set(item._key, left);
      } else {
        break;
      }
    }
  }

  const unresolvedByWorkload = new Map<string, UnresolvedHours>();
  let totalMissingHours = 0;
  for (const item of workloadItems) {
    const left = itemRemaining.get(item._key) ?? 0;
    if (left > 0) {
      totalMissingHours += left;
      const existing = unresolvedByWorkload.get(item.workloadId);
      if (existing) {
        existing.missingHours += left;
      } else {
        unresolvedByWorkload.set(item.workloadId, {
          workloadId: item.workloadId,
          classId: item.classId,
          subjectCode: item.subjectCode,
          staffId: item.staffId,
          missingHours: left,
        });
      }
    }
  }

  const metrics = evaluateAttemptMetrics(
    staffGrid,
    staffTotalTargetHours,
    classDaySubjCount,
    classSubjects,
    totalMissingHours
  );

  return {
    allClassIds,
    allStaffIds,
    classGrid,
    staffGrid,
    staffDayCount,
    staffTotalTargetHours,
    classDaySubjCount,
    classSubjects,
    subjectDisplayByKey,
    unresolved: Array.from(unresolvedByWorkload.values()),
    metrics,
  };
}

// ----------------------------------------------------------------------------
// Stage 2: Deterministic Rule 3 Repair + Simulated Annealing + Greedy Polish
// Strictly preserves Rule 1 (never introduces a staff double-booking) and
// strictly respects Priority: Rule 1 >> Rule 3 >> Rule 2 >> Spread.
// ----------------------------------------------------------------------------
function optimizeStateWithAnnealing(state: BuiltAttemptState, seed: number): void {
  const rng = mulberry32(seed);
  const {
    allClassIds,
    allStaffIds,
    classGrid,
    staffGrid,
    staffDayCount,
    staffTotalTargetHours,
    classDaySubjCount,
    classSubjects,
  } = state;

  const movableCoordsByClass = new Map<string, Array<{ d: number; p: number }>>();
  const freeOrMovableCoordsByClass = new Map<string, Array<{ d: number; p: number }>>();

  for (const cid of allClassIds) {
    const cg = classGrid.get(cid)!;
    const mov: Array<{ d: number; p: number }> = [];
    const openOrMov: Array<{ d: number; p: number }> = [];
    for (let d = 1; d <= 6; d++) {
      for (let p = 1; p <= 5; p++) {
        const entry = cg[d][p];
        if (!entry) {
          openOrMov.push({ d, p });
        } else if (entry.kind === 'GEN') {
          mov.push({ d, p });
          openOrMov.push({ d, p });
        }
      }
    }
    if (mov.length > 0 && openOrMov.length > 1) {
      movableCoordsByClass.set(cid, mov);
      freeOrMovableCoordsByClass.set(cid, openOrMov);
    }
  }

  const activeClasses = Array.from(movableCoordsByClass.keys());
  if (activeClasses.length === 0) return;

  const setSlot = (classId: string, d: number, p: number, entry: ClassCellEntry) => {
    classGrid.get(classId)![d][p] = entry;
    if (entry.staffId) {
      const sg = staffGrid.get(entry.staffId)!;
      if (!sg[d][p]) staffDayCount.get(entry.staffId)![d]++;
      sg[d][p] = {
        kind: entry.kind,
        classId,
        subjectCode: entry.subjectCode,
        isStep0Lab: entry.isStep0Lab,
      };
    }
    if (!entry.isRule3Exempt) {
      const k = dsKey(classId, d, entry.subjectKey);
      classDaySubjCount.set(k, (classDaySubjCount.get(k) ?? 0) + 1);
    }
  };

  const removeGenSlot = (classId: string, d: number, p: number): ClassCellEntry | undefined => {
    const cg = classGrid.get(classId)!;
    const entry = cg[d][p];
    if (!entry || entry.kind !== 'GEN') return undefined;
    cg[d][p] = undefined;
    if (entry.staffId) {
      const sg = staffGrid.get(entry.staffId)!;
      if (sg[d][p]) {
        sg[d][p] = undefined;
        staffDayCount.get(entry.staffId)![d]--;
      }
    }
    if (!entry.isRule3Exempt) {
      const k = dsKey(classId, d, entry.subjectKey);
      const cur = classDaySubjCount.get(k) ?? 0;
      if (cur <= 1) classDaySubjCount.delete(k);
      else classDaySubjCount.set(k, cur - 1);
    }
    return entry;
  };

  const staffCost = (staffId: string): { adj: number; spread: number } => {
    const days = staffGrid.get(staffId);
    if (!days) return { adj: 0, spread: 0 };
    const targetTotal = staffTotalTargetHours.get(staffId) ?? 0;
    let adj = 0;
    let sumSq = 0;
    let actualTotal = 0;
    for (let d = 1; d <= 6; d++) {
      let dayCount = 0;
      const row = days[d];
      for (let p = 1; p <= 5; p++) {
        if (row[p]) dayCount++;
        if (p <= 4 && row[p] && row[p + 1] && !isExemptLabPair(row[p], row[p + 1])) {
          adj++;
        }
      }
      actualTotal += dayCount;
      const diff = dayCount * 6 - targetTotal;
      sumSq += diff * diff;
    }
    const spread = Math.max(0, sumSq - minSpreadScore(actualTotal));
    return { adj, spread };
  };

  const subjectDayCost = (classId: string, subjectKey: string): number => {
    const countOn = (d: number) => classDaySubjCount.get(dsKey(classId, d, subjectKey)) ?? 0;
    let repeats = 0;
    let excess = 0;
    for (let d = 1; d <= 6; d++) {
      const c = countOn(d);
      if (c > 1) {
        repeats += c - 1;
        excess += (c * (c - 1)) / 2;
      }
    }
    const daySpread = computeSubjectDaySpreadForOne(classId, subjectKey, classDaySubjCount);
    return { repeats, excess, daySpread } as any;
  };

  const getSubjectStats = (classId: string, subjectKey: string) => {
    let repeats = 0;
    let excess = 0;
    for (let d = 1; d <= 6; d++) {
      const c = classDaySubjCount.get(dsKey(classId, d, subjectKey)) ?? 0;
      if (c > 1) {
        repeats += c - 1;
        excess += (c * (c - 1)) / 2;
      }
    }
    const daySpread = computeSubjectDaySpreadForOne(classId, subjectKey, classDaySubjCount);
    return { repeats, excess, daySpread };
  };
  void subjectDayCost;

  // Priority-weighted scalar energy:
  //   sameDayRepeats (1,500,000) + sameDayExcessCost (500,000) >> adjacentPairs (10,000) >> spreadImbalance (50) & subjectDaySpread (45)
  const calcEnergy = (m: AttemptMetrics) =>
    m.sameDayRepeats * 1_500_000 +
    m.sameDayExcessCost * 500_000 +
    m.adjacentPairs * 10_000 +
    m.spreadImbalance * 50 +
    m.subjectDaySpread * 45;

  let curMetrics = { ...state.metrics };
  let curEnergy = calcEnergy(curMetrics);

  // Fast deterministic Rule 3 repair pass BEFORE Simulated Annealing:
  // Fixes any remaining avoidable same-day subject repeats via:
  //   (a) direct move to an open day without that subject
  //   (b) 1-hop within-class swap with a slot on a missing day
  //   (c) 2-step within-class chain: move a blocker subject on missingDay to an open slot, then move repeated subject to missingDay
  //   (d) 1-hop cross-class move of a staff blocker on missingDay
  const repairRule3Deterministically = () => {
    for (let pass = 0; pass < 4; pass++) {
      let improved = false;
      for (const cid of activeClasses) {
        const cg = classGrid.get(cid)!;
        for (let d1 = 1; d1 <= 6; d1++) {
          for (let p1 = 1; p1 <= 5; p1++) {
            const s1 = cg[d1][p1];
            if (!s1 || s1.kind !== 'GEN' || s1.isRule3Exempt || !s1.staffId) continue;
            if ((classDaySubjCount.get(dsKey(cid, d1, s1.subjectKey)) ?? 0) <= 1) continue;

            // Find a day d2 where s1.subjectKey currently has 0 occurrences
            let fixed = false;
            for (let d2 = 1; d2 <= 6 && !fixed; d2++) {
              if (d2 === d1) continue;
              if ((classDaySubjCount.get(dsKey(cid, d2, s1.subjectKey)) ?? 0) > 0) continue;

              // (a) Empty slot in cid at (d2, p2)
              for (let p2 = 1; p2 <= 5 && !fixed; p2++) {
                if (cg[d2][p2]) continue;
                if (staffGrid.get(s1.staffId)?.[d2]?.[p2]) continue;
                const r1 = removeGenSlot(cid, d1, p1)!;
                setSlot(cid, d2, p2, r1);
                fixed = true;
                improved = true;
              }

              // (b) Swap with another GEN subject s2 at (d2, p2)
              for (let p2 = 1; p2 <= 5 && !fixed; p2++) {
                const s2 = cg[d2][p2];
                if (!s2 || s2.kind !== 'GEN' || !s2.staffId || s2.subjectKey === s1.subjectKey) continue;
                if (!s2.isRule3Exempt && (classDaySubjCount.get(dsKey(cid, d1, s2.subjectKey)) ?? 0) > 0) continue;
                if (staffGrid.get(s1.staffId)?.[d2]?.[p2]) continue;
                if (staffGrid.get(s2.staffId)?.[d1]?.[p1]) continue;

                const r1 = removeGenSlot(cid, d1, p1)!;
                const r2 = removeGenSlot(cid, d2, p2)!;
                setSlot(cid, d2, p2, r1);
                setSlot(cid, d1, p1, r2);
                fixed = true;
                improved = true;
              }

              // (c) 2-step within-class chain: move s2 at (d2, p2) to any open (d3, p3) where s2 has 0 on d3, then move s1 -> (d2, p2)
              for (let p2 = 1; p2 <= 5 && !fixed; p2++) {
                const s2 = cg[d2][p2];
                if (!s2 || s2.kind !== 'GEN' || !s2.staffId || s2.subjectKey === s1.subjectKey) continue;
                if (staffGrid.get(s1.staffId)?.[d2]?.[p2]) continue;

                for (let d3 = 1; d3 <= 6 && !fixed; d3++) {
                  if (d3 === d2) continue;
                  if (!s2.isRule3Exempt && (classDaySubjCount.get(dsKey(cid, d3, s2.subjectKey)) ?? 0) > 0) continue;
                  for (let p3 = 1; p3 <= 5 && !fixed; p3++) {
                    if (cg[d3][p3]) continue;
                    if (staffGrid.get(s2.staffId)?.[d3]?.[p3]) continue;

                    const r2 = removeGenSlot(cid, d2, p2)!;
                    setSlot(cid, d3, p3, r2);
                    const r1 = removeGenSlot(cid, d1, p1)!;
                    setSlot(cid, d2, p2, r1);
                    fixed = true;
                    improved = true;
                  }
                }
              }

              // (d) Cross-class move: free s1.staffId at (d2, p2) when cg[d2][p2] is empty
              for (let p2 = 1; p2 <= 5 && !fixed; p2++) {
                if (cg[d2][p2]) continue;
                const busy = staffGrid.get(s1.staffId)?.[d2]?.[p2];
                if (!busy || busy.kind !== 'GEN') continue;
                const c2 = busy.classId;
                const cg2 = classGrid.get(c2)!;
                const blocker = cg2[d2][p2];
                if (!blocker || blocker.kind !== 'GEN' || !blocker.staffId) continue;

                for (let d3 = 1; d3 <= 6 && !fixed; d3++) {
                  if (
                    d3 !== d2 &&
                    !blocker.isRule3Exempt &&
                    (classDaySubjCount.get(dsKey(c2, d3, blocker.subjectKey)) ?? 0) > 0
                  ) {
                    continue;
                  }
                  for (let p3 = 1; p3 <= 5 && !fixed; p3++) {
                    if (cg2[d3][p3]) continue;
                    if (staffGrid.get(blocker.staffId)?.[d3]?.[p3]) continue;

                    const movedBlocker = removeGenSlot(c2, d2, p2)!;
                    setSlot(c2, d3, p3, movedBlocker);
                    const r1 = removeGenSlot(cid, d1, p1)!;
                    setSlot(cid, d2, p2, r1);
                    fixed = true;
                    improved = true;
                  }
                }
              }
            }
          }
        }
      }
      if (!improved) break;
    }
  };

  if (curMetrics.sameDayRepeats > 0) {
    repairRule3Deterministically();
    curMetrics = evaluateAttemptMetrics(
      staffGrid,
      staffTotalTargetHours,
      classDaySubjCount,
      classSubjects,
      curMetrics.missingHours
    );
    curEnergy = calcEnergy(curMetrics);
  }

  type SavedSlot = { cid: string; d: number; p: number; entry: ClassCellEntry };
  const snapshotGen = (): SavedSlot[] => {
    const out: SavedSlot[] = [];
    for (const cid of activeClasses) {
      const cg = classGrid.get(cid)!;
      for (let d = 1; d <= 6; d++) {
        for (let p = 1; p <= 5; p++) {
          const e = cg[d][p];
          if (e && e.kind === 'GEN') out.push({ cid, d, p, entry: e });
        }
      }
    }
    return out;
  };

  let bestMetrics = { ...curMetrics };
  let bestSnapshot = snapshotGen();

  const totalSteps = 26000;
  for (let step = 0; step < totalSteps; step++) {
    if (
      bestMetrics.sameDayRepeats === 0 &&
      bestMetrics.adjacentPairs === 0 &&
      bestMetrics.spreadImbalance === 0 &&
      bestMetrics.subjectDaySpread === 0
    ) {
      break;
    }

    let cid: string | undefined;
    let c1: { d: number; p: number } | undefined;

    // 1. Bias 15% of steps toward any Rule 3 repeat cells if present
    if (curMetrics.sameDayRepeats > 0 && step % 10 < 2) {
      const repeatCells: Array<{ cid: string; d: number; p: number }> = [];
      for (const c of activeClasses) {
        const cg = classGrid.get(c)!;
        for (let d = 1; d <= 6; d++) {
          for (let p = 1; p <= 5; p++) {
            const e = cg[d][p];
            if (e && e.kind === 'GEN' && !e.isRule3Exempt) {
              if ((classDaySubjCount.get(dsKey(c, d, e.subjectKey)) ?? 0) > 1) {
                repeatCells.push({ cid: c, d, p });
              }
            }
          }
        }
      }
      if (repeatCells.length > 0) {
        const pick = repeatCells[Math.floor(rng() * repeatCells.length)];
        cid = pick.cid;
        c1 = { d: pick.d, p: pick.p };
      }
    }

    // 2. Bias 65% of steps toward staff with adjacent pairs or spread imbalance
    if (
      (!cid || !c1) &&
      step % 10 >= 2 &&
      step % 10 < 8 &&
      (curMetrics.adjacentPairs > 0 || curMetrics.spreadImbalance > 0)
    ) {
      const problemStaff: string[] = [];
      for (const sid of allStaffIds) {
        const sc = staffCost(sid);
        if (sc.adj > 0 || sc.spread > 0) problemStaff.push(sid);
      }
      if (problemStaff.length > 0) {
        const sid = problemStaff[Math.floor(rng() * problemStaff.length)];
        const days = staffGrid.get(sid)!;
        const staffSlots: Array<{ cid: string; d: number; p: number }> = [];
        for (let d = 1; d <= 6; d++) {
          for (let p = 1; p <= 5; p++) {
            const cell = days[d][p];
            if (cell && cell.kind === 'GEN') {
              staffSlots.push({ cid: cell.classId, d, p });
            }
          }
        }
        if (staffSlots.length > 0) {
          const pick = staffSlots[Math.floor(rng() * staffSlots.length)];
          cid = pick.cid;
          c1 = { d: pick.d, p: pick.p };
        }
      }
    }

    if (!cid || !c1) {
      cid = activeClasses[Math.floor(rng() * activeClasses.length)];
      const mov = movableCoordsByClass.get(cid)!;
      c1 = mov[Math.floor(rng() * mov.length)];
    }

    const targets = freeOrMovableCoordsByClass.get(cid);
    if (!targets || targets.length < 2) continue;
    const c2 = targets[Math.floor(rng() * targets.length)];
    if (c1.d === c2.d && c1.p === c2.p) continue;

    const cg = classGrid.get(cid)!;
    const s1 = cg[c1.d][c1.p];
    if (!s1 || s1.kind !== 'GEN' || !s1.staffId) continue;
    const s2 = cg[c2.d][c2.p];

    if (!s2) {
      // Shift s1 -> empty c2 (Rule 1 check)
      if (staffGrid.get(s1.staffId)?.[c2.d]?.[c2.p]) continue;

      const beforeCost = staffCost(s1.staffId);
      const beforeSubj =
        c1.d === c2.d || s1.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, s1.subjectKey);

      const r1 = removeGenSlot(cid, c1.d, c1.p)!;
      setSlot(cid, c2.d, c2.p, r1);

      const afterCost = staffCost(s1.staffId);
      const afterSubj =
        c1.d === c2.d || s1.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, s1.subjectKey);

      const nextMetrics: AttemptMetrics = {
        missingHours: curMetrics.missingHours,
        sameDayRepeats: curMetrics.sameDayRepeats + (afterSubj.repeats - beforeSubj.repeats),
        sameDayExcessCost: curMetrics.sameDayExcessCost + (afterSubj.excess - beforeSubj.excess),
        adjacentPairs: curMetrics.adjacentPairs + (afterCost.adj - beforeCost.adj),
        spreadImbalance: curMetrics.spreadImbalance + (afterCost.spread - beforeCost.spread),
        subjectDaySpread: curMetrics.subjectDaySpread + (afterSubj.daySpread - beforeSubj.daySpread),
      };
      const nextEnergy = calcEnergy(nextMetrics);
      const delta = nextEnergy - curEnergy;
      const temp = Math.max(5, 14000 * Math.pow(1 - step / totalSteps, 2.2));

      if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
        curMetrics = nextMetrics;
        curEnergy = nextEnergy;
        if (isMetricsBetter(curMetrics, bestMetrics)) {
          bestMetrics = { ...curMetrics };
          bestSnapshot = snapshotGen();
        }
      } else {
        removeGenSlot(cid, c2.d, c2.p);
        setSlot(cid, c1.d, c1.p, r1);
      }
    } else if (s2.kind === 'GEN' && s2.staffId && s1.staffId !== s2.staffId) {
      // Swap s1 <-> s2 inside `cid` (Rule 1 check on both)
      if (staffGrid.get(s1.staffId)?.[c2.d]?.[c2.p]) continue;
      if (staffGrid.get(s2.staffId)?.[c1.d]?.[c1.p]) continue;

      const c1Before = staffCost(s1.staffId);
      const c2Before = staffCost(s2.staffId);
      const sameSubjKey = s1.subjectKey === s2.subjectKey;
      const s1BeforeSubj =
        c1.d === c2.d || sameSubjKey || s1.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, s1.subjectKey);
      const s2BeforeSubj =
        c1.d === c2.d || sameSubjKey || s2.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, s2.subjectKey);

      const r1 = removeGenSlot(cid, c1.d, c1.p)!;
      const r2 = removeGenSlot(cid, c2.d, c2.p)!;
      setSlot(cid, c2.d, c2.p, r1);
      setSlot(cid, c1.d, c1.p, r2);

      const c1After = staffCost(r1.staffId!);
      const c2After = staffCost(r2.staffId!);
      const s1AfterSubj =
        c1.d === c2.d || sameSubjKey || r1.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, r1.subjectKey);
      const s2AfterSubj =
        c1.d === c2.d || sameSubjKey || r2.isRule3Exempt
          ? { repeats: 0, excess: 0, daySpread: 0 }
          : getSubjectStats(cid, r2.subjectKey);

      const nextMetrics: AttemptMetrics = {
        missingHours: curMetrics.missingHours,
        sameDayRepeats:
          curMetrics.sameDayRepeats +
          (s1AfterSubj.repeats - s1BeforeSubj.repeats) +
          (s2AfterSubj.repeats - s2BeforeSubj.repeats),
        sameDayExcessCost:
          curMetrics.sameDayExcessCost +
          (s1AfterSubj.excess - s1BeforeSubj.excess) +
          (s2AfterSubj.excess - s2BeforeSubj.excess),
        adjacentPairs: curMetrics.adjacentPairs + (c1After.adj + c2After.adj - (c1Before.adj + c2Before.adj)),
        spreadImbalance:
          curMetrics.spreadImbalance + (c1After.spread + c2After.spread - (c1Before.spread + c2Before.spread)),
        subjectDaySpread:
          curMetrics.subjectDaySpread +
          (s1AfterSubj.daySpread - s1BeforeSubj.daySpread) +
          (s2AfterSubj.daySpread - s2BeforeSubj.daySpread),
      };
      const nextEnergy = calcEnergy(nextMetrics);
      const delta = nextEnergy - curEnergy;
      const temp = Math.max(5, 14000 * Math.pow(1 - step / totalSteps, 2.2));

      if (delta <= 0 || rng() < Math.exp(-delta / temp)) {
        curMetrics = nextMetrics;
        curEnergy = nextEnergy;
        if (isMetricsBetter(curMetrics, bestMetrics)) {
          bestMetrics = { ...curMetrics };
          bestSnapshot = snapshotGen();
        }
      } else {
        removeGenSlot(cid, c2.d, c2.p);
        removeGenSlot(cid, c1.d, c1.p);
        setSlot(cid, c1.d, c1.p, r1);
        setSlot(cid, c2.d, c2.p, r2);
      }
    }
  }

  // Restore bestSnapshot if current drifted at warm temp
  if (!isMetricsBetter(curMetrics, bestMetrics)) {
    for (const cid of activeClasses) {
      const cg = classGrid.get(cid)!;
      for (let d = 1; d <= 6; d++) {
        for (let p = 1; p <= 5; p++) {
          if (cg[d][p]?.kind === 'GEN') {
            removeGenSlot(cid, d, p);
          }
        }
      }
    }
    for (const item of bestSnapshot) {
      setSlot(item.cid, item.d, item.p, item.entry);
    }
    curMetrics = { ...bestMetrics };
  }

  // Final deterministic greedy polish sweep strictly respecting Rule 1 >> Rule 3 >> Rule 2 >> Spread
  for (let sweep = 0; sweep < 5; sweep++) {
    let changed = false;
    for (const cid of activeClasses) {
      const cg = classGrid.get(cid)!;
      const targets = freeOrMovableCoordsByClass.get(cid)!;
      for (const c1 of movableCoordsByClass.get(cid)!) {
        const s1 = cg[c1.d][c1.p];
        if (!s1 || s1.kind !== 'GEN' || !s1.staffId) continue;
        for (const c2 of targets) {
          if (c1.d === c2.d && c1.p === c2.p) continue;
          const s2 = cg[c2.d][c2.p];
          if (!s2) {
            if (staffGrid.get(s1.staffId)?.[c2.d]?.[c2.p]) continue;
            const beforeStaff = staffCost(s1.staffId);
            const beforeSubj =
              c1.d === c2.d || s1.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, s1.subjectKey);

            const r1 = removeGenSlot(cid, c1.d, c1.p)!;
            setSlot(cid, c2.d, c2.p, r1);

            const afterStaff = staffCost(s1.staffId);
            const afterSubj =
              c1.d === c2.d || s1.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, s1.subjectKey);

            const candidateMetrics: AttemptMetrics = {
              missingHours: curMetrics.missingHours,
              sameDayRepeats: curMetrics.sameDayRepeats + (afterSubj.repeats - beforeSubj.repeats),
              sameDayExcessCost: curMetrics.sameDayExcessCost + (afterSubj.excess - beforeSubj.excess),
              adjacentPairs: curMetrics.adjacentPairs + (afterStaff.adj - beforeStaff.adj),
              spreadImbalance: curMetrics.spreadImbalance + (afterStaff.spread - beforeStaff.spread),
              subjectDaySpread:
                curMetrics.subjectDaySpread + (afterSubj.daySpread - beforeSubj.daySpread),
            };

            if (isMetricsBetter(candidateMetrics, curMetrics)) {
              curMetrics = candidateMetrics;
              changed = true;
              break;
            }
            removeGenSlot(cid, c2.d, c2.p);
            setSlot(cid, c1.d, c1.p, r1);
          } else if (s2.kind === 'GEN' && s2.staffId && s1.staffId !== s2.staffId) {
            if (staffGrid.get(s1.staffId)?.[c2.d]?.[c2.p]) continue;
            if (staffGrid.get(s2.staffId)?.[c1.d]?.[c1.p]) continue;

            const b1 = staffCost(s1.staffId);
            const b2 = staffCost(s2.staffId);
            const sameSubjKey = s1.subjectKey === s2.subjectKey;
            const s1b =
              c1.d === c2.d || sameSubjKey || s1.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, s1.subjectKey);
            const s2b =
              c1.d === c2.d || sameSubjKey || s2.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, s2.subjectKey);

            const r1 = removeGenSlot(cid, c1.d, c1.p)!;
            const r2 = removeGenSlot(cid, c2.d, c2.p)!;
            setSlot(cid, c2.d, c2.p, r1);
            setSlot(cid, c1.d, c1.p, r2);

            const a1 = staffCost(r1.staffId!);
            const a2 = staffCost(r2.staffId!);
            const s1a =
              c1.d === c2.d || sameSubjKey || r1.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, r1.subjectKey);
            const s2a =
              c1.d === c2.d || sameSubjKey || r2.isRule3Exempt
                ? { repeats: 0, excess: 0, daySpread: 0 }
                : getSubjectStats(cid, r2.subjectKey);

            const candidateMetrics: AttemptMetrics = {
              missingHours: curMetrics.missingHours,
              sameDayRepeats:
                curMetrics.sameDayRepeats + (s1a.repeats - s1b.repeats) + (s2a.repeats - s2b.repeats),
              sameDayExcessCost:
                curMetrics.sameDayExcessCost + (s1a.excess - s1b.excess) + (s2a.excess - s2b.excess),
              adjacentPairs: curMetrics.adjacentPairs + (a1.adj + a2.adj - (b1.adj + b2.adj)),
              spreadImbalance:
                curMetrics.spreadImbalance + (a1.spread + a2.spread - (b1.spread + b2.spread)),
              subjectDaySpread:
                curMetrics.subjectDaySpread +
                (s1a.daySpread - s1b.daySpread) +
                (s2a.daySpread - s2b.daySpread),
            };

            if (isMetricsBetter(candidateMetrics, curMetrics)) {
              curMetrics = candidateMetrics;
              changed = true;
              break;
            }
            removeGenSlot(cid, c2.d, c2.p);
            removeGenSlot(cid, c1.d, c1.p);
            setSlot(cid, c1.d, c1.p, r1);
            setSlot(cid, c2.d, c2.p, r2);
          }
        }
      }
    }
    if (!changed) break;
  }

  state.metrics = evaluateAttemptMetrics(
    staffGrid,
    staffTotalTargetHours,
    classDaySubjCount,
    classSubjects,
    state.metrics.missingHours
  );
}

function finalizeAttemptOutput(state: BuiltAttemptState): AttemptOutput {
  const { allClassIds, allStaffIds, classGrid, staffGrid, unresolved, metrics, subjectDisplayByKey } = state;

  const slots: SlotAssignment[] = [];
  const sameDaySubjectRepeats: SameDaySubjectRepeatWarning[] = [];

  for (const cid of allClassIds) {
    const cg = classGrid.get(cid)!;
    for (let d = 1; d <= 6; d++) {
      const daySubjCount = new Map<string, number>();
      for (let p = 1; p <= 5; p++) {
        const entry = cg[d][p];
        if (!entry || entry.kind === 'BLOCKED') continue;
        slots.push({
          classId: cid,
          dayOrder: d,
          period: p,
          workloadId: entry.workloadId,
          staffId: entry.staffId ?? '',
          subjectCode: entry.subjectCode,
          isFixed: entry.kind === 'FIXED',
        });
        if (!entry.isRule3Exempt) {
          daySubjCount.set(entry.subjectKey, (daySubjCount.get(entry.subjectKey) ?? 0) + 1);
        }
      }
      for (const [sk, count] of daySubjCount.entries()) {
        if (count > 1) {
          sameDaySubjectRepeats.push({
            classId: cid,
            subjectCode: subjectDisplayByKey.get(`${cid}::${sk}`) ?? sk,
            dayOrder: d,
            count,
          });
        }
      }
    }
  }

  const consecutiveWarnings: ConsecutivePeriodWarning[] = [];
  for (const sid of allStaffIds) {
    const days = staffGrid.get(sid);
    if (!days) continue;
    for (let d = 1; d <= 6; d++) {
      const row = days[d];
      for (let p = 1; p <= 4; p++) {
        const a = row[p];
        const b = row[p + 1];
        if (a && b && !isExemptLabPair(a, b)) {
          consecutiveWarnings.push({
            staffId: sid,
            dayOrder: d,
            periodA: p,
            periodB: p + 1,
            subjects: [a.subjectCode, b.subjectCode],
          });
        }
      }
    }
  }

  return {
    slots,
    unresolved,
    consecutiveWarnings,
    sameDaySubjectRepeats,
    metrics,
  };
}
