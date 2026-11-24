// ============================================================================
// ACCFIN Timetable Generator — Scheduling Engine
// ----------------------------------------------------------------------------
// Pure functions, no Supabase/DB calls here — this file only knows about
// plain data in and plain data out, so it can be unit-tested and reused from
// any server action.
//
// ALGORITHM
// ---------
// This is a constraint-satisfaction problem: place every subject's weekly
// hours into a class's 30 slots (6 Day Orders x 5 periods) such that:
//   (a) a class never has two subjects in the same slot (guaranteed by
//       construction — we only ever place into free class slots)
//   (b) a staff member is never in two classes at the same slot (the real
//       constraint that makes this hard, since staff teach across classes)
//   (c) [soft] a subject doesn't repeat on the same day for a class more
//       than necessary, so the printed timetable looks like a normal one
//       instead of the same subject three times running
//
// Exact optimal solving is NP-hard at this scale in the worst case, so this
// uses randomized greedy placement in rounds (one hour of every subject per
// round, so hours naturally spread across days) combined with multiple
// random restarts, keeping the best (fewest unresolved hours) result. This
// matches the chosen approach: auto-generate, then hand back anything it
// couldn't place so the HOD can slot it manually.
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

export interface GenerateScheduleResult {
  slots: SlotAssignment[];
  unresolved: UnresolvedHours[];
  fixedClashes: FixedClash[];
  attemptsUsed: number;
}

