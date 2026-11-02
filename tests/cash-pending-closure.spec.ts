import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashMovementWriter } from '../src/app/cash/data/cash-movement-writer';
import { CashPendingClosingResult, CashPendingClosingWriter } from '../src/app/cash/data/cash-pending-closing-writer';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { DemoCashClosingWriter, DemoCashClosuresSource, DemoCashDaySource, DemoCashPendingClosingWriter, DemoCashReopeningWriter, DemoCashStore } from '../src/app/demo/cash-demo';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalActor } from '../src/app/shared/portal-capabilities';

// HU-CSH-001 (spec 001-, AC-CJ.16): screen 14, admin-caja.html, the panel "Caja Pendiente de cierre" · "Hay una caja anterior sin cerrar".
const WITH_PENDING: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000, openedBy: 'Fernanda Robayo (Administrador del tenant)', movements: [],
  pendingClosure: { businessDate: '2026-08-31', openedBy: 'Fernanda Robayo (Administrador del tenant)', openingBase: 30000000 },
  metrics: { income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: 30000000, expectedCash: 30000000, netTransfers: 0 },
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Day extends CashDaySource {
  reads = 0;
  constructor(public day: CashDay) { super(); }
  override today(): Promise<CashDay> { this.reads += 1; return Promise.resolve(this.day); }
}
class Pending extends CashPendingClosingWriter {
  readonly calls: string[] = [];
  next: () => Promise<CashPendingClosingResult> = () => Promise.resolve({ kind: 'closed', businessDate: '2026-08-31', expectedCash: 38000000 });
  override closePending(key: string): Promise<CashPendingClosingResult> { this.calls.push(key); return this.next(); }
}
class Keys extends IdempotencyKeys { n = 0; override generate(): string { this.n += 1; return `key-${this.n}-00000000`; } }

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function render(roles: string[], options: { day?: CashDay; granted?: boolean; withWriter?: boolean } = {}) {
  const source = new Day(options.day ?? WITH_PENDING);
  const pending = new Pending();
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, options.granted ?? false) },
    { provide: CashDaySource, useValue: source },
    { provide: IdempotencyKeys, useValue: new Keys() },
    { provide: CashMovementWriter, useValue: { register: () => Promise.reject(new Error('unused')) } },
    { provide: CashClosingWriter, useValue: { close: () => Promise.reject(new Error('unused')) } },
    { provide: CashBaseWriter, useValue: { adjust: () => Promise.reject(new Error('unused')) } },
    ...(options.withWriter === false ? [] : [{ provide: CashPendingClosingWriter, useValue: pending }]),
  ] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const panel = () => host.querySelector('.csh-cash-pending');
  const button = () => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === 'Cerrar caja pendiente') as HTMLButtonElement | undefined;
  const close = async () => { button()!.click(); await settle(fixture); };
  return { host, source, pending, panel, button, close };
}

describe('thePanelHayUnaCajaAnteriorSinCerrarIsDrawnOnlyWhereThereIsAPendingCash', () => {
  it('is drawn with the mockup words for the Administrador, naming the day of the pending cash', async () => {
    const { panel, button } = await render(['TENANT_ADMINISTRATOR']);
    expect(flat(panel()!.querySelector('.csh-cash-eyebrow')!.textContent)).toBe('Caja Pendiente de cierre');
    expect(flat(panel()!.querySelector('h2')!.textContent)).toBe('Hay una caja anterior sin cerrar');
    expect(flat(panel()!.querySelector('p:not(.csh-cash-eyebrow)')!.textContent)).toBe('La caja del 31 ago 2026 tuvo apertura operativa y no se cerró al finalizar su día: quedó con la marca Pendiente de cierre. No acepta movimientos nuevos ni tiene efectivo final calculado por el sistema; la caja de hoy opera de forma independiente.');
    expect(button()).toBeDefined();
  });

  it('is drawn for a Colaborador with Gestionar caja', async () => {
    const { panel } = await render(['OPERATIONAL_COLLABORATOR'], { granted: true });
    expect(panel()).not.toBeNull();
  });

  it('is not drawn when the service reports no pending cash', async () => {
    const { panel } = await render(['TENANT_ADMINISTRATOR'], { day: { ...WITH_PENDING, pendingClosure: undefined } });
    expect(panel()).toBeNull();
  });

  it.each([
    ['a Colaborador without Gestionar caja', ['OPERATIONAL_COLLABORATOR'], false],
    ['an Analista', ['ANALYST'], false],
  ])('is not drawn for %s', async (_who, roles, granted) => {
    const { panel } = await render(roles, { granted });
    expect(panel()).toBeNull();
  });

  it('is not drawn where the build has no writer (production)', async () => {
    const { panel } = await render(['TENANT_ADMINISTRATOR'], { withWriter: false });
    expect(panel()).toBeNull();
  });
});

