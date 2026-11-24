import React from 'react';
import { BookOpen, Users, ClipboardList, RefreshCw, History, LogOut, PanelLeftClose, PanelLeftOpen, Database, Loader2, Shield, BarChart3, Calendar } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onResetData: () => void;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  userProfile?: { fullName: string; role: string } | null;
  loggedInUser?: string;
  onSeedDatabase?: () => void;
  isSeeding?: boolean;
  onNewLogSheet?: () => void;
}

export default function Sidebar({
  currentView,
  onViewChange,
  onResetData,
  onLogout,
  isCollapsed,
  onToggleCollapse,
  userProfile,
  loggedInUser = 'Rp@amjc',
  onSeedDatabase,
  isSeeding = false,
  onNewLogSheet
}: SidebarProps) {
  const rawRole = userProfile?.role || '';
  const rawName = userProfile?.fullName || loggedInUser;

  const isCreator =
    rawRole.toLowerCase().includes('creator') ||
    rawName.toLowerCase().includes('surya') ||
    rawName.toLowerCase().includes('suryaverse');

  const isHod =
    rawRole.toLowerCase().includes('head') ||
    rawRole.toLowerCase().includes('department') ||
    rawName.toLowerCase().includes('rajendraprasad') ||
    rawName.toLowerCase().includes('rp') ||
    rawName.toLowerCase().includes('hod') ||
    !isCreator;

  const displayRole = userProfile?.role
    ? userProfile.role
    : isCreator
    ? 'Creator'
    : 'Head of Department';

  const displayName = userProfile?.fullName
    ? userProfile.fullName
    : isCreator
    ? 'SuryaVerse'
    : 'RAJENDRAPRASAD P (Rp)';

  return (
    <aside
      className={`${
        isCollapsed ? 'w-16 px-2' : 'w-64 px-4'
      } fixed left-0 top-0 bottom-0 bg-[#F5F4F0] border-r border-[#cbc4cd] flex flex-col h-screen py-5 gap-4 z-40 select-none transition-all duration-300 overflow-x-hidden`}
    >
      {/* Institution Identity & Toggle Button */}
      <div className={`flex items-center ${isCollapsed ? 'flex-col gap-3' : 'justify-between'} mb-1`}>
        {!isCollapsed ? (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="px-2.5 py-1 bg-[#556B2F] rounded flex items-center justify-center text-white shadow-sm shrink-0">
              <span className="font-serif text-sm font-black tracking-wider">AMJC</span>
            </div>
            <div className="leading-tight overflow-hidden">
              <h2 className="font-serif font-bold text-[#161b27] text-[11px] leading-tight tracking-tight">Department of Accounting & Finance</h2>
              <p className="text-[10px] font-sans font-semibold text-[#556B2F] uppercase tracking-wider mt-0.5">Shift II</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto px-2 py-1 bg-[#556B2F] rounded flex items-center justify-center text-white shadow-sm shrink-0" title="AMJC - Department of Accounting & Finance">
            <span className="font-serif text-xs font-black tracking-wider">A</span>
          </div>
        )}

        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? "Open Sidebar" : "Close Sidebar"}
          className="p-1.5 rounded-md text-[#49454d] hover:bg-white hover:text-[#161b27] transition-colors cursor-pointer shrink-0"
        >
          {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Access Level Tag (When expanded) */}
      {!isCollapsed && (
        <div className={`p-3 rounded-lg border shadow-xs transition-all duration-200 ${
          isCreator 
            ? 'bg-gradient-to-br from-blue-50 via-indigo-50/70 to-blue-100/70 border-blue-300 shadow-blue-500/10' 
            : 'bg-gradient-to-br from-emerald-50/80 via-[#556B2F]/5 to-slate-100/90 border-[#556B2F]/30 shadow-[#556B2F]/5'
        }`}>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              isCreator ? 'bg-blue-600 shadow-xs shadow-blue-500' : 'bg-[#556B2F] shadow-xs shadow-[#556B2F]'
            } animate-pulse`}></div>
            <p className={`font-sans font-bold text-xs ${
              isCreator ? 'text-blue-950 font-black tracking-wide' : 'text-[#161b27] font-extrabold tracking-tight'
            }`}>
              {displayRole}
            </p>
          </div>
          <p className={`text-[11px] font-bold mt-1 truncate ${
            isCreator ? 'text-blue-700 tracking-wider font-mono' : 'text-[#556B2F] tracking-wide'
          }`}>
            {displayName}
          </p>
        </div>
      )}

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col gap-1">
        <button
          onClick={() => onViewChange('log_sheets')}
          title="Daily Log Sheets"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'log_sheets'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <ClipboardList className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Daily Log Sheets</span>}
        </button>

        <button
          onClick={() => onViewChange('faculty_workload')}
          title="Faculty Workload"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'faculty_workload'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <BarChart3 className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Faculty Workload</span>}
        </button>

        <button
          onClick={() => onViewChange('sub_mgmt')}
          title="Log Sheet History"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'sub_mgmt'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Log Sheet History</span>}
        </button>

        <button
          onClick={() => onViewChange('dashboard')}
          title="Timetable Master"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'dashboard'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Timetable Master</span>}
        </button>

        <button
          onClick={() => onViewChange('timetable_generator')}
          title="Timetable Generator"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'timetable_generator'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Timetable Generator</span>}
        </button>

        <button
          onClick={() => onViewChange('staff_dir')}
          title="Staff Directory"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'staff_dir'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Staff Directory</span>}
        </button>

        <button
          onClick={() => onViewChange('admin')}
          title="Admin Data Management"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'admin'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Shield className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Admin Data Panel</span>}
        </button>
      </nav>

      {/* Footer Controls & Reset */}
      <div className="pt-4 border-t border-[#cbc4cd] flex flex-col gap-2">
        <button
          onClick={onResetData}
          title="Full Factory Reset & Reseed Database (Erases All History)"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-1.5'} text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6]/40 rounded transition-all w-full text-left cursor-pointer`}
        >
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          {!isCollapsed && <span>RESET DATABASE</span>}
        </button>
        <button
          onClick={onLogout}
          title="LOCK PORTAL (LOGOUT)"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-3 py-1.5'} text-xs font-bold text-[#556B2F] hover:bg-[#556B2F]/10 rounded transition-all w-full text-left cursor-pointer`}
        >
          <LogOut className="w-3.5 h-3.5 shrink-0" />
          {!isCollapsed && <span>LOCK PORTAL</span>}
        </button>

        {/* Seed Database / Feed All Data Action */}
        {onSeedDatabase && (
          <div className="pt-1">
            <button
              id="sidebar-seed-database-btn"
              onClick={onSeedDatabase}
              disabled={isSeeding}
              title="Feed All Data & Seed Database (Automatically feeds current live data, 18 staff, 11 classes, 330 periods, and history into Supabase & memory)"
              className={`flex items-center ${
                isCollapsed ? 'justify-center px-0 py-2' : 'gap-2 px-2.5 py-1.5'
              } text-xs font-bold border-2 border-dashed border-emerald-600/70 bg-emerald-50/80 hover:bg-emerald-100 text-emerald-900 rounded-lg transition-all w-full text-left cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-2xs`}
            >
              {isSeeding ? (
                <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-emerald-700" />
              ) : (
                <Database className="w-3.5 h-3.5 shrink-0 text-emerald-700" />
              )}
              {!isCollapsed && (
                <span className="truncate">
                  {isSeeding ? 'FEEDING DATA...' : 'SEED DATABASE'}
                </span>
              )}
            </button>
            {!isCollapsed && (
              <p className="text-[9px] text-emerald-800/80 font-sans leading-tight mt-1 px-0.5">
                Feed all current & past data into Supabase & memory.
              </p>
            )}
          </div>
        )}

        {!isCollapsed && (
          <p className="text-[10px] text-[#49454d]/60 font-sans tracking-wide text-center uppercase mt-1 truncate">
            AMJC-AF-SLS-2026-SV1.6
          </p>
        )}
      </div>
    </aside>
  );
}
