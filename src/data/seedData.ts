import { Staff, ClassSection, TimetableEntry } from '../types';

// ACCFIN 2026-27 ODD SEMESTER - verified against:
//   AF_CLASS_TIME_TABLE_2026-27_ODD_SEM.pdf (primary)
//   A_F_WORKLOAD__Real_data__26-27.xlsx (staff roster + hour-split disambiguation)
//   AF_STAFF_TIME_TABLE_2026-27_ODD_SEMESTER.pdf (per-staff confirmation)
//   AF_DAILY_LOG_SHEETS_2026-2027_ODD_SEMESTER.pdf (combined-grid checksum)
// Every staff code below is a REAL person confirmed in the workload sheet - none invented.

export const initialStaff: Staff[] = [
  { id: 'staff-AJ', code: 'AJ', fullName: 'DR. A. JULIET', isActive: true, onLeave: false },
  { id: 'staff-DA', code: 'DA', fullName: 'DR. D. AKILANDESWARI', isActive: true, onLeave: false },
  { id: 'staff-DJ', code: 'DJ', fullName: 'MR. B. DENNY JONES', isActive: true, onLeave: false },
  { id: 'staff-FND', code: 'FND', fullName: 'DR. P. FATHIMA NANCY DYANA', isActive: true, onLeave: false },
  { id: 'staff-GS', code: 'GS', fullName: 'DR. G. SATHYA', isActive: true, onLeave: false },
  { id: 'staff-JD', code: 'JD', fullName: 'MS. D. JAYALAKSHMI', isActive: true, onLeave: false },
  { id: 'staff-JP', code: 'JP', fullName: 'DR. R. JOTHIPRAKASH', isActive: true, onLeave: false },
  { id: 'staff-KM', code: 'KM', fullName: 'MS. K. MATHUMATHI', isActive: true, onLeave: false },
  { id: 'staff-KS', code: 'KS', fullName: 'MS. K. SINDHUJA', isActive: true, onLeave: false },
  { id: 'staff-MJ', code: 'MJ', fullName: 'DR. M. JAGADEESWARI', isActive: true, onLeave: false },
  { id: 'staff-MP', code: 'MP', fullName: 'MS. P. MEENA', isActive: true, onLeave: false },
  { id: 'staff-OJ', code: 'OJ', fullName: 'DR. M. OPHELIA JANEFER', isActive: true, onLeave: false },
  { id: 'staff-PM', code: 'PM', fullName: 'DR. P. MARIAPPAN', isActive: true, onLeave: false },
  { id: 'staff-PS', code: 'PS', fullName: 'DR. B. PADMASHREE', isActive: true, onLeave: false },
  { id: 'staff-RP', code: 'RP', fullName: 'DR. P. RAJENDRA PRASAD (HOD)', isActive: true, onLeave: false },
  { id: 'staff-RT', code: 'RT', fullName: 'MR. R. THIRUMURUGAN', isActive: true, onLeave: false },
  { id: 'staff-SS', code: 'SS', fullName: 'MS. SHILPA S', isActive: true, onLeave: false },
  { id: 'staff-TP', code: 'TP', fullName: 'MS. T. PARKAVI', isActive: true, onLeave: false }
];

