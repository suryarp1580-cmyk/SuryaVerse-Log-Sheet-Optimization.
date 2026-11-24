import Link from 'next/link';
import { Lora, IBM_Plex_Sans } from 'next/font/google';

// ============================================================================
// ACCFIN Timetable Generator — Section Layout
// ----------------------------------------------------------------------------
// A small letterhead-style masthead echoing the department's printed
// timetable sheet, plus the persistent nav between the three pages built
// across Parts 1-3. Fonts are scoped to this route segment; if you'd rather
// load them once for the whole ACCFIN app, move the font setup to your root
// layout instead and drop the className hookup here.
// ============================================================================

const serif = Lora({ subsets: ['latin'], variable: '--font-serif', weight: ['500', '600'] });
const sans = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-sans', weight: ['400', '500', '600'] });

export default function TimetableLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${serif.variable} ${sans.variable} font-sans bg-[#FAF7F1] min-h-screen`}>
      {/* Letterhead masthead */}
      <div className="bg-[#3A0D0D] border-b-4 border-[#D4AF37]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <p className="font-serif text-[#D4AF37] text-xs tracking-wide">Department of Accounting &amp; Finance</p>
          <h1 className="font-serif text-white text-xl mt-0.5">Timetable Generator</h1>
        </div>
      </div>

      {/* Section nav */}
      <nav className="border-b border-[#E4DCC9] bg-white">
        <div className="max-w-5xl mx-auto px-6 flex gap-6 text-sm">
          <Link href="/timetable/workload" className="py-3 text-[#4A4038] hover:text-[#3A0D0D] font-medium border-b-2 border-transparent hover:border-[#D4AF37] transition-colors">
            1. Workload Entry
          </Link>
          <Link href="/timetable/generate" className="py-3 text-[#4A4038] hover:text-[#3A0D0D] font-medium border-b-2 border-transparent hover:border-[#D4AF37] transition-colors">
            2. Generate
          </Link>
          <Link href="/timetable/view" className="py-3 text-[#4A4038] hover:text-[#3A0D0D] font-medium border-b-2 border-transparent hover:border-[#D4AF37] transition-colors">
            3. View Timetable
          </Link>
        </div>
      </nav>

      {children}
    </div>
  );
}
