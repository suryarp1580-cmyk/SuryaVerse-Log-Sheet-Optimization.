import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';
import { initialClasses } from '../../data/seedData';
import {
  loadFixedPeriodsMemory,
  loadMemoryData,
  loadWorkloadMemory,
} from '../memoryStorage';
import { getFixedSlotsForClass } from './fixed-periods-api';
import {
  slotKey,
  type ClassTimetableData,
  type GridCellMap,
  type StaffTimetableData,
} from './grid-types';
import type { FixedPeriodsByClass, TTClass, TTStaff, TTWorkload } from './types';
import {
  COLLEGE_LOGO_URL,
  ClassTimetablePdfPage,
  StaffTimetablePdfPage,
  type ClassPdfMetadata,
  type EnrichedStaffTimetableData,
} from '../../components/timetable/TimetablePdfTemplates';

let cachedLogoDataUrl: string | null = null;

/**
 * Sanitize a display name (e.g. "I B.COM - A" or "DR. A. JULIET") into a safe filename slug.
 */
export function buildTimetablePdfFilename(
  label: string,
  kind: 'Class' | 'Staff' | 'All_Classes' | 'All_Staff'
): string {
  const clean = (label || 'Timetable')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dateStamp = new Date().toISOString().split('T')[0];
  return `AMJC_${kind}_Timetable_${clean}_${dateStamp}.pdf`;
}

function normalizeClassToken(value: string): string {
  return (value || '')
    .trim()
    .toUpperCase()
    .replace(/^CLASS-/, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-AF-/, '-')
    .replace(/-AF$/, '');
}

/**
 * Resolves live/seed class metadata (Year label, Section, Room No, Class Incharge)
 * for any TTClass id, code, or display name without modifying stored data.
 */
export function resolveClassPdfMetadata(
  classIdOrCode: string,
  classes: TTClass[] = [],
  fallbackDisplayName?: string
): ClassPdfMetadata {
  const matchedTT = classes.find(
    (c) =>
      c.id === classIdOrCode ||
      c.code === classIdOrCode ||
      normalizeClassToken(c.id) === normalizeClassToken(classIdOrCode) ||
      normalizeClassToken(c.code) === normalizeClassToken(classIdOrCode)
  );

  const candidateTokens = new Set(
    [
      classIdOrCode,
      fallbackDisplayName,
      matchedTT?.id,
      matchedTT?.code,
      matchedTT?.display_name,
    ]
      .filter((v): v is string => Boolean(v && v.trim()))
      .map(normalizeClassToken)
  );

  // Add PG shorthand equivalence (I-MCOM <-> I-MCOM-A)
  for (const tok of Array.from(candidateTokens)) {
    if (tok === 'I-MCOM' || tok === 'I-M.COM') candidateTokens.add('I-MCOM-A');
    if (tok === 'II-MCOM' || tok === 'II-M.COM') candidateTokens.add('II-MCOM-A');
    if (tok === 'I-MCOM-A') candidateTokens.add('I-MCOM');
    if (tok === 'II-MCOM-A') candidateTokens.add('II-MCOM');
  }

  const memClasses = loadMemoryData().classesList;
  const pool = [...memClasses, ...initialClasses];

  const found = pool.find((c) => {
    const idTok = normalizeClassToken(c.id);
    const labelSecTok = normalizeClassToken(`${c.yearLabel}-${c.section}`);
    const labelOnlyTok = normalizeClassToken(c.yearLabel);
    return (
      candidateTokens.has(idTok) ||
      candidateTokens.has(labelSecTok) ||
      (c.yearLabel.toUpperCase().includes('M.COM') && candidateTokens.has(labelOnlyTok))
    );
  });

  if (found) {
    return {
      yearLabel: found.yearLabel,
      section: found.section,
      roomNo: found.roomNo || '—',
      inchargeName: found.inchargeName || '—',
    };
  }

  // Graceful parse fallback for custom classes
  const rawLabel = (matchedTT?.display_name || fallbackDisplayName || classIdOrCode || '').trim();
  const secMatch = rawLabel.match(/(?:[-\s]+)([A-Z])$/i);
  const section = secMatch ? secMatch[1].toUpperCase() : 'A';
  const yearLabel = secMatch
    ? rawLabel.slice(0, rawLabel.length - secMatch[0].length).trim()
    : rawLabel;

  return {
    yearLabel: yearLabel || rawLabel,
    section,
    roomNo: '—',
    inchargeName: '—',
  };
}

