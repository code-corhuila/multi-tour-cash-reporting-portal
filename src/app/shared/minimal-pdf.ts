/** What a document is made of: a title band, headings with a rule, rows of label and value, sub-headings, notes and blank space. */
export type PdfBlock =
  | { readonly kind: 'title'; readonly text: string; readonly subtitle?: string }
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'subheading'; readonly text: string }
  | { readonly kind: 'row'; readonly label: string; readonly value: string }
  | { readonly kind: 'note'; readonly text: string }
  /** Starts a new page unless `height` points fit on this one, so the blocks that follow stay together. Draws nothing. */
  | { readonly kind: 'keep'; readonly height: number }
  | { readonly kind: 'space'; readonly height?: number };

export interface PdfOptions {
  /** The left text of the footer of every page; the right one is "Página n de N". */
  readonly footer?: string;
}

const PAGE = { width: 595, height: 842, left: 50, right: 545, top: 60, bottom: 62 };
const BAND = 86;
/** Colours as the fractions of a PDF `rg`: the dark green of the mockup hero, its pale green, the text, the muted gray and the rule. */
const COLOR = { band: '0.098 0.239 0.227', pale: '0.741 0.89 0.843', ink: '0.09 0.145 0.168', muted: '0.4 0.459 0.475', rule: '0.8 0.851 0.824', white: '1 1 1' };

/** A PDF string: Latin-1 (WinAnsi) bytes as characters, parentheses and backslashes escaped; what Latin-1 cannot hold becomes "?". */
const pdfText = (text: string): string => text.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\xFF]/g, '?');

/** Helvetica and Helvetica-Bold widths (thousandths of the size) of the printable ASCII characters, from the standard font metrics. */
const REGULAR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584];
const BOLD = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333,
  556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584];

/** The width in points of a text in Helvetica (regular or bold): an accented letter counts as its base letter, the middle dot as a period. */
export function textWidth(text: string, size: number, bold: boolean): number {
  const table = bold ? BOLD : REGULAR;
  let thousandths = 0;
  for (const char of text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')) {
    const code = char.charCodeAt(0);
    thousandths += code >= 32 && code <= 126 ? table[code - 32] : code === 0xb7 ? 278 : 556;
  }
  return (thousandths * size) / 1000;
}

/**
 * A minimal PDF 1.4 writer (plan D-09): Helvetica on A4, no library, no script, nothing loaded from outside, so it fits `default-src 'self'`.
 * It lays out a report: a title band on the first page, headings with a rule, the values aligned on the right and a footer with the page number.
 * It draws what it is given and knows nothing of reports.
 */
export function buildPdf(blocks: readonly PdfBlock[], options: PdfOptions = {}): Uint8Array {
  const pages: string[] = [];
  let content = '';
  let y = PAGE.height - PAGE.top;
  const flush = () => { pages.push(content); content = ''; y = PAGE.height - PAGE.top; };
  const text = (value: string, x: number, at: number, size: number, bold: boolean, color: string) => {
    content += `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color} rg ${x} ${at} Td (${pdfText(value)}) Tj ET\n`;
  };
  const rule = (at: number, color: string, width: number) => { content += `${color} RG ${width} w ${PAGE.left} ${at} m ${PAGE.right} ${at} l S\n`; };
  /** Starts a new page when `height` does not fit above the footer. */
  const room = (height: number) => { if (y - height < PAGE.bottom) { flush(); } };

  blocks.forEach((block) => {
    if (block.kind === 'title') {
      content += `${COLOR.band} rg 0 ${PAGE.height - BAND} ${PAGE.width} ${BAND} re f\n`;
      text(block.text, PAGE.left, PAGE.height - 44, 18, true, COLOR.white);
      if (block.subtitle) { text(block.subtitle, PAGE.left, PAGE.height - 66, 10, false, COLOR.pale); }
      y = PAGE.height - BAND - 34;
    } else if (block.kind === 'heading') {
      room(44);
      y -= 8;
      text(block.text, PAGE.left, y, 12, true, COLOR.band);
      rule(y - 6, COLOR.rule, 0.8);
      y -= 24;
    } else if (block.kind === 'subheading') {
      room(34);
      y -= 4;
      text(block.text, PAGE.left, y, 10, true, COLOR.ink);
      y -= 20;
    } else if (block.kind === 'row') {
      room(22);
      text(block.label, PAGE.left, y, 10, false, COLOR.ink);
      text(block.value, Number((PAGE.right - textWidth(block.value, 10, true)).toFixed(2)), y, 10, true, COLOR.ink);
      rule(y - 6, COLOR.rule, 0.4);
      y -= 22;
    } else if (block.kind === 'note') {
      room(20);
      text(block.text, PAGE.left, y, 9, false, COLOR.muted);
      y -= 18;
    } else if (block.kind === 'keep') {
      room(block.height);
    } else {
      y -= block.height ?? 10;
    }
  });
  flush();

  const footer = options.footer ?? '';
  const total = pages.length;
  const withFooter = pages.map((page, i) => {
    const label = `Página ${i + 1} de ${total}`;
    let extra = `${COLOR.rule} RG 0.6 w ${PAGE.left} 44 m ${PAGE.right} 44 l S\n`;
    if (footer) { extra += `BT /F1 8 Tf ${COLOR.muted} rg ${PAGE.left} 30 Td (${pdfText(footer)}) Tj ET\n`; }
    extra += `BT /F1 8 Tf ${COLOR.muted} rg ${Number((PAGE.right - textWidth(label, 8, false)).toFixed(2))} 30 Td (${pdfText(label)}) Tj ET\n`;
    return page + extra;
  });
  // Objects: 1 catalog, 2 pages, 3 and 4 fonts, then a page and its stream per page.
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${withFooter.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${total} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  ];
  withFooter.forEach((stream, i) => objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE.width} ${PAGE.height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`));
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((at) => `${String(at).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Uint8Array.from(out, (char) => char.charCodeAt(0) & 0xff);
}
