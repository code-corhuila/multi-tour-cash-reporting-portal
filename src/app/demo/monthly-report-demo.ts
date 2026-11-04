import { Provider, inject } from '@angular/core';
import { CashMovement as CashLedgerMovement } from '../cash/data/cash-day-source';
import { DemoCashStore } from './cash-demo';
import { MonthlyReportSource } from '../cash/data/monthly-report-source';
import { MonthlyPeriod } from '../shared/monthly-period';
import { reportsMonthlySlotProviders } from '../reports/reports-monthly-slots';
import { PeriodSummary, PeriodSummarySource } from '../reports/data/period-summary-source';
import { centsFromPesos } from '../shared/money';
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

const peso = centsFromPesos;
const KINDS: Readonly<Record<CashLedgerMovement['movementType'], CashMovement['kind']>> = {
  INCOME: 'income', OPERATIONAL_PAYMENT: 'operational-payment', EXPENSE: 'expense', REFUND: 'refund',
};
/** The month of the report date of the demo (03 sep 2026, DP-RM1): listed in zeros when it has no movement. */
const REPORT_PERIOD = '2026-09';
/** The mockup's "Ventas confirmadas" of its demo clock: a stand-in for the events of the commercial domain (spec 003- section 6). */
const SEEDED_SALES = peso(7677400);

const ZERO_PERIOD: MonthlyPeriod = {
  reportedPeriod: REPORT_PERIOD, periodIncome: 0, operationalPayments: 0, operationalExpenses: 0, executedRefunds: 0,
  consolidatedCashTotal: 0, registeredCancellations: 0, registeredOperationalCosts: 0,
};

/** DEMO (spec 003- DD-1): the periods are consolidated from the movements of the cash store (closures and the day alike, so Caja and Reportes never disagree); the fixtures empty-period and failing-monthly are read here only. */
export class DemoMonthlyReportSource extends MonthlyReportSource {
  constructor(private readonly store: DemoCashStore = new DemoCashStore()) { super(); }

  override periods(): Promise<readonly MonthlyPeriod[]> {
    if (demoFixture('failing-monthly')) { return Promise.reject(new Error('failing-monthly')); }
    return Promise.resolve(demoFixture('empty-period') ? [ZERO_PERIOD] : consolidate(this.movements()));
  }

  /** Each id counts once in consolidate: the day appears among the closures once it is closed. */
  private movements(): CashMovement[] {
    const day = this.store.read();
    const dated = [
      ...this.store.closures().map((closure) => ({ date: closure.businessDate, movements: closure.movements })),
      { date: day.businessDate, movements: day.movements },
    ];
    return dated.flatMap(({ date, movements }) => movements.map((m) => ({ id: m.cashMovementId, date, kind: KINDS[m.movementType], amount: Math.abs(m.amount) })));
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
  const store = () => inject(DemoCashStore);
  const monthly = () => new DemoMonthlyReportSource(store());
  return [
    { provide: MonthlyReportSource, useFactory: monthly },
    { provide: PeriodSummarySource, useFactory: () => new DemoPeriodSummarySource(inject(MonthlyReportSource)) },
    ...reportsMonthlySlotProviders(),
  ];
}
