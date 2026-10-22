import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashClosure, CashClosuresSource, CashCorrection } from '../src/app/cash/data/cash-closures-source';
import { CashCorrectionResult, CashCorrectionWriter } from '../src/app/cash/data/cash-correction-writer';
import { CashHistoryPageComponent } from '../src/app/cash/pages/cash-history-page.component';
import { DemoCashStore, cashDemoProviders } from '../src/app/demo/cash-demo';
import { PortalActor, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { PortalNavigation } from '../src/app/shared/portal-navigation';

// HU-CSH-001, T-07 (AC-CJ.5, RN-CJ5), admin-historial-caja.html: "Registrar corrección" with a mandatory justification, for the Administrador only and never
// on an automatic closure; the correction adds a row and never changes the closure.
const peso = (n: number) => n * 100;
const MANUAL: CashClosure = {
  cashClosureId: 'cl-1', businessDate: '2026-08-31', closingMode: 'MANUAL', origin: 'OPERATIONAL_OPENING', reopened: false, openingBase: peso(300000),
  income: peso(800000), operationalPayments: 0, expenses: 0, refunds: 0, total: peso(1100000), expectedCash: peso(1100000),
  closedBy: 'Fernanda Robayo (Administrador del tenant)', closedAt: '2026-08-31T18:00:00', reopenings: [], corrections: [], movements: [], nonCashMovements: 0,
};
const AUTOMATIC: CashClosure = { ...MANUAL, cashClosureId: 'cl-2', businessDate: '2026-08-30', closingMode: 'AUTOMATIC', origin: 'AUTOMATIC_CREATION', openingBase: 0, expectedCash: null };

class Closures extends CashClosuresSource {
  items: CashClosure[] = [MANUAL, AUTOMATIC];
  override list(): Promise<readonly CashClosure[]> { return Promise.resolve(this.items); }
}
class Writer extends CashCorrectionWriter {
  readonly calls: { closureId: string; justification: string; key: string }[] = [];
  next: CashCorrectionResult | 'fail' = { kind: 'registered' };
  constructor(private readonly closures: Closures) { super(); }
  override register(closureId: string, justification: string, key: string): Promise<CashCorrectionResult> {
    this.calls.push({ closureId, justification, key });
    if (this.next === 'fail') { return Promise.reject(new Error('down')); }
    if (this.next.kind === 'registered') {
      const correction: CashCorrection = { appliedAt: '2026-09-01T10:30:00', appliedBy: 'Administrador del tenant', justification };
      this.closures.items = this.closures.items.map((c) => (c.cashClosureId === closureId ? { ...c, corrections: [...c.corrections, correction] } : c));
    }
    return Promise.resolve(this.next);
  }
}

afterEach(() => TestBed.resetTestingModule());

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}

async function history(roles: string[] = ['TENANT_ADMINISTRATOR'], mayManageCash = false) {
  const closures = new Closures(), writer = new Writer(closures);
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles, mayManageCash) }, PortalNavigation,
    { provide: CashClosuresSource, useValue: closures }, { provide: CashCorrectionWriter, useValue: writer },
  ] });
  const fixture = TestBed.createComponent(CashHistoryPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  const forms = () => Array.from(host.querySelectorAll('form.csh-cash-correction'));
  const type = (form: Element, text: string) => { const area = form.querySelector('textarea')!; area.value = text; area.dispatchEvent(new Event('input')); };
  const send = async (form: Element) => { form.dispatchEvent(new Event('submit', { cancelable: true })); await settle(fixture); };
  return { fixture, host, closures, writer, forms, type, send };
}

describe('theCorrectionFormIsOfferedOnlyWhereItBelongs', () => {
  it('draws it on a manual closure for the Administrador, with the label, the placeholder, the note and the button of the mockup', async () => {
    const { host, forms } = await history();
    expect(forms()).toHaveLength(1);
    const form = forms()[0];
    expect(form.querySelector('label')?.textContent?.trim()).toBe('Justificación de la corrección (obligatoria)');
    expect(form.querySelector('textarea')?.getAttribute('placeholder')).toBe('Describe la corrección operativa excepcional y su justificación');
    expect(form.textContent).toContain('Solo el Administrador del tenant puede registrar una corrección posterior al cierre.');
    expect(form.querySelector('button[type="submit"]')?.textContent?.trim()).toBe('Registrar corrección');
    expect(host.querySelectorAll('section.csh-history-closure')[0].contains(form)).toBe(true);
  });

  it('does not draw it on the automatic closure', async () => {
    const { host, forms } = await history();
    const automatic = host.querySelectorAll('section.csh-history-closure')[1];
    expect(automatic.textContent).toContain('Cierre automático');
    expect(forms().some((form) => automatic.contains(form))).toBe(false);
  });

  it('does not draw it for a Colaborador, with or without Gestionar caja, nor for the roles that only query', async () => {
    for (const [roles, grant] of [[['OPERATIONAL_COLLABORATOR'], false], [['OPERATIONAL_COLLABORATOR'], true], [['MANAGER'], false], [['ACCOUNTANT'], false], [['ANALYST'], false]] as const) {
      const { forms } = await history([...roles], grant);
      expect(forms(), `${roles[0]} ${grant}`).toHaveLength(0);
      TestBed.resetTestingModule();
    }
  });

  it('keeps correctClosure for the Administrador only', () => {
    expect(PortalCapabilities.for('TENANT_ADMINISTRATOR').canCorrectClosure()).toBe(true);
    expect(PortalCapabilities.for('OPERATIONAL_COLLABORATOR', true).canCorrectClosure()).toBe(false);
  });
});

