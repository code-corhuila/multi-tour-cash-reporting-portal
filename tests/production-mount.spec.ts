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
import { fakeCashClient, page } from './cash-api-client.double';
import { CASH_CONSULTATION_LINKS } from '../src/app/shared/portal-slots';
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
const ROUTES = () => fakeCashClient({
  [`${BASE}/cash-days/current`]: { ok: DAY }, [`${BASE}/cash-days/2026-09-01/movements?page=1&limit=100`]: { ok: page([]) },
  [`${BASE}/cash-days?pendingClosure=true&page=1&limit=1`]: { ok: page([]) },
  [`${BASE}/cash-closures?page=1&limit=100`]: { ok: page([CLOSURE]) }, [`${BASE}/cash-days/2026-08-31/movements?page=1&limit=100`]: { ok: page([]) },
});

describe('productionMountRegistersNoDemoAndOffersOnlyWhatItsAdaptersServe', () => {
  it.each(PRODUCTION_FILES)('%s imports nothing from src/app/demo and names no demo store', (file) => {
    const code = withoutComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/from\s+['"][^'"]*\/demo\//);
    expect(code).not.toMatch(/sources\.demo/);
    expect(code).not.toMatch(/\bDemo[A-Z]\w*|\w+DemoProviders\b/);
  });

  it('the production sources register the read ports and the writers of the opening, the base and the movements, and call the container client only when a screen asks', () => {
    const { client, calls } = ROUTES();
    const providers = sourceProviders(client) as { provide: unknown }[];
    // The panel "Consulta" of the day is composed by the build too (plan D-02): the monthly link draws itself only where its area is offered.
    expect(providers.map((provider) => provider.provide)).toEqual([CashDaySource, CashClosuresSource, CashOpeningWriter, CashBaseWriter, CashMovementWriter, CASH_CONSULTATION_LINKS, CASH_CONSULTATION_LINKS]);
    expect(calls).toEqual([]);
  });

  it('registers no closing, reopening, pending closing or correction writer, no dashboard and no monthly port yet (next branches)', () => {
    const tokens = (sourceProviders(ROUTES().client) as { provide: unknown }[]).map((provider) => provider.provide);
    for (const absent of [CashClosingWriter, CashReopeningWriter, CashPendingClosingWriter, CashCorrectionWriter, MonthlyReportSource, DailyDashboardSource]) expect(tokens).not.toContain(absent);
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

    it('offers the tenant administrator only "Caja": the day from the service with the base and movement forms, no Reportes', async () => {
      mountAs(['TENANT_ADMINISTRATOR']);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-hero')).toBeTruthy());
      expect(Array.from(host.querySelectorAll('.csh-nav button')).map((b) => flat(b.textContent))).toEqual(['Caja']);
      expect(flat(host.querySelector('.csh-cash-hero')?.textContent)).toContain('Efectivo esperado al cierre: $300.000.');
      expect(host.querySelectorAll('form').length).toBeGreaterThan(0);
      const links = Array.from(host.querySelectorAll('.csh-cash-links button')).map((b) => flat(b.textContent));
      expect(links).toEqual(['Historial de caja']);
    });

    it('opens the history from the day with the closures of the service and no correction form, because its writer is not registered', async () => {
      mountAs(['TENANT_ADMINISTRATOR']);
      await vi.waitFor(() => expect(host.querySelector('.csh-cash-links button')).toBeTruthy());
      (host.querySelector('.csh-cash-links button') as HTMLButtonElement).click();
      await vi.waitFor(() => expect(host.querySelector('.csh-history-closure')).toBeTruthy());
      expect(flat(host.querySelector('.csh-history-closure h2')?.textContent)).toBe('Total: $300.000');
      expect(flat(host.querySelector('.csh-history-badge')?.textContent)).toBe('Cerrado');
      expect(host.querySelectorAll('form, textarea').length).toBe(0);
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
