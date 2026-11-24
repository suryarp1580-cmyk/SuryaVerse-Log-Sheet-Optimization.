// ============================================================================
// ACCFIN Timetable Generator — Shared UI Primitives (Part 4 design system)
// ----------------------------------------------------------------------------
// Centralizes the visual language so every page reads as one tool instead of
// ad hoc Tailwind per component. Colors are AMJ College's own brand maroon
// and gold (matching the Cultural Coordinator badge already in use), not a
// generic SaaS palette — see the Part 4 design brief in
// docs/STITCH_DESIGN_BRIEF.md for the full rationale.
// ============================================================================

import type { ReactNode } from 'react';

export const brand = {
  maroon: '#3A0D0D',
  maroonDark: '#280909',
  gold: '#D4AF37',
  slateTeal: '#2F5D5A',
  ink: '#201A17',
  paper: '#FAF7F1',
  paperDeep: '#F1EBDE',
  danger: '#8C1F1F',
  dangerWash: '#FBEAEA',
  success: '#3F6634',
  successWash: '#EEF3EA',
  warning: '#A9631A',
  warningWash: '#FBF1E6',
};

export function PageHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description?: string }) {
  return (
    <header className="mb-8">
      {eyebrow && (
        <p className="font-serif text-sm text-[#2F5D5A] mb-1">{eyebrow}</p>
      )}
      <h1 className="font-serif text-[28px] leading-tight text-[#201A17]">{title}</h1>
      {description && <p className="text-sm text-[#5B534B] mt-2 max-w-[62ch]">{description}</p>}
    </header>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`border border-[#E4DCC9] bg-white ${className}`}>{children}</div>
  );
}

export function StatusBanner({
  tone,
  children,
}: {
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  children: ReactNode;
}) {
  const styles: Record<typeof tone, string> = {
    success: 'bg-[#EEF3EA] border-[#3F6634] text-[#2C4A26]',
    warning: 'bg-[#FBF1E6] border-[#A9631A] text-[#7A480F]',
    danger: 'bg-[#FBEAEA] border-[#8C1F1F] text-[#6B1717]',
    neutral: 'bg-[#F1EBDE] border-[#B8A98A] text-[#5B4E36]',
  };
  return <div className={`border-l-4 px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex items-center rounded px-4 py-2 text-sm font-medium text-white bg-[#3A0D0D] hover:bg-[#280909] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = '', ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-flex items-center rounded border border-[#B8A98A] px-4 py-2 text-sm font-medium text-[#3A0D0D] hover:bg-[#F1EBDE] disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${className}`}
    />
  );
}

export function Badge({ tone, children }: { tone: 'gold' | 'neutral'; children: ReactNode }) {
  const styles = tone === 'gold' ? 'bg-[#F6EFD6] text-[#7A5F12] border-[#D4AF37]' : 'bg-[#F1EBDE] text-[#5B4E36] border-[#B8A98A]';
  return <span className={`inline-block rounded border px-2 py-0.5 text-xs ${styles}`}>{children}</span>;
}

export const inputClass =
  'w-full rounded border border-[#C9BEA4] bg-white px-3 py-2 text-sm text-[#201A17] focus:outline-none focus:ring-2 focus:ring-[#3A0D0D]/30 focus:border-[#3A0D0D]';

export const labelClass = 'block text-sm font-medium text-[#4A4038] mb-1';
