/** A line of text of a document: the size defaults to 10 and an empty text is a blank line. */
export interface PdfLine { readonly text: string; readonly size?: number; readonly bold?: boolean }

const PAGE = { width: 595, height: 842, left: 50, top: 60, bottom: 50 };

/** A PDF string: Latin-1 (WinAnsi) bytes as characters, parentheses and backslashes escaped; what Latin-1 cannot hold becomes "?". */
const pdfText = (text: string): string => text.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\xFF]/g, '?');

/**
 * A minimal PDF 1.4 writer (plan D-09): Helvetica text paginated on A4, no library, no script, nothing loaded from outside,
 * so it fits `default-src 'self'`. Text only: it draws what it is given and knows nothing of reports.
 */
export function buildPdf(lines: readonly PdfLine[]): Uint8Array {
  const pages: string[] = [];
  let content = '';
  let y = PAGE.height - PAGE.top;
  const flush = () => { pages.push(content); content = ''; y = PAGE.height - PAGE.top; };
  lines.forEach((line) => {
    const size = line.size ?? 10;
    const step = size > 10 ? size + 8 : size + 6;
    if (y - step < PAGE.bottom) { flush(); }
    if (line.text) { content += `BT /${line.bold ? 'F2' : 'F1'} ${size} Tf ${PAGE.left} ${y} Td (${pdfText(line.text)}) Tj ET\n`; }
    y -= step;
  });
  flush();
  // Objects: 1 catalog, 2 pages, 3 and 4 fonts, then a page and its stream per page.
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((stream, i) => objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`));
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (char) => char.charCodeAt(0) & 0xff);
}
