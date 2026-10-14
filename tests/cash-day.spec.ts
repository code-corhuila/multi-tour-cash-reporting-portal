import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoCashDaySource } from '../src/app/demo/cash-demo';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import { CASH_CONSULTATION_LINKS } from '../src/app/shared/portal-slots';
import { PortalShellComponent } from '../src/app/shared/portal-shell.component';
import { listSourceFiles, withoutComments } from './source-files';

// HU-CSH-001 (spec 001-, tasks T-03 read side, T-06, T-10 read side): screen 14, admin-caja.html, as the portal DRAWS it.
// Amounts are cents. Demo day: 01 sep 2026, base $300.000, one income by transfer, one cash expense, one refund by transfer.
const LEGACY_CODES = /OPEN_OPERATIVE|OPEN_AUTOMATIC|NO_OPENING|CLOSED|\bCASH\b|TRANSFER|REFUND|INCOME|EXPENSE|OPERATIONAL_/;
const DAY: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000,
  openedBy: 'Fernanda Robayo (Administrador del tenant)',
  movements: [
    { cashMovementId: 'm1', movementType: 'INCOME', concept: 'Pago reserva #RES-1901', amount: 129000000, paymentMedium: 'TRANSFER', afterClosing: false, registeredAt: '2026-09-01T09:20:00', registeredBy: 'Fernanda Robayo' },
    { cashMovementId: 'm2', movementType: 'EXPENSE', concept: 'Compra operativa', amount: -25000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-09-01T11:45:00', registeredBy: 'Fernanda Robayo' },
    { cashMovementId: 'm3', movementType: 'REFUND', concept: 'Devolución reserva #RES-1902', amount: -15000000, paymentMedium: 'TRANSFER', afterClosing: false, registeredAt: '2026-09-01T14:10:00', registeredBy: 'Fernanda Robayo' },
  ],
  metrics: { income: 129000000, operationalPayments: 0, expenses: 25000000, refunds: 15000000, total: 119000000, expectedCash: 5000000, netTransfers: 114000000 },
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class SourceDouble extends CashDaySource {
  readonly reads: { resolve: (day: CashDay) => void; reject: (error: unknown) => void }[] = [];
  override today(): Promise<CashDay> { return new Promise((resolve, reject) => this.reads.push({ resolve, reject })); }
}
class FixedSource extends CashDaySource {
  constructor(private readonly day: CashDay) { super(); }
  override today(): Promise<CashDay> { return Promise.resolve(this.day); }
}

@Component({ selector: 'csh-test-link', template: '<a>Consolidación mensual</a>' })
class MonthlyLink {}

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
}

async function renderPage(source: CashDaySource, extra: unknown[] = []) {
  TestBed.configureTestingModule({ providers: [{ provide: CashDaySource, useValue: source }, ...(extra as never[])] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, settle: () => settle(fixture), text: () => flat(host.textContent) };
}

async function shellAs(roles: string[], withSource = true) {
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles) },
    ...(withSource ? [{ provide: CashDaySource, useValue: new FixedSource(DAY) }] : []),
  ] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, items: () => Array.from(host.querySelectorAll('.csh-nav button')).map((b) => flat(b.textContent)) };
}

/** [label, value, note] of each metric, read as a term and its values (pillar 7). */
const metrics = (host: HTMLElement) => Array.from(host.querySelectorAll('dl > div')).map((row) => [
  flat(row.querySelector('dt')?.textContent), flat(row.querySelector('dd.csh-cash-value')?.textContent), flat(row.querySelector('dd.csh-cash-note')?.textContent)]);

describe('cashAreaIsOfferedToEveryInternalRoleAndToNoOther', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('offers "Caja" and opens it to %s', async (role) => {
    const { host, items } = await shellAs([role]);
    expect(items()).toEqual(['Caja']);
    expect(host.querySelector('main h1')?.textContent?.trim()).toBe('Caja');
  });

  it.each([['a Cliente final', ['FINAL_CUSTOMER']], ['an unknown role', ['SUPPLIER']], ['no role', []]])('offers nothing to %s', async (_who, roles) => {
    const { host } = await shellAs(roles);
    expect(host.querySelectorAll('nav, button, main, h1').length).toBe(0);
  });

  it('does not offer the area in a build with no adapter for the day (production)', async () => {
    const { host } = await shellAs(['TENANT_ADMINISTRATOR'], false);
    expect(host.querySelectorAll('nav, main, h1').length).toBe(0);
  });
});

