import { Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashClosure, CashClosuresSource } from '../src/app/cash/data/cash-closures-source';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { MonthlyPeriod } from '../src/app/shared/monthly-period';
import { DemoCashClosuresSource, DemoCashStore } from '../src/app/demo/cash-demo';
import { PORTAL_AREAS } from '../src/app/shared/portal-areas';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import { PortalShellComponent } from '../src/app/shared/portal-shell.component';
import { CASH_CONSULTATION_LINKS } from '../src/app/shared/portal-slots';
import { CashHistoryLinkComponent, CashMonthlyLinkComponent } from '../src/app/cash/components/cash-consultation-links.component';
import { sourceProviders as demoSources } from '../src/app/sources.demo';

// HU-CSH-001 (spec 001- amended, T-07 read side) and HU-CSH-003 (T-01): the panel "Consulta / Historial y consolidación" of screen 14 and its two
// read-only sub-screens, admin-historial-caja.html and admin-consolidacion-mensual.html. Amounts are cents. Demo day: 01 sep 2026.
const LEGACY_CODES = /OPEN_OPERATIVE|OPEN_AUTOMATIC|NO_OPENING|CLOSED|AUTOMATIC|MANUAL|\bCASH\b|TRANSFER|REFUND|INCOME|EXPENSE|OPERATIONAL_|AFTER_/;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const ADMIN = 'Fernanda Robayo (Administrador del tenant)';
const peso = (n: number) => n * 100;
const TODAY: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: peso(300000), openedBy: ADMIN, movements: [],
  metrics: { income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: peso(300000), expectedCash: peso(300000), netTransfers: 0 },
};
const CLOSURE: CashClosure = {
  cashClosureId: 'cl-1', businessDate: '2026-08-31', closingMode: 'MANUAL', origin: 'OPERATIONAL_OPENING', reopened: false, openingBase: peso(300000),
  income: peso(800000), operationalPayments: 0, expenses: 0, refunds: 0, total: peso(1100000), expectedCash: peso(1100000),
  closedBy: ADMIN, closedAt: '2026-08-31T18:00:00', reopenings: [], corrections: [], movements: [], nonCashMovements: 0,
};
const AUTOMATIC: CashClosure = {
  ...CLOSURE, cashClosureId: 'cl-2', businessDate: '2026-08-30', closingMode: 'AUTOMATIC', origin: 'AUTOMATIC_CREATION', openingBase: 0, income: peso(200000),
  total: peso(200000), expectedCash: null, closedBy: 'Cierre automático (Multitour)', closedAt: '2026-08-30T23:59:00',
};
const SEP: MonthlyPeriod = {
  reportedPeriod: '2026-09', periodIncome: peso(3380000), operationalPayments: peso(300000), operationalExpenses: peso(500000),
  executedRefunds: 0, consolidatedCashTotal: peso(2580000), registeredCancellations: 2, registeredOperationalCosts: peso(480000),
};
const AUG: MonthlyPeriod = { ...SEP, reportedPeriod: '2026-08', periodIncome: peso(800000), operationalPayments: 0, operationalExpenses: 0, consolidatedCashTotal: peso(800000), registeredCancellations: 0, registeredOperationalCosts: 0 };

class Day extends CashDaySource { override today(): Promise<CashDay> { return Promise.resolve(TODAY); } }
class Closures extends CashClosuresSource {
  constructor(private readonly answer: () => Promise<readonly CashClosure[]>) { super(); }
  override list(): Promise<readonly CashClosure[]> { return this.answer(); }
}
class Monthly extends MonthlyReportSource {
  constructor(private readonly answer: () => Promise<readonly MonthlyPeriod[]>) { super(); }
  override periods(): Promise<readonly MonthlyPeriod[]> { return this.answer(); }
}

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function shellWith(roles: string[], providers: Provider[]) {
  TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(roles) }, ...providers] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === label) as HTMLButtonElement | undefined;
  const click = async (label: string) => { button(label)!.click(); await settle(fixture); };
  const text = () => flat(host.querySelector('main')?.textContent);
  const title = () => flat(host.querySelector('main h1')?.textContent);
  const active = () => flat(host.querySelector('.csh-nav [aria-current="page"]')?.textContent);
  return { host, button, click, text, title, active, settle: () => settle(fixture) };
}

const fakes = (closures: () => Promise<readonly CashClosure[]>, periods: () => Promise<readonly MonthlyPeriod[]>): Provider[] => [
  { provide: CashDaySource, useValue: new Day() },
  { provide: CashClosuresSource, useValue: new Closures(closures) },
  { provide: MonthlyReportSource, useValue: new Monthly(periods) },
  { provide: CASH_CONSULTATION_LINKS, useValue: CashHistoryLinkComponent, multi: true },
  { provide: CASH_CONSULTATION_LINKS, useValue: CashMonthlyLinkComponent, multi: true },
];
const withClosures = (list: readonly CashClosure[]) => fakes(() => Promise.resolve(list), () => Promise.resolve([SEP, AUG]));
const demo = (): Provider[] => demoSources({} as never);

