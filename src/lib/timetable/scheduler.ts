// ============================================================================
// ACCFIN Timetable Generator — Scheduling Engine
// ----------------------------------------------------------------------------
// Pure functions, no Supabase/DB calls here — this file only knows about
// plain data in and plain data out, so it can be unit-tested and reused from
// any server action.
//
// HARD & SOFT CONSTRAINTS
// -----------------------
//   Rule 1 [HARD — NEVER RELAXED]:
//     (a) A class never has two subjects in the same (dayOrder, period).
//     (b) A staff member can teach only one class at any given (dayOrder, period)
//         across all classes/sections, including individual split-hour shares
//         and staff optionally attached to Step 0 fixed LANG/ENG/LAB cells.
//         If no clash-free slot exists, leave the hour unplaced and report it.
//
//   Rule 2 [SPACING & SPREAD]:
//     (a) Within one Day Order, a staff member's periods should not be
//         consecutive (P1-P2, P2-P3, P3-P4, P4-P5; P3-P4 is treated as adjacent
//         despite the break). Exemption: Step 0 fixed LAB blocks spanning
//         consecutive periods in the same class are management-set and exempt.
//     (b) Weekly hours for each staff member are spread as evenly as possible
//         across Day Orders I–VI rather than stacked on a few days.
//     (c) Multi-restart randomized construction + 1-hop relocation + targeted
//         simulated-annealing / greedy swap optimization minimize
//         (unresolvedHours, nonExemptAdjacentPairs, weeklySpreadImbalance,
//         sameSubjectSameDay). Any unavoidable adjacent pair is reported in
//         consecutiveWarnings.
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

export interface GenerateScheduleResult {
  slots: SlotAssignment[];
  unresolved: UnresolvedHours[];
  fixedClashes: FixedClash[];
  consecutiveWarnings: ConsecutivePeriodWarning[];
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
// Internal grid state used inside each scheduling attempt
// ----------------------------------------------------------------------------
interface ClassCellEntry {
  kind: 'BLOCKED' | 'FIXED' | 'GEN';
  workloadId: string;
  staffId: string | null;
  subjectCode: string;
  isStep0Lab: boolean;
}

interface StaffCellEntry {
  kind: 'BLOCKED' | 'FIXED' | 'GEN';
  classId: string;
  subjectCode: string;
  isStep0Lab: boolean;
}

interface AttemptMetrics {
  missingHours: number;
  adjacentPairs: number;
  spreadImbalance: number;
  sameDayRepeats: number;
}

interface BuiltAttemptState {
  allClassIds: string[];
  allStaffIds: string[];
  classGrid: Map<string, (ClassCellEntry | undefined)[][]>;
  staffGrid: Map<string, (StaffCellEntry | undefined)[][]>;
  staffDayCount: Map<string, number[]>;
  staffTotalTargetHours: Map<string, number>;
  classDaySubjCount: Map<string, number>;
  unresolved: UnresolvedHours[];
  metrics: AttemptMetrics;
}

interface AttemptOutput {
  slots: SlotAssignment[];
  unresolved: UnresolvedHours[];
  consecutiveWarnings: ConsecutivePeriodWarning[];
  metrics: AttemptMetrics;
}

function minSpreadScore(totalHours: number): number {
  const r = totalHours % 6;
  return 6 * r * (6 - r);
}

function isExemptLabPair(a: StaffCellEntry | undefined, b: StaffCellEntry | undefined): boolean {
  return Boolean(a && b && a.isStep0Lab && b.isStep0Lab && a.classId === b.classId);
}

function dsKey(classId: string, d: number, subjectCode: string): string {
  return `${classId}_${d}_${subjectCode}`;
}

function evaluateAttemptMetrics(
  staffGrid: Map<string, (StaffCellEntry | undefined)[][]>,
  staffTotalTargetHours: Map<string, number>,
  classDaySubjCount: Map<string, number>,
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
  for (const count of classDaySubjCount.values()) {
    if (count > 1) sameDayRepeats += count - 1;
  }

  return { missingHours, adjacentPairs, spreadImbalance, sameDayRepeats };
}

function isMetricsBetter(a: AttemptMetrics, b: AttemptMetrics): boolean {
  if (a.missingHours !== b.missingHours) return a.missingHours < b.missingHours;
  if (a.adjacentPairs !== b.adjacentPairs) return a.adjacentPairs < b.adjacentPairs;
  if (a.spreadImbalance !== b.spreadImbalance) return a.spreadImbalance < b.spreadImbalance;
  return a.sameDayRepeats < b.sameDayRepeats;
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

  // Stage 1: Fast randomized construction + 1-hop relocation across restarts
  const candidates: BuiltAttemptState[] = [];
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    attemptsUsed = attempt + 1;
    const state = buildConstructiveState(cleanFixedPlacements, schedulableWorkload, attempt, blockedSlots);
    candidates.push(state);
    if (
      state.metrics.missingHours === 0 &&
      state.metrics.adjacentPairs === 0 &&
      state.metrics.spreadImbalance === 0 &&
      state.metrics.sameDayRepeats === 0
    ) {
      break;
    }
  }

