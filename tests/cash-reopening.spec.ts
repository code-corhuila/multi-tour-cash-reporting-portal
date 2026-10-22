import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashMovementWriter } from '../src/app/cash/data/cash-movement-writer';
import { CashReopeningResult, CashReopeningWriter } from '../src/app/cash/data/cash-reopening-writer';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { DemoCashClosingWriter, DemoCashClosuresSource, DemoCashDaySource, DemoCashMovementWriter, DemoCashReopeningWriter, DemoCashStore } from '../src/app/demo/cash-demo';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalActor } from '../src/app/shared/portal-capabilities';

// HU-CSH-001 (spec 001-, AC-CJ.15): screen 14, admin-caja.html, the panel "Reapertura" · "Reabrir la caja cerrada".
const CLOSED: CashDay = {
  businessDate: '2026-09-01', status: 'CLOSED', origin: 'OPERATIONAL_OPENING', openingBase: 30000000, openedBy: 'Fernanda Robayo (Administrador del tenant)', parametrizedBase: 30000000, movements: [],
  metrics: { income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: 30000000, expectedCash: 30000000, netTransfers: 0 },
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Day extends CashDaySource {
  reads = 0;
  constructor(public day: CashDay) { super(); }
  override today(): Promise<CashDay> { this.reads += 1; return Promise.resolve(this.day); }
}
class Reopening extends CashReopeningWriter {
  readonly calls: { reason: string; key: string }[] = [];
  next: () => Promise<CashReopeningResult> = () => Promise.resolve({ kind: 'reopened' });
  override reopen(reason: string, key: string): Promise<CashReopeningResult> { this.calls.push({ reason, key }); return this.next(); }
}
class Keys extends IdempotencyKeys { n = 0; override generate(): string { this.n += 1; return `key-${this.n}-00000000`; } }

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function render(roles: string[], options: { day?: CashDay; granted?: boolean; withWriter?: boolean } = {}) {
  const source = new Day(options.day ?? CLOSED);
  const reopening = new Reopening();
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, options.granted ?? false) },
    { provide: CashDaySource, useValue: source },
    { provide: IdempotencyKeys, useValue: new Keys() },
    { provide: CashMovementWriter, useValue: { register: () => Promise.reject(new Error('unused')) } },
    { provide: CashClosingWriter, useValue: { close: () => Promise.reject(new Error('unused')) } },
    { provide: CashBaseWriter, useValue: { adjust: () => Promise.reject(new Error('unused')) } },
    ...(options.withWriter === false ? [] : [{ provide: CashReopeningWriter, useValue: reopening }]),
  ] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const panel = () => host.querySelector('.csh-cash-reopening');
  const field = () => host.querySelector<HTMLTextAreaElement>('#csh-cash-reopening-reason');
  const write = async (value: string) => { const area = field()!; area.value = value; area.dispatchEvent(new Event('input', { bubbles: true })); await settle(fixture); };
  const submit = async () => { host.querySelector('.csh-cash-reopening form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await settle(fixture); };
  return { host, source, reopening, panel, field, write, submit };
}

describe('thePanelReabrirLaCajaCerradaIsDrawnOnlyOnAClosedDay', () => {
  it('is drawn with the mockup words on a closed day for the Administrador', async () => {
    const { panel, field } = await render(['TENANT_ADMINISTRATOR']);
    expect(flat(panel()!.querySelector('.csh-cash-eyebrow')!.textContent)).toBe('Reapertura');
    expect(flat(panel()!.querySelector('h2')!.textContent)).toBe('Reabrir la caja cerrada');
    expect(flat(panel()!.querySelector('label')!.textContent)).toBe('Motivo de la reapertura (obligatorio)');
    expect(field()!.placeholder).toBe('Describe por qué debe reabrirse la caja');
    expect(flat(panel()!.querySelector('button')!.textContent)).toBe('Reabrir caja');
  });

  it('is drawn for a Colaborador with Gestionar caja', async () => {
    const { panel } = await render(['OPERATIONAL_COLLABORATOR'], { granted: true });
    expect(panel()).not.toBeNull();
  });

  it.each([['OPEN_OPERATIVE'], ['OPEN_AUTOMATIC'], ['NO_OPENING']] as const)('is not drawn on a day that is %s', async (status) => {
    const { panel } = await render(['TENANT_ADMINISTRATOR'], { day: { ...CLOSED, status } });
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

describe('theReasonIsMandatoryAndGoesWithOneKeyPerIntention', () => {
  it.each([[''], ['   ']])('sends nothing for "%s" and tells it beside the field', async (typed) => {
    const { host, reopening, field, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    await write(typed);
    await submit();
    expect(reopening.calls).toEqual([]);
    expect(flat(host.querySelector('#csh-cash-reopening-error')!.textContent)).toBe('Registra el motivo obligatorio de la reapertura.');
    expect(field()!.getAttribute('aria-invalid')).toBe('true');
  });

  it('sends the reason trimmed, says it and reads the day again', async () => {
    const { host, source, reopening, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    await write('  Se olvidó registrar un gasto en efectivo  ');
    await submit();
    expect(reopening.calls).toEqual([{ reason: 'Se olvidó registrar un gasto en efectivo', key: 'key-1-00000000' }]);
    expect(flat(host.querySelector('#csh-cash-reopening-notice')!.textContent)).toBe('Caja reabierta con motivo. El cierre original se conserva en el historial y la reapertura queda auditada.');
    expect(source.reads).toBe(2);
  });

  it('tells why the service refused and keeps the panel and the reason', async () => {
    const { host, panel, field, reopening, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    reopening.next = () => Promise.resolve({ kind: 'refused', reason: 'NOT_CLOSED' });
    await write('Motivo válido');
    await submit();
    expect(flat(host.querySelector('#csh-cash-reopening-error')!.textContent)).toBe('La caja de hoy no está cerrada.');
    expect(panel()).not.toBeNull();
    expect(field()!.value).toBe('Motivo válido');
  });

  it('keeps the panel and reuses the key when the answer fails', async () => {
    const { host, reopening, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    reopening.next = () => Promise.reject(new Error('down'));
    await write('Motivo válido');
    await submit();
    await submit();
    expect(flat(host.querySelector('#csh-cash-reopening-error')!.textContent)).toBe('No se pudo completar la solicitud.');
    expect(reopening.calls.map((call) => call.key)).toEqual(['key-1-00000000', 'key-1-00000000']);
  });
});

const stores = () => {
  const store = new DemoCashStore({ now: () => Date.UTC(2026, 8, 1, 21, 5), actor: () => 'Administrador del tenant' });
  return { store, day: new DemoCashDaySource(store), closures: new DemoCashClosuresSource(store), closing: new DemoCashClosingWriter(store), reopening: new DemoCashReopeningWriter(store), movement: new DemoCashMovementWriter(store) };
};

describe('theDemoStoreReopensTheClosedCashAndKeepsEveryClosure', () => {
  it('opens the same cash again with the reason, who and when traced, and keeps the closure in the history marked as reopened', async () => {
    const { store, day, closures, closing, reopening } = stores();
    await closing.close('close-aaaaaaa');
    expect(await reopening.reopen('Falta un gasto', 'reopen-aaaaaa')).toEqual({ kind: 'reopened' });
    expect((await day.today()).status).toBe('OPEN_OPERATIVE');
    const [closure] = await closures.list();
    expect(closure).toMatchObject({ reopened: true, businessDate: '2026-09-01' });
    expect(closure.reopenings).toEqual([{ reopenedAt: expect.stringMatching(/^2026-09-01T\d\d:\d\d:00$/), reopenedBy: 'Administrador del tenant', reason: 'Falta un gasto' }]);
    expect(store).toBeDefined();
  });

  it('keeps each closing of the day: a second closing adds a closure and the first keeps its figures', async () => {
    const { day, closures, closing, reopening, movement } = stores();
    await closing.close('close-bbbbbbb');
    const first = (await closures.list())[0];
    await reopening.reopen('Falta un gasto', 'reopen-bbbbbb');
    await movement.register({ movementType: 'EXPENSE', concept: 'Taxi', amountCents: 1000000, paymentMedium: 'CASH' }, 'mov-bbbbbbb');
    await closing.close('close-ccccccc');
    const list = await closures.list();
    expect(list).toHaveLength(2);
    expect(list.map((c) => c.cashClosureId)).toEqual(['cl-2026-09-01-2', 'cl-2026-09-01']);
    expect(list[1]).toMatchObject({ expenses: first.expenses, reopened: true });
    expect(list[0].expenses).toBe(first.expenses + 1000000);
    expect((await day.today()).status).toBe('CLOSED');
  });

  it('refuses to reopen an open day and a blank reason, and applies a key once', async () => {
    const { day, closing, reopening } = stores();
    expect(await reopening.reopen('Motivo', 'reopen-cccccc')).toEqual({ kind: 'refused', reason: 'NOT_CLOSED' });
    await closing.close('close-ddddddd');
    expect(await reopening.reopen('   ', 'reopen-dddddd')).toEqual({ kind: 'refused', reason: 'REASON_REQUIRED' });
    await reopening.reopen('Motivo', 'reopen-eeeeee');
    await reopening.reopen('Otro', 'reopen-eeeeee');
    expect((await day.today()).status).toBe('OPEN_OPERATIVE');
  });

  it('reopens the closed day of the fixture closed-day-retry', async () => {
    history.replaceState({}, '', '/?demoFixtures=closed-day-retry');
    try {
      const { day, closures, reopening } = stores();
      expect(await reopening.reopen('Motivo', 'reopen-ffffff')).toEqual({ kind: 'reopened' });
      expect((await day.today()).status).toBe('OPEN_OPERATIVE');
      expect((await closures.list())[0].reopened).toBe(true);
    } finally { history.replaceState({}, '', '/'); }
  });
});
