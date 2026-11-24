import React from 'react';
import { Bell, Check, Loader2, Cloud, Lock } from 'lucide-react';

interface HeaderProps {
  viewTitle: string;
  status?: 'draft' | 'finalized' | null;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'idle';
  lastSavedTime?: Date | null;
  onManualSave?: () => void;
  userProfile?: { fullName: string; role: string } | null;
  userEmail?: string | null;
}

export default function Header({
  viewTitle,
  status,
  saveStatus,
  lastSavedTime,
  onManualSave,
  userProfile,
  userEmail
}: HeaderProps) {
  const rawRole = (userProfile?.role || '').toLowerCase();
  const rawName = (userProfile?.fullName || '').toLowerCase();
  const rawEmail = (userEmail || '').toLowerCase();

  const isSuryaVerse =
    rawRole.includes('creator') ||
    rawRole.includes('surya') ||
    rawName.includes('surya') ||
    rawName.includes('suryaverse') ||
    rawEmail.includes('surya') ||
    rawEmail.includes('suryaverse');
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#cbc4cd] h-14 px-6 flex justify-between items-center shadow-xs">
      {/* Title & Status */}
      <div className="flex items-center gap-3 select-none flex-wrap">
        <h1 className="font-serif font-bold text-xl text-[#161b27] tracking-tight">{viewTitle}</h1>
        {status && (
          <div
            className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 ${
              status === 'finalized'
                ? 'bg-[#cbeb8a] text-[#516b19] border border-[#516b19]/20'
                : 'bg-[#e1b2c5] text-[#664353] border border-[#664353]/20'
            }`}
          >
            {status === 'finalized' && <Lock className="w-3 h-3" />}
            <span>{status}</span>
          </div>
        )}

        {/* Auto-Save 'Saved' Badge */}
        {saveStatus && (
          <button
            type="button"
            onClick={onManualSave}
            title={
              saveStatus === 'saving'
                ? 'Saving changes to Supabase...'
                : lastSavedTime
                ? `Auto-saved to Supabase at ${lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}. Click to save now.`
                : 'All changes saved to Supabase. Click to save now.'
            }
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all cursor-pointer shadow-2xs select-none ${
              saveStatus === 'saving'
                ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                : saveStatus === 'unsaved'
                ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
            }`}
          >
            {saveStatus === 'saving' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />
            ) : saveStatus === 'unsaved' ? (
              <Cloud className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>
              {saveStatus === 'saving'
                ? 'Saving...'
                : saveStatus === 'unsaved'
                ? 'Unsaved (Auto-saving in 30s)'
                : 'Saved'}
            </span>
            {lastSavedTime && saveStatus === 'saved' && (
              <span className="text-[10px] font-medium text-emerald-700/80 hidden sm:inline border-l border-emerald-300/60 pl-1.5 ml-0.5">
                {lastSavedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Utilities */}
      <div className="flex items-center gap-4">
        <button className="p-1.5 text-[#556B2F] hover:bg-[#F5F5F0] rounded-full transition-colors cursor-pointer">
          <Bell className="w-5 h-5" />
        </button>
        <div
          title={isSuryaVerse ? 'SuryaVerse (Creator)' : 'Head of Department (HOD)'}
          className={`h-8 w-8 rounded-full flex items-center justify-center text-xs select-none shadow-xs transition-all ${
            isSuryaVerse
              ? 'bg-[#EEF2FF] text-[#3730A3] border border-[#6366F1]/30 ring-1 ring-[#6366F1]/20 font-black tracking-wider shadow-indigo-500/10'
              : 'bg-[#E6E6FA] text-[#556B2F] border border-[#556B2F]/15 font-bold'
          }`}
        >
          {isSuryaVerse ? 'SV' : 'HOD'}
        </div>
      </div>
    </header>
  );
}