  // Sort candidates by (missingHours, adjacentPairs, spreadImbalance, sameDayRepeats)
  candidates.sort((a, b) => {
    if (isMetricsBetter(a.metrics, b.metrics)) return -1;
    if (isMetricsBetter(b.metrics, a.metrics)) return 1;
    return 0;
  });

  // Stage 2: Run fast Simulated Annealing + Hill-Climbing repair on top candidates
  const topCount = Math.min(6, candidates.length);
  let bestOutput: AttemptOutput | null = null;

  for (let i = 0; i < topCount; i++) {
    const state = candidates[i];
    if (
      state.metrics.adjacentPairs > 0 ||
      state.metrics.spreadImbalance > 0 ||
      state.metrics.sameDayRepeats > 0
    ) {
      optimizeStateWithAnnealing(state, 9001 + i * 3571);
    }
    const output = finalizeAttemptOutput(state);
    if (bestOutput === null || isMetricsBetter(output.metrics, bestOutput.metrics)) {
      bestOutput = output;
    }
    if (
      bestOutput.metrics.missingHours === 0 &&
      bestOutput.metrics.adjacentPairs === 0 &&
      bestOutput.metrics.spreadImbalance === 0
    ) {
      break;
    }
  }

  return {
    slots: bestOutput!.slots,
    unresolved: bestOutput!.unresolved,
    fixedClashes,
    consecutiveWarnings: bestOutput!.consecutiveWarnings,
    attemptsUsed,
  };
}

