import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { sourceProviders } from '../src/app/sources';
import type { MountProps } from '../src/app/shell-contract';
import { CashClosuresSource } from '../src/app/cash/data/cash-closures-source';
import { CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashCorrectionWriter } from '../src/app/cash/data/cash-correction-writer';
import { CashMovementWriter } from '../src/app/cash/data/cash-movement-writer';
import { CashOpeningWriter } from '../src/app/cash/data/cash-opening-writer';
import { CashPendingClosingWriter } from '../src/app/cash/data/cash-pending-closing-writer';
import { CashReopeningWriter } from '../src/app/cash/data/cash-reopening-writer';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { PeriodSummarySource } from '../src/app/reports/data/period-summary-source';
import { fakeCashClient, page, type Reply } from './cash-api-client.double';
import { CASH_CONSULTATION_LINKS, REPORTS_MONTHLY_BLOCKS } from '../src/app/shared/portal-slots';
import { withoutComments } from './source-files';

// RN-CJ9 and the micro spec (D-CSH-03): demo data reaches only the demo build, which swaps
// src/app/sources.ts for src/app/sources.demo.ts. The production module registers no demo store. HU-CSH-001 A1, branch 1:
// it registers the HTTP adapters of the READ ports of the day and the closures and nothing else; an area is offered only when
// all the ports it reads exist (portal-areas `has`), and what it writes is drawn only where its writer exists.
const PRODUCTION_FILES = ['src/mount-entry.ts', 'src/app/sources.ts'];
const BASE = '/api/v1/cash-reporting';
const DAY = {
  businessDate: '2026-09-01', timeZone: 'America/Bogota', cashSessionId: 's-1', status: 'OPEN', origin: 'OPERATIONAL_OPENING', hasOperationalOpening: true,
  pendingClosure: false, openingBaseCents: 30000000, openedAt: '2026-09-01T13:05:00Z', openedBy: { userId: 'u', roleLabel: 'Administrador del tenant' },
  incomeCents: 0, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0, totalCents: 30000000, expectedCashCents: 30000000, netTransfersCents: 0,
};
const CLOSURE = {
  businessDate: '2026-08-31', badge: 'CLOSED', baseCents: 30000000, incomeCents: 0, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0, totalCents: 30000000,
  expectedCashCents: 30000000, origin: 'OPERATIONAL_OPENING', hasOperationalOpening: true, closingMode: 'FORMAL', closedBy: { userId: 'u', roleLabel: 'Administrador del tenant' },
  closedAt: '2026-08-31T23:00:00Z', reopenings: [], corrections: [],
};
const DASHBOARD = { reportDate: '2026-09-01', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18, confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4 };
const PERIOD = {
  reportedPeriod: '2026-09', periodIncomeCents: 129000000, operationalPaymentsCents: 0, operationalExpensesCents: 25000000, executedRefundsCents: 15000000,
  consolidatedCashTotalCents: 89000000, registeredCancellations: 2, registeredOperationalCostsCents: 48000000,
  individualMovementsCounted: 3, cashIncomeCents: 0, transferIncomeCents: 129000000,
};
const MONTHLY_SUMMARY = { reportedPeriod: '2026-09', confirmedSalesCents: 415000000, periodIncomeCents: 129000000, operationalCostsCents: 48000000, cancellations: 2 };
const routes = (): Record<string, Reply | Reply[]> => ({
  [`${BASE}/cash-days/current`]: { ok: DAY }, [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
  [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
  [`${BASE}/cash-closures?page=1&limit=100`]: { ok: page([CLOSURE]) }, [`${BASE}/cash-days/2026-08-31/movements?page=1&limit=100`]: { ok: page([]) },
  [`${BASE}/daily-dashboard`]: { ok: DASHBOARD },
  [`${BASE}/monthly-consolidations?page=1&limit=100`]: { ok: page([PERIOD]) }, [`${BASE}/monthly-reports/summary`]: { ok: MONTHLY_SUMMARY },
});
const ROUTES = () => fakeCashClient(routes());

describe('productionMountRegistersNoDemoAndOffersOnlyWhatItsAdaptersServe', () => {
  it.each(PRODUCTION_FILES)('%s imports nothing from src/app/demo and names no demo store', (file) => {
    const code = withoutComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/from\s+['"][^'"]*\/demo\//);
    expect(code).not.toMatch(/sources\.demo/);
    expect(code).not.toMatch(/\bDemo[A-Z]\w*|\w+DemoProviders\b/);
  });

  it('the production sources register the read ports, the dashboard and the writers of the opening, the base, the movements, the closing, the pending closing, the reopening and the correction, and call the container client only when a screen asks', () => {
    const { client, calls } = ROUTES();
    const providers = sourceProviders(client) as { provide: unknown }[];
    // The panel "Consulta" of the day is composed by the build too (plan D-02): the monthly link draws itself only where its area is offered.
    expect(providers.map((provider) => provider.provide)).toEqual([CashDaySource, CashClosuresSource, CashOpeningWriter, CashBaseWriter, CashMovementWriter, CashClosingWriter, CashPendingClosingWriter, CashReopeningWriter, CashCorrectionWriter, DailyDashboardSource, MonthlyReportSource, PeriodSummarySource, CASH_CONSULTATION_LINKS, CASH_CONSULTATION_LINKS, REPORTS_MONTHLY_BLOCKS, REPORTS_MONTHLY_BLOCKS]);
    expect(calls).toEqual([]);
  });

  it('registers the dashboard port and the two monthly ports, each over the container client (AC-RM.8)', () => {
    const tokens = (sourceProviders(ROUTES().client) as { provide: unknown }[]).map((provider) => provider.provide);
    for (const present of [DailyDashboardSource, MonthlyReportSource, PeriodSummarySource]) expect(tokens).toContain(present);
  });

  it('the demo build is the only one that swaps the sources, through the module:demo configuration', () => {
    const angular = JSON.parse(readFileSync('angular.json', 'utf8'));
    const module = angular.projects['cash-reporting-portal'].architect.module;
    expect(module.options.browser).toBe('src/mount-entry.ts');
    expect(module.options.fileReplacements).toBeUndefined();
    expect(module.configurations.demo.fileReplacements).toEqual([
      { replace: 'src/app/sources.ts', with: 'src/app/sources.demo.ts' },
    ]);
  });

  describe('mounted', () => {
    let host: HTMLElement;
    let cleanup: () => void;
    afterEach(() => { cleanup(); host.remove(); });

    const mountAs = (roles: string[], client = ROUTES().client) => {
      host = document.createElement('div');
      document.body.append(host);
      const props: MountProps = { apiClient: client, session: { roles, open: () => undefined, close: () => undefined } };
      cleanup = entry.mount(host, props);
    };
    const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

    it.each([
      { who: 'a final customer', roles: ['FINAL_CUSTOMER'] },
      { who: 'a session with no role', roles: [] as string[] },
    ])('offers no area, link or action to $who, and asks the service nothing', async ({ roles }) => {
      const { client, calls } = ROUTES();
      mountAs(roles, client);
      await vi.waitFor(() => expect(host.querySelector('.csh-portal')).toBeTruthy());
      expect(host.querySelectorAll('nav, a, button, form, input, select, [data-area]').length).toBe(0);
      expect(host.textContent?.trim()).toBe('');
      expect(calls).toEqual([]);
    });

    it('offers the tenant administrator "Caja" and "Reportes": the day from the service with the base action and the movement form and closing', async () => {
      mountAs(['TENANT_ADMINISTRATOR']);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-hero')).toBeTruthy());
      expect(Array.from(host.querySelectorAll('.csh-nav button')).map((b) => flat(b.textContent))).toEqual(['Caja', 'Reportes']);
      expect(flat(host.querySelector('.csh-cash-hero')?.textContent)).toContain('Efectivo esperado al cierre: $300.000.');
      // The movement form needs the closing writer too (`operable` of the register panel): the closing branch registers it.
      expect(host.querySelectorAll('.csh-cash-register form').length).toBe(1);
      expect(flat(host.querySelector('.csh-cash-register-head button')?.textContent)).toBe('Cerrar caja');
      expect(host.querySelector('csh-cash-reopening')).toBeNull();
      expect(flat(host.querySelector('.csh-cash-header button')?.textContent)).toBe('Ajustar base diaria');
      const links = Array.from(host.querySelectorAll('.csh-cash-links button')).map((b) => flat(b.textContent));
      expect(links).toEqual(['Historial de caja']);
    });

    it('closes the day from the screen through the container client: POST close with its Idempotency-Key, then the day is read again', async () => {
      const closed = { ...DAY, status: 'CLOSED', expectedCashCents: 30000000 };
      const { client, calls } = fakeCashClient({
        [`${BASE}/cash-days/current`]: [{ ok: DAY }, { ok: DAY }, { ok: closed }],
        [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
        [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
        [`${BASE}/cash-days/2026-09-01/close`]: { ok: closed },
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-register-head button')).toBeTruthy());
      (host.querySelector('.csh-cash-register-head button') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(flat(host.querySelector('.csh-cash-register .csh-cash-feedback')?.textContent)).toContain('Caja cerrada correctamente. Efectivo esperado: $300.000.'));
      const close = calls.find((call) => call.path.endsWith('/close'));
      expect(close?.init?.method).toBe('POST');
      expect(close?.init?.headers?.['Idempotency-Key']).toMatch(/^[\w-]{8,128}$/);
      expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
    });

    it('shows the generic message when the service refuses the closing with a 403', async () => {
      const { client } = fakeCashClient({
        [`${BASE}/cash-days/current`]: { ok: DAY }, [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
        [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
        [`${BASE}/cash-days/2026-09-01/close`]: { fail: { status: 403, code: 'FORBIDDEN', message: 'x', traceId: 't' } },
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-register-head button')).toBeTruthy());
      (host.querySelector('.csh-cash-register-head button') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(flat(host.querySelector('.csh-cash-register .csh-cash-feedback')?.textContent)).toBe('No se pudo completar la solicitud.'));
    });

    it('draws the reopening form on a closed day and sends the reason with POST reopen', async () => {
      const closed = { ...DAY, status: 'CLOSED' };
      const { client, calls } = fakeCashClient({
        [`${BASE}/cash-days/current`]: [{ ok: closed }, { ok: closed }, { ok: closed }, { ok: DAY }],
        [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
        [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
        [`${BASE}/cash-days/2026-09-01/reopen`]: { ok: DAY },
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await vi.waitFor(() => expect(host.querySelector('csh-cash-reopening textarea')).toBeTruthy());
      const area = host.querySelector('csh-cash-reopening textarea') as HTMLTextAreaElement;
      area.value = 'Se omitió un pago';
      area.dispatchEvent(new Event('input'));
      (host.querySelector('csh-cash-reopening button[type="submit"]') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(flat(host.querySelector('#csh-cash-reopening-notice')?.textContent)).toContain('Caja reabierta con motivo.'));
      const reopen = calls.find((call) => call.path.endsWith('/reopen'));
      expect(reopen?.init).toMatchObject({ method: 'POST', body: { reason: 'Se omitió un pago' } });
    });

    it('closes the pending day of an earlier date from the screen', async () => {
      const earlier = { ...DAY, businessDate: '2026-08-31', pendingClosure: true };
      const { client, calls } = fakeCashClient({
        [`${BASE}/cash-days/current`]: { ok: DAY }, [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
        [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: [{ ok: page([earlier]) }, { ok: page([earlier]) }, { ok: page([]) }],
        [`${BASE}/cash-days/2026-08-31/close`]: { ok: { ...earlier, pendingClosure: false, status: 'CLOSED' } },
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await vi.waitFor(() => expect(host.querySelector('csh-cash-pending-closure button')).toBeTruthy());
      (host.querySelector('csh-cash-pending-closure button') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(flat(host.querySelector('#csh-cash-pending-notice')?.textContent)).toContain('cerrada formalmente'));
      expect(calls.find((call) => call.path === `${BASE}/cash-days/2026-08-31/close`)?.init?.method).toBe('POST');
    });

    const openReportes = async () => {
      await vi.waitFor(() => expect(Array.from(host.querySelectorAll('.csh-nav button')).map((b) => flat(b.textContent))).toContain('Reportes'));
      (Array.from(host.querySelectorAll('.csh-nav button')).find((b) => flat(b.textContent) === 'Reportes') as HTMLButtonElement).click();
    };

    it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('productionMountOffersReportesWhenTheAdapterIsRegistered: %s reads the dashboard with one GET and no tenant (AC-DB.9)', async (role) => {
      const { client, calls } = ROUTES();
      mountAs([role], client);
      await openReportes();
      await vi.waitFor(() => expect(host.querySelector('dl.csh-reports-metrics')).toBeTruthy());
      expect(Array.from(host.querySelectorAll('.csh-reports-metric')).map((row) => flat(row.querySelector('.csh-reports-value')?.textContent))).toEqual(['12', '6', '18', '3', '2', '4']);
      expect(calls.filter((call) => call.path.endsWith('/daily-dashboard'))).toEqual([{ path: `${BASE}/daily-dashboard`, init: undefined }]);
    });

    it('shows the generic error with "Reintentar" when the dashboard is refused, with no status or code on the screen, and reads again on retry (AC-DB.10)', async () => {
      const { client, calls } = fakeCashClient({
        ...routes(),
        [`${BASE}/daily-dashboard`]: [{ fail: { status: 500, code: 'INTERNAL_ERROR', message: 'boom', traceId: 'trace-9' } }, { ok: DASHBOARD }],
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await openReportes();
      await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).toBeTruthy());
      expect(flat(host.querySelector('[role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
      expect(flat(host.textContent)).not.toMatch(/500|INTERNAL_ERROR|trace-9|boom/);
      (Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === 'Reintentar') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(host.querySelector('dl.csh-reports-metrics')).toBeTruthy());
      expect(calls.filter((call) => call.path.endsWith('/daily-dashboard')).length).toBe(2);
    });

    it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('productionMountOffersTheMonthlyViewsWhenTheAdaptersAreRegistered: %s reads the periods and the summary and no tenant (AC-RM.8)', async (role) => {
      const { client, calls } = ROUTES();
      mountAs([role], client);
      await openReportes();
      await vi.waitFor(() => expect(host.querySelector('csh-monthly-period')).toBeTruthy());
      await vi.waitFor(() => expect(host.querySelector('.csh-monthly-metric')).toBeTruthy());
      expect(flat(host.querySelector('csh-monthly-period h3')?.textContent)).toBe('Septiembre 2026');
      expect(flat(host.querySelector('.csh-monthly-metric .csh-reports-value')?.textContent)).toBe('$4.150.000');
      const monthly = calls.filter((call) => call.path.includes('/monthly-'));
      expect(monthly.map((call) => call.path).sort()).toEqual([`${BASE}/monthly-consolidations?page=1&limit=100`, `${BASE}/monthly-reports/summary`]);
      expect(JSON.stringify(monthly).toLowerCase()).not.toContain('tenant');
    });

    it('offers the sub-screen "Consolidación mensual" from the day to the Administrador, reading the periods of the service (AC-RM.8)', async () => {
      mountAs(['TENANT_ADMINISTRATOR']);
      await vi.waitFor(() => expect(host.querySelectorAll('.csh-cash-links button').length).toBe(2));
      (host.querySelectorAll('.csh-cash-links button')[1] as HTMLButtonElement).click();
      await vi.waitFor(() => expect(host.querySelector('#csh-monthly-title')).toBeTruthy());
      await vi.waitFor(() => expect(host.querySelector('csh-monthly-period')).toBeTruthy());
      expect(flat(host.querySelector('#csh-monthly-title')?.textContent)).toBe('Consolidación mensual');
      expect(flat(host.querySelector('csh-monthly-period h3')?.textContent)).toBe('Septiembre 2026');
    });

    it('shows the generic error with "Reintentar" in the monthly block only when the periods are refused, with no status or traceId (AC-RM.10)', async () => {
      const { client } = fakeCashClient({
        ...routes(),
        [`${BASE}/monthly-consolidations?page=1&limit=100`]: [{ fail: { status: 500, code: 'INTERNAL_ERROR', message: 'boom', traceId: 'trace-7' } }, { ok: page([PERIOD]) }],
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await openReportes();
      await vi.waitFor(() => expect(host.querySelector('[role="alert"]')).toBeTruthy());
      await vi.waitFor(() => expect(host.querySelector('dl.csh-reports-metrics')).toBeTruthy());
      expect(host.querySelectorAll('[role="alert"]').length).toBe(1);
      expect(flat(host.querySelector('[role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
      expect(flat(host.textContent)).not.toMatch(/500|INTERNAL_ERROR|trace-7|boom/);
      (Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === 'Reintentar') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(host.querySelector('csh-monthly-period')).toBeTruthy());
    });

    it('a role that only reads gets neither the form nor the closing', async () => {
      mountAs(['MANAGER']);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-hero')).toBeTruthy());
      expect(host.querySelectorAll('form, textarea').length).toBe(0);
      expect(host.querySelector('.csh-cash-register-head button')).toBeNull();
    });

    it('opens the history from the day with the closures of the service and the correction form of the Administrador, because its writer is registered', async () => {
      mountAs(['TENANT_ADMINISTRATOR']);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-links button')).toBeTruthy());
      (host.querySelector('.csh-cash-links button') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(host.querySelector('.csh-history-closure')).toBeTruthy());
      expect(flat(host.querySelector('.csh-history-closure h2')?.textContent)).toBe('Total: $300.000');
      expect(flat(host.querySelector('.csh-history-badge')?.textContent)).toBe('Cerrado');
      expect(host.querySelectorAll('textarea').length).toBeGreaterThan(0);
    });

    it('shows the error with "Reintentar" in Spanish when the service fails, and reads again on retry', async () => {
      const { client } = fakeCashClient({
        [`${BASE}/cash-days/current`]: [{ fail: { status: 503, code: 'SERVICE_UNAVAILABLE', message: 'This service is not available right now. Try again later.', traceId: 't' } }, { ok: DAY }],
        [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
        [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
      });
      mountAs(['TENANT_ADMINISTRATOR'], client);
      await vi.waitFor(() => expect(host.querySelector('[data-state="error"]')).toBeTruthy());
      expect(flat(host.querySelector('.csh-state-error')?.textContent)).toBe('No se pudo completar la solicitud.');
      const retry = Array.from(host.querySelectorAll('.csh-state button')).find((b) => flat(b.textContent) === 'Reintentar') as HTMLButtonElement;
      retry.click();
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-hero')).toBeTruthy());
    });
  });
});
