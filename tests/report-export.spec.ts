import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthlyPeriod, MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { DailyDashboard, DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { PeriodSummary, PeriodSummarySource } from '../src/app/reports/data/period-summary-source';
import { BrowserReportExporter, ReportExporter } from '../src/app/reports/data/report-exporter';
import { ReportData, ReportFile, buildReportCsv, buildReportFile, buildReportPdf } from '../src/app/reports/data/report-files';
import { MonthlyReportComponent } from '../src/app/reports/components/monthly-report.component';
import { PeriodSummaryComponent } from '../src/app/reports/components/period-summary.component';
import { ReportsPageComponent } from '../src/app/reports/pages/reports-page.component';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import { REPORTS_MONTHLY_BLOCKS } from '../src/app/shared/portal-slots';

// HU-CSH-003 AC-RM.7 (spec 003-, task T-05): "Exportar CSV" and "Exportar PDF" on screen 16 hold what the screen shows.
const peso = (n: number) => n * 100;
const DAY: DailyDashboard = { reportDate: '2026-09-03', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18, confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4 };
const SUMMARY: PeriodSummary = { reportedPeriod: '2026-09', confirmedSales: peso(4150000), periodIncome: peso(3380000), registeredOperationalCosts: peso(480000), registeredCancellations: 2 };
const SEP: MonthlyPeriod = { reportedPeriod: '2026-09', periodIncome: peso(3380000), operationalPayments: peso(300000), operationalExpenses: peso(500000), executedRefunds: 0, consolidatedCashTotal: peso(2580000), registeredCancellations: 2, registeredOperationalCosts: peso(480000) };
const AUG: MonthlyPeriod = { reportedPeriod: '2026-08', periodIncome: peso(800000), operationalPayments: 0, operationalExpenses: 0, executedRefunds: 0, consolidatedCashTotal: peso(800000), registeredCancellations: 0, registeredOperationalCosts: 0 };
const DATA: ReportData = { dashboard: DAY, summary: SUMMARY, periods: [SEP, AUG] };
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const text = (bytes: Uint8Array) => Array.from(bytes, (b) => String.fromCharCode(b)).join('');

describe('exportedCsvHoldsTheSameFiguresAsTheScreen', () => {
  it('writes Sección, Indicador, Valor, then the summary, the six indicators and each period, as the mockup', () => {
    const rows = buildReportCsv(DATA).split('\r\n');
    expect(rows[0]).toBe('"Sección","Indicador","Valor"');
    expect(rows.slice(1, 5)).toEqual(['"Resumen","Ventas confirmadas","4150000"', '"Resumen","Ingresos del período","3380000"', '"Resumen","Costos operacionales","480000"', '"Resumen","Cancelaciones","2"']);
    expect(rows.slice(5, 11).map((r) => r.split(',').slice(1).join(','))).toEqual([
      '"Reservas creadas hoy","12"', '"Pendientes de pago","6"', '"Confirmadas","18"', '"Confirmadas con saldo","3"', '"Canceladas","2"', '"Próximas a ejecutar","4"']);
    expect(rows[5].startsWith('"Dashboard diario"')).toBe(true);
    expect(rows).toContain('"Mensual 2026-09","Total consolidado de caja","2580000"');
    expect(rows).toContain('"Mensual 2026-09","Devoluciones efectivamente realizadas","0"');
    expect(rows).toContain('"Mensual 2026-08","Ingresos","800000"');
    expect(rows.length).toBe(1 + 4 + 6 + 14);
  });

  it('writes only the summary and the indicators when the month has no periods', () => {
    expect(buildReportCsv({ ...DATA, periods: [] }).split('\r\n').length).toBe(1 + 4 + 6);
  });

  it('is delivered with the UTF-8 byte order mark and a CSV media type', () => {
    const file = buildReportFile('csv', DATA);
    expect(String(file.content).startsWith('﻿"Sección"')).toBe(true);
    expect(file.type).toContain('text/csv');
  });
});

describe('exportedFileNameFollowsTheLatestPeriod', () => {
  it('names the file with the newest period of the report, .csv or .pdf', () => {
    expect(buildReportFile('csv', DATA).name).toBe('reporte-multitour-2026-09.csv');
    expect(buildReportFile('pdf', DATA).name).toBe('reporte-multitour-2026-09.pdf');
    expect(buildReportFile('csv', { ...DATA, periods: [AUG, SEP] }).name).toBe('reporte-multitour-2026-08.csv');
  });
  it('uses the period of the summary when the report has no period', () => {
    expect(buildReportFile('csv', { ...DATA, periods: [] }).name).toBe('reporte-multitour-2026-09.csv');
  });
});

describe('exportedPdfIsAValidDocumentWithTheSameLines', () => {
  const pdf = text(buildReportPdf(DATA));
  it('is a PDF 1.4 with a catalog, pages, fonts and a cross-reference table that points at its objects', () => {
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf.trimEnd().endsWith('%%EOF')).toBe(true);
    const start = Number(/startxref\s+(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(start, start + 4)).toBe('xref');
    const offsets = [...pdf.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offsets.length).toBeGreaterThan(4);
    offsets.forEach((offset, i) => expect(pdf.slice(offset).startsWith(`${i + 1} 0 obj`)).toBe(true));
    expect(pdf).toContain('/Type /Catalog');
    expect(pdf).toContain('/BaseFont /Helvetica-Bold');
  });
  it('carries the lines of the report with accents as WinAnsi bytes', () => {
    // Each line of the mockup is drawn as a label on the left and its value on the right (report-pdf-layout.spec.ts); the words are the same.
    ['(Reporte operativo y econ\xF3mico) Tj', '(Multitour \xB7 Per\xEDodo 2026-09) Tj', '(Ventas confirmadas) Tj', '($4.150.000) Tj', '(Pr\xF3ximas a ejecutar) Tj', '(4) Tj',
      '(Total consolidado de caja del per\xEDodo) Tj', '($2.580.000) Tj', '(Per\xEDodo reportado: 2026-08) Tj']
      .forEach((line) => expect(pdf).toContain(line));
  });
  it('escapes parentheses and backslashes and adds pages when the lines do not fit', () => {
    const many = buildReportPdf({ ...DATA, periods: Array.from({ length: 12 }, () => SEP) });
    expect((text(many).match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThan(1);
    expect(text(buildReportPdf({ ...DATA, periods: [{ ...SEP, reportedPeriod: 'a(b)\\c' }] }))).toContain('a\\(b\\)\\\\c');
  });
});

describe('aFailedPdfFallsBackToTheCsv', () => {
  it('saves the PDF file when it can be built', () => {
    const saved: ReportFile[] = [];
    new BrowserReportExporter((file) => saved.push(file)).export('pdf', DATA);
    expect(saved.map((f) => f.name)).toEqual(['reporte-multitour-2026-09.pdf']);
  });
  it('saves the CSV instead when the PDF cannot be produced', () => {
    const saved: ReportFile[] = [];
    new BrowserReportExporter((file) => saved.push(file), () => { throw new Error('no pdf'); }).export('pdf', DATA);
    expect(saved.map((f) => f.name)).toEqual(['reporte-multitour-2026-09.csv']);
  });
});

class Double<T> { reads: { resolve: (v: T) => void; reject: (e: unknown) => void }[] = []; read(): Promise<T> { return new Promise((resolve, reject) => this.reads.push({ resolve, reject })); } }
class DayDouble extends DailyDashboardSource { readonly d = new Double<DailyDashboard>(); override today() { return this.d.read(); } }
class SummaryDouble extends PeriodSummarySource { readonly d = new Double<PeriodSummary>(); override current() { return this.d.read(); } }
class MonthlyDouble extends MonthlyReportSource { readonly d = new Double<readonly MonthlyPeriod[]>(); override periods() { return this.d.read(); } }
class ExporterDouble extends ReportExporter { readonly calls: [string, ReportData][] = []; override export(format: 'csv' | 'pdf', data: ReportData) { this.calls.push([format, data]); } }

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
}
async function render(roles: string[], extra: Provider[] = []) {
  const day = new DayDouble(); const summary = new SummaryDouble(); const monthly = new MonthlyDouble(); const exporter = new ExporterDouble();
  TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(roles) }, { provide: DailyDashboardSource, useValue: day },
    { provide: PeriodSummarySource, useValue: summary }, { provide: MonthlyReportSource, useValue: monthly }, { provide: ReportExporter, useValue: exporter },
    { provide: REPORTS_MONTHLY_BLOCKS, useValue: PeriodSummaryComponent, multi: true }, { provide: REPORTS_MONTHLY_BLOCKS, useValue: MonthlyReportComponent, multi: true }, ...extra] });
  const fixture = TestBed.createComponent(ReportsPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === label) as HTMLButtonElement | undefined;
  const resolveAll = async () => { day.d.reads[0].resolve(DAY); summary.d.reads[0].resolve(SUMMARY); monthly.d.reads[0].resolve([SEP, AUG]); await settle(fixture); };
  return { host, fixture, day, summary, monthly, exporter, button, resolveAll, settle: () => settle(fixture) };
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

