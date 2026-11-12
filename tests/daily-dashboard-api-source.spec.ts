import { describe, expect, it } from 'vitest';
import { DailyDashboard, DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { DailyDashboardApiSource } from '../src/app/http/daily-dashboard-api-source';
import { dailyDashboardPath } from '../src/app/http/api-paths';
import { containerError, fakeCashClient } from './cash-api-client.double';

// HU-CSH-002, adapter of the port DailyDashboardSource (spec 002- A1.9, AC-DB.9 to AC-DB.11; contract getDailyDashboard).
// One GET through props.apiClient: no body, no query, no tenant. Nothing is converted: the schema has no amount.
const PATH = '/api/v1/cash-reporting/daily-dashboard';
const WIRE: DailyDashboard = {
  reportDate: '2026-09-01', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18,
  confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4,
};
const FIELDS = Object.keys(WIRE) as (keyof DailyDashboard)[];

describe('dailyDashboardPath', () => {
  it('is the contract route of the service, a path only', () => {
    expect(dailyDashboardPath()).toBe(PATH);
  });
});

describe('DailyDashboardApiSource reads the dashboard through the container client', () => {
  it('is a DailyDashboardSource', () => {
    expect(new DailyDashboardApiSource(fakeCashClient({}).client)).toBeInstanceOf(DailyDashboardSource);
  });

  it('reads the path once, with no body, no query and no tenant, and returns the seven fields unchanged', async () => {
    const { client, calls } = fakeCashClient({ [PATH]: { ok: WIRE } });
    expect(await new DailyDashboardApiSource(client).today()).toEqual(WIRE);
    expect(calls).toEqual([{ path: PATH, init: undefined }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('answers six zeros for a day without reservations and does not raise', async () => {
    const empty = { ...WIRE, createdReservations: 0, pendingPaymentReservations: 0, confirmedReservations: 0, confirmedWithBalance: 0, cancelledReservations: 0, upcomingServices: 0 };
    const { client } = fakeCashClient({ [PATH]: { ok: empty } });
    expect(await new DailyDashboardApiSource(client).today()).toEqual(empty);
  });

  it('drops a field the contract does not name instead of passing it on', async () => {
    const { client } = fakeCashClient({ [PATH]: { ok: { ...WIRE, tenantId: 't-1' } } });
    expect(Object.keys(await new DailyDashboardApiSource(client).today()).sort()).toEqual([...FIELDS].sort());
  });

  it.each(FIELDS)('rejects a body without %s, so "undefined" is never drawn', async (field) => {
    const body: Record<string, unknown> = { ...WIRE };
    delete body[field];
    const { client } = fakeCashClient({ [PATH]: { ok: body } });
    await expect(new DailyDashboardApiSource(client).today()).rejects.toBeTruthy();
  });

  it.each([-1, 1.5, '3', null])('rejects a count that is %j', async (bad) => {
    const { client } = fakeCashClient({ [PATH]: { ok: { ...WIRE, confirmedReservations: bad } } });
    await expect(new DailyDashboardApiSource(client).today()).rejects.toBeTruthy();
  });

  it.each([null, 'x', 7])('rejects a body that is %j', async (body) => {
    const { client } = fakeCashClient({ [PATH]: { ok: body } });
    await expect(new DailyDashboardApiSource(client).today()).rejects.toBeTruthy();
  });

  it.each([[401, 'UNAUTHORIZED'], [403, 'FORBIDDEN'], [500, 'INTERNAL_ERROR'], [503, 'SERVICE_UNAVAILABLE']])('lets the rejection of a %i reach the caller as it came (AC-DB.10)', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [PATH]: { fail: error } });
    await expect(new DailyDashboardApiSource(client).today()).rejects.toBe(error);
  });
});
