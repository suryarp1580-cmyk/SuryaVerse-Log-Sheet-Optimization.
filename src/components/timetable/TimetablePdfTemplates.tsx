import React from 'react';
import { DAY_ORDERS, DAY_ORDER_LABELS, PERIOD_TIMES } from '../../lib/timetable/constants';
import type { ClassTimetableData, StaffTimetableData } from '../../lib/timetable/grid-types';

export const COLLEGE_LOGO_URL =
  'https://res.cloudinary.com/oomxhs6j/image/upload/v1785820183/b66af0ec-b48c-4ba3-b1a7-35452df00cdd.png';

export interface ClassPdfMetadata {
  yearLabel: string;
  section: string;
  roomNo: string;
  inchargeName: string;
}

export interface EnrichedStaffTimetableData extends StaffTimetableData {
  staffShortCode?: string;
}

const SERIF_FONT = '"Times New Roman", "Libre Caslon Text", Georgia, serif';
const SANS_FONT = '"IBM Plex Sans", Arial, sans-serif';

// Exact fill colors matching the AMJC printed reference templates
const COLORS = {
  mauveBar: '#D8BFD8',
  classHeaderGreen: '#C5E0B4',
  labDarkGreen: '#7BB661',
  classInchargePink: '#F4CCCC',
  staffTopYellow: '#FFF200',
  staffHeaderCyan: '#66ECFF',
  staffSummaryPeach: '#F8CBAD',
  borderBlack: '#000000',
  white: '#FFFFFF',
};

const EXACT_COLOR_STYLE: React.CSSProperties = {
  printColorAdjust: 'exact',
  WebkitPrintColorAdjust: 'exact',
};

function stripSplitSuffix(subjectCode: string): string {
  return (subjectCode || '').replace(/\s*\([^)]+\)$/, '').trim();
}

function isLabOrSecCell(subjectCode: string): boolean {
  const upper = stripSplitSuffix(subjectCode).toUpperCase();
  return upper === 'SEC' || upper === 'LAB' || upper === 'CAB' || upper.includes('LAB');
}

function isPlainFixedLanguageCell(subjectCode: string): boolean {
  const upper = stripSplitSuffix(subjectCode).toUpperCase();
  return upper === 'LANG' || upper === 'ENG' || upper === 'TAM';
}

export function formatShortYearSection(rawClassText: string): string {
  const upper = (rawClassText || '').toUpperCase().replace(/\s+/g, ' ').trim();
  if (!upper) return '';

  // PG classes: I M.COM AF / II M.COM AF -> I PG / II PG
  if (upper.includes('M.COM') || upper.includes('MCOM') || upper.includes('PG')) {
    if (upper.includes('II')) return 'II PG';
    return 'I PG';
  }

  // UG classes: I/II/III B.COM AF - A/B/C -> I A / II B / III C
  let year = '';
  if (upper.startsWith('III') || upper.includes('III-') || upper.includes('III ')) {
    year = 'III';
  } else if (upper.startsWith('II') || upper.includes('II-') || upper.includes('II ')) {
    year = 'II';
  } else if (upper.startsWith('I') || upper.includes('I-') || upper.includes('I ')) {
    year = 'I';
  }

  const secMatch = upper.match(/(?:SEC\s*[:-]?\s*|[-\s])([ABC])$/);
  const sec = secMatch ? secMatch[1] : '';

  if (year && sec) return `${year} ${sec}`;
  if (year) return year;
  return upper;
}

