import React, { useState, useMemo } from 'react';
import { Staff, TimetableEntry } from '../types';
import { 
  Users, 
  Search, 
  ToggleLeft, 
  ToggleRight, 
  Filter, 
  ArrowUpDown, 
  UserCheck, 
  UserX, 
  CalendarDays, 
  Flame,
  Activity,
  GraduationCap,
  UserPlus,
  Edit2,
  Trash2,
  X,
  Check,
  Sparkles
} from 'lucide-react';
import { generateUUID } from '../lib/uuid';

interface StaffDirectoryProps {
  staffList: Staff[];
  timetableEntries: TimetableEntry[];
  onToggleStatus: (staffId: string) => void;
  onToggleLeave: (staffId: string) => void;
  onAddStaff?: (newStaff: Staff, isHOD?: boolean) => void;
  onEditStaff?: (updatedStaff: Staff, isHOD?: boolean) => void;
  onDeleteStaff?: (staffId: string, staffCode?: string) => void;
}

const getDepartmentName = (code: string): string => {
  const mapping: Record<string, string> = {
    'AJ': 'Dept. Economics',
    'BBS': 'Dept. Accounting and Finance',
    'BS': 'Dept. Accounting and Finance.',
    'DA': 'Dept. Accounting and Finance',
    'DJ': 'Dept. Accounting and Finance',
    'FND': 'Dept. Accounting and Finance',
    'GS': 'Dept. Accounting and Finance.',
    'JP': 'Dept. Accounting and Finance',
    'KB': 'Dept. Accounting and Finance',
    'KM': 'Dept. Accounting and Finance',
    'KS': 'Dept. Accounting and Finance',
    'MJ': 'Dept. Accounting and Finance',
    'OJ': 'Dept. Accounting and Finance',
    'PM': 'Dept. Accounting and Finance',
    'PS': 'Dept. Accounting and Finance.',
    'PSK': 'Dept. Accounting and Finance',
    'RP': 'Dept. Accounting and Finance',
    'RT': 'Dept. Accounting and Finance',
    'SN': 'Dept. Accounting and Finance',
    'SS': 'Dept. Accounting and Finance',
    'TP': 'Dept. Accounting and Finance'
  };
  return mapping[code] || 'Dept. Accounting and Finance';
};

type FilterType = 'all' | 'active' | 'on_leave' | 'inactive';
type SortType = 'name' | 'code' | 'workload';