export const initialClasses: ClassSection[] = [
  { id: 'class-I-BCOM-AF-A', yearLabel: 'I B.COM AF', section: 'A', roomNo: 'MB S6', inchargeName: 'MS. K. MATHUMATHI', displayOrder: 1 },
  { id: 'class-I-BCOM-AF-B', yearLabel: 'I B.COM AF', section: 'B', roomNo: 'MB S7', inchargeName: 'DR. G. SATHYA', displayOrder: 2 },
  { id: 'class-I-BCOM-AF-C', yearLabel: 'I B.COM AF', section: 'C', roomNo: 'MB S9', inchargeName: 'DR. P. FATHIMA NANCY DYANA', displayOrder: 3 },
  { id: 'class-II-BCOM-AF-A', yearLabel: 'II B.COM AF', section: 'A', roomNo: 'MB S10', inchargeName: 'DR. M. JAGADEESWARI', displayOrder: 4 },
  { id: 'class-II-BCOM-AF-B', yearLabel: 'II B.COM AF', section: 'B', roomNo: 'MB S11', inchargeName: 'MR. B. DENNY JONES', displayOrder: 5 },
  { id: 'class-II-BCOM-AF-C', yearLabel: 'II B.COM AF', section: 'C', roomNo: 'MB S12', inchargeName: 'MS. K. SINDHUJA', displayOrder: 6 },
  { id: 'class-III-BCOM-AF-A', yearLabel: 'III B.COM AF', section: 'A', roomNo: 'MB S18', inchargeName: 'MS. T. PARKAVI', displayOrder: 7 },
  { id: 'class-III-BCOM-AF-B', yearLabel: 'III B.COM AF', section: 'B', roomNo: 'MB S19', inchargeName: 'DR. R. JOTHIPRAKASH', displayOrder: 8 },
  { id: 'class-III-BCOM-AF-C', yearLabel: 'III B.COM AF', section: 'C', roomNo: 'MB S20', inchargeName: 'DR. B. PADMASHREE', displayOrder: 9 },
  { id: 'class-I-MCOM-AF-A', yearLabel: 'I M.COM AF', section: 'A', roomNo: 'MB S21C', inchargeName: 'MS. P. MEENA', displayOrder: 10 },
  { id: 'class-II-MCOM-AF-A', yearLabel: 'II M.COM AF', section: 'A', roomNo: 'MB S17', inchargeName: 'DR. D. AKILANDESWARI', displayOrder: 11 }
];

interface RawPeriod {
  subject: string;
  staffCodes?: string[];
  excluded?: boolean;
  isLab?: boolean;
}

