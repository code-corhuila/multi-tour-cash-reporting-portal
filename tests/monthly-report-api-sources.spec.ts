import { describe, expect, it } from 'vitest';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { PeriodSummarySource } from '../src/app/reports/data/period-summary-source';
import { MonthlyReportApiSource, PeriodSummaryApiSource } from '../src/app/http/monthly-report-api-sources';
import { monthlyConsolidationsPath, monthlyReportSummaryPath } from '../src/app/http/api-paths';
import { containerError, fakeCashClient, page } from './cash-api-client.double';

// HU-CSH-003, adapters of the ports MonthlyReportSource and PeriodSummarySource (spec 003- A1.9, AC-RM.8 to AC-RM.10;
// contract listMonthlyConsolidations and getMonthlyReportSummary). Through props.apiClient: no body, no tenant, no period.
const BASE = '/api/v1/cash-reporting';
const CONSOLIDATIONS = `${BASE}/monthly-consolidations`;
const SUMMARY = `${BASE}/monthly-reports/summary`;
const first = (path: string) => `${path}?page=1&limit=100`;

const WIRE_SEP = {
  reportedPeriod: '2026-09', periodIncomeCents: 129000000, operationalPaymentsCents: 0, operationalExpensesCents: 25000000, executedRefundsCents: 15000000,
  consolidatedCashTotalCents: 89000000, registeredCancellations: 2, registeredOperationalCostsCents: 48000000,
  individualMovementsCounted: 3, cashIncomeCents: 0, transferIncomeCents: 129000000,
};
const WIRE_AUG = { ...WIRE_SEP, reportedPeriod: '2026-08', periodIncomeCents: 100000000, individualMovementsCounted: 2, cashIncomeCents: 80000000, transferIncomeCents: 20000000 };
const PORT_SEP = {
  reportedPeriod: '2026-09', periodIncome: 129000000, operationalPayments: 0, operationalExpenses: 25000000, executedRefunds: 15000000,
  consolidatedCashTotal: 89000000, registeredCancellations: 2, registeredOperationalCosts: 48000000,
  countedMovements: 3, incomeInCash: 0, incomeByTransfer: 129000000,
};
const WIRE_SUMMARY = { reportedPeriod: '2026-09', confirmedSalesCents: 415000000, periodIncomeCents: 129000000, operationalCostsCents: 48000000, cancellations: 2 };

describe('the monthly paths', () => {
  it('are the contract routes of the service, paths only, with no tenant and no period', () => {
    expect(monthlyConsolidationsPath()).toBe(CONSOLIDATIONS);
    expect(monthlyReportSummaryPath()).toBe(SUMMARY);
  });
});

describe('MonthlyReportApiSource reads the periods through the container client (AC-RM.8)', () => {
  it('is a MonthlyReportSource', () => {
    expect(new MonthlyReportApiSource(fakeCashClient({}).client)).toBeInstanceOf(MonthlyReportSource);
  });

  it('reads the consolidations once, with no body, no tenant and no period, and maps every field of the contract by name', async () => {
    const { client, calls } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([WIRE_SEP]) } });
    expect(await new MonthlyReportApiSource(client).periods()).toEqual([PORT_SEP]);
    expect(calls).toEqual([{ path: first(CONSOLIDATIONS), init: undefined }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toMatch(/tenant|period=/);
  });

  it('keeps the amounts in cents: nothing is converted, summed or rounded', async () => {
    const odd = { ...WIRE_SEP, periodIncomeCents: 12345, consolidatedCashTotalCents: 1 };
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([odd]) } });
    const [period] = await new MonthlyReportApiSource(client).periods();
    expect([period.periodIncome, period.consolidatedCashTotal]).toEqual([12345, 1]);
  });

  it('answers the periods in the order the service gives them, newest first (AC-RM.9)', async () => {
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([WIRE_SEP, WIRE_AUG]) } });
    expect((await new MonthlyReportApiSource(client).periods()).map((p) => p.reportedPeriod)).toEqual(['2026-09', '2026-08']);
  });

  it('reads every page, 100 at a time, when there are more periods than one page (AC-RM.9)', async () => {
    const { client, paths } = fakeCashClient({
      [first(CONSOLIDATIONS)]: { ok: page([WIRE_SEP], { page: 1, totalPages: 3 }) },
      [`${CONSOLIDATIONS}?page=2&limit=100`]: { ok: page([WIRE_AUG], { page: 2, totalPages: 3 }) },
      [`${CONSOLIDATIONS}?page=3&limit=100`]: { ok: page([{ ...WIRE_AUG, reportedPeriod: '2026-07' }], { page: 3, totalPages: 3 }) },
    });
    expect((await new MonthlyReportApiSource(client).periods()).map((p) => p.reportedPeriod)).toEqual(['2026-09', '2026-08', '2026-07']);
    expect(paths()).toEqual([first(CONSOLIDATIONS), `${CONSOLIDATIONS}?page=2&limit=100`, `${CONSOLIDATIONS}?page=3&limit=100`]);
  });

  it('answers an empty list when the service has no period, and does not raise', async () => {
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([]) } });
    expect(await new MonthlyReportApiSource(client).periods()).toEqual([]);
  });

  it('drops a field the contract does not name instead of passing it on', async () => {
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([{ ...WIRE_SEP, tenantId: 't-1' }]) } });
    expect(Object.keys((await new MonthlyReportApiSource(client).periods())[0]).sort()).toEqual(Object.keys(PORT_SEP).sort());
  });

  it.each(Object.keys(WIRE_SEP))('rejects a period without %s, so "undefined" is never drawn', async (field) => {
    const body: Record<string, unknown> = { ...WIRE_SEP };
    delete body[field];
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([body]) } });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBeTruthy();
  });

  it.each([-1, 1.5, '3', null])('rejects an amount or a count that is %j', async (bad) => {
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { ok: page([{ ...WIRE_SEP, executedRefundsCents: bad }]) } });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBeTruthy();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'INTERNAL_ERROR'], [503, 'SERVICE_UNAVAILABLE']])('lets the rejection of a %i reach the caller as it came (AC-RM.10)', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [first(CONSOLIDATIONS)]: { fail: error } });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBe(error);
  });

  it('lets a network failure reach the caller as it came, and a failed later page is not turned into a shorter list', async () => {
    const error = new TypeError('Failed to fetch');
    const { client } = fakeCashClient({
      [first(CONSOLIDATIONS)]: { ok: page([WIRE_SEP], { page: 1, totalPages: 2 }) },
      [`${CONSOLIDATIONS}?page=2&limit=100`]: { fail: error },
    });
    await expect(new MonthlyReportApiSource(client).periods()).rejects.toBe(error);
  });
});

