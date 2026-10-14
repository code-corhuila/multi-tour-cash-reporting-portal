import { readFileSync } from 'node:fs';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { DemoDailyDashboardSource } from '../src/app/demo/reports-demo';
import { DailyDashboard, DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { ReportsPageComponent } from '../src/app/reports/pages/reports-page.component';
import type { MountProps } from '../src/app/shell-contract';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { formatMonth } from '../src/app/shared/format';
import { PortalActor, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { CONTAINER_NAVIGATION, REPORTS_MONTHLY_BLOCKS } from '../src/app/shared/portal-slots';
import { PortalShellComponent } from '../src/app/shared/portal-shell.component';
import { listSourceFiles, withoutComments } from './source-files';

// HU-CSH-002 (spec 002-, tasks T-01 and T-02): screen 16 of the mockup, admin-reportes.html, article "Dashboard diario".
// Demo day: 03 sep 2026, created 12, pending 6, confirmed 18, with balance 3, cancelled 2, about to run 4 (spec section 6).
const DAY: DailyDashboard = {
  reportDate: '2026-09-03', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18,
  confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4,
};
const ODD: DailyDashboard = { ...DAY, createdReservations: 7, pendingPaymentReservations: 0, confirmedReservations: 1, confirmedWithBalance: 5, cancelledReservations: 9, upcomingServices: 2 };
const LABELS = ['Reservas creadas hoy', 'Pendientes de pago', 'Confirmadas', 'Confirmadas con saldo', 'Canceladas', 'Próximas a ejecutar'];
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

/** The port under the test's control: each read waits for resolve or reject. */
class SourceDouble extends DailyDashboardSource {
  readonly reads: { resolve: (day: DailyDashboard) => void; reject: (error: unknown) => void }[] = [];
  override today(): Promise<DailyDashboard> { return new Promise((resolve, reject) => this.reads.push({ resolve, reject })); }
}
class FixedSource extends DailyDashboardSource {
  constructor(private readonly day: DailyDashboard) { super(); }
  override today(): Promise<DailyDashboard> { return Promise.resolve(this.day); }
}

@Component({ selector: 'csh-test-monthly', template: '<article>Reporte mensual</article>' })
class Monthly {}

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
}

async function renderPage(source: DailyDashboardSource, extra: unknown[] = []) {
  TestBed.configureTestingModule({ providers: [{ provide: DailyDashboardSource, useValue: source }, ...(extra as never[])] });
  const fixture = TestBed.createComponent(ReportsPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, fixture, settle: () => settle(fixture), page: fixture.componentInstance, text: () => flat(host.textContent) };
}

/** [label, value] of each indicator, read as a term and its value (pillar 7). */
const indicators = (host: HTMLElement) => Array.from(host.querySelectorAll('dl > div')).map((row) => [flat(row.querySelector('dt')?.textContent), flat(row.querySelector('dd.csh-reports-value')?.textContent)]);

async function shellAs(roles: string[], withSource = true) {
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles) },
    ...(withSource ? [{ provide: DailyDashboardSource, useValue: new FixedSource(DAY) }] : []),
  ] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, fixture, items: () => Array.from(host.querySelectorAll('.csh-nav button')).map((b) => flat(b.textContent)) };
}

describe('reportsAreaIsOfferedToEveryInternalRoleAndToNoOther', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('offers "Reportes" and opens it to %s', async (role) => {
    expect(PortalCapabilities.for(role).canReadReports()).toBe(true);
    const { host, items } = await shellAs([role]);
    expect(items()).toEqual(['Reportes']);
    expect(host.querySelector('main h1')?.textContent?.trim()).toBe('Reportes');
  });

  it.each([['a Cliente final', ['FINAL_CUSTOMER']], ['an unknown role', ['SUPPLIER']], ['no role', []]])('offers nothing to %s', async (_who, roles) => {
    expect(PortalCapabilities.for(roles[0] ?? '').canReadReports()).toBe(false);
    const { host } = await shellAs(roles);
    expect(host.querySelectorAll('nav, button, main, h1').length).toBe(0);
  });

  it('does not offer the area in a build with no adapter for the dashboard (production)', async () => {
    const { host } = await shellAs(['TENANT_ADMINISTRATOR'], false);
    expect(host.querySelectorAll('nav, main, h1').length).toBe(0);
  });
});

