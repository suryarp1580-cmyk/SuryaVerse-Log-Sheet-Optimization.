// ============================================================================
// ACCFIN Timetable Generator — View Page
// Route: /timetable/view
// ============================================================================

import TimetableViewer from '@/components/timetable/TimetableViewer';
import { getClassList, getStaffList } from './actions';

export const dynamic = 'force-dynamic';

export default async function TimetableViewPage() {
  const [classes, staff] = await Promise.all([getClassList(), getStaffList()]);
  return <TimetableViewer classes={classes} staff={staff} />;
}
