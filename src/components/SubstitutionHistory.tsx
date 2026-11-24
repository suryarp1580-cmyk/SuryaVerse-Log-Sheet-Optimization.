import React, { useState } from 'react';
import { Substitution, Staff, ClassSection, LogSheet } from '../types';
import {
  History,
  Calendar,
  Trash2,
  Edit3,
  Eye,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Search,
  Filter,
  ArrowUpDown,
  Lock,
  Unlock,
  CheckCircle2,
  UserX,
  UserCheck,
  FileDown,
  Printer,
  ExternalLink,
  Layers,
  Sparkles,
  X,
  Clock,
  Cloud
} from 'lucide-react';

interface SubstitutionHistoryProps {
  logSheets: LogSheet[];
  substitutions: Substitution[];
  staffList: Staff[];
  classes: ClassSection[];
  onSelectLogSheet: (date: string, dayOrder: number) => void;
  onUnlockLogSheet: (logSheetId: string) => void;
  onDeleteLogSheet: (logSheetId: string) => void;
  onRemoveSubstitution: (subId: string) => void;
}

export default function SubstitutionHistory({
  logSheets,
  substitutions,
  staffList,
  classes,
  onSelectLogSheet,
  onUnlockLogSheet,
  onDeleteLogSheet,
  onRemoveSubstitution
}: SubstitutionHistoryProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dayOrderFilter, setDayOrderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'finalized' | 'draft'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeTab, setActiveTab] = useState<'log_sheets' | 'all_subs'>('log_sheets');

  // Modal states
  const [deleteConfirmSheet, setDeleteConfirmSheet] = useState<LogSheet | null>(null);
  const [unlockConfirmSheet, setUnlockConfirmSheet] = useState<LogSheet | null>(null);
  const [popoutSheet, setPopoutSheet] = useState<LogSheet | null>(null);
  const [deleteSubConfirmId, setDeleteSubConfirmId] = useState<string | null>(null);

  const getStaffCode = (id: string) => staffList.find(s => s.id === id)?.code || '?';
  const getStaffName = (id: string) => staffList.find(s => s.id === id)?.fullName || 'Faculty member';
  const getClassLabel = (id: string) => {
    const c = classes.find(cls => cls.id === id);
    return c ? `${c.yearLabel} - Section ${c.section}` : '?';
  };

  const finalizedSheets = logSheets.filter(sheet => sheet.status === 'finalized');
  const draftSheets = logSheets.filter(sheet => sheet.status === 'draft' || !sheet.status);

  // Calculations for each log sheet
  const getSheetStats = (sheet: LogSheet) => {
    const sheetSubs = substitutions.filter(s => s.logSheetId === sheet.id);
    const absentStaffIds = Array.from(
      new Set(sheetSubs.map(s => s.absentStaffId).filter(Boolean))
    );
    const subStaffIds = Array.from(
      new Set(sheetSubs.map(s => s.substituteStaffId).filter(Boolean) as string[])
    );
    const swapCount = sheetSubs.filter(s => s.isSwap).length;

    return {
      substitutions: sheetSubs,
      absentCount: absentStaffIds.length,
      absentStaffIds,
      subStaffCount: subStaffIds.length,
      subStaffIds,
      totalAdjustments: sheetSubs.length,
      swapCount
    };
  };

  // Filtered and sorted sheets according to status, day order, and search
  const filteredSheets = logSheets
    .filter(sheet => {
      // Status filter
      if (statusFilter === 'finalized' && sheet.status !== 'finalized') {
        return false;
      }
      if (statusFilter === 'draft' && sheet.status === 'finalized') {
        return false;
      }

      // Day Order filter
      if (dayOrderFilter !== 'all' && sheet.dayOrder !== parseInt(dayOrderFilter, 10)) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const stats = getSheetStats(sheet);
        const dateMatch = sheet.logDate.includes(term);
        const staffMatch = stats.absentStaffIds.some(id => {
          const s = staffList.find(st => st.id === id);
          return s?.code.toLowerCase().includes(term) || s?.fullName?.toLowerCase().includes(term);
        }) || stats.subStaffIds.some(id => {
          const s = staffList.find(st => st.id === id);
          return s?.code.toLowerCase().includes(term) || s?.fullName?.toLowerCase().includes(term);
        });
        return dateMatch || staffMatch;
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.logDate).getTime();
      const dateB = new Date(b.logDate).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

  // Filtered substitutions list
  const filteredSubs = substitutions.filter(sub => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    const absentStaff = staffList.find(s => s.id === sub.absentStaffId);
    const subStaff = staffList.find(s => s.id === sub.substituteStaffId);
    const classObj = classes.find(c => c.id === sub.classId);

    return (
      absentStaff?.code.toLowerCase().includes(term) ||
      absentStaff?.fullName?.toLowerCase().includes(term) ||
      subStaff?.code.toLowerCase().includes(term) ||
      subStaff?.fullName?.toLowerCase().includes(term) ||
      classObj?.yearLabel.toLowerCase().includes(term) ||
      sub.remarks.toLowerCase().includes(term)
    );
  });

  const formatDateDisplay = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const romanDayOrders = ['I', 'II', 'III', 'IV', 'V', 'VI'];

  return (
    <div className="p-6 space-y-6 select-none font-sans max-w-6xl mx-auto">
      {/* Top Banner Header */}
      <div className="bg-white border border-[#cbc4cd] p-6 rounded-xl shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3.5">
          <div className="p-3 bg-[#556B2F]/10 border border-[#556B2F]/20 rounded-xl text-[#556B2F]">
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-serif font-black text-xl text-[#161b27] tracking-tight">
                Log Sheet History & Archives
              </h2>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-300">
                Official Records
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Archived finalized log sheets, absentees, and faculty substitutions
            </p>
          </div>
        </div>

        {/* Aggregate Stats */}
        <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-[#cbc4cd] px-4 py-2 rounded-lg text-xs font-semibold text-slate-700">
          <div className="flex items-center gap-1.5 border-r border-[#cbc4cd] pr-3">
            <ShieldCheck className="w-4 h-4 text-[#556B2F]" />
            <span>
              <strong className="text-[#161b27]">{finalizedSheets.length}</strong> Finalized
            </span>
          </div>
          <div className="flex items-center gap-1.5 border-r border-[#cbc4cd] pr-3">
            <Cloud className="w-4 h-4 text-amber-600" />
            <span>
              <strong className="text-[#161b27]">{draftSheets.length}</strong> Auto-saved Drafts
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-emerald-600" />
            <span>
              <strong className="text-[#161b27]">{substitutions.length}</strong> Adjustments
            </span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center justify-between border-b border-[#cbc4cd]">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('log_sheets')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'log_sheets'
                ? 'border-[#556B2F] text-[#556B2F] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Log Sheets Archive ({logSheets.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('all_subs')}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'all_subs'
                ? 'border-[#556B2F] text-[#556B2F] bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>All Substitution Entries ({substitutions.length})</span>
          </button>
        </div>

        {/* Sort & Filter Controls */}
        <div className="flex items-center gap-2 pb-2">
          <button
            onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#cbc4cd] hover:bg-slate-50 rounded text-xs font-bold text-slate-700 shadow-2xs transition-all cursor-pointer"
            title={`Sort by Date: ${sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}`}
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-[#556B2F]" />
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 border border-[#cbc4cd] rounded-lg shadow-2xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by date, staff code, name, or class..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 text-xs font-semibold border border-[#cbc4cd] rounded bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 text-[#161b27]"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter Toggle */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500">Status:</span>
          <div className="flex bg-slate-100 p-0.5 rounded border border-[#cbc4cd]">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer ${
                statusFilter === 'all'
                  ? 'bg-white text-[#161b27] shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({logSheets.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('finalized')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer ${
                statusFilter === 'finalized'
                  ? 'bg-white text-emerald-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Finalized ({finalizedSheets.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('draft')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded transition-all cursor-pointer ${
                statusFilter === 'draft'
                  ? 'bg-white text-amber-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Drafts ({draftSheets.length})
            </button>
          </div>
        </div>

        {/* Day Order Filter */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Filter className="w-3.5 h-3.5" />
            <span>Day Order:</span>
          </div>
          <select
            value={dayOrderFilter}
            onChange={e => setDayOrderFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-semibold border border-[#cbc4cd] rounded bg-white text-slate-700 outline-none focus:ring-2 focus:ring-[#556B2F]/20 cursor-pointer"
          >
            <option value="all">All Day Orders</option>
            <option value="1">Day Order I</option>
            <option value="2">Day Order II</option>
            <option value="3">Day Order III</option>
            <option value="4">Day Order IV</option>
            <option value="5">Day Order V</option>
            <option value="6">Day Order VI</option>
          </select>
        </div>
      </div>

      {/* TAB 1: LOG SHEETS ARCHIVE VIEW */}
      {activeTab === 'log_sheets' && (
        <div className="space-y-4">
          {filteredSheets.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredSheets.map(sheet => {
                const stats = getSheetStats(sheet);
                const isFinalized = sheet.status === 'finalized';
                return (
                  <div
                    key={sheet.id}
                    className="bg-white border border-[#cbc4cd] hover:border-[#556B2F]/40 rounded-xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-4"
                  >
                    {/* Left: Date & Day Order Info */}
                    <div className="flex items-start gap-4">
                      <div className={`p-3 text-white rounded-xl text-center min-w-[70px] shadow-xs ${
                        isFinalized ? 'bg-[#556B2F]' : 'bg-amber-600'
                      }`}>
                        <span className="text-[10px] uppercase font-bold tracking-wider block opacity-80">
                          {new Date(sheet.logDate).toLocaleDateString('en-US', { month: 'short' })}
                        </span>
                        <span className="text-xl font-black font-serif leading-none block my-0.5">
                          {new Date(sheet.logDate).getDate()}
                        </span>
                        <span className="text-[9px] uppercase font-extrabold tracking-widest block opacity-90">
                          {new Date(sheet.logDate).toLocaleDateString('en-US', { weekday: 'short' })}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-serif font-black text-base text-[#161b27]">
                            {formatDateDisplay(sheet.logDate)}
                          </h3>
                          <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-md">
                            Day Order {romanDayOrders[sheet.dayOrder - 1] || sheet.dayOrder}
                          </span>
                          {isFinalized ? (
                            <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Lock className="w-3 h-3" />
                              Finalized
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-800 border border-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                              <Cloud className="w-3 h-3 text-amber-600" />
                              Draft (Auto-saved)
                            </span>
                          )}
                        </div>

                        {/* Absentees Badges & Summary */}
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          {stats.absentCount > 0 ? (
                            <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-800 px-2.5 py-1 rounded-md">
                              <UserX className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span className="font-bold">
                                {stats.absentCount} {stats.absentCount === 1 ? 'Absent Faculty' : 'Absentees'}:
                              </span>
                              <div className="flex items-center gap-1 font-mono font-bold text-red-900">
                                {stats.absentStaffIds.map(id => getStaffCode(id)).join(', ')}
                              </div>
                            </div>
                          ) : (
                            <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold text-[11px]">
                              Full Staff Attendance
                            </span>
                          )}

                          <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-800 px-2.5 py-1 rounded-md font-semibold">
                            <UserCheck className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>
                              <strong>{stats.totalAdjustments}</strong> {stats.totalAdjustments === 1 ? 'Substitution' : 'Substitutions / Swaps'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2 w-full md:w-auto justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100 flex-wrap">
                      {/* Pop out Details Button */}
                      <button
                        onClick={() => setPopoutSheet(sheet)}
                        className="px-3 py-1.5 bg-white border border-[#cbc4cd] hover:bg-slate-50 text-slate-700 text-xs font-bold rounded flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                        title="Pop out Detailed Breakdown"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#556B2F]" />
                        <span>Pop Out</span>
                      </button>

                      {isFinalized ? (
                        <>
                          {/* Open in Daily Sheet for Printing / Viewing */}
                          <button
                            onClick={() => onSelectLogSheet(sheet.logDate, sheet.dayOrder)}
                            className="px-3.5 py-1.5 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                            title="Open in Daily Log Sheet for viewing and printing"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Open & Print</span>
                          </button>

                          {/* Edit / Unlock Button with Awareness Modal */}
                          <button
                            onClick={() => setUnlockConfirmSheet(sheet)}
                            className="p-1.5 border border-amber-300 text-amber-700 hover:bg-amber-50 rounded transition-all cursor-pointer"
                            title="Re-open Log Sheet for Editing"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        </>
                      ) : (
                        /* Continue Editing Draft */
                        <button
                          onClick={() => onSelectLogSheet(sheet.logDate, sheet.dayOrder)}
                          className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                          title="Open Draft Log Sheet to continue editing and finalize"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit & Finalize</span>
                        </button>
                      )}

                      {/* Delete Button with Awareness Alert Modal */}
                      <button
                        onClick={() => setDeleteConfirmSheet(sheet)}
                        className="p-1.5 border border-red-200 text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer"
                        title="Delete this Log Sheet from History"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white border border-[#cbc4cd] rounded-xl p-12 text-center space-y-3 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-serif font-bold text-base text-slate-800">
                {statusFilter === 'draft'
                  ? 'No Draft Log Sheets'
                  : statusFilter === 'finalized'
                  ? 'No Finalized Log Sheets in History'
                  : 'No Log Sheets in History'}
              </h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                {statusFilter === 'draft'
                  ? 'Draft log sheets are automatically saved to Supabase every 30 seconds as you make changes.'
                  : 'When you mark staff absent, assign substitutions, and click "FINALIZE LOG" on the Daily Log Sheet, it will be automatically saved in Supabase and permanently logged here in History.'}
              </p>
              <div className="pt-2">
                <button
                  onClick={() => onSelectLogSheet('2024-05-20', 3)}
                  className="px-4 py-2 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
                >
                  Go to Daily Log Sheets
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL SUBSTITUTIONS REGISTRY VIEW */}
      {activeTab === 'all_subs' && (
        <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-xs overflow-hidden">
          {filteredSubs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-[#556B2F] text-white text-xs font-serif font-bold">
                    <th className="p-3 border border-[#cbc4cd] text-center">CLASS / SECTION</th>
                    <th className="p-3 border border-[#cbc4cd] text-center bg-[#B2D274] text-[#141f00] font-sans font-extrabold">
                      PERIOD
                    </th>
                    <th className="p-3 border border-[#cbc4cd] text-center bg-[#B2D274] text-[#141f00] font-sans font-extrabold">
                      ABSENT FACULTY
                    </th>
                    <th className="p-3 border border-[#cbc4cd] text-center bg-[#B2D274] text-[#141f00] font-sans font-extrabold">
                      SUBSTITUTE ASSIGNED
                    </th>
                    <th className="p-3 border border-[#cbc4cd] text-center">TYPE / REMARKS</th>
                    <th className="p-3 border border-[#cbc4cd] text-center w-20">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#cbc4cd] text-xs">
                  {filteredSubs.map(sub => (
                    <tr key={sub.id} className="hover:bg-slate-50 transition-colors h-14">
                      {/* Class label */}
                      <td className="p-3 border border-[#cbc4cd] font-sans font-bold text-[#556B2F] bg-[#FFF0F5]/30">
                        {getClassLabel(sub.classId)}
                      </td>

                      {/* Period num */}
                      <td className="p-3 border border-[#cbc4cd] text-center font-extrabold text-slate-800">
                        P{sub.period}
                      </td>

                      {/* Absent staff */}
                      <td className="p-3 border border-[#cbc4cd] text-center">
                        <div className="inline-flex items-center gap-1.5 bg-red-100/60 border border-red-200 px-2 py-1 rounded">
                          <span className="font-black text-red-800 font-mono">{getStaffCode(sub.absentStaffId)}</span>
                          <span className="text-[10px] text-slate-600 font-semibold truncate max-w-[130px]" title={getStaffName(sub.absentStaffId)}>
                            {getStaffName(sub.absentStaffId)}
                          </span>
                        </div>
                      </td>

                      {/* Substitute staff */}
                      <td className="p-3 border border-[#cbc4cd] text-center">
                        {sub.substituteStaffId ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-100/60 border border-emerald-200 px-2 py-1 rounded">
                            <span className="font-black text-emerald-800 font-mono">{getStaffCode(sub.substituteStaffId)}</span>
                            <span className="text-[10px] text-slate-600 font-semibold truncate max-w-[130px]" title={getStaffName(sub.substituteStaffId)}>
                              {getStaffName(sub.substituteStaffId)}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex px-2 py-1 bg-amber-100 text-amber-800 text-[10px] font-bold rounded border border-amber-200 uppercase">
                            Free period
                          </div>
                        )}
                      </td>

                      {/* Type & Remarks */}
                      <td className="p-3 border border-[#cbc4cd]">
                        <div className="flex flex-col gap-0.5">
                          {sub.isSwap && (
                            <span className="inline-flex self-start px-1.5 py-0.5 bg-blue-100 text-blue-800 font-bold text-[9px] rounded border border-blue-200">
                              Swapped with P{sub.swapWithPeriod}
                            </span>
                          )}
                          <span className="text-slate-600 italic font-medium">
                            {sub.remarks || 'Standard coverage'}
                          </span>
                        </div>
                      </td>

                      {/* Delete action */}
                      <td className="p-3 border border-[#cbc4cd] text-center">
                        <button
                          onClick={() => setDeleteSubConfirmId(sub.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-all cursor-pointer"
                          title="Delete Substitution Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-12 text-center text-slate-400 space-y-2">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-semibold italic text-slate-600">No active substitution records found.</p>
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: AWARENESS DELETE LOG SHEET MODAL */}
      {deleteConfirmSheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-red-300 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-red-100 text-red-600 rounded-full shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-black text-lg text-slate-900">
                  Delete Log Sheet History Record?
                </h3>
                <p className="text-xs text-red-700 font-bold">Awareness & Security Alert</p>
              </div>
            </div>

            <div className="bg-red-50/70 border border-red-200 p-3.5 rounded-xl text-xs text-slate-700 space-y-2">
              <p>
                You are about to permanently delete the finalized log sheet for:
              </p>
              <div className="font-bold text-slate-900 bg-white p-2.5 rounded-lg border border-red-200 space-y-1">
                <div>📅 Date: {formatDateDisplay(deleteConfirmSheet.logDate)}</div>
                <div>🔄 Day Order: {romanDayOrders[deleteConfirmSheet.dayOrder - 1]}</div>
                <div>
                  📋 Associated Substitutions:{' '}
                  {substitutions.filter(s => s.logSheetId === deleteConfirmSheet.id).length} records
                </div>
              </div>
              <p className="text-red-700 font-semibold text-[11px]">
                ⚠️ Warning: Deleting this log sheet will also remove all substitution assignments recorded on this date. This action cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmSheet(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDeleteLogSheet(deleteConfirmSheet.id);
                  setDeleteConfirmSheet(null);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Yes, Delete Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: AWARENESS EDIT / UNLOCK LOG SHEET MODAL */}
      {unlockConfirmSheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-amber-300 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-100 text-amber-700 rounded-full shrink-0">
                <Unlock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-serif font-black text-lg text-slate-900">
                  Re-Open Log Sheet for Editing?
                </h3>
                <p className="text-xs text-amber-700 font-bold">Edit Mode Activation</p>
              </div>
            </div>

            <div className="bg-amber-50/70 border border-amber-200 p-3.5 rounded-xl text-xs text-slate-700 space-y-2">
              <p>
                Unlocking this finalized log sheet for{' '}
                <strong>{formatDateDisplay(unlockConfirmSheet.logDate)} (Day Order {romanDayOrders[unlockConfirmSheet.dayOrder - 1]})</strong> will change its status back to <strong>Draft</strong>.
              </p>
              <p className="text-slate-600">
                You will be able to edit absent staff, adjust substitutes, and swap periods on the Daily Log Sheet grid. When finished, remember to click <strong className="text-[#556B2F]">"FINALIZE LOG"</strong> to re-lock it.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setUnlockConfirmSheet(null)}
                className="px-4 py-2 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onUnlockLogSheet(unlockConfirmSheet.id);
                  onSelectLogSheet(unlockConfirmSheet.logDate, unlockConfirmSheet.dayOrder);
                  setUnlockConfirmSheet(null);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm transition-all cursor-pointer"
              >
                Unlock & Edit in Daily Grid
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: POP OUT DETAILS MODAL (DATE ORDER POP OUT BREAKDOWN) */}
      {popoutSheet && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border border-[#cbc4cd] rounded-2xl shadow-2xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-serif font-black text-xl text-[#161b27]">
                    Log Sheet Breakdown
                  </h3>
                  <span className="bg-amber-100 text-amber-900 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-300">
                    Day Order {romanDayOrders[popoutSheet.dayOrder - 1]}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Date: {formatDateDisplay(popoutSheet.logDate)} ({popoutSheet.logDate})
                </p>
              </div>
              <button
                onClick={() => setPopoutSheet(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Stats overview */}
              {(() => {
                const stats = getSheetStats(popoutSheet);
                return (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-slate-50 border border-[#cbc4cd] rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Absentees</span>
                      <span className="text-lg font-black text-red-700">{stats.absentCount}</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-[#cbc4cd] rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Substitutes</span>
                      <span className="text-lg font-black text-emerald-700">{stats.subStaffCount}</span>
                    </div>
                    <div className="p-3 bg-slate-50 border border-[#cbc4cd] rounded-xl text-center">
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Adjustments</span>
                      <span className="text-lg font-black text-[#556B2F]">{stats.totalAdjustments}</span>
                    </div>
                  </div>
                );
              })()}

              {/* Adjustments Table */}
              <div>
                <h4 className="text-xs font-bold text-slate-700 mb-2 uppercase tracking-wider">
                  Substitution & Swap Records for this Date:
                </h4>
                {substitutions.filter(s => s.logSheetId === popoutSheet.id).length > 0 ? (
                  <div className="border border-[#cbc4cd] rounded-lg overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#556B2F] text-white">
                        <tr>
                          <th className="p-2.5 font-serif font-bold">Class</th>
                          <th className="p-2.5 text-center font-bold">Period</th>
                          <th className="p-2.5 font-bold">Absent Staff</th>
                          <th className="p-2.5 font-bold">Substitute</th>
                          <th className="p-2.5 font-bold">Remarks</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#cbc4cd]">
                        {substitutions
                          .filter(s => s.logSheetId === popoutSheet.id)
                          .map(sub => (
                            <tr key={sub.id} className="hover:bg-slate-50">
                              <td className="p-2.5 font-bold text-[#556B2F]">{getClassLabel(sub.classId)}</td>
                              <td className="p-2.5 text-center font-extrabold">P{sub.period}</td>
                              <td className="p-2.5">
                                <span className="font-bold text-red-700 font-mono">{getStaffCode(sub.absentStaffId)}</span>
                                <span className="text-[10px] text-slate-500 block">{getStaffName(sub.absentStaffId)}</span>
                              </td>
                              <td className="p-2.5">
                                {sub.substituteStaffId ? (
                                  <>
                                    <span className="font-bold text-emerald-800 font-mono">
                                      {getStaffCode(sub.substituteStaffId)}
                                    </span>
                                    <span className="text-[10px] text-slate-500 block">
                                      {getStaffName(sub.substituteStaffId)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-amber-800 font-semibold text-[10px]">Free period</span>
                                )}
                              </td>
                              <td className="p-2.5 italic text-slate-600">
                                {sub.remarks || 'Standard coverage'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-lg text-center text-slate-500 text-xs italic">
                    No substitutions were needed on this date (Full Attendance).
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-between items-center border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400 font-semibold">
                Status: Finalized & Locked
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPopoutSheet(null)}
                  className="px-3.5 py-1.5 border border-[#cbc4cd] text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    const date = popoutSheet.logDate;
                    const dayOrder = popoutSheet.dayOrder;
                    setPopoutSheet(null);
                    onSelectLogSheet(date, dayOrder);
                  }}
                  className="px-4 py-1.5 bg-[#556B2F] hover:opacity-90 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Grid</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: DELETE SINGLE SUBSTITUTION AWARENESS MODAL */}
      {deleteSubConfirmId && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white border-2 border-red-300 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 text-red-600 rounded-full shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-black text-base text-slate-900">
                  Delete Substitution Entry?
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">Remove adjustment from registry</p>
              </div>
            </div>
            <p className="text-xs text-slate-600">
              Are you sure you want to remove this substitution assignment record?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setDeleteSubConfirmId(null)}
                className="px-3.5 py-1.5 border border-[#cbc4cd] text-slate-700 font-bold text-xs rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onRemoveSubstitution(deleteSubConfirmId);
                  setDeleteSubConfirmId(null);
                }}
                className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
