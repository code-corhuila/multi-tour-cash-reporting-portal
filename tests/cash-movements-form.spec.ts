import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashClosingResult, CashClosingWriter } from '../src/app/cash/data/cash-closing-writer';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashMovementResult, CashMovementWriter, NewCashMovement } from '../src/app/cash/data/cash-movement-writer';
import { CashDayPageComponent } from '../src/app/cash/pages/cash-day-page.component';
import { DemoCashClosingWriter, DemoCashDaySource, DemoCashMovementWriter, DemoCashStore } from '../src/app/demo/cash-demo';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { IdempotencyKeys } from '../src/app/shared/idempotency-keys';
import { PortalActor } from '../src/app/shared/portal-capabilities';

// HU-CSH-001 (spec 001-, amended 2026-10-14): screen 14, admin-caja.html, the panel "Movimientos / Registro de la jornada":
// the form of movements (AC-CJ.9, .12, .14), "Cerrar caja" (AC-CJ.3, .4) and the demo store that stands for the service.
const NOTE = 'Registra los movimientos de la jornada. Los pagos validados y las devoluciones ejecutadas se agregan automáticamente; el efectivo exige la apertura operativa y una transferencia crea la caja del día si todavía no existe.';
const DAY: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000, openedBy: 'Fernanda Robayo (Administrador del tenant)',
  movements: [{ cashMovementId: 'm2', movementType: 'EXPENSE', concept: 'Compra operativa', amount: -25000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-09-01T11:45:00', registeredBy: 'Fernanda Robayo' }],
  metrics: { income: 0, operationalPayments: 0, expenses: 25000000, refunds: 0, total: 5000000, expectedCash: 5000000, netTransfers: 0 },
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Day extends CashDaySource {
  reads = 0;
  constructor(public day: CashDay) { super(); }
  override today(): Promise<CashDay> { this.reads += 1; return Promise.resolve(this.day); }
}
class Movements extends CashMovementWriter {
  readonly calls: { movement: NewCashMovement; key: string }[] = [];
  next: () => Promise<CashMovementResult> = () => Promise.resolve({ kind: 'registered', placement: 'IN_DAY' });
  override register(movement: NewCashMovement, key: string): Promise<CashMovementResult> { this.calls.push({ movement, key }); return this.next(); }
}
class Closing extends CashClosingWriter {
  readonly keys: string[] = [];
  next: () => Promise<CashClosingResult> = () => Promise.resolve({ kind: 'closed', expectedCash: 5000000 });
  override close(key: string): Promise<CashClosingResult> { this.keys.push(key); return this.next(); }
}
class Keys extends IdempotencyKeys { n = 0; override generate(): string { this.n += 1; return `key-${this.n}-00000000`; } }

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function render(roles: string[], options: { day?: CashDay; granted?: boolean; withWriters?: boolean } = {}) {
  const source = new Day(options.day ?? DAY);
  const movements = new Movements();
  const closing = new Closing();
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, options.granted ?? false) },
    { provide: CashDaySource, useValue: source },
    { provide: IdempotencyKeys, useValue: new Keys() },
    ...(options.withWriters === false ? [] : [{ provide: CashMovementWriter, useValue: movements }, { provide: CashClosingWriter, useValue: closing }]),
  ] });
  const fixture = TestBed.createComponent(CashDayPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const field = <T extends HTMLElement>(name: string) => host.querySelector<T>(`#csh-cash-movement-${name}`)!;
  const type = (select: HTMLSelectElement, value: string) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
  const write = (input: HTMLInputElement, value: string) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); };
  const fill = (values: { type?: string; medium?: string; concept?: string; amount?: string }) => {
    if (values.type !== undefined) { type(field<HTMLSelectElement>('type'), values.type); }
    if (values.medium !== undefined) { type(field<HTMLSelectElement>('medium'), values.medium); }
    if (values.concept !== undefined) { write(field<HTMLInputElement>('concept'), values.concept); }
    if (values.amount !== undefined) { write(field<HTMLInputElement>('amount'), values.amount); }
  };
  const submit = async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await settle(fixture); };
  const button = (label: string) => Array.from(host.querySelectorAll('button')).find((b) => flat(b.textContent) === label) as HTMLButtonElement | undefined;
  const feedback = () => flat(host.querySelector('#csh-cash-feedback')?.textContent);
  return { host, source, movements, closing, field, fill, submit, button, feedback, settle: () => settle(fixture) };
}