describe('exportButtonsFollowTheReportAndTheRole', () => {
  it('draws both buttons for the five internal roles, disabled while the report loads', async () => {
    for (const role of ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST']) {
      const page = await render([role]);
      expect(page.button('Exportar CSV')!.disabled, role).toBe(true);
      expect(page.button('Exportar PDF')!.disabled, role).toBe(true);
      await page.resolveAll();
      expect(page.button('Exportar CSV')!.disabled, role).toBe(false);
      expect(page.button('Exportar PDF')!.disabled, role).toBe(false);
      TestBed.resetTestingModule();
    }
  });

  it('exports what the sources gave, through the port, in the format chosen', async () => {
    const page = await render(['MANAGER']);
    await page.resolveAll();
    page.button('Exportar CSV')!.click();
    page.button('Exportar PDF')!.click();
    expect(page.exporter.calls).toEqual([['csv', DATA], ['pdf', DATA]]);
  });

  it('keeps them disabled when the dashboard, the summary or the periods fail', async () => {
    const page = await render(['ANALYST']);
    page.day.d.reads[0].resolve(DAY); page.summary.d.reads[0].resolve(SUMMARY); page.monthly.d.reads[0].reject(new Error('down'));
    await page.settle();
    expect(page.button('Exportar CSV')!.disabled).toBe(true);
    expect(page.button('Exportar PDF')!.disabled).toBe(true);
  });

  it('draws no buttons for a Cliente final or an unknown role', async () => {
    for (const role of ['CUSTOMER', 'UNKNOWN']) {
      const page = await render([role]);
      await page.resolveAll();
      expect(page.button('Exportar CSV')).toBeUndefined();
      expect(page.button('Exportar PDF')).toBeUndefined();
      TestBed.resetTestingModule();
    }
  });

  it('shows the read-only note only to the Gerente, Contador and Analista', async () => {
    const note = 'Tu rol es de solo consulta: puedes revisar y exportar los reportes, sin registrar ni modificar información.';
    for (const role of ['MANAGER', 'ACCOUNTANT', 'ANALYST']) {
      const page = await render([role]); await page.resolveAll();
      expect(flat(page.host.textContent), role).toContain(note);
      TestBed.resetTestingModule();
    }
    for (const role of ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR']) {
      const page = await render([role]); await page.resolveAll();
      expect(flat(page.host.textContent), role).not.toContain('solo consulta');
      TestBed.resetTestingModule();
    }
  });

  it('draws no buttons when the portal contributes no summary or monthly article (the report is not there)', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(['MANAGER']) }, { provide: DailyDashboardSource, useValue: new DayDouble() }] });
    const fixture = TestBed.createComponent(ReportsPageComponent);
    await settle(fixture);
    expect(Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).map((b) => flat(b.textContent))).toEqual([]);
  });
});
