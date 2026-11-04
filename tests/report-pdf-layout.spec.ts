import { describe, expect, it } from 'vitest';
import { PdfBlock, buildPdf, textWidth } from '../src/app/shared/minimal-pdf';

// HU-CSH-003 AC-RM.7 (spec 003-, DP-RM3, PROPUESTO): the PDF of the report keeps the lines of the mockup but is drawn as a document: a title band, sections with
// a rule, the values aligned on the right and a footer with the page number. Plan D-09: no library, nothing loaded from outside, Helvetica only.
const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');
const BLOCKS: PdfBlock[] = [
  { kind: 'title', text: 'Reporte operativo y económico', subtitle: 'Multitour · Período 2026-09' },
  { kind: 'heading', text: 'Resumen' },
  { kind: 'row', label: 'Ventas confirmadas', value: '$4.150.000' },
  { kind: 'row', label: 'Cancelaciones', value: '2' },
  { kind: 'heading', text: 'Reporte mensual' },
  { kind: 'subheading', text: 'Período reportado: 2026-09' },
  { kind: 'note', text: 'Sin movimientos de caja.' },
];

describe('textWidthMeasuresHelvetica', () => {
  it('adds the widths of the Helvetica metrics at the size of the text', () => {
    // $ 556, 1 556, . 278, 2 556, 9 556, 0 556, . 278, 0 556, 0 556, 0 556 = 5004 thousandths of the size.
    expect(textWidth('$1.290.000', 10, false)).toBeCloseTo(50.04, 2);
    expect(textWidth('$1.290.000', 20, false)).toBeCloseTo(100.08, 2);
  });

  it('measures an accented letter as its base letter and the bold face wider than the regular one', () => {
    expect(textWidth('ó', 10, false)).toBeCloseTo(textWidth('o', 10, false), 5);
    expect(textWidth('Ventas', 10, true)).toBeGreaterThan(textWidth('Ventas', 10, false));
  });
});

describe('theDocumentIsDrawnAsAReport', () => {
  const pdf = text(buildPdf(BLOCKS));

  it('paints a dark title band on the first page with the title in white and the subtitle under it', () => {
    expect(pdf).toMatch(/0\.098 0\.239 0\.227 rg\s+0 756 595 86 re f/);
    expect(pdf).toContain('(Reporte operativo y econ\xF3mico) Tj');
    expect(pdf).toContain('(Multitour \xB7 Per\xEDodo 2026-09) Tj');
    expect(pdf).toMatch(/1 1 1 rg\s+50 \d+ Td \(Reporte operativo/);
  });

  it('draws each heading in bold with a rule under it', () => {
    expect(pdf).toMatch(/\/F2 12 Tf[^\n]*\n?[^\n]*\(Resumen\) Tj/);
    expect(pdf.match(/ m 545 \d+(\.\d+)? l S/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('writes the label on the left and the value right-aligned at the right margin, in bold', () => {
    const label = /50 (\d+) Td \(Ventas confirmadas\) Tj/.exec(pdf);
    expect(label).not.toBeNull();
    const value = /\/F2 10 Tf[^\n]*?([\d.]+) (\d+) Td \(\$4\.150\.000\) Tj/.exec(pdf);
    expect(value).not.toBeNull();
    expect(Number(value![1])).toBeCloseTo(545 - textWidth('$4.150.000', 10, true), 1);
    expect(value![2]).toBe(label![1]);
    const short = /([\d.]+) \d+ Td \(2\) Tj/.exec(pdf);
    expect(Number(short![1])).toBeCloseTo(545 - textWidth('2', 10, true), 1);
  });

  it('draws a footer with the name of the report and "Página n de N" on every page', () => {
    const many = text(buildPdf([{ kind: 'title', text: 'T' }, ...Array.from({ length: 60 }, (_, i): PdfBlock => ({ kind: 'row', label: `Fila ${i}`, value: String(i) }))], { footer: 'Multitour · Reporte operativo y económico' }));
    const pages = (many.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    for (let n = 1; n <= pages; n += 1) { expect(many).toContain(`(P\xE1gina ${n} de ${pages}) Tj`); }
    expect((many.match(/\(Multitour \xB7 Reporte operativo y econ\xF3mico\) Tj/g) ?? []).length).toBe(pages);
  });

  it('keeps a group together: when its rows do not fit under the page, all of it moves to the next page and none is left alone', () => {
    const filler = Array.from({ length: 28 }, (_, i): PdfBlock => ({ kind: 'row', label: `Relleno ${i}`, value: String(i) }));
    const group: PdfBlock[] = [{ kind: 'keep', height: 4 * 22 + 24 }, { kind: 'subheading', text: 'Grupo unido' },
      ...Array.from({ length: 4 }, (_, i): PdfBlock => ({ kind: 'row', label: `Línea ${i}`, value: 'x' }))];
    const streams = [...text(buildPdf([{ kind: 'title', text: 'T' }, ...filler, ...group])).matchAll(/stream\n([\s\S]*?)endstream/g)].map((m) => m[1]);
    expect(streams.length).toBe(2);
    const holder = streams.filter((page) => page.includes('(Grupo unido) Tj'));
    expect(holder).toHaveLength(1);
    for (let i = 0; i < 4; i += 1) { expect(holder[0]).toContain(`(L\xEDnea ${i}) Tj`); }
  });

  it('puts the band only on the first page', () => {
    const many = text(buildPdf([{ kind: 'title', text: 'T' }, ...Array.from({ length: 60 }, (_, i): PdfBlock => ({ kind: 'row', label: `Fila ${i}`, value: String(i) }))]));
    expect((many.match(/0 756 595 86 re f/g) ?? []).length).toBe(1);
  });

  it('stays a valid PDF 1.4 whose cross-reference table points at its objects, with the escaped text', () => {
    const odd = text(buildPdf([{ kind: 'title', text: 'a(b)\\c' }, { kind: 'row', label: 'x', value: 'y' }]));
    expect(odd).toContain('a\\(b\\)\\\\c');
    expect(odd.startsWith('%PDF-1.4')).toBe(true);
    const start = Number(/startxref\s+(\d+)/.exec(odd)![1]);
    expect(odd.slice(start, start + 4)).toBe('xref');
    [...odd.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1])).forEach((offset, i) => expect(odd.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
  });
});