describe('theMovementsPanelDrawsTheFormOfTheMockup', () => {
  it('draws the head with "Cerrar caja", the four fields, the note and "Registrar movimiento" for the Administrador', async () => {
    const { host, field, button, feedback } = await render(['TENANT_ADMINISTRATOR']);
    expect(Array.from(host.querySelectorAll('.csh-cash-register-head p, .csh-cash-register-head h2')).map((e) => flat(e.textContent))).toEqual(['Movimientos', 'Registro de la jornada']);
    expect(button('Cerrar caja')).toBeDefined();
    expect(Array.from(host.querySelectorAll('.csh-cash-form label')).map((l) => flat(l.textContent))).toEqual(['Tipo', 'Medio de pago', 'Concepto', 'Valor']);
    expect(Array.from(field<HTMLSelectElement>('type').options).map((o) => flat(o.textContent))).toEqual(['Selecciona un tipo', 'Ingreso', 'Pago operacional', 'Gasto']);
    expect(Array.from(field<HTMLSelectElement>('medium').options).map((o) => flat(o.textContent))).toEqual(['Efectivo', 'Transferencia']);
    expect(field<HTMLSelectElement>('medium').selectedOptions[0].textContent).toBe('Efectivo');
    expect(field<HTMLInputElement>('concept').placeholder).toBe('Describe el movimiento');
    expect(button('Registrar movimiento')).toBeDefined();
    expect(feedback()).toBe(NOTE);
    expect(host.textContent).not.toMatch(/Devolución\s*<|REFUND/);
  });

  it('never offers a refund as a type', async () => {
    const { field } = await render(['TENANT_ADMINISTRATOR']);
    expect(Array.from(field<HTMLSelectElement>('type').options).map((o) => o.value)).toEqual(['', 'INCOME', 'OPERATIONAL_PAYMENT', 'EXPENSE']);
  });

  it('keeps the table of movements with its six columns under the form', async () => {
    const { host } = await render(['TENANT_ADMINISTRATOR']);
    expect(Array.from(host.querySelectorAll('thead th')).map((th) => flat(th.textContent))).toEqual(['Hora', 'Tipo', 'Concepto', 'Medio', 'Valor', 'Responsable']);
    expect(Array.from(host.querySelectorAll('tbody tr td')).map((td) => flat(td.textContent))).toEqual(['11:45', 'Gasto', 'Compra operativa', 'Efectivo', '-$250.000', 'Fernanda Robayo']);
  });
});

describe('onlyWhoMayOperateTheCashSeesTheFormAndTheClosing', () => {
  it.each([['a Colaborador with Gestionar caja', ['OPERATIONAL_COLLABORATOR'], true]])('draws them for %s', async (_who, roles, granted) => {
    const { button, field } = await render(roles, { granted });
    expect(button('Cerrar caja')).toBeDefined();
    expect(field('type')).not.toBeNull();
  });

  it.each([
    ['a Colaborador without Gestionar caja', ['OPERATIONAL_COLLABORATOR'], false],
    ['a Gerente', ['MANAGER'], true], ['a Contador', ['ACCOUNTANT'], true], ['an Analista', ['ANALYST'], true],
  ])('draws neither for %s, only the table', async (_who, roles, granted) => {
    const { host, button } = await render(roles, { granted });
    expect(button('Cerrar caja')).toBeUndefined();
    expect(button('Registrar movimiento')).toBeUndefined();
    expect(host.querySelector('form')).toBeNull();
    expect(host.querySelector('tbody tr')).not.toBeNull();
  });

  it('draws neither where the build has no writer (production)', async () => {
    const { host, button } = await render(['TENANT_ADMINISTRATOR'], { withWriters: false });
    expect(button('Cerrar caja')).toBeUndefined();
    expect(host.querySelector('form')).toBeNull();
  });
});