function CollegeBannerHeader({ logoSrc }: { logoSrc: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '2px solid #1C3A70',
        paddingBottom: '8px',
        marginBottom: '10px',
        fontFamily: SANS_FONT,
        gap: '10px',
      }}
    >
      {/* Left Logo + NAAC Badge (reusing exact Daily Log Sheet Letterhead asset) */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '150px',
          flexShrink: 0,
        }}
      >
        <img
          src={logoSrc}
          alt="AM Jain College Crest"
          referrerPolicy="no-referrer"
          style={{
            height: '52px',
            objectFit: 'contain',
            marginBottom: '3px',
          }}
        />
        <div
          style={{
            ...EXACT_COLOR_STYLE,
            backgroundColor: '#1C3A70',
            color: '#FFFFFF',
            fontSize: '7.5px',
            fontWeight: 800,
            padding: '2px 8px',
            borderRadius: '9999px',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginBottom: '2px',
          }}
        >
          Accredited A+ by NAAC
        </div>
        <div
          style={{
            fontSize: '7px',
            fontWeight: 600,
            color: '#475569',
            textTransform: 'uppercase',
            textAlign: 'center',
            lineHeight: 1.15,
          }}
        >
          <div>(A Unit of Sri. S. S. Jain Educational Society)</div>
          <div>— Meenambakkam, Chennai —</div>
        </div>
      </div>

      {/* Center College Heading */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: '20px',
            fontWeight: 800,
            color: '#203978',
            lineHeight: 1.15,
            letterSpacing: '-0.01em',
          }}
        >
          Agurchand Manmull Jain College
        </div>
        <div
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: '#334155',
            marginTop: '2px',
          }}
        >
          (A Unit of Sri. S. S. Jain Educational Society)
        </div>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 600,
            color: '#1E293B',
            marginTop: '2px',
            lineHeight: 1.25,
          }}
        >
          Affiliated to University of Madras &nbsp;|&nbsp; A Jain Minority Institution &nbsp;|&nbsp; NAAC
          Re-accredited with Grade A+
        </div>
        <div
          style={{
            fontSize: '9px',
            fontWeight: 500,
            color: '#334155',
            marginTop: '2px',
          }}
        >
          A Co-educational Institution, Meenambakkam, Chennai – 600 061.
        </div>
        <div
          style={{
            marginTop: '5px',
            paddingTop: '4px',
            borderTop: '1px solid #E2E8F0',
            width: '90%',
            fontSize: '9.5px',
            fontWeight: 700,
            color: '#203978',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
          }}
        >
          Shift II &nbsp;•&nbsp; Department of Accounting &amp; Finance
        </div>
      </div>

      {/* Balancing right spacer */}
      <div style={{ width: '150px', flexShrink: 0 }} />
    </div>
  );
}

const CELL_BORDER = `1px solid ${COLORS.borderBlack}`;

