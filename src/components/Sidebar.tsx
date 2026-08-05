import React from 'react';
import { BookOpen, Users, ClipboardList, RefreshCw, Layers, LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onResetData: () => void;
  onLogout: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export default function Sidebar({
  currentView,
  onViewChange,
  onResetData,
  onLogout,
  isCollapsed,
  onToggleCollapse
}: SidebarProps) {
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
        <div className="p-3 bg-white rounded border border-[#cbc4cd] shadow-xs transition-opacity duration-200">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#556B2F] animate-pulse"></div>
            <p className="font-sans font-bold text-xs text-[#161b27]">Admin Access</p>
          </div>
          <p className="text-[11px] text-[#49454d] font-medium mt-0.5">Head of Department</p>
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
          onClick={() => onViewChange('sub_mgmt')}
          title="Substitution Log"
          className={`flex items-center ${isCollapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'} rounded text-sm font-semibold transition-all text-left ${
            currentView === 'sub_mgmt'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span className="truncate">Substitution Log</span>}
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
      </nav>

      {/* Footer Controls & Reset */}
      <div className="pt-4 border-t border-[#cbc4cd] flex flex-col gap-2">
        <button
          onClick={onResetData}
          title="RESET DATABASE"
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
        {!isCollapsed && (
          <p className="text-[10px] text-[#49454d]/60 font-sans tracking-wide text-center uppercase mt-1 truncate">
            AMJC-AF-SLS-2026-SV1.0
          </p>
        )}
      </div>
    </aside>
  );
}