/** [label, value] of each line of the panel that holds `heading`. */
const lines = (host: HTMLElement, heading: string): Record<string, string> => {
  const panel = Array.from(host.querySelectorAll('section.csh-history-closure')).find((p) => flat(p.querySelector('.csh-cash-eyebrow')?.textContent) === heading)!;
  return { Total: flat(panel.querySelector('h2')?.textContent).replace('Total: ', ''), ...Object.fromEntries(Array.from(panel.querySelectorAll('dl > div')).map((row) => [flat(row.querySelector('dt')?.textContent), flat(row.querySelector('dd')?.textContent)])) };
};

describe('cashAreasOfTheConsultation', () => {
  it('declares cash-history and cash-monthly as sub-screens of Caja', () => {
    for (const key of ['cash-history', 'cash-monthly']) {
      const area = PORTAL_AREAS.find((a) => a.key === key);
      expect(area?.menu).toBe(false);
      expect(area?.parent).toBe('cash');
    }
  });

  it('draws the panel with both links only where the build offers their areas, and a click opens each', async () => {
    const { host, button, click, title } = await shellWith(['TENANT_ADMINISTRATOR'], withClosures([CLOSURE]));
    expect(flat(host.querySelector('.csh-cash-consultation h2')?.textContent)).toBe('Historial y consolidación');
    expect(button('Historial de caja')).toBeDefined();
    expect(button('Consolidación mensual')).toBeDefined();
    await click('Historial de caja');
    expect(title()).toBe('Historial de caja');
  });

  it('linksAreDrawnOnlyWhenTheirAreaIsOffered', async () => {
    const onlyHistory = fakes(() => Promise.resolve([CLOSURE]), () => Promise.resolve([SEP])).filter((p) => (p as { provide: unknown }).provide !== MonthlyReportSource);
    const { button } = await shellWith(['TENANT_ADMINISTRATOR'], onlyHistory);
    expect(button('Historial de caja')).toBeDefined();
    expect(button('Consolidación mensual')).toBeUndefined();
    TestBed.resetTestingModule();
    const noHistory = fakes(() => Promise.resolve([CLOSURE]), () => Promise.resolve([SEP])).filter((p) => (p as { provide: unknown }).provide !== CashClosuresSource);
    const second = await shellWith(['TENANT_ADMINISTRATOR'], noHistory);
    expect(second.button('Historial de caja')).toBeUndefined();
    expect(second.button('Consolidación mensual')).toBeDefined();
  });

  it('theDemoBuildOffersBothLinks', async () => {
    const { button } = await shellWith(['TENANT_ADMINISTRATOR'], demo());
    expect(button('Historial de caja')).toBeDefined();
    expect(button('Consolidación mensual')).toBeDefined();
  });
});