export interface BlockedClassSlot {
  classId: string;
  dayOrder: number;
  period: number;
  slotType: 'LANG' | 'ENG' | 'LAB';
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
// Detect conflicts among the HOD's manually-fixed placements themselves —
// these can't be auto-corrected, only flagged for the HOD to re-enter.
// ----------------------------------------------------------------------------
export function detectFixedClashes(fixedPlacements: FixedPlacement[]): FixedClash[] {
  const clashes: FixedClash[] = [];

  const byStaffSlot = new Map<string, FixedPlacement[]>();
  for (const fp of fixedPlacements) {
    const key = `${fp.staffId}_${fp.dayOrder}_${fp.period}`;
    const list = byStaffSlot.get(key) ?? [];
    list.push(fp);
    byStaffSlot.set(key, list);
  }
  for (const list of byStaffSlot.values()) {
    if (list.length > 1) {
      const distinctClasses = new Set(list.map((l) => l.classId));
      if (distinctClasses.size > 1) {
        clashes.push({
          reason: `Staff member is fixed into ${distinctClasses.size} different classes at Day Order ${list[0].dayOrder}, Period ${list[0].period}.`,
          workloadIds: list.map((l) => l.workloadId),
          classId: list[0].classId,
          dayOrder: list[0].dayOrder,
          period: list[0].period,
        });
      }
    }
  }

  // Note: two fixed subjects in the same class at the same slot is already
  // prevented at the database level (uq_tt_workload_fixed_slot), so it
  // isn't re-checked here.

  return clashes;
}

// ----------------------------------------------------------------------------
// Main entry point
// ----------------------------------------------------------------------------
export function generateSchedule(
  fixedPlacements: FixedPlacement[],
  schedulableWorkload: SchedulableWorkload[],
  options: GenerateScheduleOptions = {}
): GenerateScheduleResult {
  const maxRestarts = options.maxRestarts ?? 60;
  const blockedSlots = options.blockedSlots ?? [];
  const fixedClashes = detectFixedClashes(fixedPlacements);

  // Fixed rows that clash with each other are excluded from the "occupied"
  // grid so they don't silently block other placements — they're surfaced
  // separately for the HOD to fix, and the UI (Part 3) should render their
  // own cell as a clash rather than a normal placement.
  const clashingWorkloadIds = new Set(fixedClashes.flatMap((c) => c.workloadIds));
  const cleanFixedPlacements = fixedPlacements.filter((fp) => !clashingWorkloadIds.has(fp.workloadId));

  let best: { slots: SlotAssignment[]; unresolved: UnresolvedHours[] } | null = null;
  let attemptsUsed = 0;

  for (let attempt = 0; attempt < maxRestarts; attempt++) {
    attemptsUsed = attempt + 1;
    const result = attemptSchedule(cleanFixedPlacements, schedulableWorkload, attempt, blockedSlots);
    if (best === null || result.unresolved.length < best.unresolved.length) {
      best = result;
    }
    if (best.unresolved.length === 0) break;
  }

  return {
    slots: best!.slots,
    unresolved: best!.unresolved,
    fixedClashes,
    attemptsUsed,
  };
}

// ----------------------------------------------------------------------------
// A single randomized attempt
// ----------------------------------------------------------------------------
function attemptSchedule(
  fixedPlacements: FixedPlacement[],
  schedulableWorkload: SchedulableWorkload[],
  attemptSeed: number,
  blockedSlots: BlockedClassSlot[] = []
): { slots: SlotAssignment[]; unresolved: UnresolvedHours[] } {
  const rng = mulberry32(1000 + attemptSeed * 7919);

  const staffBusy = new Set<string>();
  const classBusy = new Set<string>();
  const classDaySubject = new Set<string>();

  const slots: SlotAssignment[] = [];

  const staffKey = (staffId: string, d: number, p: number) => `${staffId}_${d}_${p}`;
  const classKey = (classId: string, d: number, p: number) => `${classId}_${d}_${p}`;
  const daySubjectKey = (classId: string, d: number, subjectCode: string) => `${classId}_${d}_${subjectCode}`;

  // Reserve all Step 0 fixed slots (LANG, ENG, LAB) before placing any subjects
  for (const b of blockedSlots) {
    classBusy.add(classKey(b.classId, b.dayOrder, b.period));
  }

  for (const fp of fixedPlacements) {
    if (classBusy.has(classKey(fp.classId, fp.dayOrder, fp.period))) continue;
    staffBusy.add(staffKey(fp.staffId, fp.dayOrder, fp.period));
    classBusy.add(classKey(fp.classId, fp.dayOrder, fp.period));
    classDaySubject.add(daySubjectKey(fp.classId, fp.dayOrder, fp.subjectCode));
    slots.push({
      classId: fp.classId,
      dayOrder: fp.dayOrder,
      period: fp.period,
      workloadId: fp.workloadId,
      staffId: fp.staffId,
      subjectCode: fp.subjectCode,
      isFixed: true,
    });
  }

  const remaining = new Map<string, number>();
  for (const w of schedulableWorkload) {
    remaining.set(w.workloadId, w.hoursPerWeek);
  }

  const maxRounds = 30;
  const allSlotList = allSlots();

  for (let round = 0; round < maxRounds; round++) {
    const pendingThisRound = shuffle(
      schedulableWorkload.filter((w) => (remaining.get(w.workloadId) ?? 0) > 0),
      rng
    );
    if (pendingThisRound.length === 0) break;

    for (const w of pendingThisRound) {
      const hoursLeft = remaining.get(w.workloadId) ?? 0;
      if (hoursLeft <= 0) continue;

      const shuffledSlots = shuffle(allSlotList, rng);

      const tryPlace = (candidateSlots: typeof shuffledSlots, enforceSoftConstraint: boolean): boolean => {
        for (const { dayOrder, period } of candidateSlots) {
          const cKey = classKey(w.classId, dayOrder, period);
          const sKey = staffKey(w.staffId, dayOrder, period);
          if (classBusy.has(cKey) || staffBusy.has(sKey)) continue;

          if (enforceSoftConstraint) {
            const dsKey = daySubjectKey(w.classId, dayOrder, w.subjectCode);
            if (classDaySubject.has(dsKey)) continue;
          }

          classBusy.add(cKey);
          staffBusy.add(sKey);
          classDaySubject.add(daySubjectKey(w.classId, dayOrder, w.subjectCode));
          slots.push({
            classId: w.classId,
            dayOrder,
            period,
            workloadId: w.workloadId,
            staffId: w.staffId,
            subjectCode: w.subjectCode,
            isFixed: false,
          });
          remaining.set(w.workloadId, hoursLeft - 1);
          return true;
        }
        return false;
      };

      tryPlace(shuffledSlots, true) || tryPlace(shuffledSlots, false);
    }
  }

  const unresolved: UnresolvedHours[] = [];
  for (const w of schedulableWorkload) {
    const left = remaining.get(w.workloadId) ?? 0;
    if (left > 0) {
      unresolved.push({
        workloadId: w.workloadId,
        classId: w.classId,
        subjectCode: w.subjectCode,
        staffId: w.staffId,
        missingHours: left,
      });
    }
  }

  return { slots, unresolved };
}