describe('theFormValidatesBeforeSendingAndShowsTheErrorBesideTheField', () => {
  it('sends nothing when type, concept and value are missing: the errors are beside their fields and the focus goes to the first one', async () => {
    const { host, movements, submit, feedback, field } = await render(['TENANT_ADMINISTRATOR']);
    await submit();
    expect(movements.calls).toEqual([]);
    expect(feedback()).toBe('Completa tipo, concepto, medio de pago y un valor mayor a $0 para registrar el movimiento.');
    for (const name of ['type', 'concept', 'amount']) {
      const control = field(name);
      expect(control.getAttribute('aria-invalid')).toBe('true');
      const error = host.querySelector(`#${control.getAttribute('aria-describedby')}`);
      expect(flat(error?.textContent)).not.toBe('');
      expect(control.parentElement?.contains(error)).toBe(true);
    }
    expect(field('medium').getAttribute('aria-invalid')).toBeNull();
    expect(document.activeElement).toBe(field('type'));
  });

  it.each([['0'], ['-5'], ['abc'], ['12.500,00'], ['1.234'], ['']])('refuses the value "%s" and keeps what the person typed', async (amount) => {
    const { movements, submit, fill, field } = await render(['TENANT_ADMINISTRATOR']);
    fill({ type: 'EXPENSE', concept: 'Taxi', amount });
    await submit();
    expect(movements.calls).toEqual([]);
    expect(field('amount').getAttribute('aria-invalid')).toBe('true');
    expect(field<HTMLInputElement>('concept').value).toBe('Taxi');
    expect(field<HTMLInputElement>('amount').value).toBe(amount);
  });

  it('refuses a concept of blanks', async () => {
    const { movements, submit, fill, field } = await render(['TENANT_ADMINISTRATOR']);
    fill({ type: 'EXPENSE', concept: '   ', amount: '100' });
    await submit();
    expect(movements.calls).toEqual([]);
    expect(field('concept').getAttribute('aria-invalid')).toBe('true');
  });
});

describe('theMovementIsSentInCentsWithOneKeyPerIntention', () => {
  it('reads the value from the text into cents and sends the type, the medium, the concept and a key', async () => {
    const { movements, submit, fill, feedback, source, field } = await render(['TENANT_ADMINISTRATOR']);
    fill({ type: 'EXPENSE', concept: ' Taxi al aeropuerto ', amount: '250000.50' });
    await submit();
    expect(movements.calls).toEqual([{ movement: { movementType: 'EXPENSE', concept: 'Taxi al aeropuerto', amountCents: 25000050, paymentMedium: 'CASH' }, key: 'key-1-00000000' }]);
    expect(feedback()).toBe('Movimiento registrado correctamente.');
    expect(source.reads).toBe(2);
    expect(field<HTMLInputElement>('concept').value).toBe('');
    expect(field<HTMLSelectElement>('medium').value).toBe('CASH');
  });

  it('reads 0.07 as 7 cents', async () => {
    const { movements, submit, fill } = await render(['TENANT_ADMINISTRATOR']);
    fill({ type: 'INCOME', medium: 'TRANSFER', concept: 'Ajuste', amount: '0.07' });
    await submit();
    expect(movements.calls[0].movement).toEqual({ movementType: 'INCOME', concept: 'Ajuste', amountCents: 7, paymentMedium: 'TRANSFER' });
  });

  it('sends once on a double click: the button is disabled while sending', async () => {
    const { movements, submit, fill, button } = await render(['TENANT_ADMINISTRATOR']);
    let answer!: (result: CashMovementResult) => void;
    movements.next = () => new Promise((resolve) => { answer = resolve; });
    fill({ type: 'EXPENSE', concept: 'Taxi', amount: '100' });
    const first = submit();
    await submit();
    expect(movements.calls.length).toBe(1);
    expect(button('Registrar movimiento')!.disabled).toBe(true);
    answer({ kind: 'registered', placement: 'IN_DAY' });
    await first;
    expect(button('Registrar movimiento')!.disabled).toBe(false);
  });

  it('keeps the fields and reuses the key when the answer fails; a new movement after success gets a new key', async () => {
    const { movements, submit, fill, feedback, field } = await render(['TENANT_ADMINISTRATOR']);
    movements.next = () => Promise.reject(new Error('down'));
    fill({ type: 'EXPENSE', concept: 'Taxi', amount: '100' });
    await submit();
    expect(feedback()).toBe('No se pudo completar la solicitud.');
    expect(field<HTMLInputElement>('concept').value).toBe('Taxi');
    movements.next = () => Promise.resolve({ kind: 'registered', placement: 'IN_DAY' });
    await submit();
    expect(movements.calls.map((c) => c.key)).toEqual(['key-1-00000000', 'key-1-00000000']);
    fill({ type: 'EXPENSE', concept: 'Taxi', amount: '100' });
    await submit();
    expect(movements.calls[2].key).toBe('key-2-00000000');
  });
});

