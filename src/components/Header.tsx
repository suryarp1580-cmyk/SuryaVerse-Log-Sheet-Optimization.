import React from 'react';
import { Bell } from 'lucide-react';

interface HeaderProps {
  viewTitle: string;
  status?: 'draft' | 'finalized' | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

export default function Header({ viewTitle, status }: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#cbc4cd] h-14 px-6 flex justify-between items-center shadow-xs">
      {/* Title & Status */}
      <div className="flex items-center gap-3 select-none">
        <h1 className="font-serif font-bold text-xl text-[#161b27] tracking-tight">{viewTitle}</h1>
        {status && (
          <div
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${
              status === 'finalized'
                ? 'bg-[#cbeb8a] text-[#516b19] border border-[#516b19]/20'
                : 'bg-[#e1b2c5] text-[#664353] border border-[#664353]/20'
            }`}
          >
            {status}
          </div>
        )}
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-4">
        <button className="p-1.5 text-[#556B2F] hover:bg-[#F5F5F0] rounded-full transition-colors cursor-pointer">
          <Bell className="w-5 h-5" />
        </button>
        <div className="h-8 w-8 rounded-full bg-[#E6E6FA] flex items-center justify-center text-[#556B2F] font-bold text-xs select-none shadow-xs border border-[#556B2F]/15">
          HOD
        </div>
      </div>
    </header>
  );
}
