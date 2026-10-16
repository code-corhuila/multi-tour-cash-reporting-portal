import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashBaseResult, CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashMovementWriter } from '../src/app/cash/data/cash-movement-writer';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { DemoCashBaseWriter, DemoCashClosingWriter, DemoCashDaySource, DemoCashStore } from '../src/app/demo/cash-demo';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { CASH_CONSULTATION_LINKS } from '../src/app/shared/portal-slots';

// HU-CSH-001 (spec 001-, T-04, AC-CJ.9): screen 14, admin-caja.html, the button "Ajustar base diaria" and its panel "Ajuste".
const DAY: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000, openedBy: 'Fernanda Robayo (Administrador del tenant)',
  movements: [{ cashMovementId: 'm2', movementType: 'EXPENSE', concept: 'Compra operativa', amount: -25000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-09-01T11:45:00', registeredBy: 'Fernanda Robayo' }],
  metrics: { income: 0, operationalPayments: 0, expenses: 25000000, refunds: 0, total: 5000000, expectedCash: 5000000, netTransfers: 0 },
};
const INVALID = 'Registra una base diaria válida.';
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Day extends CashDaySource {
  reads = 0;
  constructor(public day: CashDay) { super(); }
  override today(): Promise<CashDay> { this.reads += 1; return Promise.resolve(this.day); }
}
class Base extends CashBaseWriter {
  readonly calls: { baseCents: number; key: string }[] = [];
  next: () => Promise<CashBaseResult> = () => Promise.resolve({ kind: 'adjusted' });
  override adjust(baseCents: number, key: string): Promise<CashBaseResult> { this.calls.push({ baseCents, key }); return this.next(); }
}
class Keys extends IdempotencyKeys { n = 0; override generate(): string { this.n += 1; return `key-${this.n}-00000000`; } }

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function render(roles: string[], options: { day?: CashDay; granted?: boolean; withWriter?: boolean } = {}) {
  const source = new Day(options.day ?? DAY);
  const base = new Base();
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, options.granted ?? false) },
    { provide: CashDaySource, useValue: source },
    { provide: IdempotencyKeys, useValue: new Keys() },
    { provide: CashMovementWriter, useValue: { register: () => Promise.reject(new Error('unused')) } },
    { provide: CashClosingWriter, useValue: { close: () => Promise.reject(new Error('unused')) } },
    ...(options.withWriter === false ? [] : [{ provide: CashBaseWriter, useValue: base }]),
  ] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === label) as HTMLButtonElement | undefined;
  const input = () => host.querySelector<HTMLInputElement>('#csh-cash-base-input');
  const open = async () => { button('Ajustar base diaria')!.click(); await settle(fixture); };
  const write = async (value: string) => { const field = input()!; field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await settle(fixture); };
  const save = async () => { host.querySelector('.csh-cash-base form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await settle(fixture); };
  return { host, source, base, button, input, open, write, save, settle: () => settle(fixture) };
}

describe('onlyTheAdministratorSeesAjustarBaseDiaria', () => {
  it('draws the button in the header, next to the title, for the Administrador', async () => {
    const { host, button } = await render(['TENANT_ADMINISTRATOR']);
    expect(host.querySelector('.csh-cash-header')!.contains(button('Ajustar base diaria') ?? null)).toBe(true);
    expect(button('Ajustar base diaria')!.disabled).toBe(false);
  });

  it.each([
    ['a Colaborador with Gestionar caja', ['OPERATIONAL_COLLABORATOR'], true],
    ['a Colaborador without it', ['OPERATIONAL_COLLABORATOR'], false],
    ['an Analista', ['ANALYST'], false],
  ])('draws neither the button nor the panel for %s', async (_who, roles, granted) => {
    const { host, button } = await render(roles, { granted });
    expect(button('Ajustar base diaria')).toBeUndefined();
    expect(host.textContent).not.toContain('Nueva base diaria');
  });

  it('draws nothing where the build has no writer (production)', async () => {
    const { button } = await render(['TENANT_ADMINISTRATOR'], { withWriter: false });
    expect(button('Ajustar base diaria')).toBeUndefined();
  });

  it.each([['CLOSED'], ['NO_OPENING'], ['OPEN_AUTOMATIC']] as const)('disables the button on a day that is %s', async (status) => {
    const { button } = await render(['TENANT_ADMINISTRATOR'], { day: { ...DAY, status } });
    expect(button('Ajustar base diaria')!.disabled).toBe(true);
  });
});

describe('thePanelAjusteOpensAndClosesAsTheMockupDoes', () => {
  it('is closed at first, opens with the current base and the mockup words, and Cancelar closes it without writing', async () => {
    const { host, base, button, input, open, settle } = await render(['TENANT_ADMINISTRATOR']);
    expect(host.querySelector('.csh-cash-base')).toBeNull();
    await open();
    const panel = host.querySelector('.csh-cash-base')!;
    expect(flat(panel.querySelector('.csh-cash-eyebrow')!.textContent)).toBe('Ajuste');
    expect(flat(panel.querySelector('h2')!.textContent)).toBe('Ajustar base diaria');
    expect(flat(panel.querySelector('label')!.textContent)).toBe('Nueva base diaria');
    expect(input()!.value).toBe('300000');
    expect(flat(panel.querySelector('#csh-cash-base-note')!.textContent)).toBe('Registra la nueva base diaria parametrizada para hoy.');
    expect(button('Cancelar')).toBeDefined();
    expect(button('Guardar base diaria')).toBeDefined();
    button('Cancelar')!.click();
    await settle();
    expect(host.querySelector('.csh-cash-base')).toBeNull();
    expect(base.calls).toEqual([]);
  });
});

describe('anInvalidBaseIsRefusedWithTheMockupMessage', () => {
  it.each([[''], ['-1'], ['abc'], ['1.234']])('sends nothing for "%s": the message is beside the field and the focus goes to it', async (typed) => {
    const { host, base, input, open, write, save } = await render(['TENANT_ADMINISTRATOR']);
    await open();
    await write(typed);
    await save();
    expect(base.calls).toEqual([]);
    expect(flat(host.querySelector('#csh-cash-base-error')?.textContent)).toBe(INVALID);
    expect(input()!.getAttribute('aria-invalid')).toBe('true');
    expect(input()!.getAttribute('aria-describedby')).toContain('csh-cash-base-error');
    expect(document.activeElement).toBe(input());
  });
});

describe('theBaseIsSentInCentsWithOneKeyPerIntention', () => {
  it('reads 400000 as 40000000 cents, sends a key, closes the panel, says it and reads the day again', async () => {
    const { host, source, base, open, write, save } = await render(['TENANT_ADMINISTRATOR']);
    await open();
    await write('400000');
    await save();
    expect(base.calls).toEqual([{ baseCents: 40000000, key: 'key-1-00000000' }]);
    expect(host.querySelector('.csh-cash-base')).toBeNull();
    expect(flat(host.querySelector('#csh-cash-base-notice')!.textContent)).toBe('Base diaria actualizada correctamente.');
    expect(source.reads).toBe(2);
  });

  it('reads 0.07 as 7 cents and accepts a base of 0', async () => {
    const { base, open, write, save } = await render(['TENANT_ADMINISTRATOR']);
    await open();
    await write('0.07');
    await save();
    await open();
    await write('0');
    await save();
    expect(base.calls.map((call) => call.baseCents)).toEqual([7, 0]);
  });

  it('keeps the panel and reuses the key when the answer fails', async () => {
    const { host, base, open, write, save } = await render(['TENANT_ADMINISTRATOR']);
    base.next = () => Promise.reject(new Error('down'));
    await open();
    await write('400000');
    await save();
    await save();
    expect(host.querySelector('.csh-cash-base')).not.toBeNull();
    expect(flat(host.querySelector('#csh-cash-base-error')!.textContent)).toBe('No se pudo completar la solicitud.');
    expect(base.calls.map((call) => call.key)).toEqual(['key-1-00000000', 'key-1-00000000']);
  });

  it('tells why the service refused and keeps the panel', async () => {
    const { host, base, open, write, save } = await render(['TENANT_ADMINISTRATOR']);
    base.next = () => Promise.resolve({ kind: 'refused', reason: 'NOT_OPERATIVE' });
    await open();
    await write('400000');
    await save();
    expect(host.querySelector('.csh-cash-base')).not.toBeNull();
    expect(flat(host.querySelector('#csh-cash-base-error')!.textContent)).toBe('La base solo se ajusta con la caja abierta con apertura operativa.');
  });
});

describe('theDemoStoreRecalculatesTheDayWithTheNewBase', () => {
  const stores = () => {
    const store = new DemoCashStore({ now: () => Date.UTC(2026, 8, 1, 21, 5), actor: () => 'Administrador del tenant' });
    return { day: new DemoCashDaySource(store), base: new DemoCashBaseWriter(store), closing: new DemoCashClosingWriter(store) };
  };

  it('moves the initial base, the total and the expected cash by the same difference', async () => {
    const { day, base } = stores();
    expect(await base.adjust(40000000, 'key-aaaaaaaa')).toEqual({ kind: 'adjusted' });
    const today = await day.today();
    expect(today.openingBase).toBe(40000000);
    expect(today.metrics).toMatchObject({ total: 144000000, expectedCash: 15000000, income: 129000000, expenses: 25000000 });
  });

  it('applies a key once', async () => {
    const { day, base } = stores();
    await base.adjust(40000000, 'key-aaaaaaaa');
    await base.adjust(50000000, 'key-aaaaaaaa');
    expect((await day.today()).openingBase).toBe(40000000);
  });

  it('refuses the change on a closed day and on a day without opening', async () => {
    const { base, closing } = stores();
    await closing.close('close-aaaaaaa');
    expect(await base.adjust(1, 'key-bbbbbbbb')).toEqual({ kind: 'refused', reason: 'DAY_CLOSED' });
    history.replaceState({}, '', '/?demoFixtures=no-opening-day');
    expect(await stores().base.adjust(1, 'key-cccccccc')).toEqual({ kind: 'refused', reason: 'NOT_OPERATIVE' });
  });

  it('shows the new base, the total and the expected cash on the screen built with the demo providers', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(['TENANT_ADMINISTRATOR']) }, ...(demoSources({ request: () => Promise.reject(new Error('unused')) } as never) as { provide: unknown }[]).filter((p) => p.provide !== CASH_CONSULTATION_LINKS) as never[]] });
    const fixture = TestBed.createComponent(CashDayPageComponent);
    await settle(fixture);
    const host: HTMLElement = fixture.nativeElement;
    const text = () => flat(host.textContent);
    expect(text()).toContain('Efectivo esperado al cierre: $50.000.');
    expect(text()).toContain('incluye la base de $300.000');
    Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === 'Ajustar base diaria')!.click();
    await settle(fixture);
    const input = host.querySelector<HTMLInputElement>('#csh-cash-base-input')!;
    input.value = '400000';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    host.querySelector('.csh-cash-base form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await settle(fixture);
    expect(text()).toContain('Efectivo esperado al cierre: $150.000.');
    expect(text()).toContain('incluye la base de $400.000');
    expect(text()).toContain('Base diaria actualizada correctamente.');
  });
});
