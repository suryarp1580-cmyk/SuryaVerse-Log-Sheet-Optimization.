// ============================================================================
// ACCFIN Timetable Generator — Top-Level Module (Vite port)
// ----------------------------------------------------------------------------
// NEW FOR THE PORT: in the Next.js version, Workload Entry / Generate / View
// were three separate routed pages (app/timetable/workload, /generate,
// /view) sharing a layout.tsx. Since this Vite app's routing/sidebar
// implementation is unknown from here, everything is merged into ONE
// self-contained component with its own internal step tabs — so
// integrating it is just "render <TimetableGeneratorModule /> when the
// sidebar item is selected," regardless of whether the app uses
// react-router, a state-based switch, or anything else.
//
// This also owns the initial data fetch (classes, staff, per-class
// workload) that used to happen in the Next.js Server Components.
// ============================================================================

import { useEffect, useState } from 'react';
import type { TTClass, TTStaff, TTWorkload } from '../../lib/timetable/types';
import { getClasses, getStaff, getWorkloadForClass } from '../../lib/timetable/workload-api';
import WorkloadEntryForm from './WorkloadEntryForm';
import GenerateButton from './GenerateButton';
import TimetableViewer from './TimetableViewer';

type Step = 'workload' | 'generate' | 'view';

export default function TimetableGeneratorModule() {
  const [step, setStep] = useState<Step>('workload');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [classes, setClasses] = useState<TTClass[]>([]);
  const [staff, setStaff] = useState<TTStaff[]>([]);
  const [workloadByClass, setWorkloadByClass] = useState<Record<string, TTWorkload[]>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [classList, staffList] = await Promise.all([getClasses(), getStaff()]);
        if (cancelled) return;
        const workloadEntries = await Promise.all(classList.map((c) => getWorkloadForClass(c.id)));
        if (cancelled) return;
        const byClass: Record<string, TTWorkload[]> = {};
        classList.forEach((c, i) => {
          byClass[c.id] = workloadEntries[i];
        });
        setClasses(classList);
        setStaff(staffList);
        setWorkloadByClass(byClass);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Failed to load timetable data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-sm text-[#8A806D]">Loading timetable data…</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="border-l-4 border-[#8C1F1F] bg-[#FBEAEA] px-4 py-3 text-sm text-[#6B1717]">
          Couldn't load timetable data: {loadError}
          <br />
          Check that the migrations in supabase/migrations/ have been run against this project's Supabase database.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#FAF7F1] min-h-full">
      {/* Letterhead masthead */}
      <div className="bg-[#3A0D0D] border-b-4 border-[#D4AF37] no-print">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <p className="font-serif text-[#D4AF37] text-xs tracking-wide">Department of Accounting &amp; Finance</p>
          <h1 className="font-serif text-white text-xl mt-0.5">Timetable Generator</h1>
        </div>
      </div>

      {/* Step nav */}
      <nav className="border-b border-[#E4DCC9] bg-white no-print">
        <div className="max-w-5xl mx-auto px-6 flex gap-6 text-sm">
          <button
            onClick={() => setStep('workload')}
            className={`py-3 font-medium border-b-2 transition-colors ${step === 'workload' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'}`}
          >
            1. Workload Entry
          </button>
          <button
            onClick={() => setStep('generate')}
            className={`py-3 font-medium border-b-2 transition-colors ${step === 'generate' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'}`}
          >
            2. Generate
          </button>
          <button
            onClick={() => setStep('view')}
            className={`py-3 font-medium border-b-2 transition-colors ${step === 'view' ? 'border-[#D4AF37] text-[#3A0D0D]' : 'border-transparent text-[#4A4038] hover:text-[#3A0D0D]'}`}
          >
            3. View Timetable
          </button>
        </div>
      </nav>

      {step === 'workload' && <WorkloadEntryForm classes={classes} staff={staff} initialWorkloadByClass={workloadByClass} />}
      {step === 'generate' && <GenerateButton />}
      {step === 'view' && <TimetableViewer classes={classes} staff={staff} />}
    </div>
  );
}