describe('reportsHeaderAndHeroFollowTheMockupWithoutExportar', () => {
  it('writes the header, the hero with the month of the report date and the article head, and draws no export', async () => {
    const { host, text } = await renderPage(new FixedSource(DAY));
    expect(Array.from(host.querySelectorAll('header p, header h1')).map((e) => flat(e.textContent))).toEqual(['Consultas operativas', 'Reportes']);
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Reportes');
    expect(Array.from(host.querySelectorAll('.csh-reports-hero p, .csh-reports-hero h2')).map((e) => flat(e.textContent))).toEqual([
      'Septiembre 2026', 'Información consolidada para decidir con claridad.',
      'Consulta reservas, ejecución, costos y caja sin mezclar la información de otros operadores. Las fechas se interpretan en la zona horaria del tenant.']);
    expect(flat(host.querySelector('article')?.querySelector('p, h2')?.textContent)).toBe('Dashboard diario');
    expect(text()).toContain('Seguimiento operativo');
    expect(text()).not.toMatch(/Exportar|CSV|PDF|solo de consulta|Ventas confirmadas|Reporte mensual/);
    expect(host.querySelector('header button, header a')).toBeNull();
  });

  it('writes the month in full from any report date', () => {
    expect(formatMonth('2026-09-03')).toBe('Septiembre 2026');
    expect(formatMonth('2027-01-15T10:00:00')).toBe('Enero 2027');
    expect(formatMonth('sin fecha')).toBe('sin fecha');
  });

  it('leaves the month out while the day is not known', async () => {
    const source = new SourceDouble();
    const { host } = await renderPage(source);
    expect(host.querySelector('.csh-reports-hero [data-month]')).toBeNull();
    expect(flat(host.querySelector('.csh-reports-hero')?.textContent)).not.toMatch(/\d{4}/);
  });

  it('draws nothing in the place of the monthly blocks while none is provided, and the block of another story when it is', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(host.querySelectorAll('.csh-reports-grid > *').length).toBe(1);
    TestBed.resetTestingModule();
    const { host: other } = await renderPage(new FixedSource(DAY), [{ provide: REPORTS_MONTHLY_BLOCKS, useValue: Monthly, multi: true }]);
    expect(flat(other.querySelector('.csh-reports-grid')?.textContent)).toContain('Reporte mensual');
  });
});