describe('theAnswersOfTheServiceAreWrittenAsTheMockupDoes', () => {
  it.each([
    [{ kind: 'registered', placement: 'AFTER_CLOSING' }, 'Movimiento no efectivo registrado como posterior al cierre, sin reabrir la caja.'],
    [{ kind: 'registered', placement: 'DAY_CREATED' }, 'Movimiento no efectivo registrado: la caja de hoy se creó automáticamente (Abierta, sin base).'],
    [{ kind: 'refused', reason: 'CASH_NEEDS_OPENING' }, 'Abre la caja de hoy (apertura operativa) antes de registrar efectivo.'],
    [{ kind: 'refused', reason: 'DAY_CLOSED' }, 'La caja está cerrada: reábrela con motivo para registrar efectivo.'],
  ] as [CashMovementResult, string][])('%o reads "%s"', async (result, message) => {
    const { movements, submit, fill, feedback, field } = await render(['TENANT_ADMINISTRATOR']);
    movements.next = () => Promise.resolve(result);
    fill({ type: 'EXPENSE', concept: 'Taxi', amount: '100' });
    await submit();
    expect(feedback()).toBe(message);
    expect(field<HTMLInputElement>('concept').value).toBe(result.kind === 'refused' ? 'Taxi' : '');
  });
});

describe('aClosedDayDisablesTheClosingAndTheCashMedium', () => {
  it('disables "Cerrar caja" and the option "Efectivo", leaves "Transferencia" selected and available', async () => {
    const { button, field } = await render(['TENANT_ADMINISTRATOR'], { day: { ...DAY, status: 'CLOSED' } });
    expect(button('Cerrar caja')!.disabled).toBe(true);
    const medium = field<HTMLSelectElement>('medium');
    expect(Array.from(medium.options).map((o) => [o.value, o.disabled])).toEqual([['CASH', true], ['TRANSFER', false]]);
    expect(medium.value).toBe('TRANSFER');
  });
});

describe('theClosingIsExplicitAndIdempotent', () => {
  it('closes the day, tells the expected cash, and draws the day again as "Jornada cerrada"', async () => {
    const { host, closing, source, button, feedback, settle: again } = await render(['TENANT_ADMINISTRATOR']);
    closing.next = () => { source.day = { ...DAY, status: 'CLOSED' }; return Promise.resolve({ kind: 'closed', expectedCash: 5000000 }); };
    button('Cerrar caja')!.click();
    await again();
    expect(closing.keys).toEqual(['key-1-00000000']);
    expect(feedback()).toBe('Caja cerrada correctamente. Efectivo esperado: $50.000. El cierre y el histórico quedaron conservados.');
    expect(flat(host.querySelector('.csh-cash-hero p')?.textContent)).toBe('Jornada cerrada');
    expect(button('Cerrar caja')!.disabled).toBe(true);
  });

  it('does not send twice on a double click', async () => {
    const { closing, button } = await render(['TENANT_ADMINISTRATOR']);
    closing.next = () => new Promise(() => undefined);
    button('Cerrar caja')!.click();
    button('Cerrar caja')!.click();
    expect(closing.keys.length).toBe(1);
  });

  it.each([
    [{ kind: 'refused', reason: 'ALREADY_CLOSED' }, 'La caja ya está cerrada.'],
    [{ kind: 'refused', reason: 'NOT_OPERATIVE' }, 'Una caja creada automáticamente sin apertura operativa se cierra sola al finalizar el día.'],
  ] as [CashClosingResult, string][])('%o reads "%s"', async (result, message) => {
    const { closing, button, feedback, settle: again } = await render(['TENANT_ADMINISTRATOR']);
    closing.next = () => Promise.resolve(result);
    button('Cerrar caja')!.click();
    await again();
    expect(feedback()).toBe(message);
  });

  it('says the request failed and reuses the key on the retry', async () => {
    const { closing, button, feedback, settle: again } = await render(['TENANT_ADMINISTRATOR']);
    closing.next = () => Promise.reject(new Error('down'));
    button('Cerrar caja')!.click();
    await again();
    expect(feedback()).toBe('No se pudo completar la solicitud.');
    button('Cerrar caja')!.click();
    await again();
    expect(closing.keys).toEqual(['key-1-00000000', 'key-1-00000000']);
  });
});

