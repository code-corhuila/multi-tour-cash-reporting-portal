import { MonthlyReportSource } from '../cash/data/monthly-report-source';
import { PeriodSummary, PeriodSummarySource } from '../reports/data/period-summary-source';
import { MonthlyPeriod } from '../shared/monthly-period';
import { PortalApiClient } from '../shell-contract';
import { listAll, monthlyConsolidationsPath, monthlyReportSummaryPath } from './api-paths';

type Wire = Record<string, unknown>;
const isCount = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
const isPeriod = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

/** The fields of the contract that are numbers (amounts in cents and counts, all whole and zero or more): the port name each one takes. */
const PERIOD_NUMBERS: Readonly<Record<string, keyof MonthlyPeriod>> = {
  periodIncomeCents: 'periodIncome', operationalPaymentsCents: 'operationalPayments', operationalExpensesCents: 'operationalExpenses',
  executedRefundsCents: 'executedRefunds', consolidatedCashTotalCents: 'consolidatedCashTotal', registeredCancellations: 'registeredCancellations',
  registeredOperationalCostsCents: 'registeredOperationalCosts', individualMovementsCounted: 'countedMovements', cashIncomeCents: 'incomeInCash',
  transferIncomeCents: 'incomeByTransfer',
};

/**
 * MonthlyReportSource over the container client (HU-CSH-003 spec A1.9, plan D-08): every page of `listMonthlyConsolidations`, 100 at a time, no body, no
 * tenant and no period; the one read feeds the sub-screen and the article of Reportes, so they never list different periods. Only the names change:
 * amounts stay in cents and nothing is summed here. A period that lacks a field is rejected so "undefined" is never drawn, and every rejection of the
 * client reaches the page as it came (AC-RM.10).
 */
export class MonthlyReportApiSource extends MonthlyReportSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async periods(): Promise<readonly MonthlyPeriod[]> {
    return (await listAll<Wire>(this.client, monthlyConsolidationsPath())).map((wire) => {
      if (!isPeriod(wire['reportedPeriod'])) { throw new Error('monthly-consolidations: no reportedPeriod'); }
      const period: Record<string, string | number> = { reportedPeriod: wire['reportedPeriod'] };
      for (const [field, name] of Object.entries(PERIOD_NUMBERS)) {
        if (!isCount(wire[field])) { throw new Error(`monthly-consolidations: ${field} is missing or not a whole number`); }
        period[name] = wire[field];
      }
      return period as unknown as MonthlyPeriod;
    });
  }
}

/**
 * PeriodSummarySource over the container client (spec A1.9): one GET with no body, no query and no period, so the service answers its latest period.
 * `confirmedSalesCents` is null while the commercial value has no source (G-SALES): an unknown figure is never drawn as zero, so it is rejected and the
 * row shows the error, not a false $0.
 */
export class PeriodSummaryApiSource extends PeriodSummarySource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async current(): Promise<PeriodSummary> {
    const body = await this.client.request<Wire | null>(monthlyReportSummaryPath());
    if (typeof body !== 'object' || body === null || !isPeriod(body['reportedPeriod'])) { throw new Error('monthly-report-summary: no reportedPeriod'); }
    const [sales, income, costs, cancellations] = ['confirmedSalesCents', 'periodIncomeCents', 'operationalCostsCents', 'cancellations'].map((field) => body[field]);
    if (![sales, income, costs, cancellations].every(isCount)) { throw new Error('monthly-report-summary: a value is missing, unknown or not a whole number'); }
    return { reportedPeriod: body['reportedPeriod'], confirmedSales: sales as number, periodIncome: income as number, registeredOperationalCosts: costs as number, registeredCancellations: cancellations as number };
  }
}
