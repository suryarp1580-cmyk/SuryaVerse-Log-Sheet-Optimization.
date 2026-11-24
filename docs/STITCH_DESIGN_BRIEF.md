# Google Stitch Design Brief — ACCFIN Timetable Generator

Paste the prompt below into Google Stitch to generate exploratory mockups
that match what's already built. Use this if you want to explore visual
directions beyond the working version delivered in Part 4, or to mock up
future screens (e.g. a dashboard, a printable export view) before they're
built for real.

---

## Prompt to paste into Stitch

```
Design a 3-screen internal admin web tool for the Department of Accounting
& Finance at an Indian college (AGURCHAND MANMULL JAIN COLLEGE), used by
the Head of Department to build the weekly class timetable.

BRAND / TONE: Formal academic institution, not a startup SaaS product.
Trustworthy, precise, ledger-like — think "well-run registrar's office,"
not "modern dashboard." Reference: a printed college timetable sheet with
a maroon-and-gold letterhead and cyan-highlighted grid headers.

COLOR PALETTE (use exactly):
- Primary / brand: deep maroon #3A0D0D
- Accent: gold #D4AF37
- Secondary structural accent: muted slate-teal #2F5D5A
- Background: warm paper #FAF7F1
- Text: warm near-black #201A17
- Success: #3F6634 | Warning: #A9631A | Danger/clash: #8C1F1F

TYPOGRAPHY: Serif (Lora or similar) for headings and the masthead, giving
academic gravity. Clean grotesque sans (IBM Plex Sans or similar) for body
text, forms, and table data. Avoid a generic default like Inter everywhere.

LAYOUT PRINCIPLES:
- Small letterhead-style masthead at the top of every screen: maroon bar,
  gold hairline underneath, department name in serif type.
- Sharp or minimally-rounded corners on structural panels and tables
  (ledger feel) — reserve small rounded corners for buttons and inputs only.
- Hairline borders instead of soft drop-shadows on cards.
- No monospace fonts for codes/data — use the sans typeface with slightly
  wider letter spacing instead.

SCREEN 1 — Workload Entry:
A form where the HOD selects one of 11 classes from a dropdown, then adds
subject rows: short code (e.g. "BI"), full subject name, hours per week,
assigned staff member (from an 18-person roster), and a "Fixed" checkbox
for language subjects that reveals a Day Order (I-VI) + Period (1-5)
picker. Below the form, a table lists all subjects added so far for the
selected class, with a running total against a 30-hour weekly cap.

SCREEN 2 — Generate:
A single prominent button that triggers automatic schedule generation.
Below it, a results summary: three stat panels (classes scheduled, slots
placed, attempts used), plus two possible warning lists below — "fixed-slot
clashes" in a red/maroon list, and "needs manual placement" in an
amber/gold list, each with the specific class, subject, and staff involved.

SCREEN 3 — View Timetable:
A tab switch between "Class View" and "Staff View", each with a dropdown
selector above a 6x5 grid (Day Orders I-VI as rows, Periods 1-5 as columns
plus a visually distinct "Break" column between periods 3 and 4). Grid
cells show a subject code and staff initials (Class View) or a class code
and subject (Staff View). Any conflicting cell is marked with a solid red
left border and light red wash. Below the grid, a legend table lists every
subject/class with its full name and hours.

Generate all three screens as a cohesive set sharing the same masthead,
color system, and typography.
```

---

## Why these choices (for your reference, not part of the Stitch prompt)

- **Maroon + gold** are your college's own brand colors — the same pair
  used on the Cultural Coordinator badge — so this tool visually belongs
  with your other department materials instead of looking like a bolted-on
  generic app.
- **Serif masthead** echoes the printed timetable's formal letterhead feel
  without literally copying it.
- **Sharp panel corners + hairline borders** avoid the "rounded card everywhere"
  look common to AI-generated SaaS UIs, leaning instead toward an official
  document register appropriate for a registrar's tool.
- If Stitch's output diverges from what's built and you like it better,
  the actual color/type values are centralized in one place —
  `components/timetable/ui.tsx` — so applying a new direction across all
  three pages is a small, contained edit, not a rewrite.