function resolveReadableClassName(
  classIdOrCode: string,
  classes: TTClass[] = [],
  fallback?: string
): string {
  const matched = classes.find(
    (c) =>
      c.id === classIdOrCode ||
      c.code === classIdOrCode ||
      normalizeClassToken(c.id) === normalizeClassToken(classIdOrCode) ||
      normalizeClassToken(c.code) === normalizeClassToken(classIdOrCode)
  );
  if (matched?.display_name) return matched.display_name;

  if (
    fallback &&
    fallback !== classIdOrCode &&
    !fallback.startsWith('class-') &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(fallback)
  ) {
    return fallback;
  }

  const meta = resolveClassPdfMetadata(classIdOrCode, classes, fallback);
  return `${meta.yearLabel} - ${meta.section}`;
}

function fixedSlotSubjectName(slotType: string): string {
  if (slotType === 'LANG') return 'Language (Fixed)';
  if (slotType === 'ENG') return 'English (Fixed)';
  return 'Lab / Practical (Fixed)';
}

/**
 * Enriches ClassTimetableData with metadata and Step 0 optional staff codes
 * on LAB/SEC cells without mutating the source timetable state.
 */
export function enrichClassTimetableForPdf(
  data: ClassTimetableData,
  classes: TTClass[] = [],
  staff: TTStaff[] = []
): { enriched: ClassTimetableData; meta: ClassPdfMetadata } {
  const meta = resolveClassPdfMetadata(data.classId, classes, data.classDisplayName);
  const readableClassName = resolveReadableClassName(
    data.classId,
    classes,
    data.classDisplayName
  );

  const staffById = new Map<string, TTStaff>();
  const staffByCode = new Map<string, TTStaff>();
  for (const s of staff) {
    staffById.set(s.id, s);
    staffByCode.set(s.short_code.trim().toUpperCase(), s);
  }

  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const fixedSlots = getFixedSlotsForClass(memFixed, data.classId, classes);
  const fixedByKey = new Map(fixedSlots.map((fs) => [slotKey(fs.day_order, fs.period), fs]));

  const enrichedCells: GridCellMap = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const step0 = fixedByKey.get(key);
    let staffShortCode = cell.staffShortCode;
    let staffName = cell.staffName;

    if (
      step0?.assigned_staff_id &&
      (!staffShortCode || staffShortCode === 'FIXED' || staffShortCode === '?')
    ) {
      const resolvedStaff =
        staffById.get(step0.assigned_staff_id) ||
        staffByCode.get(step0.assigned_staff_id.trim().toUpperCase());
      if (resolvedStaff) {
        staffShortCode = resolvedStaff.short_code;
        staffName = resolvedStaff.full_name;
      }
    }

    enrichedCells[key] = {
      ...cell,
      classDisplayName: readableClassName,
      staffShortCode,
      staffName,
    };
  }

  return {
    enriched: {
      ...data,
      classDisplayName: readableClassName,
      cells: enrichedCells,
    },
    meta,
  };
}

/**
 * Enriches StaffTimetableData with full faculty name, readable class labels,
 * Step 0 optional staff-assigned slots, and complete summary legend rows
 * (handling Supabase online & offline resilient mode cleanly).
 */