describe('theDemoStoreAppliesTheRulesOfTheService', () => {
  const stores = () => {
    const store = new DemoCashStore({ now: () => Date.UTC(2026, 8, 1, 21, 5), actor: () => 'Administrador del tenant' });
    return { day: new DemoCashDaySource(store), movements: new DemoCashMovementWriter(store), closing: new DemoCashClosingWriter(store) };
  };
  const expense = (amountCents: number, paymentMedium: NewCashMovement['paymentMedium'] = 'CASH'): NewCashMovement => ({ movementType: 'EXPENSE', concept: 'Taxi', amountCents, paymentMedium });

  it('registers a cash expense as a negative row of the actor and moves the metrics', async () => {
    const { day, movements } = stores();
    expect(await movements.register(expense(1000000), 'key-aaaaaaaa')).toEqual({ kind: 'registered', placement: 'IN_DAY' });
    const today = await day.today();
    expect(today.movements.at(-1)).toMatchObject({ movementType: 'EXPENSE', concept: 'Taxi', amount: -1000000, paymentMedium: 'CASH', afterClosing: false, registeredBy: 'Administrador del tenant' });
    expect(today.metrics).toMatchObject({ expenses: 26000000, expectedCash: 4000000, total: 118000000 });
  });

  it('records an income as a positive row and counts it once for the same key', async () => {
    const { day, movements } = stores();
    const income: NewCashMovement = { movementType: 'INCOME', concept: 'Seña', amountCents: 500000, paymentMedium: 'CASH' };
    await movements.register(income, 'key-bbbbbbbb');
    await movements.register(income, 'key-bbbbbbbb');
    const today = await day.today();
    expect(today.movements.filter((m) => m.concept === 'Seña').map((m) => m.amount)).toEqual([500000]);
    expect(today.metrics.income).toBe(129500000);
  });

  it('does not change the expected cash with a transfer', async () => {
    const { day, movements } = stores();
    await movements.register(expense(1000000, 'TRANSFER'), 'key-cccccccc');
    const today = await day.today();
    expect(today.metrics.expectedCash).toBe(5000000);
    expect(today.metrics.netTransfers).toBe(113000000);
  });

  it('refuses cash on a day without opening and creates the cash of the day with a transfer', async () => {
    history.replaceState({}, '', '/?demoFixtures=no-opening-day');
    const { day, movements } = stores();
    expect((await day.today()).status).toBe('NO_OPENING');
    expect(await movements.register(expense(1000), 'key-dddddddd')).toEqual({ kind: 'refused', reason: 'CASH_NEEDS_OPENING' });
    expect((await day.today()).movements).toEqual([]);
    expect(await movements.register(expense(1000, 'TRANSFER'), 'key-eeeeeeee')).toEqual({ kind: 'registered', placement: 'DAY_CREATED' });
    const created = await day.today();
    expect(created).toMatchObject({ status: 'OPEN_AUTOMATIC', origin: 'AUTOMATIC_CREATION', openingBase: 0 });
    expect(created.metrics.expectedCash).toBeNull();
  });

  it('closes once: the closed day takes transfers marked after the closing, no cash, and a second closing is refused', async () => {
    const { day, movements, closing } = stores();
    expect(await closing.close('key-ffffffff')).toEqual({ kind: 'closed', expectedCash: 5000000 });
    expect((await day.today()).status).toBe('CLOSED');
    expect(await closing.close('key-gggggggg')).toEqual({ kind: 'refused', reason: 'ALREADY_CLOSED' });
    expect(await movements.register(expense(1000), 'key-hhhhhhhh')).toEqual({ kind: 'refused', reason: 'DAY_CLOSED' });
    expect(await movements.register(expense(1000, 'TRANSFER'), 'key-iiiiiiii')).toEqual({ kind: 'registered', placement: 'AFTER_CLOSING' });
    const today = await day.today();
    expect(today.movements.at(-1)?.afterClosing).toBe(true);
    expect(today.metrics.expectedCash).toBe(5000000);
  });

  it('refuses to close a cash created automatically', async () => {
    history.replaceState({}, '', '/?demoFixtures=no-opening-day');
    const { closing, movements } = stores();
    await movements.register(expense(1000, 'TRANSFER'), 'key-jjjjjjjj');
    expect(await closing.close('key-kkkkkkkk')).toEqual({ kind: 'refused', reason: 'NOT_OPERATIVE' });
  });

  it('answers the fixture closed-day-retry with a closed day', async () => {
    history.replaceState({}, '', '/?demoFixtures=closed-day-retry');
    const { day, closing } = stores();
    expect((await day.today()).status).toBe('CLOSED');
    expect(await closing.close('key-llllllll')).toEqual({ kind: 'refused', reason: 'ALREADY_CLOSED' });
  });

  it('is the only build that registers the writers, over one store', () => {
    const providers = demoSources({ request: () => Promise.reject(new Error('unused')) } as never) as { provide: unknown }[];
    expect(providers.map((p) => p.provide)).toEqual(expect.arrayContaining([CashDaySource, CashMovementWriter, CashClosingWriter]));
  });
});
