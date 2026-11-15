import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashMovementWriter } from '../src/app/cash/data/cash-movement-writer';
import { CashOpeningResult, CashOpeningWriter } from '../src/app/cash/data/cash-opening-writer';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { DemoCashClosingWriter, DemoCashDaySource, DemoCashMovementWriter, DemoCashOpeningWriter, DemoCashStore } from '../src/app/demo/cash-demo';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalActor } from '../src/app/shared/portal-capabilities';

// HU-CSH-001 (spec 001-, AC-CJ.13): screen 14, admin-caja.html, the panel "Apertura operativa" · "Abrir la caja de hoy".
const NO_OPENING: CashDay = {
  businessDate: '2026-09-01', status: 'NO_OPENING', origin: null, openingBase: 0, openedBy: null, parametrizedBase: 30000000, movements: [],
  metrics: { income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: 0, expectedCash: null, netTransfers: 0 },
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Day extends CashDaySource {
  reads = 0;
  constructor(public day: CashDay) { super(); }
  override today(): Promise<CashDay> { this.reads += 1; return Promise.resolve(this.day); }
}
class Opening extends CashOpeningWriter {
  readonly calls: { baseCents: number; key: string }[] = [];
  next: () => Promise<CashOpeningResult> = () => Promise.resolve({ kind: 'opened', baseCents: 0 });
  override open(baseCents: number, key: string): Promise<CashOpeningResult> { this.calls.push({ baseCents, key }); return this.next(); }
}
class Keys extends IdempotencyKeys { n = 0; override generate(): string { this.n += 1; return `key-${this.n}-00000000`; } }

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function render(roles: string[], options: { day?: CashDay; granted?: boolean; withWriter?: boolean } = {}) {
  const source = new Day(options.day ?? NO_OPENING);
  const opening = new Opening();
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, options.granted ?? false) },
    { provide: CashDaySource, useValue: source },
    { provide: IdempotencyKeys, useValue: new Keys() },
    { provide: CashMovementWriter, useValue: { register: () => Promise.reject(new Error('unused')) } },
    { provide: CashClosingWriter, useValue: { close: () => Promise.reject(new Error('unused')) } },
    { provide: CashBaseWriter, useValue: { adjust: () => Promise.reject(new Error('unused')) } },
    ...(options.withWriter === false ? [] : [{ provide: CashOpeningWriter, useValue: opening }]),
  ] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const panel = () => host.querySelector('.csh-cash-opening');
  const button = () => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === 'Abrir caja') as HTMLButtonElement | undefined;
  const input = () => host.querySelector<HTMLInputElement>('#csh-cash-opening-input');
  const write = async (value: string) => { const field = input()!; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await settle(fixture); };
  const submit = async () => { host.querySelector('.csh-cash-opening form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await settle(fixture); };
  return { host, source, opening, panel, button, input, write, submit, settle: () => settle(fixture) };
}

describe('thePanelAbrirLaCajaDeHoyIsDrawnOnlyWhereTheDayNeedsTheOpening', () => {
  it.each([['NO_OPENING'], ['OPEN_AUTOMATIC']] as const)('is drawn with the mockup words on a day that is %s', async (status) => {
    const { panel, button } = await render(['TENANT_ADMINISTRATOR'], { day: { ...NO_OPENING, status } });
    expect(flat(panel()!.querySelector('.csh-cash-eyebrow')!.textContent)).toBe('Apertura operativa');
    expect(flat(panel()!.querySelector('h2')!.textContent)).toBe('Abrir la caja de hoy');
    expect(flat(panel()!.querySelector('label')!.textContent)).toBe('Base del día (efectivo físico)');
    expect(button()).toBeDefined();
  });

  it.each([['OPEN_OPERATIVE'], ['CLOSED']] as const)('is not drawn on a day that is %s', async (status) => {
    const { panel } = await render(['TENANT_ADMINISTRATOR'], { day: { ...NO_OPENING, status, origin: 'OPERATIONAL_OPENING' } });
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

describe('theAdministradorTypesTheBaseAndTheColaboradorOpensWithTheParametrizedOne', () => {
  it('starts the Administrador from the parametrized base and sends what is typed in cents with one key', async () => {
    const { source, opening, input, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    expect(input()!.value).toBe('300000');
    await write('250000');
    await submit();
    expect(opening.calls).toEqual([{ baseCents: 25000000, key: 'key-1-00000000' }]);
    expect(source.reads).toBe(2);
  });

  it('shows the Colaborador with Gestionar caja the parametrized base read only and sends exactly that', async () => {
    const { opening, input, submit } = await render(['OPERATIONAL_COLLABORATOR'], { granted: true });
    expect(input()!.readOnly).toBe(true);
    expect(input()!.value).toBe('300000');
    await submit();
    expect(opening.calls.map((call) => call.baseCents)).toEqual([30000000]);
  });

  it.each([[''], ['-1'], ['abc'], ['1.234']])('sends nothing for "%s" and tells it beside the field', async (typed) => {
    const { host, opening, input, write, submit } = await render(['TENANT_ADMINISTRATOR']);
    await write(typed);
    await submit();
    expect(opening.calls).toEqual([]);
    expect(flat(host.querySelector('#csh-cash-opening-error')!.textContent)).toBe('Registra una base diaria válida.');
    expect(input()!.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('theAnswerOfTheServiceIsToldAsTheMockupDoes', () => {
  it('says the base the cash was opened with and reads the day again', async () => {
    const { host, source, opening, submit } = await render(['TENANT_ADMINISTRATOR']);
    opening.next = () => Promise.resolve({ kind: 'opened', baseCents: 30000000 });
    await submit();
    expect(flat(host.querySelector('#csh-cash-opening-notice')!.textContent)).toBe('Caja abierta con una base de $300.000. Quedó registrada la apertura con su responsable, fecha y hora.');
    expect(source.reads).toBe(2);
  });

  it.each([
    ['ALREADY_OPEN', 'La caja de hoy ya tiene apertura operativa.'],
    ['DAY_CLOSED', 'La caja de hoy está cerrada: reábrela con motivo.'],
  ] as const)('tells why the service refused with %s and keeps the panel', async (reason, message) => {
    const { host, panel, opening, submit } = await render(['TENANT_ADMINISTRATOR']);
    opening.next = () => Promise.resolve({ kind: 'refused', reason });
    await submit();
    expect(flat(host.querySelector('#csh-cash-opening-error')!.textContent)).toBe(message);
    expect(panel()).not.toBeNull();
  });

  it('keeps the panel and reuses the key when the answer fails', async () => {
    const { host, opening, submit } = await render(['TENANT_ADMINISTRATOR']);
    opening.next = () => Promise.reject(new Error('down'));
    await submit();
    await submit();
    expect(flat(host.querySelector('#csh-cash-opening-error')!.textContent)).toBe('No se pudo completar la solicitud.');
    expect(opening.calls.map((call) => call.key)).toEqual(['key-1-00000000', 'key-1-00000000']);
  });
});

describe('theDemoStoreOpensTheCashOnce', () => {
  const stores = () => {
    const store = new DemoCashStore({ now: () => Date.UTC(2026, 8, 1, 21, 5), actor: () => 'Administrador del tenant' });
    return { day: new DemoCashDaySource(store), opening: new DemoCashOpeningWriter(store), movement: new DemoCashMovementWriter(store), closing: new DemoCashClosingWriter(store) };
  };
  const noOpening = () => history.replaceState({}, '', '/?demoFixtures=no-opening-day');
  afterEach(() => history.replaceState({}, '', '/'));

  it('opens a day without opening with the base, traced to who opened it, and lets cash be recorded afterwards', async () => {
    noOpening();
    const { day, opening, movement } = stores();
    expect((await day.today()).parametrizedBase).toBe(30000000);
    expect(await opening.open(25000000, 'open-aaaaaaa')).toEqual({ kind: 'opened', baseCents: 25000000 });
    const today = await day.today();
    expect(today).toMatchObject({ status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 25000000, openedBy: 'Administrador del tenant' });
    expect(today.metrics.expectedCash).toBe(25000000);
    expect(await movement.register({ movementType: 'EXPENSE', concept: 'Compra', amountCents: 100, paymentMedium: 'CASH' }, 'mov-aaaaaaa')).toMatchObject({ kind: 'registered' });
  });

  it('opens, with its operative origin, the cash a transfer created by itself, keeping its movements', async () => {
    noOpening();
    const { day, opening, movement } = stores();
    await movement.register({ movementType: 'INCOME', concept: 'Pago', amountCents: 500, paymentMedium: 'TRANSFER' }, 'mov-bbbbbbb');
    expect((await day.today()).status).toBe('OPEN_AUTOMATIC');
    await opening.open(30000000, 'open-bbbbbbb');
    const today = await day.today();
    expect(today).toMatchObject({ status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000 });
    expect(today.movements).toHaveLength(1);
  });

  it('applies a key once, refuses a second opening and refuses to open a closed day', async () => {
    noOpening();
    const { day, opening } = stores();
    await opening.open(100, 'open-ccccccc');
    await opening.open(999, 'open-ccccccc');
    expect((await day.today()).openingBase).toBe(100);
    expect(await opening.open(200, 'open-ddddddd')).toEqual({ kind: 'refused', reason: 'ALREADY_OPEN' });
    history.replaceState({}, '', '/');
    const closed = stores();
    await closed.closing.close('close-aaaaaaa');
    expect(await closed.opening.open(1, 'open-eeeeeee')).toEqual({ kind: 'refused', reason: 'DAY_CLOSED' });
  });
});