export function enrichStaffTimetableForPdf(
  data: StaffTimetableData,
  classes: TTClass[] = [],
  staff: TTStaff[] = []
): EnrichedStaffTimetableData {
  const matchedStaff = staff.find(
    (s) =>
      s.id === data.staffId ||
      s.short_code.trim().toUpperCase() === data.staffId.trim().toUpperCase() ||
      s.full_name.trim().toUpperCase() === (data.staffName || '').trim().toUpperCase()
  );

  const staffName = matchedStaff?.full_name || data.staffName || data.staffId;
  const staffShortCode = matchedStaff?.short_code;

  const workloadMap = loadWorkloadMemory() as Record<string, TTWorkload[]>;
  const subjectNameLookup = new Map<string, string>();
  for (const [cid, list] of Object.entries(workloadMap)) {
    for (const w of list ?? []) {
      const codeKey = `${normalizeClassToken(cid)}::${(w.subject_code || '').trim().toUpperCase()}`;
      if (w.subject_name) subjectNameLookup.set(codeKey, w.subject_name);
      if (w.id && w.subject_name) subjectNameLookup.set(`wid::${w.id}`, w.subject_name);
    }
  }

  const enrichedCells: GridCellMap = {};
  for (const [key, cell] of Object.entries(data.cells)) {
    const classIdOrCode = cell.classDisplayName || cell.classCode;
    const readableClass = resolveReadableClassName(
      cell.classCode || classIdOrCode,
      classes,
      cell.classDisplayName
    );
    const matchedClass = classes.find(
      (c) =>
        c.id === cell.classCode ||
        c.code === cell.classCode ||
        normalizeClassToken(c.id) === normalizeClassToken(cell.classCode)
    );

    enrichedCells[key] = {
      ...cell,
      classCode: matchedClass?.code || cell.classCode,
      classDisplayName: readableClass,
      staffName,
    };
  }

  // Merge any Step 0 fixed slots explicitly assigned to this staff member
  const memFixed = loadFixedPeriodsMemory() as FixedPeriodsByClass;
  const targetIds = new Set(
    [data.staffId, matchedStaff?.id, matchedStaff?.short_code]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.trim().toUpperCase())
  );

  for (const cls of classes) {
    const fixedSlots = getFixedSlotsForClass(memFixed, cls.id, classes);
    for (const fs of fixedSlots) {
      if (!fs.assigned_staff_id) continue;
      if (!targetIds.has(fs.assigned_staff_id.trim().toUpperCase())) continue;

      const key = slotKey(fs.day_order, fs.period);
      if (!enrichedCells[key]) {
        enrichedCells[key] = {
          slotId: fs.id || `fixed-${cls.id}-${key}`,
          workloadId: '',
          subjectCode: fs.slot_type,
          subjectName: fixedSlotSubjectName(fs.slot_type),
          staffShortCode: staffShortCode || '',
          staffName,
          classCode: cls.code,
          classDisplayName: cls.display_name,
          isFixed: true,
          isClash: false,
          clashReason: null,
        };
      }
    }
  }

  // Normalize existing legend or reconstruct from cells when offline
  let legend = (data.legend ?? []).map((item) => ({
    ...item,
    classDisplayName: resolveReadableClassName(
      item.classDisplayName,
      classes,
      item.classDisplayName
    ),
  }));

  if (legend.length === 0 && Object.keys(enrichedCells).length > 0) {
    const grouped = new Map<
      string,
      { classDisplayName: string; subjectCode: string; subjectName: string; hoursPerWeek: number }
    >();

    for (const cell of Object.values(enrichedCells)) {
      const cleanSubjCode = (cell.subjectCode || '').replace(/\s*\([^)]+\)$/, '').trim();
      const groupKey = `${cell.classDisplayName}::${cleanSubjCode}`;
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.hoursPerWeek += 1;
      } else {
        const lookedUpName =
          (cell.workloadId && subjectNameLookup.get(`wid::${cell.workloadId}`)) ||
          subjectNameLookup.get(
            `${normalizeClassToken(cell.classCode)}::${cleanSubjCode.toUpperCase()}`
          ) ||
          (cell.subjectName && cell.subjectName !== cell.subjectCode
            ? cell.subjectName
            : cleanSubjCode);

        grouped.set(groupKey, {
          classDisplayName: cell.classDisplayName,
          subjectCode: cleanSubjCode,
          subjectName: lookedUpName,
          hoursPerWeek: 1,
        });
      }
    }

    legend = Array.from(grouped.values()).sort((a, b) =>
      a.classDisplayName.localeCompare(b.classDisplayName)
    );
  }

  const placedCount = Object.keys(enrichedCells).length;
  const legendTotal = legend.reduce((sum, l) => sum + l.hoursPerWeek, 0);
  const totalHours = Math.max(data.totalHours || 0, placedCount, legendTotal);

  return {
    staffId: data.staffId,
    staffName,
    staffShortCode,
    totalHours,
    cells: enrichedCells,
    legend,
  };
}

/**
 * Fetches and caches the college crest image as a base64 data URL so html2canvas
 * renders it crisply without CORS canvas-taint issues.
 */
