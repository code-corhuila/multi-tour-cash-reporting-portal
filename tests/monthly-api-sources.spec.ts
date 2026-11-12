import { describe, expect, it } from 'vitest';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { monthlyConsolidationsPath, periodSummaryPath } from '../src/app/http/api-paths';
import { MonthlyReportApiSource } from '../src/app/http/monthly-report-api-source';
import { PeriodSummaryApiSource } from '../src/app/http/period-summary-api-source';
import { PeriodSummarySource } from '../src/app/reports/data/period-summary-source';
import { containerError, fakeCashClient, page } from './cash-api-client.double';

// HU-CSH-003, adapters of MonthlyReportSource and PeriodSummarySource (spec 003- A1.9, AC-RM.8 to AC-RM.10; contract listMonthlyConsolidations, getMonthlyReportSummary).
// Every request goes through props.apiClient: no tenant, no body, no `period`. Amounts stay in cents; only the names change.
const BASE = '/api/v1/cash-reporting';
const PERIODS = (n: number) => `${BASE}/monthly-consolidations?page=${n}&limit=100`;
const SUMMARY = `${BASE}/monthly-reports/summary`;

const SEP_WIRE = {
  reportedPeriod: '2026-09', periodIncomeCents: 129000000, operationalPaymentsCents: 1000000, operationalExpensesCents: 25000000, executedRefundsCents: 15000000,
  consolidatedCashTotalCents: 88000000, registeredCancellations: 2, registeredOperationalCostsCents: 48000000,
  individualMovementsCounted: 5, cashIncomeCents: 29000000, transferIncomeCents: 100000000,
};
const SEP = {
  reportedPeriod: '2026-09', periodIncome: 129000000, operationalPayments: 1000000, operationalExpenses: 25000000, executedRefunds: 15000000,
  consolidatedCashTotal: 88000000, registeredCancellations: 2, registeredOperationalCosts: 48000000,
  countedMovements: 5, incomeInCash: 29000000, incomeByTransfer: 100000000,
};
const AUG_WIRE = { ...SEP_WIRE, reportedPeriod: '2026-08', registeredCancellations: 0, registeredOperationalCostsCents: 0, individualMovementsCounted: 0, cashIncomeCents: 0, transferIncomeCents: 0 };
const WIRE_FIELDS = Object.keys(SEP_WIRE);

describe('the paths of the monthly reads', () => {
  it('are the contract routes of the service, paths only', () => {
    expect(monthlyConsolidationsPath()).toBe(`${BASE}/monthly-consolidations`);
    expect(periodSummaryPath()).toBe(SUMMARY);
  });
});

