// ============================================================================
// ACCFIN Timetable Generator — Workload Entry Page
// Route: /timetable/workload
// ============================================================================

import WorkloadEntryForm from '@/components/timetable/WorkloadEntryForm';
import { getClasses, getStaff, getWorkloadForClass } from './actions';
import type { TTWorkload } from '@/lib/timetable/types';

export const dynamic = 'force-dynamic'; // always read fresh workload data

export default async function WorkloadPage() {
  const [classes, staff] = await Promise.all([getClasses(), getStaff()]);

  // Pre-load workload for every class up front so switching the class
  // dropdown in the form is instant (no extra round-trip per switch).
  const workloadEntries = await Promise.all(
    classes.map((c) => getWorkloadForClass(c.id))
  );

  const initialWorkloadByClass: Record<string, TTWorkload[]> = {};
  classes.forEach((c, i) => {
    initialWorkloadByClass[c.id] = workloadEntries[i];
  });

  return (
    <WorkloadEntryForm
      classes={classes}
      staff={staff}
      initialWorkloadByClass={initialWorkloadByClass}
    />
  );
}