describe('historyListsTheClosuresNewestFirstWithTheirValues', () => {
  it('the demo history starts empty as the mockup does, with its empty text', async () => {
    const { host, click, text } = await shellWith(['TENANT_ADMINISTRATOR'], demo());
    await click('Historial de caja');
    expect(text()).toContain('Aún no se han registrado cierres de caja.');
    expect(host.querySelectorAll('section.csh-history-closure').length).toBe(0);
  });

  it('shows 31 ago and 30 ago 2026 of the source, newest first, with the header and the note of the mockup', async () => {
    const { host, click, title, text, active } = await shellWith(['TENANT_ADMINISTRATOR'], withClosures([CLOSURE, AUTOMATIC]));
    await click('Historial de caja');
    expect(title()).toBe('Historial de caja');
    expect(flat(host.querySelector('main .csh-cash-eyebrow')?.textContent)).toBe('Control diario');
    expect(active()).toBe('Caja');
    expect(text()).toContain('Todo cierre queda conservado sin borrarse, con sus aperturas, reaperturas y movimientos.');
    expect(Array.from(host.querySelectorAll('section.csh-history-closure .csh-history-head .csh-cash-eyebrow')).map((h) => flat(h.textContent))).toEqual(['Cierre 31 ago 2026', 'Cierre 30 ago 2026']);
    expect(lines(host, 'Cierre 31 ago 2026')).toMatchObject({
      Total: '$1.100.000', Base: '$300.000', Ingresos: '$800.000', 'Pagos operacionales': '$0', Gastos: '$0', Devoluciones: '$0',
      'Efectivo esperado al cierre': '$1.100.000', 'Origen de la caja': 'Apertura operativa', 'Cerrado por': ADMIN, 'Fecha y hora de cierre': '31 ago 2026 · 18:00',
    });
    expect(Array.from(host.querySelectorAll('.csh-history-badge')).map((b) => flat(b.textContent))).toEqual(['Cerrado', 'Cierre automático']);
  });

  it('showsTheOriginOfTheCashAndTheExpectedCash: an automatic closure has no expected cash and says who closed it', async () => {
    const { host, click, text } = await shellWith(['TENANT_ADMINISTRATOR'], withClosures([CLOSURE, AUTOMATIC]));
    await click('Historial de caja');
    const auto = lines(host, 'Cierre 30 ago 2026');
    expect(auto['Total']).toBe('$200.000');
    expect(auto['Base']).toBe('$0');
    expect('Efectivo esperado al cierre' in auto).toBe(false);
    expect(auto['Origen de la caja']).toBe('Creación automática, sin apertura operativa ni efectivo (cierre automático)');
    expect(auto['Cerrado por']).toBe('Cierre automático (Multitour)');
    expect(text()).toContain('Sin correcciones registradas para este cierre.');
    expect(text()).not.toMatch(LEGACY_CODES);
  });

  it('draws reopenings, movements, corrections, the reopened badge and the late creation origin', async () => {
    const rich: CashClosure = {
      ...CLOSURE, reopened: true, origin: 'AUTOMATIC_CREATION', nonCashMovements: 1,
      reopenings: [{ reopenedAt: '2026-08-31T19:10:00', reopenedBy: ADMIN, reason: 'Falta registrar un gasto' }],
      corrections: [{ appliedAt: '2026-09-01T08:30:00', appliedBy: ADMIN, justification: 'Ajuste por error de digitación' }],
      movements: [
        { cashMovementId: 'a', movementType: 'INCOME', concept: 'Pago reserva #RES-1899', amount: peso(200000), paymentMedium: 'TRANSFER', afterClosing: true, registeredAt: '2026-08-31T20:00:00', registeredBy: 'Fernanda Robayo' },
        { cashMovementId: 'b', movementType: 'EXPENSE', concept: 'Compra operativa', amount: -peso(250000), paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-08-31T11:45:00', registeredBy: 'Fernanda Robayo' },
      ],
    };
    const { host, click, text } = await shellWith(['TENANT_ADMINISTRATOR'], withClosures([rich]));
    await click('Historial de caja');
    expect(flat(host.querySelector('.csh-history-badge')?.textContent)).toBe('Reabierto');
    expect(lines(host, 'Cierre 31 ago 2026')['Origen de la caja']).toBe('Creación automática con apertura operativa posterior');
    const rows = Array.from(host.querySelectorAll('tbody tr')).map((r) => Array.from(r.querySelectorAll('td')).map((c) => flat(c.textContent)));
    expect(rows).toContainEqual(['31 ago 2026 · 19:10', ADMIN, 'Falta registrar un gasto']);
    expect(rows).toContainEqual(['01 sep 2026 · 08:30', ADMIN, 'Ajuste por error de digitación']);
    expect(rows).toContainEqual(['20:00', 'Ingreso', 'Pago reserva #RES-1899', 'Transferencia · Posterior al cierre', '$200.000']);
    expect(rows).toContainEqual(['11:45', 'Gasto', 'Compra operativa', 'Efectivo', '-$250.000']);
    expect(text()).toContain('1 movimiento(s) no efectivo(s): se concilian aparte y no modifican el efectivo esperado.');
    expect(text()).not.toMatch(LEGACY_CODES);
  });

  it('theMockupHasNoClosuresUntilTheDayIsClosedFromTheFormAndThenItAppearsOnce', async () => {
    const store = new DemoCashStore({ now: () => Date.parse('2026-09-01T18:05:00'), actor: () => 'Administrador del tenant' });
    const source = new DemoCashClosuresSource(store);
    expect((await source.list()).map((c) => c.businessDate)).toEqual([]);
    store.close('k-1');
    store.close('k-2');
    const list = await source.list();
    expect(list.map((c) => c.businessDate)).toEqual(['2026-09-01']);
    expect(list[0]).toMatchObject({ closingMode: 'MANUAL', expectedCash: peso(50000), total: peso(1340000), closedBy: 'Administrador del tenant' });
  });
});

describe('historyIsReadOnly', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('offers %s only to read: no form, no field and a single "Volver a caja"', async (role) => {
    const { host, click, title } = await shellWith([role], withClosures([CLOSURE, AUTOMATIC]));
    await click('Historial de caja');
    expect(title()).toBe('Historial de caja');
    expect(host.querySelectorAll('main form, main input, main textarea, main select').length).toBe(0);
    expect(Array.from(host.querySelectorAll('main button')).map((b) => flat(b.textContent))).toEqual(['Volver a caja']);
  });

  it.each([['a Cliente final', ['FINAL_CUSTOMER']], ['an unknown role', ['SUPPLIER']], ['no role', []]])('offers nothing to %s', async (_who, roles) => {
    const { host } = await shellWith(roles, withClosures([CLOSURE]));
    expect(host.querySelectorAll('nav, button, main, h1').length).toBe(0);
  });
});

