import React from 'react';
import { BookOpen, Calendar, Users, ClipboardList, RefreshCw, Layers } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onResetData: () => void;
}

export default function Sidebar({ currentView, onViewChange, onResetData }: SidebarProps) {
  return (
    <aside className="w-64 fixed left-0 top-0 bottom-0 bg-[#F5F4F0] border-r border-[#cbc4cd] flex flex-col h-screen py-5 px-4 gap-4 z-40 select-none">
      {/* Institution Identity */}
      <div className="flex flex-col gap-1 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#556B2F] rounded flex items-center justify-center text-white shadow-sm">
            <span className="font-serif text-xl font-bold tracking-tight">AM</span>
          </div>
          <div className="leading-tight">
            <h2 className="font-serif font-bold text-[#161b27] text-md tracking-tight">Dept. of Accounting</h2>
            <p className="text-[11px] font-sans font-semibold text-[#556B2F] uppercase tracking-wider">&amp; Finance - Shift II</p>
          </div>
        </div>
        
        {/* Access Level Tag */}
        <div className="mt-4 p-3 bg-white rounded border border-[#cbc4cd] shadow-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#556B2F] animate-pulse"></div>
            <p className="font-sans font-bold text-xs text-[#161b27]">Admin Access</p>
          </div>
          <p className="text-[11px] text-[#49454d] font-medium mt-0.5">Head of Department</p>
        </div>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 flex flex-col gap-1">
        <button
          onClick={() => onViewChange('log_sheets')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-all text-left ${
            currentView === 'log_sheets'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          <span>Daily Log Sheets</span>
        </button>

        <button
          onClick={() => onViewChange('sub_mgmt')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-all text-left ${
            currentView === 'sub_mgmt'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Substitution Log</span>
        </button>

        <button
          onClick={() => onViewChange('dashboard')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-all text-left ${
            currentView === 'dashboard'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Timetable Master</span>
        </button>

        <button
          onClick={() => onViewChange('staff_dir')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded text-sm font-semibold transition-all text-left ${
            currentView === 'staff_dir'
              ? 'bg-[#556B2F] text-white font-bold shadow-xs'
              : 'text-[#49454d] hover:bg-white hover:text-[#161b27]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Directory</span>
        </button>
      </nav>

      {/* Footer Controls & Reset */}
      <div className="pt-4 border-t border-[#cbc4cd] flex flex-col gap-2">
        <button
          onClick={onResetData}
          className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-[#ba1a1a] hover:bg-[#ffdad6]/40 rounded transition-all w-full text-left cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>RESET DATABASE</span>
        </button>
        <p className="text-[10px] text-[#49454d]/60 font-sans tracking-wide text-center uppercase">
          AMJC-AF-SLS-2026-V2.5
        </p>
      </div>
    </aside>
  );
}
