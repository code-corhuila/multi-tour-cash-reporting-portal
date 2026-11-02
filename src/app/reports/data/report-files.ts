import { MonthlyPeriod } from '../../shared/monthly-period';
import { formatCop, formatPesos } from '../../shared/format';
import { PdfBlock, buildPdf } from '../../shared/minimal-pdf';
import { MONTHLY_PERIOD_COPY } from '../../shared/monthly-period-copy';
import { REPORTS_COPY } from '../reports-copy';
import { DailyDashboard } from './daily-dashboard-source';
import { PeriodSummary } from './period-summary-source';

/** What screen 16 shows, as the three ports gave it: the export writes these values and computes none (RN-RM6). */
export interface ReportData {
  readonly dashboard: DailyDashboard;
  readonly summary: PeriodSummary;
  readonly periods: readonly MonthlyPeriod[];
}
export type ReportFormat = 'csv' | 'pdf';
/** A file ready to be saved: the name carries the period of the report. */
export interface ReportFile { readonly name: string; readonly type: string; readonly content: string | Uint8Array }

const t = REPORTS_COPY;
const m = MONTHLY_PERIOD_COPY;
/** Cents as whole pesos, the unit of the mockup's file (`4150000`). */
const pesos = formatPesos;

/** One row of the CSV: section, indicator, value. */
type Row = readonly [string, string, string];

function csvRows(data: ReportData): Row[] {
  const { dashboard: d, summary: s } = data;
  const rows: Row[] = [
    ['Resumen', t.sales, pesos(s.confirmedSales)], ['Resumen', t.income, pesos(s.periodIncome)],
    ['Resumen', t.costs, pesos(s.registeredOperationalCosts)], ['Resumen', t.cancellations, String(s.registeredCancellations)],
    ['Dashboard diario', t.created, String(d.createdReservations)], ['Dashboard diario', t.pending, String(d.pendingPaymentReservations)],
    ['Dashboard diario', t.confirmed, String(d.confirmedReservations)], ['Dashboard diario', t.withBalance, String(d.confirmedWithBalance)],
    ['Dashboard diario', t.cancelled, String(d.cancelledReservations)], ['Dashboard diario', t.upcoming, String(d.upcomingServices)],
  ];
  data.periods.forEach((p) => {
    const section = `Mensual ${p.reportedPeriod}`;
    rows.push([section, 'Ingresos', pesos(p.periodIncome)], [section, 'Pagos operacionales', pesos(p.operationalPayments)], [section, 'Gastos', pesos(p.operationalExpenses)],
      [section, m.refunds, pesos(p.executedRefunds)], [section, 'Total consolidado de caja', pesos(p.consolidatedCashTotal)],
      [section, 'Cancelaciones registradas', String(p.registeredCancellations)], [section, 'Costos operacionales registrados', pesos(p.registeredOperationalCosts)]);
  });
  return rows;
}

/** The CSV of the mockup (`buildOperatorReportsCsv`): columns Sección, Indicador, Valor, every cell quoted, CRLF. */
export function buildReportCsv(data: ReportData): string {
  const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [['Sección', 'Indicador', 'Valor'] as Row, ...csvRows(data)].map((row) => row.map(cell).join(',')).join('\r\n');
}

/** The newest period of the report, or the period of the summary when the month has no movements. */
const periodOf = (data: ReportData): string => data.periods[0]?.reportedPeriod ?? data.summary.reportedPeriod;



const row = (label: string, value: string): PdfBlock => ({ kind: 'row', label, value });

/**
 * The PDF of the mockup (`buildOperatorReportsLines`) has these same lines, one per `label: value`. Here each one is a row (the label on the left,
 * the value on the right) under the title band, so the document reads as a report; the words and the values are the same.
 */
function pdfBlocks(data: ReportData): PdfBlock[] {
  const { dashboard: d, summary: s } = data;
  const blocks: PdfBlock[] = [
    { kind: 'title', text: 'Reporte operativo y económico', subtitle: `Multitour · Período ${periodOf(data)}` },
    { kind: 'heading', text: 'Resumen' },
    row(t.sales, formatCop(s.confirmedSales)), row(t.income, formatCop(s.periodIncome)),
    row(t.costs, formatCop(s.registeredOperationalCosts)), row(t.cancellations, String(s.registeredCancellations)),
    { kind: 'heading', text: 'Dashboard diario (hoy)' },
    row(t.created, String(d.createdReservations)), row(t.pending, String(d.pendingPaymentReservations)), row(t.confirmed, String(d.confirmedReservations)),
    row(t.withBalance, String(d.confirmedWithBalance)), row(t.cancelled, String(d.cancelledReservations)), row(t.upcoming, String(d.upcomingServices)),
    { kind: 'heading', text: 'Reporte mensual' },
  ];
  if (!data.periods[0]) { blocks.push({ kind: 'note', text: t.monthlyEmpty }); }
  // One period is one group of eight lines: it is never split between two pages.
  data.periods.forEach((p) => blocks.push(
    { kind: 'keep', height: 24 + 7 * 22 }, { kind: 'subheading', text: `${m.reported}: ${p.reportedPeriod}` }, row(m.income, formatCop(p.periodIncome)),
    row(m.payments, formatCop(p.operationalPayments)), row(m.expenses, formatCop(p.operationalExpenses)),
    row(m.refunds, formatCop(p.executedRefunds)), row(m.total, formatCop(p.consolidatedCashTotal)),
    row(m.cancellations, String(p.registeredCancellations)),
    row(m.costs, p.registeredOperationalCosts > 0 ? formatCop(p.registeredOperationalCosts) : m.noCosts), { kind: 'space' }));
  return blocks;
}

/** The PDF of the report: the blocks above on the shared minimal writer, with the name of the report in the footer. */
export const buildReportPdf = (data: ReportData): Uint8Array => buildPdf(pdfBlocks(data), { footer: 'Multitour · Reporte operativo y económico' });

/** The file of one format, named `reporte-multitour-AAAA-MM` with the period of the report. The CSV starts with the UTF-8 byte order mark, so a spreadsheet reads the accents. */
export function buildReportFile(format: ReportFormat, data: ReportData, pdf: (data: ReportData) => Uint8Array = buildReportPdf): ReportFile {
  const name = `reporte-multitour-${periodOf(data)}`;
  return format === 'csv'
    ? { name: `${name}.csv`, type: 'text/csv;charset=utf-8', content: `\uFEFF${buildReportCsv(data)}` }
    : { name: `${name}.pdf`, type: 'application/pdf', content: pdf(data) };
}