// ============================================================================
// Class Time Table PDF Template (A4 Portrait)
// ============================================================================
export function ClassTimetablePdfPage({
  data,
  meta,
  logoSrc,
}: {
  data: ClassTimetableData;
  meta: ClassPdfMetadata;
  logoSrc: string;
}) {
  const periodColumns = PERIOD_TIMES;

  return (
    <div
      className="pdf-sheet-page"
      style={{
        ...EXACT_COLOR_STYLE,
        width: '794px',
        backgroundColor: COLORS.white,
        color: '#000000',
        padding: '26px 32px 24px 32px',
        boxSizing: 'border-box',
        fontFamily: SERIF_FONT,
        pageBreakAfter: 'always',
        breakInside: 'avoid',
      }}
    >
      <CollegeBannerHeader logoSrc={logoSrc} />

      {/* Centered Bold Title Block */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: SERIF_FONT,
          fontWeight: 700,
          color: '#000000',
          marginTop: '10px',
          marginBottom: '14px',
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontSize: '14px' }}>DEPARTMENT OF ACCOUNTING &amp; FINANCE</div>
        <div style={{ fontSize: '14px' }}>CLASS TIME TABLE</div>
        <div style={{ fontSize: '12.5px' }}>
          ACADEMIC YEAR 2026–2027 (EVEN SEMESTER DECEMBER 2026 – APRIL 2027)
        </div>
      </div>

      {/* Main Framed Timetable Container (Mauve top bar + Grid + Pink Incharge footer) */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontFamily: SERIF_FONT,
          border: CELL_BORDER,
        }}
      >
        <colgroup>
          <col style={{ width: '11%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>

        <thead>
          {/* Mauve Full-Width Top Bar */}
          <tr>
            <th
              colSpan={7}
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.mauveBar,
                border: CELL_BORDER,
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                }}
              >
                <span>CLASS: {meta.yearLabel}</span>
                <span>SECTION: {meta.section}</span>
                <span>ROOM NO: {meta.roomNo || '—'}</span>
              </div>
            </th>
          </tr>

          {/* Green Header Row 1: HOURS + Period labels + Break header */}
          <tr>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.classHeaderGreen,
                border: CELL_BORDER,
                padding: '6px 4px',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              HOURS
            </th>
            {periodColumns.map((pt) =>
              pt.period === 'BREAK' ? (
                <th
                  key="brk-hdr"
                  rowSpan={2}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.classHeaderGreen,
                    border: CELL_BORDER,
                    padding: '6px 3px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    lineHeight: 1.25,
                  }}
                >
                  11:00 TO
                  <br />
                  11:30
                </th>
              ) : (
                <th
                  key={`p-num-${pt.period}`}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.classHeaderGreen,
                    border: CELL_BORDER,
                    padding: '6px 4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                  }}
                >
                  Period {pt.period}
                </th>
              )
            )}
          </tr>

          {/* Green Header Row 2: DAY ORDER + Period times */}
          <tr>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.classHeaderGreen,
                border: CELL_BORDER,
                padding: '6px 4px',
                fontSize: '10px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              DAY ORDER
            </th>
            {periodColumns.map((pt) =>
              pt.period === 'BREAK' ? null : (
                <th
                  key={`p-time-${pt.period}`}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.classHeaderGreen,
                    border: CELL_BORDER,
                    padding: '5px 3px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                  }}
                >
                  {pt.label.replace('–', 'TO').replace(/\s+TO\s+/, ' TO ')}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {DAY_ORDERS.map((day, dIdx) => (
            <tr key={day}>
              <td
                style={{
                  ...EXACT_COLOR_STYLE,
                  backgroundColor: COLORS.white,
                  border: CELL_BORDER,
                  height: '62px',
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#000000',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {DAY_ORDER_LABELS[day]}
              </td>

              {periodColumns.map((pt) => {
                if (pt.period === 'BREAK') {
                  if (dIdx !== 0) return null;
                  return (
                    <td
                      key="merged-break"
                      rowSpan={6}
                      style={{
                        ...EXACT_COLOR_STYLE,
                        backgroundColor: COLORS.white,
                        border: CELL_BORDER,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#000000',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.5,
                          letterSpacing: '0.05em',
                        }}
                      >
                        <span>B</span>
                        <span>R</span>
                        <span>E</span>
                        <span>A</span>
                        <span>K</span>
                      </div>
                    </td>
                  );
                }

                const key = `${day}_${pt.period}`;
                const cell = data.cells[key];
                if (!cell) {
                  return (
                    <td
                      key={key}
                      style={{
                        ...EXACT_COLOR_STYLE,
                        backgroundColor: COLORS.white,
                        border: CELL_BORDER,
                        height: '62px',
                        textAlign: 'center',
                        verticalAlign: 'middle',
                      }}
                    />
                  );
                }

                const baseSubj = stripSplitSuffix(cell.subjectCode);
                const plainLangEng = isPlainFixedLanguageCell(baseSubj);
                const labOrSec = !plainLangEng && isLabOrSecCell(baseSubj);
                const cleanStaff =
                  cell.staffShortCode &&
                  cell.staffShortCode !== 'FIXED' &&
                  cell.staffShortCode !== '?'
                    ? cell.staffShortCode.trim()
                    : '';

                let cellLabel = baseSubj;
                if (plainLangEng) {
                  cellLabel = baseSubj;
                } else if (baseSubj.toUpperCase() === 'LAB') {
                  cellLabel = cleanStaff ? `LAB (${cleanStaff})` : 'LAB';
                } else if (labOrSec) {
                  cellLabel = cleanStaff ? `${baseSubj} -${cleanStaff}` : baseSubj;
                } else if (cleanStaff) {
                  cellLabel = `${baseSubj}-${cleanStaff}`;
                }

                return (
                  <td
                    key={key}
                    style={{
                      ...EXACT_COLOR_STYLE,
                      backgroundColor: labOrSec ? COLORS.labDarkGreen : COLORS.white,
                      border: CELL_BORDER,
                      height: '62px',
                      padding: '4px 3px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      color: '#000000',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      wordBreak: 'break-word',
                    }}
                  >
                    {cellLabel}
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Pink Footer Bar: CLASS INCHARGE */}
          <tr>
            <td
              colSpan={7}
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.classInchargePink,
                border: CELL_BORDER,
                padding: '9px 12px',
                fontSize: '12px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              CLASS INCHARGE: {meta.inchargeName || '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bottom Right Bold FACILITATOR */}
      <div
        style={{
          marginTop: '54px',
          textAlign: 'right',
          fontFamily: SERIF_FONT,
          fontSize: '12.5px',
          fontWeight: 700,
          color: '#000000',
          paddingRight: '8px',
        }}
      >
        FACILITATOR
      </div>
    </div>
  );
}

// ============================================================================
// Individual Staff Time Table PDF Template (A4 Portrait)
// ============================================================================
export function StaffTimetablePdfPage({
  data,
  logoSrc,
}: {
  data: EnrichedStaffTimetableData;
  logoSrc: string;
}) {
  const periodColumns = PERIOD_TIMES;
  const totalSummaryHours = data.legend.reduce((sum, l) => sum + l.hoursPerWeek, 0);
  const displayTotalHours = data.totalHours || totalSummaryHours;

  return (
    <div
      className="pdf-sheet-page"
      style={{
        ...EXACT_COLOR_STYLE,
        width: '794px',
        backgroundColor: COLORS.white,
        color: '#000000',
        padding: '24px 32px 22px 32px',
        boxSizing: 'border-box',
        fontFamily: SERIF_FONT,
        pageBreakAfter: 'always',
        breakInside: 'avoid',
      }}
    >
      <CollegeBannerHeader logoSrc={logoSrc} />

      {/* Centered Bold Title Lines */}
      <div
        style={{
          textAlign: 'center',
          fontFamily: SERIF_FONT,
          fontWeight: 700,
          color: '#000000',
          marginTop: '8px',
          marginBottom: '12px',
          lineHeight: 1.38,
        }}
      >
        <div style={{ fontSize: '13.5px' }}>AGURCHAND MANMULL JAIN COLLEGE - SHIFT II</div>
        <div style={{ fontSize: '13.5px' }}>DEPARTMENT OF ACCOUNTING &amp; FINANCE</div>
        <div style={{ fontSize: '13.5px' }}>INDIVIDUAL STAFF TIME TABLE</div>
        <div style={{ fontSize: '12px' }}>
          ACADEMIC YEAR 2026-2027 - JUNE 2026 (ODD SEMESTER)
        </div>
      </div>

      {/* Top Yellow Bar: Faculty Name (left) + Total Hours Allotted (separate yellow box on right) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          justifyContent: 'space-between',
          gap: '10px',
          marginBottom: '10px',
          fontFamily: SERIF_FONT,
        }}
      >
        <div
          style={{
            ...EXACT_COLOR_STYLE,
            flex: 1,
            backgroundColor: COLORS.staffTopYellow,
            border: CELL_BORDER,
            padding: '7px 10px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#000000',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          NAME OF THE FACULTY : {data.staffName}
        </div>
        <div
          style={{
            ...EXACT_COLOR_STYLE,
            backgroundColor: COLORS.staffTopYellow,
            border: CELL_BORDER,
            padding: '7px 12px',
            fontSize: '11.5px',
            fontWeight: 700,
            color: '#000000',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          TOTAL HOURS ALLOTTED: {displayTotalHours}
        </div>
      </div>

      {/* Cyan Header 6x5 Grid */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontFamily: SERIF_FONT,
          border: CELL_BORDER,
        }}
      >
        <colgroup>
          <col style={{ width: '11%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>

        <thead>
          <tr>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.staffHeaderCyan,
                border: CELL_BORDER,
                padding: '6px 4px',
                fontSize: '10.5px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              HOUR
            </th>
            {periodColumns.map((pt) =>
              pt.period === 'BREAK' ? (
                <th
                  key="brk-hdr"
                  rowSpan={2}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.staffHeaderCyan,
                    border: CELL_BORDER,
                    padding: '6px 3px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                    lineHeight: 1.25,
                  }}
                >
                  11:00 TO
                  <br />
                  11:30
                </th>
              ) : (
                <th
                  key={`p-num-${pt.period}`}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.staffHeaderCyan,
                    border: CELL_BORDER,
                    padding: '6px 4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                  }}
                >
                  {pt.period}
                </th>
              )
            )}
          </tr>

          <tr>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.staffHeaderCyan,
                border: CELL_BORDER,
                padding: '5px 4px',
                fontSize: '10px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              DAY ORDER
            </th>
            {periodColumns.map((pt) =>
              pt.period === 'BREAK' ? null : (
                <th
                  key={`p-time-${pt.period}`}
                  style={{
                    ...EXACT_COLOR_STYLE,
                    backgroundColor: COLORS.staffHeaderCyan,
                    border: CELL_BORDER,
                    padding: '5px 3px',
                    fontSize: '9.5px',
                    fontWeight: 700,
                    color: '#000000',
                    textAlign: 'center',
                  }}
                >
                  {pt.label.replace('–', 'TO').replace(/\s+TO\s+/, ' TO ')}
                </th>
              )
            )}
          </tr>
        </thead>

        <tbody>
          {DAY_ORDERS.map((day, dIdx) => (
            <tr key={day}>
              <td
                style={{
                  ...EXACT_COLOR_STYLE,
                  backgroundColor: COLORS.white,
                  border: CELL_BORDER,
                  height: '48px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: '#000000',
                  textAlign: 'center',
                  verticalAlign: 'middle',
                }}
              >
                {DAY_ORDER_LABELS[day]}
              </td>

              {periodColumns.map((pt) => {
                if (pt.period === 'BREAK') {
                  if (dIdx !== 0) return null;
                  return (
                    <td
                      key="merged-break"
                      rowSpan={6}
                      style={{
                        ...EXACT_COLOR_STYLE,
                        backgroundColor: COLORS.white,
                        border: CELL_BORDER,
                        textAlign: 'center',
                        verticalAlign: 'middle',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        color: '#000000',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.38,
                        }}
                      >
                        <span>B</span>
                        <span>R</span>
                        <span>E</span>
                        <span>A</span>
                        <span>K</span>
                      </div>
                    </td>
                  );
                }

                const key = `${day}_${pt.period}`;
                const cell = data.cells[key];
                const cellLabel = cell
                  ? `${stripSplitSuffix(cell.subjectCode)}-${formatShortYearSection(
                      cell.classDisplayName || cell.classCode
                    )}`
                  : '';

                return (
                  <td
                    key={key}
                    style={{
                      ...EXACT_COLOR_STYLE,
                      backgroundColor: COLORS.white,
                      border: CELL_BORDER,
                      height: '48px',
                      padding: '4px 3px',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#000000',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      wordBreak: 'break-word',
                    }}
                  >
                    {cellLabel}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary Table Below Grid with Peach Header Row */}
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          fontFamily: SERIF_FONT,
          border: CELL_BORDER,
          marginTop: '14px',
        }}
      >
        <colgroup>
          <col style={{ width: '26%' }} />
          <col style={{ width: '58%' }} />
          <col style={{ width: '16%' }} />
        </colgroup>
        <thead>
          <tr>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.staffSummaryPeach,
                border: CELL_BORDER,
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              CLASS &amp; SECTION
            </th>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.staffSummaryPeach,
                border: CELL_BORDER,
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              SUBJECT NAME
            </th>
            <th
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.staffSummaryPeach,
                border: CELL_BORDER,
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              HOURS
            </th>
          </tr>
        </thead>
        <tbody>
          {data.legend.map((row, idx) => (
            <tr key={idx}>
              <td
                style={{
                  ...EXACT_COLOR_STYLE,
                  backgroundColor: COLORS.white,
                  border: CELL_BORDER,
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#000000',
                  textAlign: 'center',
                }}
              >
                {row.classDisplayName}
              </td>
              <td
                style={{
                  ...EXACT_COLOR_STYLE,
                  backgroundColor: COLORS.white,
                  border: CELL_BORDER,
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#000000',
                  textAlign: 'left',
                }}
              >
                {row.subjectName}
              </td>
              <td
                style={{
                  ...EXACT_COLOR_STYLE,
                  backgroundColor: COLORS.white,
                  border: CELL_BORDER,
                  padding: '5px 8px',
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#000000',
                  textAlign: 'center',
                }}
              >
                {row.hoursPerWeek}
              </td>
            </tr>
          ))}
          <tr>
            <td
              colSpan={2}
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.white,
                border: CELL_BORDER,
                padding: '6px 10px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'right',
              }}
            >
              TOTAL HOURS
            </td>
            <td
              style={{
                ...EXACT_COLOR_STYLE,
                backgroundColor: COLORS.white,
                border: CELL_BORDER,
                padding: '6px 8px',
                fontSize: '11px',
                fontWeight: 700,
                color: '#000000',
                textAlign: 'center',
              }}
            >
              {totalSummaryHours || displayTotalHours}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bottom Right Bold FACILITATOR */}
      <div
        style={{
          marginTop: '32px',
          textAlign: 'right',
          fontFamily: SERIF_FONT,
          fontSize: '12px',
          fontWeight: 700,
          color: '#000000',
          paddingRight: '8px',
        }}
      >
        FACILITATOR
      </div>
    </div>
  );
}
