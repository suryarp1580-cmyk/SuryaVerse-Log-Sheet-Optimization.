// ============================================================================
// ACCFIN Timetable Generator — Workload Data Layer
// Supports single-section and bulk multi-section (UG Sections A, B, C)
// workload entry matching the AMJ College Accounting & Finance format.
// ============================================================================

import { supabase, getActiveSupabaseUrl, getActiveSupabaseAnonKey, isExpectedSupabaseFallbackError } from '../supabaseClient';
import type { FormActionResult, TTClass, TTStaff, TTWorkload } from './types';
import { MAX_HOURS_PER_WEEK, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK } from './constants';
import { loadWorkloadMemory, saveWorkloadMemory, loadTTStaffMemory, saveTTStaffMemory, loadFixedPeriodsMemory } from '../memoryStorage';
import { getFixedSlotsForClass } from './fixed-periods-api';

// ----------------------------------------------------------------------------
// Classes & Staff Getters
// ----------------------------------------------------------------------------

export async function getClasses(forceLive = false): Promise<TTClass[]> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const directRes = await fetch(`${url}/rest/v1/tt_classes?select=*&order=sort_order.asc&_ts=${Date.now()}`, {
          method: 'GET',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (directRes.ok) {
          const json = await directRes.json();
          return json ?? [];
        }
      } catch {
        // Fallback to standard client below
      }
    }
  }

  const { data, error } = await supabase
    .from('tt_classes')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Failed to load classes: ${error.message}`);
  return data ?? [];
}

export async function getStaff(forceLive = false): Promise<TTStaff[]> {
  if (forceLive) {
    const url = getActiveSupabaseUrl();
    const anonKey = getActiveSupabaseAnonKey();
    if (url && anonKey) {
      try {
        const directRes = await fetch(`${url}/rest/v1/tt_staff?select=*&status=eq.ACTIVE&order=full_name.asc&_ts=${Date.now()}`, {
          method: 'GET',
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        });
        if (directRes.ok) {
          const json: TTStaff[] = await directRes.json();
          if (json && json.length > 0) {
            saveTTStaffMemory(json);
            return json;
          }
        }
      } catch {
        // Fallback to standard client below
      }
    }
  }

  const { data, error } = await supabase
    .from('tt_staff')
    .select('*')
    .eq('status', 'ACTIVE')
    .order('full_name', { ascending: true });

  if (!error && data && data.length > 0) {
    saveTTStaffMemory(data);
    return data;
  }

  // Fallback to local memory if Supabase has network issues
  const memStaff = loadTTStaffMemory();
  if (memStaff && memStaff.length > 0) {
    return memStaff;
  }

  if (error) throw new Error(`Failed to load staff: ${error.message}`);
  return data ?? [];
}

// ----------------------------------------------------------------------------
// Workload Getters
// ----------------------------------------------------------------------------

export async function getWorkloadForClass(classId: string): Promise<TTWorkload[]> {
  try {
    const { data, error } = await supabase
      .from('tt_workload')
      .select('*, staff:tt_staff(*)')
      .eq('class_id', classId)
      .order('subject_code', { ascending: true });

    if (!error && data) {
      const typed = data as unknown as TTWorkload[];
      // Sync into local memory
      const mem = loadWorkloadMemory();
      mem[classId] = typed;
      saveWorkloadMemory(mem);
      return typed;
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Network error loading workload for class, checking local memory:', err);
    }
  }

  // Resilient memory fallback
  const mem = loadWorkloadMemory();
  return (mem[classId] as unknown as TTWorkload[]) ?? [];
}

export async function getAllWorkload(): Promise<Record<string, TTWorkload[]>> {
  try {
    const { data, error } = await supabase
      .from('tt_workload')
      .select('*, staff:tt_staff(*)')
      .order('subject_code', { ascending: true });

    if (!error && data) {
      const byClass: Record<string, TTWorkload[]> = {};
      (data as unknown as TTWorkload[]).forEach((row) => {
        if (!byClass[row.class_id]) byClass[row.class_id] = [];
        byClass[row.class_id].push(row);
      });
      saveWorkloadMemory(byClass);
      return byClass;
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Network error loading all workloads:', err);
    }
  }

  return (loadWorkloadMemory() as Record<string, TTWorkload[]>) ?? {};
}

// ----------------------------------------------------------------------------
// Year Group Model & Categorization (AMJ College ACCFIN Structure)
// ----------------------------------------------------------------------------

export interface YearGroupSection {
  sectionName: 'A' | 'B' | 'C' | 'PG';
  classId: string;
  classCode: string;
  displayName: string;
}

export interface YearGroup {
  id: string; // 'I-BCOM' | 'II-BCOM' | 'III-BCOM' | 'I-MCOM' | 'II-MCOM'
  label: string; // 'I B.COM AF' | 'II B.COM AF' | 'III B.COM AF' | 'I M.COM AF' | 'II M.COM AF'
  isUG: boolean;
  sections: YearGroupSection[];
}

export function buildYearGroups(classes: TTClass[]): YearGroup[] {
  const ugYears = [
    { key: 'I-BCOM', prefix: 'I', label: 'I B.COM AF' },
    { key: 'II-BCOM', prefix: 'II', label: 'II B.COM AF' },
    { key: 'III-BCOM', prefix: 'III', label: 'III B.COM AF' },
  ];

  const pgYears = [
    { key: 'I-MCOM', label: 'I M.COM AF' },
    { key: 'II-MCOM', label: 'II M.COM AF' },
  ];

  const groups: YearGroup[] = [];

  // 1. UG Groups
  for (const ug of ugYears) {
    const matchedSections: YearGroupSection[] = [];
    const secLabels: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C'];

    for (const sec of secLabels) {
      // Find matching class
      const found = classes.find((c) => {
        const code = c.code.toUpperCase();
        const dName = c.display_name.toUpperCase();
        const hasYear = code.startsWith(`${ug.prefix}-BCOM`) || dName.startsWith(`${ug.prefix} B.COM`);
        const hasSec = code.endsWith(`-${sec}`) || dName.endsWith(`- ${sec}`) || dName.endsWith(` ${sec}`);
        return hasYear && hasSec;
      });

      if (found) {
        matchedSections.push({
          sectionName: sec,
          classId: found.id,
          classCode: found.code,
          displayName: found.display_name,
        });
      }
    }

    if (matchedSections.length > 0) {
      groups.push({
        id: ug.key,
        label: ug.label,
        isUG: true,
        sections: matchedSections,
      });
    }
  }

  // 2. PG Groups
  for (const pg of pgYears) {
    const found = classes.find((c) => {
      const code = c.code.toUpperCase();
      const dName = c.display_name.toUpperCase();
      if (pg.key === 'I-MCOM') {
        return code.includes('I-MCOM') || (dName.includes('I M.COM') && !dName.includes('II'));
      } else {
        return code.includes('II-MCOM') || dName.includes('II M.COM');
      }
    });

    if (found) {
      groups.push({
        id: pg.key,
        label: pg.label,
        isUG: false,
        sections: [
          {
            sectionName: 'PG',
            classId: found.id,
            classCode: found.code,
            displayName: found.display_name,
          },
        ],
      });
    }
  }

  // Fallback: If classes didn't match standard UG/PG patterns, group any unmapped classes
  const mappedIds = new Set(groups.flatMap((g) => g.sections.map((s) => s.classId)));
  const unmapped = classes.filter((c) => !mappedIds.has(c.id));
  if (unmapped.length > 0) {
    unmapped.forEach((c) => {
      groups.push({
        id: c.id,
        label: c.display_name,
        isUG: false,
        sections: [
          {
            sectionName: 'PG',
            classId: c.id,
            classCode: c.code,
            displayName: c.display_name,
          },
        ],
      });
    });
  }

  return groups;
}

// ----------------------------------------------------------------------------
// Staff Split-Hour Parser
// Supports notations like:
// - "MJ(4)/MP(1)" -> Dr. Jagadeeswari 4 hrs, Ms. Meena 1 hr
// - "MJ (4) / MP (1)"
// - "MJ(4), MP(1)"
// - "MJ(4)+MP(1)"
// - "MJ" -> single teacher assigned all subject hours
// ----------------------------------------------------------------------------

export interface StaffSplitAssignment {
  staffId: string;
  staffCode: string;
  staffName: string;
  hours: number;
}

export function parseStaffSplitNotation(
  rawInput: string,
  totalSubjectHours: number,
  allStaff: TTStaff[]
): { splits: StaffSplitAssignment[]; error?: string } {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { splits: [], error: 'Staff assignment cannot be empty.' };
  }

  // Helper to find a staff member strictly by exact code, id, or exact full name
  // (Prioritized passes across the entire roster so an earlier name containing
  // the typed code as a substring, e.g. "KS" inside "JAYALAKSHMI", can never shadow "KS".)
  const findStaff = (query: string): TTStaff | undefined => {
    const q = query.trim().toUpperCase();
    if (!q) return undefined;

    return (
      allStaff.find((s) => s.short_code.trim().toUpperCase() === q) ??
      allStaff.find((s) => s.id.trim().toUpperCase() === q) ??
      allStaff.find((s) => s.full_name.trim().toUpperCase() === q)
    );
  };

  // Check if user simply selected a staff member or entered a single code without brackets
  // e.g. "MJ" or a full UUID or selected from dropdown
  if (!trimmed.includes('(') && !trimmed.includes('/') && !trimmed.includes('+') && !trimmed.includes(',')) {
    const found = findStaff(trimmed);
    if (!found) {
      return { splits: [], error: `Unknown faculty code "${trimmed}". Select from directory.` };
    }
    return {
      splits: [
        {
          staffId: found.id,
          staffCode: found.short_code,
          staffName: found.full_name,
          hours: totalSubjectHours,
        },
      ],
    };
  }

  // Split by /, +, or ,
  const tokens = trimmed
    .split(/[/+,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return { splits: [], error: 'Please enter a valid faculty assignment.' };
  }

  const splits: StaffSplitAssignment[] = [];
  let allocatedHours = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // Match e.g. "MJ(4)" or "MJ (4)" or "MJ"
    const match = token.match(/^([A-Za-z0-9._\s-]+?)(?:\s*\(\s*(\d+)\s*\))?$/);
    if (!match) {
      return { splits: [], error: `Invalid format near "${token}". Use e.g. MJ(4)/MP(1)` };
    }

    const codePart = match[1].trim();
    const hoursPart = match[2];

    const staffMember = findStaff(codePart);
    if (!staffMember) {
      return { splits: [], error: `Unknown faculty "${codePart}". Check Staff Directory.` };
    }

    let hours: number;
    if (hoursPart !== undefined) {
      hours = parseInt(hoursPart, 10);
      if (isNaN(hours) || hours <= 0) {
        return { splits: [], error: `Invalid hours "${hoursPart}" for faculty ${codePart}.` };
      }
    } else {
      // If no hours specified on last token, fill remaining
      if (i === tokens.length - 1 && tokens.length > 1) {
        hours = totalSubjectHours - allocatedHours;
      } else if (tokens.length === 1) {
        hours = totalSubjectHours;
      } else {
        return { splits: [], error: `Please specify hours in parentheses for ${codePart}, e.g. ${codePart}(2)` };
      }
    }

    allocatedHours += hours;
    splits.push({
      staffId: staffMember.id,
      staffCode: staffMember.short_code,
      staffName: staffMember.full_name,
      hours,
    });
  }

  if (allocatedHours !== totalSubjectHours) {
    return {
      splits: [],
      error: `Split hours sum to ${allocatedHours}h, but subject is set to ${totalSubjectHours}h per week.`,
    };
  }

  return { splits };
}

// ----------------------------------------------------------------------------
// Bulk Multi-Section Workload Submission
// Saves all 3 sections (for UG) or 1 section (for PG) in a single save.
// ----------------------------------------------------------------------------

export interface BulkSectionInput {
  classId: string;
  sectionName: string; // 'A' | 'B' | 'C' | 'PG'
  hoursOverride?: number;
  rawStaffInput: string;
}

export interface BulkWorkloadFormInput {
  yearGroupId: string;
  subjectCode: string;
  subjectName: string;
  hoursPerWeek: number;
  isFixed: boolean;
  fixedDayOrder?: number | null;
  fixedPeriod?: number | null;
  sections: BulkSectionInput[];
}

export async function saveBulkWorkload(
  input: BulkWorkloadFormInput,
  allStaff: TTStaff[]
): Promise<FormActionResult> {
  const subjectCode = input.subjectCode.trim().toUpperCase();
  const subjectName = input.subjectName.trim().toUpperCase();

  if (!subjectCode) {
    return { success: false, message: 'Subject Short Code is required (e.g. ACA, BI, LANG).' };
  }
  if (!subjectName) {
    return { success: false, message: 'Full Subject Name is required.' };
  }
  if (!Number.isFinite(input.hoursPerWeek) || input.hoursPerWeek <= 0) {
    return { success: false, message: 'Hours per week must be a positive number.' };
  }
  if (input.hoursPerWeek > MAX_HOURS_PER_WEEK) {
    return { success: false, message: `Hours per week cannot exceed ${MAX_HOURS_PER_WEEK}.` };
  }

  if (input.isFixed) {
    if (!input.fixedDayOrder || input.fixedDayOrder < 1 || input.fixedDayOrder > 6) {
      return { success: false, message: 'Fixed/Language subjects require a valid Day Order (1–6).' };
    }
    if (!input.fixedPeriod || input.fixedPeriod < 1 || input.fixedPeriod > 5) {
      return { success: false, message: 'Fixed/Language subjects require a valid Period (1–5).' };
    }
  }

  // 1. Validate & Parse all sections first before touching the database
  interface ParsedSectionWork {
    classId: string;
    sectionName: string;
    effectiveHours: number;
    splits: StaffSplitAssignment[];
  }

  const parsedSections: ParsedSectionWork[] = [];

  for (const sec of input.sections) {
    const effectiveHours = sec.hoursOverride && sec.hoursOverride > 0 ? sec.hoursOverride : input.hoursPerWeek;
    const { splits, error } = parseStaffSplitNotation(sec.rawStaffInput, effectiveHours, allStaff);
    if (error) {
      return {
        success: false,
        message: `Section ${sec.sectionName}: ${error}`,
      };
    }
    if (splits.length === 0) {
      return {
        success: false,
        message: `Section ${sec.sectionName}: Faculty assignment is required.`,
      };
    }
    parsedSections.push({
      classId: sec.classId,
      sectionName: sec.sectionName,
      effectiveHours,
      splits,
    });
  }

  // 2. Validate maximum weekly hours constraint (30 slots - Step 0 fixed slots) for each class
  const memWorkload = loadWorkloadMemory();
  const memFixed = loadFixedPeriodsMemory();

  for (const sec of parsedSections) {
    let existingTotal = 0;
    try {
      const { data: existingRows } = await supabase
        .from('tt_workload')
        .select('subject_code, hours_per_week')
        .eq('class_id', sec.classId);

      if (existingRows) {
        // Exclude current subject code if replacing
        existingTotal = existingRows
          .filter((r) => !r.subject_code.startsWith(subjectCode))
          .reduce((sum, r) => sum + (r.hours_per_week || 0), 0);
      } else {
        const localRows = memWorkload[sec.classId] || [];
        existingTotal = localRows
          .filter((r) => !r.subject_code.startsWith(subjectCode))
          .reduce((sum, r) => sum + (r.hours_per_week || 0), 0);
      }
    } catch {
      const localRows = memWorkload[sec.classId] || [];
      existingTotal = localRows
        .filter((r) => !r.subject_code.startsWith(subjectCode))
        .reduce((sum, r) => sum + (r.hours_per_week || 0), 0);
    }

    const fixedSlotsForClass = getFixedSlotsForClass(memFixed, sec.classId);
    const fixedCount = fixedSlotsForClass.length;
    const openWeeklySlots = Math.max(0, TOTAL_SCHEDULABLE_SLOTS_PER_WEEK - fixedCount);

    if (existingTotal + sec.effectiveHours > openWeeklySlots) {
      return {
        success: false,
        message:
          fixedCount > 0
            ? `Section ${sec.sectionName} has ${fixedCount} fixed slot(s) locked in Step 0 (${openWeeklySlots} open slots available) and ${existingTotal}h of subjects already allotted. Adding ${sec.effectiveHours}h would exceed the 30-period week.`
            : `Section ${sec.sectionName} already has ${existingTotal}h allotted. Adding ${sec.effectiveHours}h would exceed the ${TOTAL_SCHEDULABLE_SLOTS_PER_WEEK} slots available in the weekly grid.`,
      };
    }
  }

  // 3. Persist to Supabase and local memory
  const savedEntries: TTWorkload[] = [];
  let dbFailed = false;

  for (const sec of parsedSections) {
    // 3.1 Delete existing entries for this subject in this class
    try {
      await supabase
        .from('tt_workload')
        .delete()
        .eq('class_id', sec.classId)
        .ilike('subject_code', `${subjectCode}%`);
    } catch {
      // Non-blocking
    }

    // 3.2 Insert rows for each split
    for (let i = 0; i < sec.splits.length; i++) {
      const split = sec.splits[i];
      // If multiple splits exist, the primary split keeps subjectCode, subsequent splits get code suffix
      // to cleanly handle any unique (class_id, subject_code) constraints in Postgres
      const finalCode = i === 0 ? subjectCode : `${subjectCode} (${split.staffCode})`;

      const payload = {
        class_id: sec.classId,
        subject_code: finalCode,
        subject_name: subjectName,
        hours_per_week: split.hours,
        staff_id: split.staffId,
        is_fixed: input.isFixed,
        fixed_day_order: input.isFixed ? input.fixedDayOrder ?? null : null,
        fixed_period: input.isFixed ? input.fixedPeriod ?? null : null,
      };

      let insertedId = crypto.randomUUID();

      try {
        const { data: inserted, error: insertErr } = await supabase
          .from('tt_workload')
          .insert(payload)
          .select('id')
          .single();

        if (!insertErr && inserted?.id) {
          insertedId = inserted.id;
        } else if (insertErr?.code === '23505') {
          // If unique constraint violation, try with distinctive suffix
          const retryPayload = {
            ...payload,
            subject_code: `${subjectCode}-${split.staffCode}-${Date.now().toString().slice(-4)}`,
          };
          const { data: retryIns } = await supabase
            .from('tt_workload')
            .insert(retryPayload)
            .select('id')
            .single();
          if (retryIns?.id) insertedId = retryIns.id;
        } else if (insertErr) {
          if (!isExpectedSupabaseFallbackError(insertErr)) {
            console.warn('Supabase workload insert notice:', insertErr.message);
          }
          dbFailed = true;
        }
      } catch (err: any) {
        if (!isExpectedSupabaseFallbackError(err)) {
          console.warn('Supabase workload insert catch:', err?.message);
        }
        dbFailed = true;
      }

      const matchingStaff = allStaff.find((s) => s.id === split.staffId);
      const newEntry: TTWorkload = {
        id: insertedId,
        class_id: sec.classId,
        subject_code: finalCode,
        subject_name: subjectName,
        hours_per_week: split.hours,
        staff_id: split.staffId,
        is_fixed: input.isFixed,
        fixed_day_order: input.isFixed ? input.fixedDayOrder ?? null : null,
        fixed_period: input.isFixed ? input.fixedPeriod ?? null : null,
        staff: matchingStaff,
      };
      savedEntries.push(newEntry);
    }
  }

  // 4. Update local memory storage immediately so data NEVER disappears
  const currentMem = loadWorkloadMemory();
  for (const sec of parsedSections) {
    const existing = (currentMem[sec.classId] || []).filter(
      (r) => !r.subject_code.startsWith(subjectCode)
    );
    const newForThisClass = savedEntries.filter((e) => e.class_id === sec.classId);
    currentMem[sec.classId] = [...existing, ...newForThisClass];
  }
  saveWorkloadMemory(currentMem);

  const sectionCountText =
    parsedSections.length > 1
      ? `across all ${parsedSections.length} sections (A, B, C)`
      : `for ${parsedSections[0]?.sectionName || 'class'}`;

  return {
    success: true,
    message: dbFailed
      ? `Subject "${subjectCode}" saved to local persistent storage ${sectionCountText}.`
      : `Successfully added "${subjectCode}" (${input.hoursPerWeek}h) ${sectionCountText}!`,
  };
}

// ----------------------------------------------------------------------------
// Deletions
// ----------------------------------------------------------------------------

export async function deleteSubjectAcrossSections(
  classIds: string[],
  subjectCode: string
): Promise<FormActionResult> {
  const cleanCode = subjectCode.trim().toUpperCase();

  // Expand possible class ID variations to handle any schema mapping (e.g. I-BCOM-A vs class-I-BCOM-AF-A)
  const expandedClassIds = new Set<string>();
  for (const cid of classIds) {
    expandedClassIds.add(cid);
    expandedClassIds.add(`class-${cid}`);
    expandedClassIds.add(cid.replace(/^class-/, ''));
    if (cid.includes('BCOM-')) {
      expandedClassIds.add(cid.replace('BCOM-', 'BCOM-AF-'));
    }
    if (cid.includes('BCOM-AF-')) {
      expandedClassIds.add(cid.replace('BCOM-AF-', 'BCOM-'));
    }
  }

  const isMatchingSubject = (rowCode: string): boolean => {
    if (!rowCode) return false;
    const upper = rowCode.trim().toUpperCase();
    const match = upper.match(/^([A-Za-z0-9_-]+)/);
    const base = match ? match[1] : upper;
    return (
      base === cleanCode ||
      upper.startsWith(cleanCode) ||
      upper.replace(/[^A-Z0-9]/g, '') === cleanCode.replace(/[^A-Z0-9]/g, '')
    );
  };

  // 1. Delete from Supabase tt_workload and linked tt_fixed_slots
  try {
    for (const cid of Array.from(expandedClassIds)) {
      const { data: toDelete } = await supabase
        .from('tt_workload')
        .select('id')
        .eq('class_id', cid)
        .ilike('subject_code', `${cleanCode}%`);

      if (toDelete && toDelete.length > 0) {
        const ids = toDelete.map((d: { id: string }) => d.id);
        await supabase.from('tt_fixed_slots').delete().in('workload_id', ids);
      }

      await supabase
        .from('tt_workload')
        .delete()
        .eq('class_id', cid)
        .ilike('subject_code', `${cleanCode}%`);
    }
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Supabase delete error:', err);
    }
  }

  // 2. Delete from persistent local memory
  const currentMem = loadWorkloadMemory();
  for (const key of Object.keys(currentMem)) {
    const isTargetClass =
      expandedClassIds.has(key) ||
      Array.from(expandedClassIds).some(
        (cid) => key.toLowerCase() === cid.toLowerCase() || key.includes(cid) || cid.includes(key)
      );

    if (isTargetClass && Array.isArray(currentMem[key])) {
      currentMem[key] = currentMem[key].filter((r) => !isMatchingSubject(r.subject_code));
    }
  }
  saveWorkloadMemory(currentMem);

  return { success: true, message: `Removed "${cleanCode}".` };
}

export async function deleteWorkloadEntry(workloadId: string): Promise<FormActionResult> {
  // 1. Delete from Supabase
  try {
    await supabase.from('tt_workload').delete().eq('id', workloadId);
  } catch (err) {
    if (!isExpectedSupabaseFallbackError(err)) {
      console.warn('Supabase single workload delete error:', err);
    }
  }

  // 2. Delete from local persistent memory
  const currentMem = loadWorkloadMemory();
  for (const cid of Object.keys(currentMem)) {
    currentMem[cid] = currentMem[cid].filter((r) => r.id !== workloadId);
  }
  saveWorkloadMemory(currentMem);

  return { success: true, message: 'Removed.' };
}

// Single entry legacy compatibility
export async function addWorkloadEntry(input: {
  classId: string;
  subjectCode: string;
  subjectName: string;
  hoursPerWeek: number;
  staffId: string;
  isFixed: boolean;
  fixedDayOrder?: number | null;
  fixedPeriod?: number | null;
}): Promise<FormActionResult> {
  return saveBulkWorkload(
    {
      yearGroupId: input.classId,
      subjectCode: input.subjectCode,
      subjectName: input.subjectName,
      hoursPerWeek: input.hoursPerWeek,
      isFixed: input.isFixed,
      fixedDayOrder: input.fixedDayOrder,
      fixedPeriod: input.fixedPeriod,
      sections: [
        {
          classId: input.classId,
          sectionName: 'A',
          rawStaffInput: input.staffId,
        },
      ],
    },
    []
  );
}