describe('theHeaderAndTheNoteFollowTheMockup', () => {
  it('writes the eyebrow, the title and the note about the single cash per day', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(Array.from(host.querySelectorAll('header p, header h1')).map((e) => flat(e.textContent))).toEqual(['Control diario', 'Caja']);
    expect(flat(host.querySelector('.csh-cash-access-note')?.textContent)).toBe('Cada tenant tiene una única caja por día calendario, que consolida todos los medios de pago. La abre, cierra y reabre el Administrador del tenant o un usuario con el permiso Gestionar caja (la reapertura exige motivo y queda auditada). La base representa solo efectivo físico y solo el Administrador del tenant puede modificarla.');
  });
});

describe('theHeadlineIsTheExpectedCashAndTheTotalIsAskedToTheSource', () => {
  it('draws the open day: status, headline of the expected cash, the consolidated total and the origin note', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    const hero = Array.from(host.querySelectorAll('.csh-cash-hero p, .csh-cash-hero h2')).map((e) => flat(e.textContent));
    expect(hero).toEqual([
      'Jornada abierta', 'Efectivo esperado al cierre: $50.000.',
      'Total consolidado de la jornada (todos los medios): $1.190.000 · incluye la base de $300.000.',
      'Apertura operativa por Fernanda Robayo (Administrador del tenant). La base representa solo efectivo físico; el efectivo esperado al cierre es la base más las entradas en efectivo menos las salidas en efectivo.']);
  });

  it.each([
    ['NO_OPENING', 'Sin apertura', 'La caja de hoy todavía no existe.', 'No aplica'],
    ['OPEN_AUTOMATIC', 'Abierta · creación automática', 'Efectivo esperado al cierre: no aplica (caja sin efectivo).', 'No aplica'],
  ] as const)('draws the day %s without cash: the expected cash is "No aplica"', async (status, label, headline, expected) => {
    const day: CashDay = { ...DAY, status, origin: null, openingBase: 0, openedBy: null, movements: [], metrics: { ...DAY.metrics, expectedCash: null } };
    const { host } = await renderPage(new FixedSource(day));
    const hero = Array.from(host.querySelectorAll('.csh-cash-hero p, .csh-cash-hero h2')).map((e) => flat(e.textContent));
    expect(hero.slice(0, 2)).toEqual([label, headline]);
    expect(metrics(host)[5].slice(0, 2)).toEqual(['Efectivo esperado', expected]);
    expect(flat(host.textContent)).not.toMatch(LEGACY_CODES);
  });

  it('leaves out the base of the consolidated line when the day has none, and draws the closed day', async () => {
    const day: CashDay = { ...DAY, status: 'CLOSED', openingBase: 0, metrics: { ...DAY.metrics, total: 8000000 } };
    const { host } = await renderPage(new FixedSource(day));
    const hero = Array.from(host.querySelectorAll('.csh-cash-hero p')).map((e) => flat(e.textContent));
    expect(hero[0]).toBe('Jornada cerrada');
    expect(hero[1]).toBe('Total consolidado de la jornada (todos los medios): $80.000.');
    expect(hero[2]).toMatch(/^La caja está cerrada\./);
  });
});