// ----------------------------------------------------------------------------
// Stage 1: Randomized constructive placement + 1-hop relocation
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
  for (const b of blockedSlots) {
    allClassIdSet.add(b.classId);
    if (b.assignedStaffId) allStaffIdSet.add(b.assignedStaffId);
  }
  for (const fp of fixedPlacements) {
    allClassIdSet.add(fp.classId);
    if (fp.staffId) allStaffIdSet.add(fp.staffId);
  }
  for (const w of schedulableWorkload) {
    allClassIdSet.add(w.classId);
    if (w.staffId) allStaffIdSet.add(w.staffId);
  }

  const allClassIds = Array.from(allClassIdSet);
  const allStaffIds = Array.from(allStaffIdSet).sort();

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
    if (entry.kind !== 'BLOCKED') {
      const k = dsKey(classId, d, entry.subjectCode);
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
    const k = dsKey(classId, d, entry.subjectCode);
    const cur = classDaySubjCount.get(k) ?? 0;
    if (cur <= 1) classDaySubjCount.delete(k);
    else classDaySubjCount.set(k, cur - 1);
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
      isStep0Lab: b.slotType === 'LAB',
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
    setSlot(fp.classId, fp.dayOrder, fp.period, {
      kind: 'FIXED',
      workloadId: fp.workloadId,
      staffId: fp.staffId,
      subjectCode: fp.subjectCode,
      isStep0Lab: false,
    });
  }

  // Compute total target weekly hours per staff
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
  for (const w of schedulableWorkload) {
    staffTotalTargetHours.set(
      w.staffId,
      (staffTotalTargetHours.get(w.staffId) ?? 0) + w.hoursPerWeek
    );
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

  const scorePlacement = (
    w: SchedulableWorkload,
    d: number,
    p: number,
    withJitter: boolean
  ): number => {
    const newAdj = countNewAdjacentIfPlaced(w.staffId, d, p);
    const sameSubj = classDaySubjCount.get(dsKey(w.classId, d, w.subjectCode)) ?? 0;
    const curDayCount = staffDayCount.get(w.staffId)?.[d] ?? 0;
    const totalStaffHours = staffTotalTargetHours.get(w.staffId) ?? 6;
    const idealCeil = Math.max(1, Math.ceil(totalStaffHours / 6));

    let score = 0;
    score += newAdj * 100000;
    if (sameSubj > 0) score += 5000 * sameSubj;

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

  // Phase 1: Constructive round-robin with strict Rule 1 + non-adjacent filter
  const workloadItems = schedulableWorkload.map((w, idx) => ({
    ...w,
    _key: `${w.workloadId}__${idx}`,
  }));
  const itemRemaining = new Map<string, number>();
  for (const item of workloadItems) {
    itemRemaining.set(item._key, item.hoursPerWeek);
  }

  for (let round = 0; round < 30; round++) {
    const pending = workloadItems.filter((item) => (itemRemaining.get(item._key) ?? 0) > 0);
    if (pending.length === 0) break;

    const ordered = shuffle(pending, rng).sort((a, b) => {
      const ha = staffTotalTargetHours.get(a.staffId) ?? 0;
      const hb = staffTotalTargetHours.get(b.staffId) ?? 0;
      return hb - ha;
    });

    let placedAnyInRound = false;
    for (const item of ordered) {
      const left = itemRemaining.get(item._key) ?? 0;
      if (left <= 0) continue;

      let bestSlot: { dayOrder: number; period: number; score: number } | null = null;
      for (const { dayOrder, period } of shuffle(allSlotList, rng)) {
        if (!isClashFree(item.classId, item.staffId, dayOrder, period)) continue;
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
          isStep0Lab: false,
        });
        itemRemaining.set(item._key, left - 1);
        placedAnyInRound = true;
      }
    }

    if (!placedAnyInRound) break;
  }

  // Phase 2 & 3: 1-hop relocation (non-adjacent first, then adjacent only if unavoidable)
  const tryRelocateAndPlace = (
    item: (typeof workloadItems)[number],
    allowAdjacent: boolean
  ): boolean => {
    let bestDirect: { d: number; p: number; score: number } | null = null;
    for (const { dayOrder: d, period: p } of shuffle(allSlotList, rng)) {
      if (!isClashFree(item.classId, item.staffId, d, p)) continue;
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
        isStep0Lab: false,
      });
      return true;
    }

    const cg = classGrid.get(item.classId)!;
    const shuffledSlots = shuffle(allSlotList, rng);
    for (const { dayOrder: d1, period: p1 } of shuffledSlots) {
      const other = cg[d1][p1];
      if (!other || other.kind !== 'GEN') continue;
      if (item.staffId && staffGrid.get(item.staffId)?.[d1]?.[p1]) continue;
      if (!allowAdjacent && countNewAdjacentIfPlaced(item.staffId, d1, p1) > 0) continue;

      for (const { dayOrder: d2, period: p2 } of shuffledSlots) {
        if (d1 === d2 && p1 === p2) continue;
        if (cg[d2][p2]) continue;
        if (other.staffId && staffGrid.get(other.staffId)?.[d2]?.[p2]) continue;

        const removed = removeGenSlot(item.classId, d1, p1);
        if (!removed) continue;

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
          isStep0Lab: false,
        });
        return true;
      }
    }

    if (item.staffId) {
      for (const { dayOrder: d1, period: p1 } of shuffledSlots) {
        if (cg[d1][p1]) continue;
        const busyInfo = staffGrid.get(item.staffId)?.[d1]?.[p1];
        if (!busyInfo || busyInfo.kind !== 'GEN') continue;

        const c2 = busyInfo.classId;
        const cg2 = classGrid.get(c2)!;
        const blocker = cg2[d1][p1];
        if (!blocker || blocker.kind !== 'GEN') continue;

        for (const { dayOrder: d2, period: p2 } of shuffledSlots) {
          if (cg2[d2][p2]) continue;
          if (staffGrid.get(item.staffId)?.[d2]?.[p2]) continue;

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
            isStep0Lab: false,
          });
          return true;
        }
      }
    }

    return false;
  };

  for (const item of workloadItems) {
    let left = itemRemaining.get(item._key) ?? 0;
    while (left > 0) {
      if (tryRelocateAndPlace(item, false)) {
        left--;
        itemRemaining.set(item._key, left);
      } else {
        break;
      }
    }
  }

  for (const item of workloadItems) {
    let left = itemRemaining.get(item._key) ?? 0;
    while (left > 0) {
      if (tryRelocateAndPlace(item, true)) {
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
    unresolved: Array.from(unresolvedByWorkload.values()),
    metrics,
  };
}

// ----------------------------------------------------------------------------
// Stage 2: Fast Simulated Annealing + Deterministic Polish on top candidates
// Strictly preserves Rule 1 (never introduces a staff double-booking).
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
  } = state;

  // Collect all GEN and non-BLOCKED slots per class for fast sampling
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
    if (entry.kind !== 'BLOCKED') {
      const k = dsKey(classId, d, entry.subjectCode);
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
    const k = dsKey(classId, d, entry.subjectCode);
    const cur = classDaySubjCount.get(k) ?? 0;
    if (cur <= 1) classDaySubjCount.delete(k);
    else classDaySubjCount.set(k, cur - 1);
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

  // Weighted scalar energy so Simulated Annealing can trade sideways/temp moves
  // Weights reflect strict priority: adjacentPairs (10000) >> spreadImbalance (50) >> sameDayRepeats (10)
  const calcEnergy = (m: AttemptMetrics) =>
    m.adjacentPairs * 10000 + m.spreadImbalance * 50 + m.sameDayRepeats * 10;

  let curMetrics = { ...state.metrics };
  let curEnergy = calcEnergy(curMetrics);

  // Track best state seen during annealing (snapshot of GEN cells)
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

  const totalSteps = 25000;
  for (let step = 0; step < totalSteps; step++) {
    if (
      bestMetrics.adjacentPairs === 0 &&
      bestMetrics.spreadImbalance === 0 &&
      bestMetrics.sameDayRepeats === 0
    ) {
      break;
    }

    // Bias 65% of moves toward a staff member who currently has adjacent pairs or spread imbalance
    let cid: string | undefined;
    let c1: { d: number; p: number } | undefined;

    if (step % 3 !== 0 && (curMetrics.adjacentPairs > 0 || curMetrics.spreadImbalance > 0)) {
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
      const beforeSame =
        c1.d === c2.d
          ? 0
          : Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, s1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, s1.subjectCode)) ?? 0) - 1);

      const r1 = removeGenSlot(cid, c1.d, c1.p)!;
      setSlot(cid, c2.d, c2.p, r1);

      const afterCost = staffCost(s1.staffId);
      const afterSame =
        c1.d === c2.d
          ? 0
          : Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, s1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, s1.subjectCode)) ?? 0) - 1);

      const nextMetrics: AttemptMetrics = {
        missingHours: curMetrics.missingHours,
        adjacentPairs: curMetrics.adjacentPairs + (afterCost.adj - beforeCost.adj),
        spreadImbalance: curMetrics.spreadImbalance + (afterCost.spread - beforeCost.spread),
        sameDayRepeats: curMetrics.sameDayRepeats + (afterSame - beforeSame),
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
      const sameBefore =
        c1.d === c2.d || s1.subjectCode === s2.subjectCode
          ? 0
          : Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, s1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, s1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, s2.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, s2.subjectCode)) ?? 0) - 1);

      const r1 = removeGenSlot(cid, c1.d, c1.p)!;
      const r2 = removeGenSlot(cid, c2.d, c2.p)!;
      setSlot(cid, c2.d, c2.p, r1);
      setSlot(cid, c1.d, c1.p, r2);

      const c1After = staffCost(r1.staffId!);
      const c2After = staffCost(r2.staffId!);
      const sameAfter =
        c1.d === c2.d || r1.subjectCode === r2.subjectCode
          ? 0
          : Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, r1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, r1.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c1.d, r2.subjectCode)) ?? 0) - 1) +
            Math.max(0, (classDaySubjCount.get(dsKey(cid, c2.d, r2.subjectCode)) ?? 0) - 1);

      const nextMetrics: AttemptMetrics = {
        missingHours: curMetrics.missingHours,
        adjacentPairs: curMetrics.adjacentPairs + (c1After.adj + c2After.adj - (c1Before.adj + c2Before.adj)),
        spreadImbalance:
          curMetrics.spreadImbalance + (c1After.spread + c2After.spread - (c1Before.spread + c2Before.spread)),
        sameDayRepeats: curMetrics.sameDayRepeats + (sameAfter - sameBefore),
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

  // Restore bestSnapshot if current drifted slightly at warm temp
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
  }

  // Final deterministic greedy polish sweep
  for (let sweep = 0; sweep < 4; sweep++) {
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
            const before = staffCost(s1.staffId);
            const r1 = removeGenSlot(cid, c1.d, c1.p)!;
            setSlot(cid, c2.d, c2.p, r1);
            const after = staffCost(s1.staffId);
            if (
              after.adj < before.adj ||
              (after.adj === before.adj && after.spread < before.spread)
            ) {
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
            const r1 = removeGenSlot(cid, c1.d, c1.p)!;
            const r2 = removeGenSlot(cid, c2.d, c2.p)!;
            setSlot(cid, c2.d, c2.p, r1);
            setSlot(cid, c1.d, c1.p, r2);
            const a1 = staffCost(r1.staffId!);
            const a2 = staffCost(r2.staffId!);
            const adjDelta = a1.adj + a2.adj - (b1.adj + b2.adj);
            const spreadDelta = a1.spread + a2.spread - (b1.spread + b2.spread);
            if (adjDelta < 0 || (adjDelta === 0 && spreadDelta < 0)) {
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
    state.metrics.missingHours
  );
}

function finalizeAttemptOutput(state: BuiltAttemptState): AttemptOutput {
  const { allClassIds, allStaffIds, classGrid, staffGrid, unresolved, metrics } = state;

  const slots: SlotAssignment[] = [];
  for (const cid of allClassIds) {
    const cg = classGrid.get(cid)!;
    for (let d = 1; d <= 6; d++) {
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
    metrics,
  };
}
