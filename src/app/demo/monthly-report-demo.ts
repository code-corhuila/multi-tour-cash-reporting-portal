import { Provider } from '@angular/core';
import { MonthlyPeriod, MonthlyReportSource } from '../cash/data/monthly-report-source';
import { PeriodSummary, PeriodSummarySource } from '../reports/data/period-summary-source';
import { PeriodSummaryComponent } from '../reports/components/period-summary.component';
import { MonthlyReportComponent } from '../reports/components/monthly-report.component';
import { REPORTS_MONTHLY_BLOCKS } from '../shared/portal-slots';
import { demoFixture } from './demo-fixtures';

/** A movement of a closed day, in cents. `base` is the opening cash of the day: it is not income and never enters a period (GAP-011). */
export interface CashMovement {
  readonly id: string;
  readonly date: string;
  readonly kind: 'base' | 'income' | 'operational-payment' | 'expense' | 'refund';
  readonly amount: number;
}
/** Cancellations and operational costs of a period: seeded stand-ins for the events of other domains (spec 003- section 6, DD-2). */
export type RegisteredByPeriod = Readonly<Record<string, { readonly cancellations: number; readonly costs: number }>>;

const NONE = { cancellations: 0, costs: 0 };

/** RN-RM2 on the movements, never on the closing totals: each id counts once, the base counts never; newest period first. */
export function consolidate(movements: readonly CashMovement[], registered: RegisteredByPeriod = {}): MonthlyPeriod[] {
  const counted = new Map<string, CashMovement>();
  movements.forEach((movement) => { if (movement.kind !== 'base' && !counted.has(movement.id)) { counted.set(movement.id, movement); } });
  const sum = (period: string, kind: CashMovement['kind']) =>
    [...counted.values()].filter((m) => m.date.startsWith(period) && m.kind === kind).reduce((total, m) => total + m.amount, 0);
  return [...new Set([...counted.values()].map((m) => m.date.slice(0, 7)))].sort().reverse().map((period) => {
    const [income, payments, expenses, refunds] = [sum(period, 'income'), sum(period, 'operational-payment'), sum(period, 'expense'), sum(period, 'refund')];
    const { cancellations, costs } = registered[period] ?? NONE;
    return {
      reportedPeriod: period, periodIncome: income, operationalPayments: payments, operationalExpenses: expenses, executedRefunds: refunds,
      consolidatedCashTotal: income - payments - expenses - refunds, registeredCancellations: cancellations, registeredOperationalCosts: costs,
    };
  });
}

/** The demo closures: 31 ago, 01 and 02 sep 2026, each with a base of 300.000 that no total counts (spec section 6). */
const peso = (amount: number) => amount * 100;
const MOVEMENTS: readonly CashMovement[] = [
  { id: 'c0831-base', date: '2026-08-31', kind: 'base', amount: peso(300000) }, { id: 'c0831-in', date: '2026-08-31', kind: 'income', amount: peso(800000) },
  { id: 'c0901-base', date: '2026-09-01', kind: 'base', amount: peso(300000) }, { id: 'c0901-in', date: '2026-09-01', kind: 'income', amount: peso(2000000) },
  { id: 'c0901-pay', date: '2026-09-01', kind: 'operational-payment', amount: peso(300000) },
  { id: 'c0902-base', date: '2026-09-02', kind: 'base', amount: peso(300000) }, { id: 'c0902-in', date: '2026-09-02', kind: 'income', amount: peso(1380000) },
  { id: 'c0902-exp', date: '2026-09-02', kind: 'expense', amount: peso(500000) },
];
const REGISTERED: RegisteredByPeriod = { '2026-09': { cancellations: 2, costs: peso(480000) } };
/** The month of the report date of the demo (03 sep 2026, DP-RM1): listed in zeros when it has no movement. */
const REPORT_PERIOD = '2026-09';
const SEEDED_SALES = peso(4150000);

const ZERO_PERIOD: MonthlyPeriod = {
  reportedPeriod: REPORT_PERIOD, periodIncome: 0, operationalPayments: 0, operationalExpenses: 0, executedRefunds: 0,
  consolidatedCashTotal: 0, registeredCancellations: 0, registeredOperationalCosts: 0,
};

/** DEMO (spec 003- DD-1): the periods are consolidated from seeded movements; the fixtures empty-period and failing-monthly are read here only. */
export class DemoMonthlyReportSource extends MonthlyReportSource {
  override periods(): Promise<readonly MonthlyPeriod[]> {
    if (demoFixture('failing-monthly')) { return Promise.reject(new Error('failing-monthly')); }
    return Promise.resolve(demoFixture('empty-period') ? [ZERO_PERIOD] : consolidate(MOVEMENTS, REGISTERED));
  }
}

/** DEMO: the summary of the newest period, read from the same port so the row and the article never disagree. */
export class DemoPeriodSummarySource extends PeriodSummarySource {
  constructor(private readonly monthly: MonthlyReportSource) { super(); }

  override async current(): Promise<PeriodSummary> {
    const [period] = await this.monthly.periods();
    return {
      reportedPeriod: period.reportedPeriod, confirmedSales: period.periodIncome === 0 ? 0 : SEEDED_SALES, periodIncome: period.periodIncome,
      registeredOperationalCosts: period.registeredOperationalCosts, registeredCancellations: period.registeredCancellations,
    };
  }
}

/** The two ports and the two blocks of screen 16: a build offers the blocks only with the ports they read (plan D-01). */
export function monthlyReportDemoProviders(): Provider[] {
  const monthly = new DemoMonthlyReportSource();
  return [
    { provide: MonthlyReportSource, useValue: monthly },
    { provide: PeriodSummarySource, useValue: new DemoPeriodSummarySource(monthly) },
    { provide: REPORTS_MONTHLY_BLOCKS, useValue: PeriodSummaryComponent, multi: true },
    { provide: REPORTS_MONTHLY_BLOCKS, useValue: MonthlyReportComponent, multi: true },
  ];
}