describe('dashboardShowsLoadingErrorWithRetryOrData', () => {
  it('shows loading, then an error with "Reintentar" that loads again, then the data', async () => {
    const source = new SourceDouble();
    const { host, settle: again } = await renderPage(source);
    expect(flat(host.querySelector('[data-state="loading"]')?.textContent)).toBe('Cargando…');
    source.reads[0].reject(new Error('down'));
    await again();
    expect(flat(host.querySelector('[role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
    const retry = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!;
    retry.click(); await again();
    expect(source.reads.length).toBe(2);
    expect(host.querySelector('[data-state="loading"]')).not.toBeNull();
    source.reads[1].resolve(DAY); await again();
    expect(host.querySelector('[data-state="data"]')).not.toBeNull();
    expect(indicators(host).length).toBe(6);
  });
});

describe('dashboardShowsTheSixIndicatorsWithTheMockupLabels', () => {
  it('reads the six labels in order over the seeded day', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(indicators(host)).toEqual(LABELS.map((label, i) => [label, String([12, 6, 18, 3, 2, 4][i])]));
    expect(host.querySelector('dl')).not.toBeNull();
  });

  it('writes the notes of the mockup under their indicators and no other', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    const notes = Array.from(host.querySelectorAll('dl > div')).map((row) => flat(row.querySelector('.csh-reports-note')?.textContent));
    expect(notes).toEqual(['', 'Aún sin el abono mínimo: cupo sin confirmar', 'Incluye las confirmadas con saldo', 'Con abono recibido y saldo por completar', '', '']);
  });
});

describe('confirmedCarriesItsNoteAndTheViewShowsTheSourceNumbersUnchanged', () => {
  it('shows what the source gives even when it would not add up: the view computes none', async () => {
    const { host, text } = await renderPage(new FixedSource(ODD));
    expect(indicators(host).map(([, value]) => value)).toEqual(['7', '0', '1', '5', '9', '2']);
    expect(text()).toContain('Incluye las confirmadas con saldo');
  });

  it('holds no calculation on the numbers in the feature', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/reports/') && file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const arithmetic = files.filter((file) => /[A-Za-z)\]]\s*[-+*/]\s*[A-Za-z(]|\.(reduce|filter|length)\b|Math\./.test(
      withoutComments(readFileSync(file, 'utf8')).replace(/'[^']*'|`[^`]*`|"[^"]*"/g, '""').replace(/<[^>]+>/g, '')));
    expect(arithmetic).toEqual([]);
  });
});

describe('aDayWithoutReservationsShowsSixZeros', () => {
  it('shows six zeros with no empty text and no error', async () => {
    const zero: DailyDashboard = { ...DAY, createdReservations: 0, pendingPaymentReservations: 0, confirmedReservations: 0, confirmedWithBalance: 0, cancelledReservations: 0, upcomingServices: 0 };
    const { host } = await renderPage(new FixedSource(zero));
    expect(indicators(host).map(([, value]) => value)).toEqual(['0', '0', '0', '0', '0', '0']);
    expect(host.querySelector('[data-state="empty"], [role="alert"], [data-state="loading"]')).toBeNull();
  });

  it('the demo answers six zeros for the fixture empty-day, an error for failing-dashboard, and the seed otherwise', async () => {
    const demo = new DemoDailyDashboardSource();
    expect(await demo.today()).toEqual(DAY);
    history.replaceState({}, '', '/?demoFixtures=empty-day');
    expect(await demo.today()).toEqual({ ...DAY, createdReservations: 0, pendingPaymentReservations: 0, confirmedReservations: 0, confirmedWithBalance: 0, cancelledReservations: 0, upcomingServices: 0 });
    history.replaceState({}, '', '/?demoFixtures=failing-dashboard');
    await expect(demo.today()).rejects.toBeTruthy();
  });

  it('only the demo build registers the demo source', () => {
    const providers = demoSources({ request: vi.fn() }) as { provide: unknown }[];
    expect(providers.map((p) => p.provide)).toContain(DailyDashboardSource);
  });
});

describe('theDashboardIsAskedWithNoTenantOfThePortal', () => {
  it('asks the port once per opening and with no argument: the session decides the tenant', async () => {
    const source = new FixedSource(DAY);
    const today = vi.spyOn(source, 'today');
    await renderPage(source);
    expect(today).toHaveBeenCalledTimes(1);
    expect(today.mock.calls[0]).toEqual([]);
  });
});

describe('optionalRolesSeeTheDashboardWithNoAction', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('%s sees the six numbers and no button in the content area', async (role) => {
    const { host } = await shellAs([role]);
    const content = host.querySelector('main')!;
    expect(indicators(content as HTMLElement).map(([, value]) => value)).toEqual(['12', '6', '18', '3', '2', '4']);
    expect(content.querySelectorAll('button, input, select, textarea, form').length).toBe(0);
  });
});

describe('aNewerLoadReplacesAnOlderOne', () => {
  it('shows the answer of the newest load even when an older one answers later', async () => {
    const source = new SourceDouble();
    const { host, page, settle: again } = await renderPage(source);
    page.reload();
    await again();
    expect(source.reads.length).toBe(2);
    source.reads[1].resolve(ODD); await again();
    source.reads[0].resolve(DAY); await again();
    expect(indicators(host).map(([, value]) => value)).toEqual(['7', '0', '1', '5', '9', '2']);
  });
});