async function loadLogoDataUrl(): Promise<string> {
  if (cachedLogoDataUrl) return cachedLogoDataUrl;
  if (typeof fetch === 'undefined' || typeof FileReader === 'undefined') {
    return COLLEGE_LOGO_URL;
  }

  try {
    const res = await fetch(COLLEGE_LOGO_URL, {
      mode: 'cors',
      referrerPolicy: 'no-referrer',
    });
    if (!res.ok) return COLLEGE_LOGO_URL;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        typeof reader.result === 'string'
          ? resolve(reader.result)
          : reject(new Error('Failed to encode logo'));
      reader.onerror = () => reject(new Error('Logo read error'));
      reader.readAsDataURL(blob);
    });
    cachedLogoDataUrl = dataUrl;
    return dataUrl;
  } catch {
    return COLLEGE_LOGO_URL;
  }
}

async function waitForImagesInContainer(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll('img'));
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve();
            return;
          }
          const timer = setTimeout(resolve, 4000);
          img.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve();
          };
        })
    )
  );
}

/**
 * Renders an ordered list of A4 Portrait sheet elements off-screen, one per page,
 * scales each cleanly onto exactly one A4 Portrait PDF page, and downloads the file.
 */
async function renderPagesAndSaveA4PortraitPdf(
  pageFactories: Array<(logoSrc: string) => React.ReactElement>,
  fileName: string
): Promise<void> {
  if (pageFactories.length === 0) {
    throw new Error('No timetable pages available to export.');
  }

  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }

  const logoSrc = await loadLogoDataUrl();

  const hostDiv = document.createElement('div');
  hostDiv.setAttribute('data-timetable-pdf-host', 'true');
  Object.assign(hostDiv.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '794px',
    backgroundColor: '#ffffff',
    opacity: '1',
    pointerEvents: 'none',
    zIndex: '-1',
  });
  document.body.appendChild(hostDiv);

  let root: Root | null = null;

  try {
    root = createRoot(hostDiv);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageW = pdf.internal.pageSize.getWidth(); // 210mm
    const pageH = pdf.internal.pageSize.getHeight(); // 297mm
    const margin = 6;
    const availW = pageW - margin * 2; // 198mm
    const availH = pageH - margin * 2; // 285mm

    for (let i = 0; i < pageFactories.length; i++) {
      root.render(pageFactories[i](logoSrc));
      await new Promise((r) => setTimeout(r, 90));
      await waitForImagesInContainer(hostDiv);

      const pageEl =
        (hostDiv.querySelector('.pdf-sheet-page') as HTMLElement | null) ||
        (hostDiv.firstElementChild as HTMLElement | null);

      if (!pageEl) {
        throw new Error(`Failed to render PDF page ${i + 1}.`);
      }

      const canvas = await Promise.race([
        html2canvas(pageEl, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 10000,
          backgroundColor: '#ffffff',
          width: 794,
          windowWidth: 794,
          scrollX: 0,
          scrollY: 0,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('PDF rendering timed out. Please try again.')), 25000)
        ),
      ]);

      const imgAspect = canvas.width / canvas.height;
      let renderW = availW;
      let renderH = renderW / imgAspect;
      if (renderH > availH) {
        renderH = availH;
        renderW = renderH * imgAspect;
      }

      const xOffset = (pageW - renderW) / 2;
      const yOffset = margin;

      const imgData = canvas.toDataURL('image/png');
      if (i > 0) {
        pdf.addPage('a4', 'portrait');
      }
      pdf.addImage(imgData, 'PNG', xOffset, yOffset, renderW, renderH, undefined, 'FAST');
    }

    pdf.save(fileName);
  } finally {
    try {
      root?.unmount();
    } catch {
      // ignore unmount error
    }
    hostDiv.remove();
  }
}

/**
 * Downloads a single Class Time Table PDF matching the official A4 Portrait template.
 */
export async function downloadClassTimetablePdf(
  data: ClassTimetableData,
  classes: TTClass[] = [],
  staff: TTStaff[] = []
): Promise<string> {
  const { enriched, meta } = enrichClassTimetableForPdf(data, classes, staff);
  const fileName = buildTimetablePdfFilename(enriched.classDisplayName, 'Class');

  await renderPagesAndSaveA4PortraitPdf(
    [
      (logoSrc) =>
        React.createElement(ClassTimetablePdfPage, {
          data: enriched,
          meta,
          logoSrc,
        }),
    ],
    fileName
  );

  return fileName;
}