const rawTimetable: Record<string, Record<number, RawPeriod[]>> = {
  'class-I-BCOM-AF-A': {
    1: [
      { subject: 'POM', staffCodes: ['KM'] },
      { subject: 'LANG', excluded: true },
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'ENG', excluded: true },
      { subject: 'BC', staffCodes: ['SS'] }
    ],
    2: [
      { subject: 'ENG', excluded: true },
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'POM', staffCodes: ['KM'] },
      { subject: 'SEC', staffCodes: ['TP', 'KS'], isLab: true },
      { subject: 'SEC', staffCodes: ['TP', 'DA'], isLab: true }
    ],
    3: [
      { subject: 'LANG', excluded: true },
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'ENG', excluded: true },
      { subject: 'POM', staffCodes: ['KM'] },
      { subject: 'BC', staffCodes: ['SS'] }
    ],
    4: [
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'LANG', excluded: true },
      { subject: 'POM', staffCodes: ['KM'] },
      { subject: 'ENG', excluded: true },
      { subject: 'BC', staffCodes: ['SS'] }
    ],
    5: [
      { subject: 'BC', staffCodes: ['SS'] },
      { subject: 'LANG', excluded: true },
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'PE', staffCodes: ['PS'] },
      { subject: 'POM', staffCodes: ['KM'] }
    ],
    6: [
      { subject: 'PE', staffCodes: ['PS'] },
      { subject: 'POM', staffCodes: ['KM'] },
      { subject: 'FA', staffCodes: ['JD'] },
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true }
    ]
  },
  'class-I-BCOM-AF-B': {
    1: [
      { subject: 'BC', staffCodes: ['JD'] },
      { subject: 'POM', staffCodes: ['GS'] },
      { subject: 'FA', staffCodes: ['DJ'] },
      { subject: 'LANG', excluded: true },
      { subject: 'ENG', excluded: true }
    ],
    2: [
      { subject: 'LANG', excluded: true },
      { subject: 'PE', staffCodes: ['PM'] },
      { subject: 'BC', staffCodes: ['JD'] },
      { subject: 'POM', staffCodes: ['GS'] },
      { subject: 'FA', staffCodes: ['DJ'] }
    ],
    3: [
      { subject: 'POM', staffCodes: ['RP'] },
      { subject: 'FA', staffCodes: ['DJ'] },
      { subject: 'LANG', excluded: true },
      { subject: 'BC', staffCodes: ['JD'] },
      { subject: 'ENG', excluded: true }
    ],
    4: [
      { subject: 'LANG', excluded: true },
      { subject: 'ENG', excluded: true },
      { subject: 'FA', staffCodes: ['DJ'] },
      { subject: 'PE', staffCodes: ['JD'] },
      { subject: 'POM', staffCodes: ['GS'] }
    ],
    5: [
      { subject: 'FA', staffCodes: ['DJ'] },
      { subject: 'ENG', excluded: true },
      { subject: 'POM', staffCodes: ['GS'] },
      { subject: 'BC', staffCodes: ['JD'] },
      { subject: 'LANG', excluded: true }
    ],
    6: [
      { subject: 'FA', staffCodes: ['DJ'] },
      { subject: 'SEC', staffCodes: ['PS', 'JP'], isLab: true },
      { subject: 'SEC', staffCodes: ['PS', 'JP'], isLab: true },
      { subject: 'ENG', excluded: true },
      { subject: 'POM', staffCodes: ['GS'] }
    ]
  },
  'class-I-BCOM-AF-C': {
    1: [
      { subject: 'LANG', excluded: true },
      { subject: 'BC', staffCodes: ['DJ'] },
      { subject: 'FA', staffCodes: ['DA'] },
      { subject: 'POM', staffCodes: ['FND'] },
      { subject: 'ENG', excluded: true }
    ],
    2: [
      { subject: 'LANG', excluded: true },
      { subject: 'ENG', excluded: true },
      { subject: 'FA', staffCodes: ['DA'] },
      { subject: 'PE', staffCodes: ['KM'] },
      { subject: 'POM', staffCodes: ['FND'] }
    ],
    3: [
      { subject: 'BC', staffCodes: ['MP'] },
      { subject: 'PE', staffCodes: ['KM'] },
      { subject: 'ENG', excluded: true },
      { subject: 'FA', staffCodes: ['DA'] },
      { subject: 'POM', staffCodes: ['FND'] }
    ],
    4: [
      { subject: 'LANG', excluded: true },
      { subject: 'SEC', staffCodes: ['KS', 'OJ'], isLab: true },
      { subject: 'SEC', staffCodes: ['KS', 'OJ'], isLab: true },
      { subject: 'ENG', excluded: true },
      { subject: 'POM', staffCodes: ['FND'] }
    ],
    5: [
      { subject: 'POM', staffCodes: ['FND'] },
      { subject: 'ENG', excluded: true },
      { subject: 'BC', staffCodes: ['DJ'] },
      { subject: 'FA', staffCodes: ['DA'] },
      { subject: 'LANG', excluded: true }
    ],
    6: [
      { subject: 'FA', staffCodes: ['DA'] },
      { subject: 'LANG', excluded: true },
      { subject: 'BC', staffCodes: ['MP'] },
      { subject: 'POM', staffCodes: ['FND'] },
      { subject: 'FA', staffCodes: ['DA'] }
    ]
  },
  'class-II-BCOM-AF-A': {
    1: [
      { subject: 'LANG', excluded: true },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CA', staffCodes: ['MP'] },
      { subject: 'CL', staffCodes: ['MJ'] },
      { subject: 'ENG', excluded: true }
    ],
    2: [
      { subject: 'ENG', excluded: true },
      { subject: 'CA', staffCodes: ['MP'] },
      { subject: 'CL', staffCodes: ['MJ'] },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'BOE', staffCodes: ['OJ'] }
    ],
    3: [
      { subject: 'LANG', excluded: true },
      { subject: 'CL', staffCodes: ['MJ'] },
      { subject: 'ENG', excluded: true },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CA', staffCodes: ['MP'] }
    ],
    4: [
      { subject: 'EVS', staffCodes: ['PM'] },
      { subject: 'CA', staffCodes: ['MP'] },
      { subject: 'LANG', excluded: true },
      { subject: 'CL', staffCodes: ['MJ'] },
      { subject: 'ENG', excluded: true }
    ],
    5: [
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CL', staffCodes: ['MJ'] },
      { subject: 'CA', staffCodes: ['MP'] },
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true }
    ],
    6: [
      { subject: 'BOE', staffCodes: ['OJ'] },
      { subject: 'LANG', excluded: true },
      { subject: 'EVS', staffCodes: ['PM'] },
      { subject: 'CL', staffCodes: ['JD'] },
      { subject: 'CA', staffCodes: ['MP'] }
    ]
  },
  'class-II-BCOM-AF-B': {
    1: [
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CA', staffCodes: ['PM'] },
      { subject: 'EVS', staffCodes: ['KS'] },
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'LANG', excluded: true }
    ],
    2: [
      { subject: 'CA', staffCodes: ['PM'] },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'EVS', staffCodes: ['KS'] },
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'ENG', excluded: true }
    ],
    3: [
      { subject: 'ENG', excluded: true },
      { subject: 'CA', staffCodes: ['PM'] },
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'LANG', excluded: true },
      { subject: 'BOE', staffCodes: ['TP'] }
    ],
    4: [
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CA', staffCodes: ['PM'] }
    ],
    5: [
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true },
      { subject: 'BOE', staffCodes: ['TP'] },
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'CA', staffCodes: ['PM'] }
    ],
    6: [
      { subject: 'CA', staffCodes: ['PM'] },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'ENG', excluded: true },
      { subject: 'CL', staffCodes: ['DJ'] },
      { subject: 'LANG', excluded: true }
    ]
  },
  'class-II-BCOM-AF-C': {
    1: [
      { subject: 'CA', staffCodes: ['KS'] },
      { subject: 'CL', staffCodes: ['RT'] },
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true },
      { subject: 'BOE', staffCodes: ['PS'] }
    ],
    2: [
      { subject: 'ENG', excluded: true },
      { subject: 'CA', staffCodes: ['KS'] },
      { subject: 'LANG', excluded: true },
      { subject: 'BOE', staffCodes: ['PS'] },
      { subject: 'IT', staffCodes: ['AJ'] }
    ],
    3: [
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CL', staffCodes: ['RT'] },
      { subject: 'LANG', excluded: true },
      { subject: 'CA', staffCodes: ['KS'] },
      { subject: 'ENG', excluded: true }
    ],
    4: [
      { subject: 'ENG', excluded: true },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CL', staffCodes: ['RT'] },
      { subject: 'LANG', excluded: true },
      { subject: 'CA', staffCodes: ['KS'] }
    ],
    5: [
      { subject: 'CL', staffCodes: ['JP'] },
      { subject: 'CA', staffCodes: ['KS'] },
      { subject: 'ENG', excluded: true },
      { subject: 'LANG', excluded: true },
      { subject: 'EVS', staffCodes: ['OJ'] }
    ],
    6: [
      { subject: 'CL', staffCodes: ['JP'] },
      { subject: 'CL', staffCodes: ['RT'] },
      { subject: 'IT', staffCodes: ['AJ'] },
      { subject: 'CA', staffCodes: ['KS'] },
      { subject: 'EVS', staffCodes: ['OJ'] }
    ]
  },
  'class-III-BCOM-AF-A': {
    1: [
      { subject: 'HRM', staffCodes: ['OJ'] },
      { subject: 'COST', staffCodes: ['MP'] },
      { subject: 'ACG', staffCodes: ['PS'] },
      { subject: 'FM', staffCodes: ['TP'] },
      { subject: 'BANK', staffCodes: ['DA'] }
    ],
    2: [
      { subject: 'HRM', staffCodes: ['OJ'] },
      { subject: 'ITAX', staffCodes: ['SS'] },
      { subject: 'ACG', staffCodes: ['PS'] },
      { subject: 'ITAX', staffCodes: ['SS'] },
      { subject: 'COST', staffCodes: ['MJ'] }
    ],
    3: [
      { subject: 'BANK', staffCodes: ['DA'] },
      { subject: 'FM', staffCodes: ['TP'] },
      { subject: 'ITAX', staffCodes: ['SS'] },
      { subject: 'ACG', staffCodes: ['PS'] },
      { subject: 'HRM', staffCodes: ['OJ'] }
    ],
    4: [
      { subject: 'ITAX', staffCodes: ['SS'] },
      { subject: 'COST', staffCodes: ['MJ'] },
      { subject: 'ACG', staffCodes: ['PS'] },
      { subject: 'BANK', staffCodes: ['DA'] },
      { subject: 'FM', staffCodes: ['TP'] }
    ],
    5: [
      { subject: 'HRM', staffCodes: ['OJ'] },
      { subject: 'BANK', staffCodes: ['DA'] },
      { subject: 'HRM', staffCodes: ['OJ'] },
      { subject: 'COST', staffCodes: ['MJ'] },
      { subject: 'ACG', staffCodes: ['PS'] }
    ],
    6: [
      { subject: 'COST', staffCodes: ['MJ'] },
      { subject: 'ITAX', staffCodes: ['SS'] },
      { subject: 'FM', staffCodes: ['TP'] },
      { subject: 'BANK', staffCodes: ['DA'] },
      { subject: 'FM', staffCodes: ['TP'] }
    ]
  },
  'class-III-BCOM-AF-B': {
    1: [
      { subject: 'COST', staffCodes: ['JP'] },
      { subject: 'ACG', staffCodes: ['OJ'] },
      { subject: 'ITAX', staffCodes: ['FND'] },
      { subject: 'BANK', staffCodes: ['PM'] },
      { subject: 'HRM', staffCodes: ['KS'] }
    ],
    2: [
      { subject: 'COST', staffCodes: ['JP'] },
      { subject: 'ITAX', staffCodes: ['FND'] },
      { subject: 'FM', staffCodes: ['RT'] },
      { subject: 'ACG', staffCodes: ['OJ'] },
      { subject: 'BANK', staffCodes: ['SS'] }
    ],
    3: [
      { subject: 'HRM', staffCodes: ['KS'] },
      { subject: 'COST', staffCodes: ['JP'] },
      { subject: 'ACG', staffCodes: ['OJ'] },
      { subject: 'FM', staffCodes: ['RT'] },
      { subject: 'BANK', staffCodes: ['PM'] }
    ],
    4: [
      { subject: 'FM', staffCodes: ['RT'] },
      { subject: 'ITAX', staffCodes: ['FND'] },
      { subject: 'BANK', staffCodes: ['JP'] },
      { subject: 'ACG', staffCodes: ['OJ'] },
      { subject: 'COST', staffCodes: ['JP'] }
    ],
    5: [
      { subject: 'HRM', staffCodes: ['KS'] },
      { subject: 'BANK', staffCodes: ['PM'] },
      { subject: 'FM', staffCodes: ['RT'] },
      { subject: 'COST', staffCodes: ['JP'] },
      { subject: 'ITAX', staffCodes: ['FND'] }
    ],
    6: [
      { subject: 'HRM', staffCodes: ['KS'] },
      { subject: 'ITAX', staffCodes: ['FND'] },
      { subject: 'ACG', staffCodes: ['OJ'] },
      { subject: 'FM', staffCodes: ['RT'] },
      { subject: 'HRM', staffCodes: ['KS'] }
    ]
  },
  'class-III-BCOM-AF-C': {
    1: [
      { subject: 'ITAX', staffCodes: ['GS'] },
      { subject: 'COST', staffCodes: ['PS'] },
      { subject: 'HRM', staffCodes: ['RP'] },
      { subject: 'FM', staffCodes: ['KM'] },
      { subject: 'BANK', staffCodes: ['TP'] }
    ],
    2: [
      { subject: 'COST', staffCodes: ['PS'] },
      { subject: 'BANK', staffCodes: ['TP'] },
      { subject: 'ITAX', staffCodes: ['GS'] },
      { subject: 'HRM', staffCodes: ['RP'] },
      { subject: 'ACG', staffCodes: ['JD'] }
    ],
    3: [
      { subject: 'COST', staffCodes: ['PS'] },
      { subject: 'FM', staffCodes: ['FND'] },
      { subject: 'BANK', staffCodes: ['TP'] },
      { subject: 'ACG', staffCodes: ['JP'] },
      { subject: 'ITAX', staffCodes: ['GS'] }
    ],
    4: [
      { subject: 'BANK', staffCodes: ['TP'] },
      { subject: 'FM', staffCodes: ['KM'] },
      { subject: 'ACG', staffCodes: ['JD'] },
      { subject: 'HRM', staffCodes: ['RP'] },
      { subject: 'COST', staffCodes: ['PS'] }
    ],
    5: [
      { subject: 'ACG', staffCodes: ['JP'] },
      { subject: 'COST', staffCodes: ['PS'] },
      { subject: 'HRM', staffCodes: ['RP'] },
      { subject: 'FM', staffCodes: ['KM'] },
      { subject: 'ITAX', staffCodes: ['GS'] }
    ],
    6: [
      { subject: 'FM', staffCodes: ['KM'] },
      { subject: 'ACG', staffCodes: ['JD'] },
      { subject: 'ITAX', staffCodes: ['GS'] },
      { subject: 'BANK', staffCodes: ['TP'] },
      { subject: 'HRM', staffCodes: ['RP'] }
    ]
  },
  'class-I-MCOM-AF-A': {
    1: [
      { subject: 'BF', staffCodes: ['TP'] },
      { subject: 'EMA', staffCodes: ['MJ'] },
      { subject: 'SAPM', staffCodes: ['JP'] },
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'BI', staffCodes: ['RP'] }
    ],
    2: [
      { subject: 'BF', staffCodes: ['KM'] },
      { subject: 'BI', staffCodes: ['RP'] },
      { subject: 'SAPM', staffCodes: ['JP'] },
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'SAPM', staffCodes: ['JP'] }
    ],
    3: [
      { subject: 'EMA', staffCodes: ['MJ'] },
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'BF', staffCodes: ['KM'] },
      { subject: 'BI', staffCodes: ['RP'] },
      { subject: 'SAPM', staffCodes: ['JP'] }
    ],
    4: [
      { subject: 'EMA', staffCodes: ['MJ'] },
      { subject: 'SAPM', staffCodes: ['JP'] },
      { subject: 'BI', staffCodes: ['RP'] },
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'BF', staffCodes: ['KM'] }
    ],
    5: [
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'BI', staffCodes: ['RP'] },
      { subject: 'SAPM', staffCodes: ['JP'] },
      { subject: 'BF', staffCodes: ['TP'] },
      { subject: 'EMA', staffCodes: ['MJ'] }
    ],
    6: [
      { subject: 'BI', staffCodes: ['RP'] },
      { subject: 'DM', staffCodes: ['MP'] },
      { subject: 'EMA', staffCodes: ['MJ'] },
      { subject: 'BF', staffCodes: ['KM'] },
      { subject: 'EMA', staffCodes: ['MJ'] }
    ]
  },
  'class-II-MCOM-AF-A': {
    1: [
      { subject: 'ADD', staffCodes: ['DA'] },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true },
      { subject: 'TPM', staffCodes: ['RT'] },
      { subject: 'ACM', staffCodes: ['GS'] }
    ],
    2: [
      { subject: 'RM', staffCodes: ['FND'] },
      { subject: 'ACM', staffCodes: ['GS'] },
      { subject: 'RM', staffCodes: ['PM'] },
      { subject: 'ADD', staffCodes: ['DA'] },
      { subject: 'TPM', staffCodes: ['RT'] }
    ],
    3: [
      { subject: 'RM', staffCodes: ['FND'] },
      { subject: 'ACM', staffCodes: ['GS'] },
      { subject: 'TPM', staffCodes: ['RT'] },
      { subject: 'SMO', staffCodes: ['DJ'] },
      { subject: 'ADD', staffCodes: ['DA'] }
    ],
    4: [
      { subject: 'RM', staffCodes: ['FND'] },
      { subject: 'ADD', staffCodes: ['DA'] },
      { subject: 'ACM', staffCodes: ['GS'] },
      { subject: 'TPM', staffCodes: ['RT'] },
      { subject: 'ACM', staffCodes: ['MP'] }
    ],
    5: [
      { subject: 'TPM', staffCodes: ['RT'] },
      { subject: 'RM', staffCodes: ['FND'] },
      { subject: 'RM', staffCodes: ['PM'] },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true }
    ],
    6: [
      { subject: 'TPM', staffCodes: ['RT'] },
      { subject: 'ACM', staffCodes: ['GS'] },
      { subject: 'SMO', staffCodes: ['DJ'] },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true },
      { subject: 'CAB', staffCodes: ['SS'], isLab: true }
    ]
  }
};

export const getInitialTimetableEntries = (): TimetableEntry[] => {
  const entries: TimetableEntry[] = [];

  for (const [classId, dayOrders] of Object.entries(rawTimetable)) {
    for (const [dayStr, rawPeriods] of Object.entries(dayOrders)) {
      const dayOrder = parseInt(dayStr, 10);
      rawPeriods.forEach((rawPeriod, index) => {
        const period = index + 1;
        const staffIds: string[] = [];

        if (rawPeriod.staffCodes) {
          rawPeriod.staffCodes.forEach(code => {
            const found = initialStaff.find(s => s.code === code);
            if (found) {
              staffIds.push(found.id);
            }
          });
        }

        const isLab = !!rawPeriod.isLab || rawPeriod.subject.toUpperCase().includes('LAB');

        entries.push({
          id: `entry-${classId}-${dayOrder}-${period}`,
          classId,
          dayOrder,
          period,
          subjectCode: rawPeriod.subject,
          isLab,
          excludedFromSubstitution: !!rawPeriod.excluded,
          staffIds
        });
      });
    }
  }

  return entries;
};
