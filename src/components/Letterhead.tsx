import React from 'react';

export default function Letterhead() {
  const logoUrl = 'https://lh3.googleusercontent.com/aida-public/AB6AXuAW6ioFw9ZhFTRXjX4Z-Zp_FWwIOM6yQQaC2epvJIxLvURUc80nLs8WugqWxCd5-qqaELlSxWr6US3wuoiVt_iFnfkw4Ot_p98I30trjkWKOPWt_T7Ux6SYD--QWQyNAlOhFFdzyI7CdfFRGCH9fHaiW0WFu1Z3RvBeAmAeG1TTciObo_VPfJuMzCCXutBTLh0Yr873M_T5UJ9bkQ-OM_7d35AFXQJnLidjGOTnxxM-zo4xUYcfsZy0X84xU5enA1UeEFqmscw08W8';

  return (
    <div className="flex flex-col items-center border-b-2 border-[#556B2F] pb-6 mb-8 select-none text-center">
      {/* College Coat of Arms / Logo */}
      <img
        alt="AM Jain College Shield"
        src={logoUrl}
        className="h-20 object-contain mb-3 print:h-16"
        referrerPolicy="no-referrer"
      />
      
      {/* Institutional Details */}
      <div className="max-w-2xl">
        <h2 className="font-serif text-2xl font-bold tracking-wide text-[#161b27] uppercase print:text-xl">
          Agurchand Manmull Jain College – Shift II
        </h2>
        <h3 className="font-serif text-lg font-bold text-[#556B2F] mt-1 print:text-base">
          Department of Accounting &amp; Finance
        </h3>
        <p className="font-sans text-[11px] font-bold text-[#49454d] mt-2 tracking-widest uppercase">
          Meenambakkam, Chennai - 600 114 | Institutional Record: Daily SLS
        </p>
      </div>
    </div>
  );
}