export default function StaffDirectory({
  staffList,
  timetableEntries,
  onToggleStatus,
  onToggleLeave,
  onAddStaff,
  onEditStaff,
  onDeleteStaff,
}: StaffDirectoryProps) {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [sortBy, setSortBy] = useState<SortType>('name');

  // Add / Edit Faculty Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [modalCode, setModalCode] = useState('');
  const [modalFullName, setModalFullName] = useState('');
  const [modalIsHOD, setModalIsHOD] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const openAddModal = () => {
    setEditingStaffId(null);
    setModalCode('');
    setModalFullName('');
    setModalIsHOD(false);
    setModalError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (staff: Staff) => {
    setEditingStaffId(staff.id);
    setModalCode(staff.code);
    setModalFullName(staff.fullName || '');
    setModalIsHOD(staff.code.toUpperCase() === 'RP');
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    const code = modalCode.trim().toUpperCase();
    const fullName = modalFullName.trim();

    if (!code) {
      setModalError('Faculty short code is required (e.g. MJ, DA, RT).');
      return;
    }

    if (editingStaffId) {
      // Editing existing faculty member
      const existing = staffList.find((s) => s.id === editingStaffId);
      if (!existing) return;
      const updated: Staff = {
        ...existing,
        code,
        fullName: fullName || `Prof. ${code}`,
      };
      if (onEditStaff) {
        onEditStaff(updated, modalIsHOD);
      }
    } else {
      // Check for code clash
      if (staffList.some((s) => s.code.toUpperCase() === code)) {
        setModalError(`Faculty code "${code}" already exists in directory.`);
        return;
      }
      const newStaff: Staff = {
        id: generateUUID(),
        code,
        fullName: fullName || `Prof. ${code}`,
        isActive: true,
        onLeave: false,
      };
      if (onAddStaff) {
        onAddStaff(newStaff, modalIsHOD);
      }
    }

    setIsModalOpen(false);
  };

  const handleDelete = (staff: Staff) => {
    const confirmMsg = `Remove ${staff.code} (${staff.fullName || 'Faculty'}) from Staff Directory and Timetable Generator?`;
    if (!window.confirm(confirmMsg)) return;
    if (onDeleteStaff) {
      onDeleteStaff(staff.id, staff.code);
    }
  };

  // Calculate workload counts for memoization
  const workloadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    staffList.forEach((s) => {
      counts[s.id] = timetableEntries.filter((e) => e.staffIds.includes(s.id)).length;
    });
    return counts;
  }, [staffList, timetableEntries]);

  // Overall directory statistics
  const stats = useMemo(() => {
    const total = staffList.length;
    const active = staffList.filter((s) => s.isActive).length;
    const onLeave = staffList.filter((s) => s.isActive && s.onLeave).length;
    const inactive = staffList.filter((s) => !s.isActive).length;

    let totalWorkload = 0;
    let activeWithWorkloadCount = 0;
    staffList.forEach((s) => {
      if (s.isActive) {
        totalWorkload += workloadCounts[s.id] || 0;
        activeWithWorkloadCount++;
      }
    });

    const avgWorkload = activeWithWorkloadCount > 0 ? (totalWorkload / activeWithWorkloadCount).toFixed(1) : '0.0';

    return { total, active, onLeave, inactive, avgWorkload };
  }, [staffList, workloadCounts]);

  // Filter & Sort Staff
  const processedStaffList = useMemo(() => {
    return staffList
      .filter((s) => {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          s.code.toLowerCase().includes(term) ||
          (s.fullName || '').toLowerCase().includes(term) ||
          getDepartmentName(s.code).toLowerCase().includes(term);

        if (!matchesSearch) return false;

        if (activeFilter === 'active') return s.isActive && !s.onLeave;
        if (activeFilter === 'on_leave') return s.isActive && s.onLeave;
        if (activeFilter === 'inactive') return !s.isActive;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') {
          const nameA = a.fullName || `Prof. ${a.code}`;
          const nameB = b.fullName || `Prof. ${b.code}`;
          return nameA.localeCompare(nameB);
        }
        if (sortBy === 'code') {
          return a.code.localeCompare(b.code);
        }
        if (sortBy === 'workload') {
          const loadA = workloadCounts[a.id] || 0;
          const loadB = workloadCounts[b.id] || 0;
          return loadB - loadA;
        }
        return 0;
      });
  }, [staffList, searchTerm, activeFilter, sortBy, workloadCounts]);

  return (
    <div className="p-6 space-y-6 select-none font-sans max-w-6xl mx-auto">
      {/* 1. Bento Dashboard / Statistics Header */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-[#cbc4cd] p-4 rounded-xl shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5 text-slate-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Faculty</p>
            <p className="text-xl font-serif font-black text-slate-800">{stats.total}</p>
          </div>
        </div>

        <div className="bg-white border border-[#cbc4cd] p-4 rounded-xl shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
            <UserCheck className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-emerald-600/80 uppercase tracking-wider">Active Roster</p>
            <p className="text-xl font-serif font-black text-emerald-800">{stats.active}</p>
          </div>
        </div>

        <div className="bg-white border border-[#cbc4cd] p-4 rounded-xl shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <CalendarDays className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">On Leave Today</p>
            <p className="text-xl font-serif font-black text-amber-800">{stats.onLeave}</p>
          </div>
        </div>

        <div className="bg-white border border-[#cbc4cd] p-4 rounded-xl shadow-xs flex items-center gap-4 transition-all hover:shadow-sm">
          <div className="w-10 h-10 rounded-lg bg-rose-50 flex items-center justify-center shrink-0">
            <UserX className="w-5 h-5 text-rose-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">Inactive</p>
            <p className="text-xl font-serif font-black text-rose-800">{stats.inactive}</p>
          </div>
        </div>

        <div className="bg-white border border-[#cbc4cd] p-4 rounded-xl shadow-xs flex items-center gap-4 transition-all hover:shadow-sm col-span-2 lg:col-span-1">
          <div className="w-10 h-10 rounded-lg bg-[#556B2F]/10 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-[#556B2F]" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-[#556B2F] uppercase tracking-wider">Avg. Load</p>
            <p className="text-xl font-serif font-black text-slate-800">
              {stats.avgWorkload} <span className="text-xs text-slate-500 font-sans font-normal">hrs</span>
            </p>
          </div>
        </div>
      </div>

      {/* 2. Directory Controls Panel */}
      <div className="bg-white border border-[#cbc4cd] p-5 rounded-xl shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-[#556B2F]" />
              <h3 className="font-serif font-extrabold text-lg text-[#161b27]">Faculty Directory & Rosters</h3>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Manage department roster membership, live leave statuses, and faculty details. Changes sync instantly across the entire portal.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:max-w-2xl">
            {/* Search Input */}
            <div className="relative flex-1 w-full">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search code, name, dept..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-[#cbc4cd] rounded-lg bg-slate-50/50 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 text-[#161b27] placeholder:text-slate-400"
              />
            </div>

            {/* Sort Dropdown */}
            <div className="relative min-w-[130px] w-full sm:w-auto">
              <ArrowUpDown className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="w-full pl-8 pr-4 py-2 border border-[#cbc4cd] rounded-lg bg-slate-50/50 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#556B2F]/20 appearance-none cursor-pointer"
              >
                <option value="name">Sort by Name</option>
                <option value="code">Sort by Code</option>
                <option value="workload">Sort by Workload</option>
              </select>
            </div>

            {/* Add Faculty Button */}
            <button
              type="button"
              onClick={openAddModal}
              className="w-full sm:w-auto px-4 py-2 bg-[#3A0D0D] text-[#D4AF37] hover:bg-[#4E1414] font-semibold text-xs rounded-lg shadow-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add Faculty</span>
            </button>
          </div>
        </div>

        {/* 3. Filter Tabs Row */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" /> Filter list:
          </span>

          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              activeFilter === 'all'
                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All ({stats.total})
          </button>

          <button
            onClick={() => setActiveFilter('active')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              activeFilter === 'active'
                ? 'bg-[#556B2F] border-[#556B2F] text-white shadow-xs'
                : 'bg-white border-slate-200 text-[#556B2F] hover:bg-emerald-50/50'
            }`}
          >
            Present ({stats.active - stats.onLeave})
          </button>

          <button
            onClick={() => setActiveFilter('on_leave')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              activeFilter === 'on_leave'
                ? 'bg-amber-500 border-amber-500 text-white shadow-xs'
                : 'bg-white border-slate-200 text-amber-700 hover:bg-amber-50/50'
            }`}
          >
            On Leave ({stats.onLeave})
          </button>

          <button
            onClick={() => setActiveFilter('inactive')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer border ${
              activeFilter === 'inactive'
                ? 'bg-rose-600 border-rose-600 text-white shadow-xs'
                : 'bg-white border-slate-200 text-rose-700 hover:bg-rose-50/50'
            }`}
          >
            Inactive ({stats.inactive})
          </button>
        </div>
      </div>

      {/* 4. Faculty Grid Cards */}
      {processedStaffList.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {processedStaffList.map((s) => {
            const workload = workloadCounts[s.id] || 0;
            const dept = getDepartmentName(s.code);
            const isStaffOnLeave = s.onLeave;

            let progressColor = 'bg-emerald-500';
            let loadStatusText = 'Optimal load';
            if (workload >= 5) {
              progressColor = 'bg-red-500';
              loadStatusText = 'Maxed workload';
            } else if (workload >= 4) {
              progressColor = 'bg-amber-500';
              loadStatusText = 'High load';
            } else if (workload === 0) {
              progressColor = 'bg-slate-300';
              loadStatusText = 'No periods today';
            }

            return (
              <div
                key={s.id}
                className={`bg-white border rounded-xl p-4 shadow-xs hover:shadow-md transition-all flex flex-col sm:flex-row justify-between gap-4 ${
                  !s.isActive ? 'opacity-70 border-slate-200 bg-slate-50/40' : 'border-[#cbc4cd]'
                }`}
              >
                {/* Left info */}
                <div className="flex-1 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-lg bg-[#556B2F]/10 text-[#556B2F] font-serif font-black text-sm flex items-center justify-center shrink-0 border border-[#556B2F]/20">
                      {s.code}
                    </div>

                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-sans font-extrabold text-sm text-[#161b27]">
                          {s.fullName || `Prof. ${s.code}`}
                        </h4>

                        {isStaffOnLeave && s.isActive && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wider">
                            On Leave
                          </span>
                        )}
                        {!s.isActive && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
                            Inactive
                          </span>
                        )}
                      </div>

                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide">{dept}</p>
                    </div>
                  </div>

                  {/* Workload sparkline */}
                  {s.isActive ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-medium text-slate-500">
                        <span className="flex items-center gap-1">
                          <Flame
                            className={`w-3.5 h-3.5 ${
                              workload >= 5 ? 'text-red-500 animate-bounce' : 'text-slate-400'
                            }`}
                          />
                          Weekly workload
                        </span>
                        <span className="font-bold text-[#161b27]">{workload} / 5 periods</span>
                      </div>

                      <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${progressColor}`}
                          style={{ width: `${Math.min((workload / 5) * 100, 100)}%` }}
                        />
                      </div>

                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                        {loadStatusText}
                      </p>
                    </div>
                  ) : (
                    <div className="py-1">
                      <p className="text-[10px] text-slate-400 italic">
                        Excluded from current periods & schedule assignments.
                      </p>
                    </div>
                  )}

                  {/* Edit / Delete action buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => openEditModal(s)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-[#3A0D0D] transition-colors"
                      title="Edit faculty code or name"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>
                    <span className="text-slate-200">|</span>
                    <button
                      type="button"
                      onClick={() => handleDelete(s)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 hover:text-rose-800 transition-colors"
                      title="Remove from directory"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                </div>

                {/* Right Panel: Functional Action Switches */}
                <div className="flex flex-col items-end justify-between min-w-[130px] pl-4 border-l border-slate-100">
                  {/* Active Roster controller */}
                  <div className="flex flex-col items-end gap-1 w-full">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      Roster Status
                    </span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          s.isActive ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {s.isActive ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        onClick={() => onToggleStatus(s.id)}
                        className="text-slate-400 hover:text-[#556B2F] transition-all cursor-pointer focus:outline-none"
                        title={s.isActive ? 'Deactivate from Department' : 'Activate on Roster'}
                      >
                        {s.isActive ? (
                          <ToggleRight className="w-8 h-8 text-[#556B2F]" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Daily Leave controller */}
                  <div className="flex flex-col items-end gap-1 w-full border-t border-slate-50 pt-3 mt-2">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Attendance</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase ${
                          !s.isActive ? 'text-slate-300' : isStaffOnLeave ? 'text-amber-600' : 'text-slate-500'
                        }`}
                      >
                        {!s.isActive ? '—' : isStaffOnLeave ? 'On Leave' : 'Present'}
                      </span>
                      <button
                        onClick={() => s.isActive && onToggleLeave(s.id)}
                        disabled={!s.isActive}
                        className={`transition-all focus:outline-none ${
                          s.isActive
                            ? 'text-slate-400 hover:text-amber-500 cursor-pointer'
                            : 'text-slate-200 cursor-not-allowed'
                        }`}
                        title={isStaffOnLeave ? 'Set as Present' : 'Mark On Leave'}
                      >
                        {isStaffOnLeave && s.isActive ? (
                          <ToggleRight className="w-8 h-8 text-amber-500" />
                        ) : (
                          <ToggleLeft className="w-8 h-8 text-slate-300" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-[#cbc4cd] p-12 text-center rounded-xl shadow-xs">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="font-serif font-bold text-slate-700">No faculty members found</p>
          <p className="text-xs text-slate-400 mt-1">
            Try refining your search terms or checking a different filter category.
          </p>
        </div>
      )}

      {/* 5. Add / Edit Faculty Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#cbc4cd] rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-[#3A0D0D]">
                <GraduationCap className="w-5 h-5 text-[#D4AF37]" />
                <h3 className="font-serif font-bold text-base text-[#161b27]">
                  {editingStaffId ? 'Edit Faculty Member' : 'Add New Faculty Member'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-4 text-xs text-[#4A4038]">
              <div>
                <label className="block font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1">
                  Faculty Short Code * (e.g. MJ, DA, RT)
                </label>
                <input
                  type="text"
                  placeholder="e.g. MJ"
                  value={modalCode}
                  onChange={(e) => setModalCode(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-[#cbc4cd] rounded-lg bg-slate-50 text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-[#3A0D0D]/20 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-bold uppercase tracking-wider text-[10px] text-slate-500 mb-1">
                  Full Name & Designation *
                </label>
                <input
                  type="text"
                  placeholder="e.g. DR. M. JAGADEESWARI"
                  value={modalFullName}
                  onChange={(e) => setModalFullName(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-[#cbc4cd] rounded-lg bg-slate-50 text-xs font-medium focus:ring-2 focus:ring-[#3A0D0D]/20 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={modalIsHOD}
                    onChange={(e) => setModalIsHOD(e.target.checked)}
                    className="rounded border-[#C9BEA4] text-[#3A0D0D] focus:ring-[#3A0D0D]/30"
                  />
                  <span className="font-semibold text-slate-700">Head of Department (HOD)</span>
                </label>
              </div>

              {modalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-xs">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-[#cbc4cd] text-slate-600 rounded text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#3A0D0D] text-[#D4AF37] hover:bg-[#4E1414] rounded text-xs font-semibold cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{editingStaffId ? 'Update Faculty' : 'Save to Directory'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