describe('aCorrectionNeedsItsJustificationAndKeepsWhoAndWhen', () => {
  it('asks for the justification when it is empty and sends nothing', async () => {
    const { host, forms, send, writer } = await history();
    await send(forms()[0]);
    expect(host.querySelector('form.csh-cash-correction')?.textContent).toContain('Registra la justificación obligatoria de la corrección.');
    expect(host.querySelector('textarea')?.getAttribute('aria-invalid')).toBe('true');
    expect(writer.calls).toHaveLength(0);
  });

  it('registers the trimmed justification once, adds a row Fecha, Responsable and Justificación and leaves the closure values as they were', async () => {
    const { host, forms, type, send, writer } = await history();
    const before = host.querySelectorAll('section.csh-history-closure')[0].querySelector('dl')?.textContent;
    type(forms()[0], '  Compra operativa registrada dos veces  ');
    await send(forms()[0]);
    expect(writer.calls).toHaveLength(1);
    expect(writer.calls[0]).toMatchObject({ closureId: 'cl-1', justification: 'Compra operativa registrada dos veces' });
    const closure = host.querySelectorAll('section.csh-history-closure')[0];
    const rows = Array.from(closure.querySelectorAll('tbody tr')).map((row) => Array.from(row.querySelectorAll('td'), (cell) => cell.textContent?.trim()));
    expect(rows.at(-1)).toEqual([expect.stringContaining('2026'), 'Administrador del tenant', 'Compra operativa registrada dos veces']);
    expect(closure.querySelector('dl')?.textContent).toBe(before);
    expect(host.querySelectorAll('section.csh-history-closure')).toHaveLength(2);
    expect(host.querySelector('textarea')?.value).toBe('');
  });

  it('reuses the Idempotency-Key of a retry of the same correction', async () => {
    const { forms, type, send, writer } = await history();
    writer.next = 'fail';
    type(forms()[0], 'Misma corrección');
    await send(forms()[0]); await send(forms()[0]);
    expect(writer.calls).toHaveLength(2);
    expect(writer.calls[1].key).toBe(writer.calls[0].key);
  });

  it('says the service could not complete it, keeping what was typed', async () => {
    const { host, forms, type, send, writer } = await history();
    writer.next = 'fail';
    type(forms()[0], 'Texto escrito');
    await send(forms()[0]);
    expect(host.querySelector('form.csh-cash-correction')?.textContent).toContain('No se pudo completar la solicitud.');
    expect(host.querySelector('textarea')?.value).toBe('Texto escrito');
  });

  it('says so when the service refuses an automatic closure', async () => {
    const { host, forms, type, send, writer } = await history();
    writer.next = { kind: 'refused', reason: 'AUTOMATIC_CLOSURE' };
    type(forms()[0], 'No debería aceptarse');
    await send(forms()[0]);
    expect(host.querySelector('form.csh-cash-correction')?.textContent).toContain('Un cierre automático no admite correcciones.');
  });
});

describe('theDemoWriterKeepsTheCorrectionInTheSameStore', () => {
  it('adds the correction to the closure of the day with who and when, once per key, and refuses an unknown closure', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(['TENANT_ADMINISTRATOR']) }, ...cashDemoProviders()] });
    const store = TestBed.inject(DemoCashStore);
    store.close('close-1');
    const [closure] = store.closures();
    const writer = TestBed.inject(CashCorrectionWriter);
    expect(await writer.register(closure.cashClosureId, 'Ajuste de caja', 'key-1')).toEqual({ kind: 'registered' });
    expect(await writer.register(closure.cashClosureId, 'Ajuste de caja', 'key-1')).toEqual({ kind: 'registered' });
    const [corrected] = store.closures();
    expect(corrected.corrections).toHaveLength(1);
    expect(corrected.corrections[0]).toMatchObject({ appliedBy: 'Administrador del tenant', justification: 'Ajuste de caja' });
    expect(corrected.total).toBe(closure.total);
    expect(await writer.register('cl-unknown', 'x', 'key-2')).toEqual({ kind: 'refused', reason: 'NOT_FOUND' });
  });
});
