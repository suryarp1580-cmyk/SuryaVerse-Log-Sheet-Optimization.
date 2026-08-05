import React from 'react';

export default function Letterhead() {
  const logoUrl = 'https://res.cloudinary.com/oomxhs6j/image/upload/v1785820183/b66af0ec-b48c-4ba3-b1a7-35452df00cdd.png';

  return (
    <div className="letterhead-container flex flex-col sm:flex-row items-center justify-between border-b-2 border-[#1C3A70] pb-4 mb-6 select-none text-center gap-4">
      {/* Left Logo / Badge Section */}
      <div className="flex flex-col items-center justify-center shrink-0 w-full sm:w-[220px] select-none">
        <img
          alt="AM Jain College Crest"
          src={logoUrl}
          className="h-16 md:h-20 object-contain mb-1 print:h-14"
          referrerPolicy="no-referrer"
        />
        <div className="bg-[#1C3A70] text-white text-[9px] font-extrabold px-3 py-0.5 rounded-full uppercase tracking-wider shadow-2xs my-1 print:text-[8px] print:py-0">
          Accredited A+ by NAAC
        </div>
        <div className="text-[8px] font-semibold text-slate-500 uppercase tracking-tight text-center leading-tight">
          <span>(A Unit of Sri. S. S. Jain Educational Society)</span>
          <div className="flex items-center justify-center gap-1 mt-0.5 text-slate-400">
            <span className="w-2.5 h-[1px] bg-slate-300 inline-block"></span>
            <span>Meenambakkam, Chennai</span>
            <span className="w-2.5 h-[1px] bg-slate-300 inline-block"></span>
          </div>
        </div>
      </div>

      {/* Main College Heading & Details */}
      <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
        <h1 className="font-sans text-2xl md:text-3xl font-extrabold tracking-tight text-[#203978] leading-tight print:text-xl print:text-[#203978]">
          Agurchand Manmull Jain College
        </h1>
        <p className="text-xs md:text-sm font-semibold text-slate-700 mt-0.5 print:text-[10px]">
          (A Unit of Sri. S. S. Jain Educational Society)
        </p>
        <p className="text-[11px] md:text-xs font-semibold text-slate-800 mt-1 flex flex-wrap justify-center items-center gap-x-1.5 leading-snug print:text-[9px]">
          <span>Affiliated to University of Madras</span>
          <span className="text-slate-400 font-normal">|</span>
          <span>A Jain Minority Institution</span>
          <span className="text-slate-400 font-normal">|</span>
          <span>NAAC Re-accredited with Grade A+</span>
        </p>
        <p className="text-[11px] md:text-xs font-medium text-slate-700 mt-0.5 print:text-[9px]">
          A Co-educational Institution, Meenambakkam, Chennai – 600 061.
        </p>
        
        {/* Department & Shift Badge / Header */}
        <div className="mt-2 pt-1.5 border-t border-slate-200 w-full max-w-lg flex items-center justify-center gap-2 text-xs font-bold text-[#203978] tracking-wide uppercase print:text-[10px] print:mt-1 print:pt-1">
          <span>Shift II</span>
          <span className="text-slate-300">•</span>
          <span>Department of Accounting &amp; Finance</span>
        </div>
      </div>

      {/* Right Balancing Spacer to keep center text perfectly centered */}
      <div className="hidden sm:block w-[220px] shrink-0 print:block print:w-[220px]" />
    </div>
  );
}

