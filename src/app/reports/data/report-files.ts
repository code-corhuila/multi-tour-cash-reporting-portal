import { MonthlyPeriod } from '../../cash/data/monthly-report-source';
import { formatCop, formatPesos } from '../../shared/format';
import { PdfLine, buildPdf } from '../../shared/minimal-pdf';
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



/** The lines of the mockup's PDF (`buildOperatorReportsLines`), from the same values. */
function pdfLines(data: ReportData): PdfLine[] {
  const { dashboard: d, summary: s } = data;
  const lines: PdfLine[] = [
    { text: 'Reporte operativo y económico - Multitour', size: 14, bold: true }, { text: '' },
    { text: 'Resumen', size: 12, bold: true },
    { text: `${t.sales}: ${formatCop(s.confirmedSales)}` }, { text: `${t.income}: ${formatCop(s.periodIncome)}` },
    { text: `${t.costs}: ${formatCop(s.registeredOperationalCosts)}` }, { text: `${t.cancellations}: ${s.registeredCancellations}` }, { text: '' },
    { text: 'Dashboard diario (hoy)', size: 12, bold: true },
    { text: `${t.created}: ${d.createdReservations}` }, { text: `${t.pending}: ${d.pendingPaymentReservations}` }, { text: `${t.confirmed}: ${d.confirmedReservations}` },
    { text: `${t.withBalance}: ${d.confirmedWithBalance}` }, { text: `${t.cancelled}: ${d.cancelledReservations}` }, { text: `${t.upcoming}: ${d.upcomingServices}` }, { text: '' },
    { text: 'Reporte mensual', size: 12, bold: true },
  ];
  if (!data.periods[0]) { lines.push({ text: t.monthlyEmpty }); }
  data.periods.forEach((p) => lines.push(
    { text: `${m.reported}: ${p.reportedPeriod}`, bold: true }, { text: `${m.income}: ${formatCop(p.periodIncome)}` },
    { text: `${m.payments}: ${formatCop(p.operationalPayments)}` }, { text: `${m.expenses}: ${formatCop(p.operationalExpenses)}` },
    { text: `${m.refunds}: ${formatCop(p.executedRefunds)}` }, { text: `${m.total}: ${formatCop(p.consolidatedCashTotal)}` },
    { text: `${m.cancellations}: ${p.registeredCancellations}` },
    { text: `${m.costs}: ${p.registeredOperationalCosts > 0 ? formatCop(p.registeredOperationalCosts) : m.noCosts}` }, { text: '' }));
  return lines;
}

/** The PDF of the report: the lines above on the shared minimal writer. */
export const buildReportPdf = (data: ReportData): Uint8Array => buildPdf(pdfLines(data));

/** The file of one format, named `reporte-multitour-AAAA-MM` with the period of the report. The CSV starts with the UTF-8 byte order mark, so a spreadsheet reads the accents. */
export function buildReportFile(format: ReportFormat, data: ReportData, pdf: (data: ReportData) => Uint8Array = buildReportPdf): ReportFile {
  const name = `reporte-multitour-${periodOf(data)}`;
  return format === 'csv'
    ? { name: `${name}.csv`, type: 'text/csv;charset=utf-8', content: `\uFEFF${buildReportCsv(data)}` }
    : { name: `${name}.pdf`, type: 'application/pdf', content: pdf(data) };
}
