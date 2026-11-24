'use client';

// ============================================================================
// ACCFIN Timetable Generator — Generate Button (Part 4 restyle)
// ============================================================================

import { useState, useTransition } from 'react';
import { runGenerateSchedule, type GenerateRunSummary } from '../../lib/timetable/generate-api';
import { PageHeader, Panel, StatusBanner, PrimaryButton } from './ui';

export default function GenerateButton() {
  const [isPending, startTransition] = useTransition();
  const [summary, setSummary] = useState<GenerateRunSummary | null>(null);

  function handleGenerate() {
    startTransition(async () => {
      const result = await runGenerateSchedule();
      setSummary(result);
    });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        eyebrow="Step 2 — Auto-Generator"
        title="Generate Timetable"
        description="Locks in all Step 0 fixed slots (LANG, ENG, LAB), places every remaining subject from Workload Entry into open periods without double-booking any staff member, and lists anything needing manual placement."
      />

      <PrimaryButton type="button" onClick={handleGenerate} disabled={isPending} className="px-5 py-2.5">
        {isPending ? 'Generating…' : 'Generate Timetable'}
      </PrimaryButton>

      {summary && (
        <div className="space-y-4">
          <StatusBanner
            tone={
              summary.success && summary.unresolved.length === 0 && summary.fixedClashes.length === 0
                ? 'success'
                : summary.success
                  ? 'warning'
                  : 'danger'
            }
          >
            {summary.message}
          </StatusBanner>

          {summary.success && (
            <dl className="grid grid-cols-3 gap-4 text-sm">
              <Panel className="p-3">
                <dt className="text-[#8A806D]">Classes scheduled</dt>
                <dd className="text-lg font-serif text-[#201A17]">{summary.classesAffected}</dd>
              </Panel>
              <Panel className="p-3">
                <dt className="text-[#8A806D]">Slots placed</dt>
                <dd className="text-lg font-serif text-[#201A17]">{summary.slotsPlaced}</dd>
              </Panel>
              <Panel className="p-3">
                <dt className="text-[#8A806D]">Attempts used</dt>
                <dd className="text-lg font-serif text-[#201A17]">{summary.attemptsUsed}</dd>
              </Panel>
            </dl>
          )}

          {summary.fixedClashes.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-[#8C1F1F] mb-2">
                Fixed-slot clashes — fix these in Workload Entry first
              </h2>
              <ul className="space-y-1 text-sm">
                {summary.fixedClashes.map((c, i) => (
                  <li key={i} className="border-l-4 border-[#8C1F1F] bg-[#FBEAEA] px-3 py-2 text-[#6B1717]">
                    {c.classCode} · Day Order {c.dayOrder}, Period {c.period} — {c.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.unresolved.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-[#A9631A] mb-2">Needs manual placement — no free slot found</h2>
              <ul className="space-y-1 text-sm">
                {summary.unresolved.map((u, i) => (
                  <li key={i} className="border-l-4 border-[#A9631A] bg-[#FBF1E6] px-3 py-2 text-[#7A480F]">
                    {u.classCode} · {u.subjectCode} ({u.staffName}) — {u.missingHours} hour(s) unplaced
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.staffWarnings && summary.staffWarnings.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-[#8C1F1F] mb-2 flex items-center gap-1.5">
                <span>Staff Assignment Warnings ({summary.staffWarnings.length})</span>
              </h2>
              <ul className="space-y-1.5 text-sm">
                {summary.staffWarnings.map((w, i) => (
                  <li key={i} className="border-l-4 border-[#8C1F1F] bg-[#FBEAEA] px-3 py-2 text-[#6B1717] font-medium">
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