describe('everyConsultationScreenShowsOneOfTheFourStates', () => {
  it('history: loading, error with "Reintentar", empty and data', async () => {
    let attempt = 0;
    const pending: { resolve: (list: readonly CashClosure[]) => void }[] = [];
    const answer = () => {
      attempt += 1;
      if (attempt === 1) { return Promise.reject(new Error('down')); }
      return new Promise<readonly CashClosure[]>((resolve) => pending.push({ resolve }));
    };
    const { host, click, text, settle: again } = await shellWith(['TENANT_ADMINISTRATOR'], fakes(answer, () => Promise.resolve([SEP])));
    await click('Historial de caja');
    expect(text()).toContain('No se pudo completar la solicitud.');
    await click('Reintentar');
    expect(text()).toContain('Cargando…');
    pending[0].resolve([]);
    await again();
    expect(text()).toContain('Aún no se han registrado cierres de caja.');
    expect(host.querySelectorAll('section.csh-history-closure').length).toBe(0);
    await click('Volver a caja');
    pending.length = 0;
    await click('Historial de caja');
    pending[0].resolve([CLOSURE]);
    await again();
    expect(host.querySelectorAll('section.csh-history-closure').length).toBe(1);
  });

  it('monthly: error, empty and data', async () => {
    let attempt = 0;
    const answer = () => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('down')) : attempt === 2 ? Promise.resolve([]) : Promise.resolve([SEP]);
    };
    const { host, click, text, button } = await shellWith(['TENANT_ADMINISTRATOR'], fakes(() => Promise.resolve([CLOSURE]), answer));
    await click('Consolidación mensual');
    expect(text()).toContain('No se pudo completar la solicitud.');
    await click('Reintentar');
    expect(text()).toContain('Aún no hay movimientos registrados para consolidar.');
    await click('Volver a caja');
    await click('Consolidación mensual');
    expect(host.querySelectorAll('csh-monthly-period').length).toBe(1);
    expect(button('Reintentar')).toBeUndefined();
  });

  it('theDemoFixturesDriveTheStates', async () => {
    history.replaceState({}, '', '/?demoFixtures=failing-closures');
    const failing = await shellWith(['TENANT_ADMINISTRATOR'], demo());
    await failing.click('Historial de caja');
    expect(failing.text()).toContain('No se pudo completar la solicitud.');
    TestBed.resetTestingModule();
    history.replaceState({}, '', '/?demoFixtures=empty-closures');
    const empty = await shellWith(['TENANT_ADMINISTRATOR'], demo());
    await empty.click('Historial de caja');
    expect(empty.text()).toContain('Aún no se han registrado cierres de caja.');
  });
});

describe('consolidacionMensualOpensTheSubScreenAndVolverACajaReturns', () => {
  it('opens the sub-screen with the periods of the source, newest first, and goes back to Caja', async () => {
    const { host, click, title, text, active } = await shellWith(['ACCOUNTANT'], withClosures([CLOSURE]));
    await click('Consolidación mensual');
    expect(title()).toBe('Consolidación mensual');
    expect(flat(host.querySelector('main .csh-cash-eyebrow')?.textContent)).toBe('Control económico');
    expect(active()).toBe('Caja');
    expect(text()).toContain('El total del mes se construye con todos los movimientos individuales del período');
    expect(Array.from(host.querySelectorAll('csh-monthly-period h3')).map((h) => flat(h.textContent))).toEqual(['Septiembre 2026', 'Agosto 2026']);
    expect(flat(host.querySelector('csh-monthly-period')?.textContent)).toContain('Total consolidado de caja del período$2.580.000');
    expect(Array.from(host.querySelectorAll('main button')).map((b) => flat(b.textContent))).toEqual(['Volver a caja']);
    await click('Volver a caja');
    expect(title()).toBe('Caja');
    expect(active()).toBe('Caja');
  });

  it('is offered to the five internal roles and to no other', async () => {
    for (const role of ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST']) {
      TestBed.resetTestingModule();
      const { button } = await shellWith([role], demo());
      expect(button('Consolidación mensual')).toBeDefined();
    }
    TestBed.resetTestingModule();
    const { host } = await shellWith(['FINAL_CUSTOMER'], demo());
    expect(host.querySelectorAll('button').length).toBe(0);
  });
});