/**
 * Downloads all classes (one class per A4 Portrait page) in a single PDF.
 */
export async function downloadAllClassesTimetablePdf(
  classes: TTClass[],
  staff: TTStaff[],
  fetchClassData: (classId: string) => Promise<ClassTimetableData>
): Promise<string> {
  if (!classes || classes.length === 0) {
    throw new Error('No classes found to download.');
  }

  const allEntries = await Promise.all(
    classes.map(async (cls) => {
      const raw = await fetchClassData(cls.id);
      return enrichClassTimetableForPdf(
        {
          ...raw,
          classDisplayName: raw.classDisplayName && raw.classDisplayName !== cls.id
            ? raw.classDisplayName
            : cls.display_name,
        },
        classes,
        staff
      );
    })
  );

  const fileName = buildTimetablePdfFilename('All_Classes', 'All_Classes');
  await renderPagesAndSaveA4PortraitPdf(
    allEntries.map(
      ({ enriched, meta }) =>
        (logoSrc: string) =>
          React.createElement(ClassTimetablePdfPage, {
            data: enriched,
            meta,
            logoSrc,
          })
    ),
    fileName
  );

  return fileName;
}

/**
 * Downloads a single Individual Staff Time Table PDF matching the official A4 Portrait template.
 */
export async function downloadStaffTimetablePdf(
  data: StaffTimetableData,
  classes: TTClass[] = [],
  staff: TTStaff[] = []
): Promise<string> {
  const enriched = enrichStaffTimetableForPdf(data, classes, staff);
  const fileName = buildTimetablePdfFilename(enriched.staffName, 'Staff');

  await renderPagesAndSaveA4PortraitPdf(
    [
      (logoSrc) =>
        React.createElement(StaffTimetablePdfPage, {
          data: enriched,
          logoSrc,
        }),
    ],
    fileName
  );

  return fileName;
}

/**
 * Downloads all active staff members (one staff member per A4 Portrait page) in a single PDF.
 */
export async function downloadAllStaffTimetablePdf(
  staff: TTStaff[],
  classes: TTClass[],
  fetchStaffData: (staffId: string) => Promise<StaffTimetableData>
): Promise<string> {
  const activeStaff = (staff ?? []).filter((s) => s.status !== 'INACTIVE');
  if (activeStaff.length === 0) {
    throw new Error('No staff members found in directory to download.');
  }

  const allEnriched = await Promise.all(
    activeStaff.map(async (member) => {
      const raw = await fetchStaffData(member.id);
      return enrichStaffTimetableForPdf(
        {
          ...raw,
          staffId: member.id,
          staffName: member.full_name || raw.staffName,
        },
        classes,
        staff
      );
    })
  );

  const fileName = buildTimetablePdfFilename('All_Staff', 'All_Staff');
  await renderPagesAndSaveA4PortraitPdf(
    allEnriched.map(
      (enriched) => (logoSrc: string) =>
        React.createElement(StaffTimetablePdfPage, {
          data: enriched,
          logoSrc,
        })
    ),
    fileName
  );

  return fileName;
}

/**
 * Preserved legacy DOM-capture helper (kept for backwards compatibility).
 */
export async function exportTimetableToPdf(element: HTMLElement, fileName: string): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));

  const captureHeight = Math.max(element.scrollHeight, element.offsetHeight, 1000);
  element.setAttribute('data-active-timetable-export', 'true');

  try {
    const renderPromise = html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      imageTimeout: 10000,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      windowHeight: captureHeight + 400,
      scrollY: 0,
      scrollX: 0,
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PDF generation timed out. Please try again.')), 20000)
    );

    const canvas = await Promise.race([renderPromise, timeoutPromise]);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const availW = pdfWidth - margin * 2;
    const availH = pdfHeight - margin * 2;

    const aspect = canvas.width / canvas.height;
    let w = availW;
    let h = w / aspect;
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', (pdfWidth - w) / 2, margin, w, h);
    pdf.save(fileName);
  } finally {
    element.removeAttribute('data-active-timetable-export');
  }
}