describe('theFormalClosingOfThePendingCashIsToldWithItsDateAndItsExpectedCash', () => {
  it('sends one key, says the closed day and the expected cash, and reads the day again', async () => {
    const { host, source, pending, close } = await render(['TENANT_ADMINISTRATOR']);
    await close();
    expect(pending.calls).toEqual(['key-1-00000000']);
    expect(flat(host.querySelector('#csh-cash-pending-notice')!.textContent)).toBe('Caja del 31 ago 2026 cerrada formalmente. Efectivo esperado: $380.000.');
    expect(source.reads).toBe(2);
  });

  it('tells that there is no pending cash anymore and keeps the panel when the service refuses', async () => {
    const { host, panel, pending, close } = await render(['TENANT_ADMINISTRATOR']);
    pending.next = () => Promise.resolve({ kind: 'refused', reason: 'NO_PENDING' });
    await close();
    expect(flat(host.querySelector('#csh-cash-pending-error')!.textContent)).toBe('No hay una caja anterior pendiente de cierre.');
    expect(panel()).not.toBeNull();
  });

  it('reuses the key when the answer fails', async () => {
    const { host, pending, close } = await render(['TENANT_ADMINISTRATOR']);
    pending.next = () => Promise.reject(new Error('down'));
    await close();
    await close();
    expect(flat(host.querySelector('#csh-cash-pending-error')!.textContent)).toBe('No se pudo completar la solicitud.');
    expect(pending.calls).toEqual(['key-1-00000000', 'key-1-00000000']);
  });
});

describe('theDemoStoreClosesThePendingCashKeepingItsDate', () => {
  const stores = () => {
    const store = new DemoCashStore({ now: () => Date.UTC(2026, 8, 1, 21, 5), actor: () => 'Administrador del tenant' });
    return {
      day: new DemoCashDaySource(store), closures: new DemoCashClosuresSource(store), pending: new DemoCashPendingClosingWriter(store),
      closing: new DemoCashClosingWriter(store), reopening: new DemoCashReopeningWriter(store),
    };
  };
  const withPending = () => history.replaceState({}, '', '/?demoFixtures=pending-closure-day');
  afterEach(() => history.replaceState({}, '', '/'));

  it('has no pending cash unless the fixture asks for it, and today operates independently with it', async () => {
    expect((await stores().day.today()).pendingClosure).toBeUndefined();
    withPending();
    const today = await stores().day.today();
    expect(today.pendingClosure).toEqual({ businessDate: '2026-08-31', openedBy: 'Fernanda Robayo (Administrador del tenant)', openingBase: 30000000 });
    expect(today.status).toBe('OPEN_OPERATIVE');
  });

  it('closes it formally with its own date, who closed it and the expected cash, leaving today open', async () => {
    withPending();
    const { day, closures, pending } = stores();
    expect(await pending.closePending('close-pend-aaa')).toEqual({ kind: 'closed', businessDate: '2026-08-31', expectedCash: 38000000 });
    expect((await day.today()).pendingClosure).toBeUndefined();
    expect((await day.today()).status).toBe('OPEN_OPERATIVE');
    const [closure] = await closures.list();
    expect(closure).toMatchObject({ businessDate: '2026-08-31', closedBy: 'Administrador del tenant', expectedCash: 38000000, closingMode: 'MANUAL', reopened: false });
  });

  it('keeps the closure of today as the first one of its day even with the pending one in the history', async () => {
    withPending();
    const { closures, pending, closing } = stores();
    await pending.closePending('close-pend-bbb');
    await closing.close('close-today-bbb');
    expect((await closures.list()).map((c) => [c.businessDate, c.cashClosureId])).toEqual([['2026-09-01', 'cl-2026-09-01'], ['2026-08-31', 'cl-2026-08-31']]);
  });

  it('applies a key once and refuses when nothing is pending', async () => {
    withPending();
    const { pending, closures } = stores();
    await pending.closePending('close-pend-ccc');
    await pending.closePending('close-pend-ccc');
    expect(await closures.list()).toHaveLength(1);
    expect(await pending.closePending('close-pend-ddd')).toEqual({ kind: 'refused', reason: 'NO_PENDING' });
  });
});