describe('MonthlyReportApiSource reads the periods through the container client', () => {
  it('is a MonthlyReportSource', () => {
    expect(new MonthlyReportApiSource(fakeCashClient({}).client)).toBeInstanceOf(MonthlyReportSource);
  });

  it('maps every cents field to the name of the port, keeps the amounts in cents and carries the three lines of the sub-screen', async () => {
    const { client, calls } = fakeCashClient({ [PERIODS(1)]: { ok: page([SEP_WIRE]) } });
    expect(await new MonthlyReportApiSource(client).periods()).toEqual([SEP]);
    expect(calls).toEqual([{ path: PERIODS(1), init: undefined }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('reads every page, 100 at a time, and lists the periods in the order the service gives them (AC-RM.9)', async () => {
    const may = { ...SEP_WIRE, reportedPeriod: '2026-07' };
    const { client, paths } = fakeCashClient({
      [PERIODS(1)]: { ok: page([SEP_WIRE], { page: 1, totalPages: 3 }) },
      [PERIODS(2)]: { ok: page([AUG_WIRE], { page: 2, totalPages: 3 }) },
      [PERIODS(3)]: { ok: page([may], { page: 3, totalPages: 3 }) },
    });
    const periods = await new MonthlyReportApiSource(client).periods();
    expect(periods.map((period) => period.reportedPeriod)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(paths()).toEqual([PERIODS(1), PERIODS(2), PERIODS(3)]);
  });

  it('answers a period in zeros without raising and an empty list when the service has none', async () => {
    const zero = { ...AUG_WIRE, periodIncomeCents: 0, operationalPaymentsCents: 0, operationalExpensesCents: 0, executedRefundsCents: 0, consolidatedCashTotalCents: 0 };
    const { client } = fakeCashClient({ [PERIODS(1)]: { ok: page([zero]) } });
    expect((await new MonthlyReportApiSource(client).periods())[0].consolidatedCashTotal).toBe(0);
    expect(await new MonthlyReportApiSource(fakeCashClient({ [PERIODS(1)]: { ok: page([]) } }).client).periods()).toEqual([]);
  });

  it.each(WIRE_FIELDS.filter((field) => field !== 'reportedPeriod'))('rejects a period that lacks %s, so "undefined" is never drawn', async (field) => {
    const broken: Record<string, unknown> = { ...SEP_WIRE };
    delete broken[field];
    const { client } = fakeCashClient({ [PERIODS(1)]: { ok: page([broken]) } });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBeTruthy();
  });

  it('rejects an amount that is not a whole number of cents', async () => {
    const { client } = fakeCashClient({ [PERIODS(1)]: { ok: page([{ ...SEP_WIRE, periodIncomeCents: '12' }]) } });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBeTruthy();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'INTERNAL_ERROR']])('lets the rejection of a %i reach the caller as it came, also from a later page (AC-RM.10)', async (status, code) => {
    const error = containerError(status, code);
    const first = fakeCashClient({ [PERIODS(1)]: { fail: error } });
    await expect(new MonthlyReportApiSource(first.client).periods()).rejects.toBe(error);
    const later = fakeCashClient({ [PERIODS(1)]: { ok: page([SEP_WIRE], { page: 1, totalPages: 2 }) }, [PERIODS(2)]: { fail: error } });
    await expect(new MonthlyReportApiSource(later.client).periods()).rejects.toBe(error);
  });
});

describe('PeriodSummaryApiSource reads the summary row through the container client', () => {
  const WIRE = { reportedPeriod: '2026-09', confirmedSalesCents: 415000000, periodIncomeCents: 129000000, operationalCostsCents: 48000000, cancellations: 2 };
  const PORTAL = { reportedPeriod: '2026-09', confirmedSales: 415000000, periodIncome: 129000000, registeredOperationalCosts: 48000000, registeredCancellations: 2 };

  it('is a PeriodSummarySource', () => {
    expect(new PeriodSummaryApiSource(fakeCashClient({}).client)).toBeInstanceOf(PeriodSummarySource);
  });

  it('reads the path once with no body, no tenant and no period, and maps the four values to the names of the port', async () => {
    const { client, calls } = fakeCashClient({ [SUMMARY]: { ok: WIRE } });
    expect(await new PeriodSummaryApiSource(client).current()).toEqual(PORTAL);
    expect(calls).toEqual([{ path: SUMMARY, init: undefined }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('answers four zeros for a period without movements and does not raise', async () => {
    const { client } = fakeCashClient({ [SUMMARY]: { ok: { ...WIRE, confirmedSalesCents: 0, periodIncomeCents: 0, operationalCostsCents: 0, cancellations: 0 } } });
    expect(await new PeriodSummaryApiSource(client).current()).toEqual({ reportedPeriod: '2026-09', confirmedSales: 0, periodIncome: 0, registeredOperationalCosts: 0, registeredCancellations: 0 });
  });

  it.each(Object.keys(WIRE))('rejects a body without %s', async (field) => {
    const broken: Record<string, unknown> = { ...WIRE };
    delete broken[field];
    const { client } = fakeCashClient({ [SUMMARY]: { ok: broken } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBeTruthy();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'INTERNAL_ERROR']])('lets the rejection of a %i reach the caller as it came (AC-RM.10)', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [SUMMARY]: { fail: error } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBe(error);
  });
});