describe('PeriodSummaryApiSource reads the summary through the container client (AC-RM.8)', () => {
  it('is a PeriodSummarySource', () => {
    expect(new PeriodSummaryApiSource(fakeCashClient({}).client)).toBeInstanceOf(PeriodSummarySource);
  });

  it('reads the summary once, with no body, no query and no tenant, and maps every field of the contract by name', async () => {
    const { client, calls } = fakeCashClient({ [SUMMARY]: { ok: WIRE_SUMMARY } });
    expect(await new PeriodSummaryApiSource(client).current()).toEqual({
      reportedPeriod: '2026-09', confirmedSales: 415000000, periodIncome: 129000000, registeredOperationalCosts: 48000000, registeredCancellations: 2,
    });
    expect(calls).toEqual([{ path: SUMMARY, init: undefined }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('answers four zeros for a period without movements and does not raise', async () => {
    const zero = { reportedPeriod: '2026-09', confirmedSalesCents: 0, periodIncomeCents: 0, operationalCostsCents: 0, cancellations: 0 };
    const { client } = fakeCashClient({ [SUMMARY]: { ok: zero } });
    expect(await new PeriodSummaryApiSource(client).current()).toEqual({
      reportedPeriod: '2026-09', confirmedSales: 0, periodIncome: 0, registeredOperationalCosts: 0, registeredCancellations: 0,
    });
  });

  it.each(Object.keys(WIRE_SUMMARY))('rejects a body without %s, so "undefined" is never drawn', async (field) => {
    const body: Record<string, unknown> = { ...WIRE_SUMMARY };
    delete body[field];
    const { client } = fakeCashClient({ [SUMMARY]: { ok: body } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBeTruthy();
  });

  it('keeps an unknown sales figure as null, never as zero: a null confirmedSalesCents (G-SALES) maps to confirmedSales null and the rest is read as always', async () => {
    const { client } = fakeCashClient({ [SUMMARY]: { ok: { ...WIRE_SUMMARY, confirmedSalesCents: null } } });
    expect(await new PeriodSummaryApiSource(client).current()).toEqual({
      reportedPeriod: '2026-09', confirmedSales: null, periodIncome: 129000000, registeredOperationalCosts: 48000000, registeredCancellations: 2,
    });
  });

  it.each([-1, 1.5, '3'])('still rejects a confirmedSalesCents that is %j (only null is unknown)', async (bad) => {
    const { client } = fakeCashClient({ [SUMMARY]: { ok: { ...WIRE_SUMMARY, confirmedSalesCents: bad } } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBeTruthy();
  });

  it.each([-1, 1.5, '3'])('rejects a count or an amount that is %j', async (bad) => {
    const { client } = fakeCashClient({ [SUMMARY]: { ok: { ...WIRE_SUMMARY, cancellations: bad } } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBeTruthy();
  });

  it.each([null, 'x', 7])('rejects a body that is %j', async (body) => {
    const { client } = fakeCashClient({ [SUMMARY]: { ok: body } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBeTruthy();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'INTERNAL_ERROR']])('lets the rejection of a %i reach the caller as it came (AC-RM.10)', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [SUMMARY]: { fail: error } });
    await expect(new PeriodSummaryApiSource(client).current()).rejects.toBe(error);
  });
});