describe('theSevenMetricsReadWhatTheSourceResolved', () => {
  it('reads the seven labels, values and notes of the mockup in order over the seeded day', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(metrics(host)).toEqual([
      ['Base inicial', '$300.000', 'Efectivo físico de apertura'],
      ['Ingresos', '$1.290.000', 'Dinero efectivamente recibido (efectivo y transferencias validadas)'],
      ['Pagos operacionales', '$0', 'Obligaciones operativas del día'],
      ['Gastos', '$250.000', 'Salidas administrativas o menores'],
      ['Devoluciones', '$150.000', 'Salida efectiva de dinero ejecutada hoy'],
      ['Efectivo esperado', '$50.000', 'Base + entradas en efectivo - salidas en efectivo'],
      ['Transferencias netas', '$1.140.000', 'Se concilian aparte; no modifican el efectivo esperado'],
    ]);
  });

  it('shows what the source gives even when it would not add up, and a negative net transfer with its sign: the view computes none', async () => {
    const odd: CashDay = { ...DAY, openingBase: 111, metrics: { income: 222, operationalPayments: 333, expenses: 444, refunds: 555, total: 777700, expectedCash: 888, netTransfers: -25000000 } };
    const { host, text } = await renderPage(new FixedSource(odd));
    expect(metrics(host).map(([, value]) => value)).toEqual(['$1', '$2', '$3', '$4', '$6', '$9', '-$250.000']);
    expect(text()).toContain('Total consolidado de la jornada (todos los medios): $7.777 · incluye la base de $1.');
  });

  it('holds no calculation and no clock in the feature: the amounts and the day come resolved from the port', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/cash/') && file.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    const code = (file: string) => withoutComments(readFileSync(file, 'utf8')).replace(/'[^']*'|`[^`]*`|"[^"]*"/g, '""').replace(/<[^>]+>/g, '');
    expect(files.filter((file) => /[A-Za-z)\]]\s*[-+*/]\s*[A-Za-z(]|\.(reduce|filter|length)\b|Math\./.test(code(file)))).toEqual([]);
    expect(files.filter((file) => /Date\.now|new Date|Clock|localStorage|sessionStorage/.test(code(file)))).toEqual([]);
  });
});

describe('theMovementsTableShowsEachMovementWithItsMedium', () => {
  it('has the six columns and a row per movement, the refund included, in the order the source gave them', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(Array.from(host.querySelectorAll('thead th')).map((th) => flat(th.textContent))).toEqual(['Hora', 'Tipo', 'Concepto', 'Medio', 'Valor', 'Responsable']);
    const rows = Array.from(host.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => flat(td.textContent)));
    expect(rows).toEqual([
      ['09:20', 'Ingreso', 'Pago reserva #RES-1901', 'Transferencia', '$1.290.000', 'Fernanda Robayo'],
      ['11:45', 'Gasto', 'Compra operativa', 'Efectivo', '-$250.000', 'Fernanda Robayo'],
      ['14:10', 'Devolución', 'Devolución reserva #RES-1902', 'Transferencia', '-$150.000', 'Fernanda Robayo'],
    ]);
    expect(flat(host.textContent)).not.toMatch(LEGACY_CODES);
  });

  it('marks a transfer recorded after the closing under its medium, and an operational payment as "Pago operacional"', async () => {
    const day: CashDay = { ...DAY, status: 'CLOSED', movements: [
      { ...DAY.movements[0], afterClosing: true },
      { ...DAY.movements[1], movementType: 'OPERATIONAL_PAYMENT', amount: -3000000 }] };
    const { host } = await renderPage(new FixedSource(day));
    const medium = (row: number) => flat(host.querySelectorAll('tbody tr')[row].querySelectorAll('td')[3].textContent);
    expect(medium(0)).toBe('TransferenciaPosterior al cierre');
    expect(flat(host.querySelector('tbody tr td small')?.textContent)).toBe('Posterior al cierre');
    expect(medium(1)).toBe('Efectivo');
    expect(flat(host.querySelectorAll('tbody tr')[1].querySelectorAll('td')[1].textContent)).toBe('Pago operacional');
  });

  it('writes "Sin movimientos registrados hoy." when the day has none', async () => {
    const { host } = await renderPage(new FixedSource({ ...DAY, movements: [] }));
    expect(flat(host.querySelector('tbody')?.textContent)).toBe('Sin movimientos registrados hoy.');
  });
});

describe('cashDayShowsLoadingErrorWithRetryOrData', () => {
  it('shows loading, then an error with "Reintentar" that loads again, then the day', async () => {
    const source = new SourceDouble();
    const { host, settle: again } = await renderPage(source);
    expect(flat(host.querySelector('[data-state="loading"]')?.textContent)).toBe('Cargando…');
    source.reads[0].reject(new Error('down'));
    await again();
    expect(flat(host.querySelector('[role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar')!.click();
    await again();
    expect(source.reads.length).toBe(2);
    source.reads[1].resolve(DAY); await again();
    expect(host.querySelector('[data-state="data"]')).not.toBeNull();
    expect(metrics(host).length).toBe(7);
  });

  it('asks the port once per opening and with no argument: the session decides the tenant and the service the day', async () => {
    const source = new FixedSource(DAY);
    const today = vi.spyOn(source, 'today');
    await renderPage(source);
    expect(today).toHaveBeenCalledTimes(1);
    expect(today.mock.calls[0]).toEqual([]);
  });
});

describe('theConsultationPanelHoldsTheLinksOfOtherStories', () => {
  it('draws no panel while no story contributes a link, and the link of another story when it does', async () => {
    const { host } = await renderPage(new FixedSource(DAY));
    expect(host.querySelector('.csh-cash-consultation')).toBeNull();
    TestBed.resetTestingModule();
    const { host: other } = await renderPage(new FixedSource(DAY), [{ provide: CASH_CONSULTATION_LINKS, useValue: MonthlyLink, multi: true }]);
    expect(Array.from(other.querySelectorAll('.csh-cash-consultation p, .csh-cash-consultation h2, .csh-cash-consultation a')).map((e) => flat(e.textContent))).toEqual(['Consulta', 'Historial y consolidación', 'Consolidación mensual']);
  });
});

describe('theDemoStoreResolvesTheDayOfTheSpec', () => {
  it('seeds the day of 01 sep 2026 with the total as the formula and the expected cash apart from the transfers', async () => {
    const day = await new DemoCashDaySource().today();
    expect(day.businessDate).toBe('2026-09-01');
    expect(day.status).toBe('OPEN_OPERATIVE');
    expect(day.openingBase).toBe(30000000);
    // base + income - payments - expenses - refunds = 300.000 + 1.290.000 - 0 - 250.000 - 150.000
    expect(day.metrics).toEqual({ income: 129000000, operationalPayments: 0, expenses: 25000000, refunds: 15000000, total: 119000000, expectedCash: 5000000, netTransfers: 114000000 });
  });

  it('holds the pending transfer of RES-1903 without returning it as a row nor counting it', async () => {
    const day = await new DemoCashDaySource().today();
    expect(day.movements.map((m) => m.concept)).toEqual(['Pago reserva #RES-1901', 'Compra operativa', 'Devolución reserva #RES-1902']);
    expect(JSON.stringify(day)).not.toContain('RES-1903');
    expect(day.metrics.income).toBe(129000000);
  });

  it('counts the refund apart from the expenses', async () => {
    const day = await new DemoCashDaySource().today();
    expect(day.movements.find((m) => m.movementType === 'REFUND')).toMatchObject({ amount: -15000000, paymentMedium: 'TRANSFER' });
    expect(day.metrics.expenses).toBe(25000000);
    expect(day.metrics.refunds).toBe(15000000);
  });

  it('answers the fixtures: empty-cash-day (no movements, base only) and failing-cash-source (an error)', async () => {
    const demo = new DemoCashDaySource();
    history.replaceState({}, '', '/?demoFixtures=empty-cash-day');
    const empty = await demo.today();
    expect(empty.movements).toEqual([]);
    expect(empty.metrics).toEqual({ income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: 30000000, expectedCash: 30000000, netTransfers: 0 });
    history.replaceState({}, '', '/?demoFixtures=failing-cash-source');
    await expect(demo.today()).rejects.toBeTruthy();
  });

  it('only the demo build registers the demo source', () => {
    const providers = demoSources({ request: vi.fn() }) as { provide: unknown }[];
    expect(providers.map((p) => p.provide)).toContain(CashDaySource);
  });
});

describe('theCashFeatureDependsOnlyOnTheSharedBase', () => {
  it('imports from shared/ and from its own folders only', () => {
    const files = listSourceFiles().filter((file) => file.startsWith('src/app/cash/') && file.endsWith('.ts'));
    const allowed = [resolve('src/app/cash'), resolve('src/app/shared')];
    const outside = files.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']*)'/g)]
      .map(([, path]) => resolve(dirname(file), path)).filter((target) => !allowed.some((root) => target.startsWith(root))).map((target) => `${file}: ${target}`));
    expect(outside).toEqual([]);
  });
});