describe('irAReservasAsksTheContainerToOpenReservationsOrIsNotDrawn', () => {
  const link = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('button.csh-reports-link')).find((l) => l.textContent?.trim() === 'Ir a reservas');

  it('asks the container to open Reservas of the commercial portal, by click and by Enter', async () => {
    const navigate = vi.fn();
    const { host } = await renderPage(new FixedSource(DAY), [{ provide: PortalActor, useValue: PortalActor.from(['MANAGER']) }, { provide: CONTAINER_NAVIGATION, useValue: navigate }]);
    link(host)!.click();
    link(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navigate).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith({ portal: 'commercial-reservation-portal', area: 'reservations' });
    expect(link(host)!.getAttribute('tabindex')).toBe('0');
  });

  it('is not drawn while the container offers no navigation', async () => {
    const { host, text } = await renderPage(new FixedSource(DAY));
    expect(link(host)).toBeUndefined();
    expect(text()).not.toContain('Ir a reservas');
  });

  it('reaches the page from the container props of the mount contract', async () => {
    const navigate = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const props = { apiClient: { request: vi.fn() } as never, session: { roles: ['MANAGER'], open: () => undefined, close: () => undefined }, navigate, initialParams: { area: 'reports' } } as MountProps;
    const cleanup = entry.mountWith(host, props, demoSources);
    await vi.waitFor(() => expect(link(host)).toBeTruthy());
    link(host)!.click();
    expect(navigate).toHaveBeenCalledWith({ portal: 'commercial-reservation-portal', area: 'reservations' });
    cleanup(); host.remove();
  });
});

describe('reportsTextsAreSpanishWithAccentsAndNoRawCodes', () => {
  it('writes the screen in Spanish with accents and shows no field name, code or placeholder', async () => {
    const { text } = await renderPage(new FixedSource(DAY), [{ provide: CONTAINER_NAVIGATION, useValue: vi.fn() }]);
    for (const word of ['Información', 'ejecución', 'Próximas', 'mínimo', 'Confirmadas con saldo']) { expect(text()).toContain(word); }
    expect(text()).not.toMatch(/createdReservations|pendingPayment|upcomingServices|[A-Z]{3,}_[A-Z_]+|undefined|NaN|null|\[object/);
  });

  it('keeps the texts in reports-copy.ts, not in the template', () => {
    const copy = readFileSync('src/app/reports/reports-copy.ts', 'utf8');
    expect(copy).toContain('Seguimiento operativo');
    for (const file of ['src/app/reports/pages/reports-page.component.ts', 'src/app/reports/components/daily-dashboard.component.ts']) {
      const template = /template:\s*`([\s\S]*?)`/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
      expect(template.replace(/\{\{[^}]*\}\}|<[^>]*>|@\w+[^\n{<]*\{?|[{}]/g, '').trim()).toBe('');
    }
  });

  it('keeps role names out of the feature (pillar 4) and imports only shared/ from outside it (pillar 10)', () => {
    const files = listSourceFiles().filter((file) => /^src\/app\/(reports|demo\/reports-demo)/.test(file));
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      expect(code).not.toMatch(/TENANT_ADMINISTRATOR|OPERATIONAL_COLLABORATOR|MANAGER|ACCOUNTANT|ANALYST|FINAL_CUSTOMER/);
      const outside = [...code.matchAll(/from\s+'(\.\.\/[^']*)'/g)].map(([, path]) => path).filter((path) => !/(^|\/)(shared|reports|cash\/data)\//.test(path) &&!/^\.\.\/(data|components|pages)\//.test(path) && !/^\.\.\/reports-copy$/.test(path) && !/^\.\.\/reports\//.test(path));
      expect(outside, file).toEqual([]);
    }
  });
});
