import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

/**
 * Sanitize a display name (e.g. "I B.COM - A" or "DR. A. JULIET") into a safe filename slug.
 */
export function buildTimetablePdfFilename(label: string, kind: 'Class' | 'Staff'): string {
  const clean = (label || 'Timetable')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const dateStamp = new Date().toISOString().split('T')[0];
  return `AMJC_${kind}_Timetable_${clean}_${dateStamp}.pdf`;
}

/**
 * Captures a rendered timetable container (letterhead + 6x5 grid + legend)
 * and downloads it directly to the user's PC as a crisp Landscape A4 PDF.
 */
export async function exportTimetableToPdf(element: HTMLElement, fileName: string): Promise<void> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
  await new Promise((resolve) => setTimeout(resolve, 120));

  const captureHeight = Math.max(element.scrollHeight, element.offsetHeight, 1000);
  element.setAttribute('data-active-timetable-export', 'true');

  try {
    const renderPromise = html2canvas(element, {
      scale: 2.5,
      useCORS: true,
      logging: false,
      imageTimeout: 10000,
      backgroundColor: '#ffffff',
      windowWidth: 1200,
      windowHeight: captureHeight + 400,
      scrollY: 0,
      scrollX: 0,
      onclone: (clonedDoc) => {
        const clonedTarget = clonedDoc.querySelector('[data-active-timetable-export="true"]') as HTMLElement | null;
        if (clonedTarget) {
          clonedTarget.style.height = 'auto';
          clonedTarget.style.minHeight = '0px';
          clonedTarget.style.maxHeight = 'none';
          clonedTarget.style.overflow = 'visible';
          clonedTarget.style.backgroundColor = '#ffffff';
          clonedTarget.style.padding = '20px';
          clonedTarget.style.width = '1040px';
          clonedTarget.style.maxWidth = '1040px';

          let parent = clonedTarget.parentElement;
          while (parent && parent !== clonedDoc.body) {
            parent.style.height = 'auto';
            parent.style.minHeight = '0px';
            parent.style.maxHeight = 'none';
            parent.style.overflow = 'visible';
            parent = parent.parentElement;
          }
        }

        if (clonedDoc.body) {
          clonedDoc.body.style.height = 'auto';
          clonedDoc.body.style.overflow = 'visible';
        }

        const style = clonedDoc.createElement('style');
        style.innerHTML = `
          [data-active-timetable-export="true"] .no-print {
            display: none !important;
          }
          [data-active-timetable-export="true"] .print-only-letterhead {
            display: block !important;
            text-align: center !important;
            border-bottom: 2px solid #3A0D0D !important;
            padding-bottom: 10px !important;
            margin-bottom: 16px !important;
          }
          [data-active-timetable-export="true"] .overflow-x-auto {
            overflow: visible !important;
          }
          [data-active-timetable-export="true"] .sticky {
            position: static !important;
          }
          [data-active-timetable-export="true"] table {
            width: 100% !important;
          }
        `;
        clonedDoc.head.appendChild(style);
      },
    });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PDF generation timed out. Please try again.')), 20000)
  );

  const canvas = await Promise.race([renderPromise, timeoutPromise]);

  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const margin = 8;
  const maxPrintWidth = pdfWidth - margin * 2;
  const maxPrintHeight = pdfHeight - margin * 2;

  let printWidth = maxPrintWidth;
  let totalScaledHeight = (canvas.height * printWidth) / canvas.width;
  const standardNumPages = Math.ceil(totalScaledHeight / maxPrintHeight);
  let effectivePages = standardNumPages;

  // Avoid creating a nearly empty trailing page for minor legend overflow
  if (standardNumPages > 1) {
    const lastPageFraction = (totalScaledHeight - (standardNumPages - 1) * maxPrintHeight) / maxPrintHeight;
    if (lastPageFraction < 0.25) {
      effectivePages = standardNumPages - 1;
      totalScaledHeight = effectivePages * maxPrintHeight;
      printWidth = (canvas.width * totalScaledHeight) / canvas.height;
    }
  }

  if (effectivePages <= 1) {
    const singleCanvas = document.createElement('canvas');
    singleCanvas.width = canvas.width;
    singleCanvas.height = canvas.height;
    const ctx = singleCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, singleCanvas.width, singleCanvas.height);
      ctx.drawImage(canvas, 0, 0);
    }
    const imgData = singleCanvas.toDataURL('image/jpeg', 0.95);
    const xOffset = Math.max(margin, (pdfWidth - printWidth) / 2);
    const yOffset = Math.max(margin, (pdfHeight - totalScaledHeight) / 2);
    pdf.addImage(imgData, 'JPEG', xOffset, yOffset, printWidth, totalScaledHeight);
  } else {
    const sourcePageHeightPx = Math.floor((maxPrintHeight * canvas.width) / printWidth);
    let renderedHeightPx = 0;
    let pageIndex = 0;

    while (renderedHeightPx < canvas.height && pageIndex < effectivePages) {
      const currentSliceHeightPx = Math.min(canvas.height - renderedHeightPx, sourcePageHeightPx);
      if (currentSliceHeightPx <= 0) break;

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = canvas.width;
      pageCanvas.height = currentSliceHeightPx;

      const ctx = pageCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(
          canvas,
          0,
          renderedHeightPx,
          canvas.width,
          currentSliceHeightPx,
          0,
          0,
          canvas.width,
          currentSliceHeightPx
        );
      }

      const pageImgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      const sliceHeightMm = (currentSliceHeightPx * printWidth) / canvas.width;

      if (pageIndex > 0) {
        pdf.addPage('a4', 'landscape');
      }

      const xOffset = Math.max(margin, (pdfWidth - printWidth) / 2);
      pdf.addImage(pageImgData, 'JPEG', xOffset, margin, printWidth, sliceHeightMm);

      renderedHeightPx += currentSliceHeightPx;
      pageIndex++;
    }
  }

    pdf.save(fileName);
  } finally {
    element.removeAttribute('data-active-timetable-export');
  }
}
