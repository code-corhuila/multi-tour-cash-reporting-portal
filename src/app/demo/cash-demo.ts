import { Provider, inject } from '@angular/core';
import { CashClosure, CashClosuresSource, CashCorrection } from '../cash/data/cash-closures-source';
import { CashCorrectionResult, CashCorrectionWriter } from '../cash/data/cash-correction-writer';
import { CashHistoryLinkComponent, CashMonthlyLinkComponent } from '../cash/components/cash-consultation-links.component';
import { CashBaseResult, CashBaseWriter } from '../cash/data/cash-base-writer';
import { CashClosingResult, CashClosingWriter } from '../cash/data/cash-closing-writer';
import { CashDay, CashDayMetrics, CashDaySource, CashDayStatus, CashMovement, CashOrigin } from '../cash/data/cash-day-source';
import { CashMovementResult, CashMovementWriter, NewCashMovement } from '../cash/data/cash-movement-writer';
import { Clock } from '../shared/clock';
import { PortalCapabilities } from '../shared/portal-capabilities';
import { CASH_CONSULTATION_LINKS } from '../shared/portal-slots';
import { demoFixture } from './demo-fixtures';

/** The demo day of 001- (01 sep 2026, the mockup's demo clock): one base, one income by transfer and one cash expense, as the mockup draws it (spec section 6). */
const BUSINESS_DATE = '2026-09-01';
const BASE = 30000000;
const WHO = 'Fernanda Robayo';
type Type = CashMovement['movementType'];
type Medium = CashMovement['paymentMedium'];
interface LedgerEntry extends CashMovement { readonly validated: boolean }
const entry = (id: string, time: string, movementType: Type, concept: string, amount: number, paymentMedium: Medium, validated = true): LedgerEntry =>
  ({ cashMovementId: id, movementType, concept, amount, paymentMedium, afterClosing: false, registeredAt: `${BUSINESS_DATE}T${time}:00`, registeredBy: WHO, validated });

/** Invented amounts but the mockup's day; RES-1903 is a transfer still "En validación": the source holds it and never returns it (AC-CJ.2, DD-2). */
const LEDGER: readonly LedgerEntry[] = [
  entry('cm-1', '09:20', 'INCOME', 'Pago reserva #RES-1901', 129000000, 'TRANSFER'),
  entry('cm-2', '11:45', 'EXPENSE', 'Compra operativa', -25000000, 'CASH'),
  entry('cm-4', '15:30', 'INCOME', 'Pago reserva #RES-1903', 50000000, 'TRANSFER', false),
];

/** The mockup keeps no closure before the demo day (its history starts empty, spec 001- section 6): the only closure is the day itself once it is closed. */
const magnitude = (movements: readonly CashMovement[], type: Type) =>
  movements.filter((m) => m.movementType === type).reduce((total, m) => total + Math.abs(m.amount), 0);
const net = (movements: readonly CashMovement[], medium: Medium) =>
  movements.filter((m) => m.paymentMedium === medium).reduce((total, m) => total + m.amount, 0);

/** The rules of RN-CJ1 and RN-CJ10 live here, in the demo that stands for the service (plan D-03); a day without cash has no expected cash. */
function resolve(movements: readonly CashMovement[], base: number, withCash: boolean): CashDayMetrics {
  const income = magnitude(movements, 'INCOME');
  const operationalPayments = magnitude(movements, 'OPERATIONAL_PAYMENT');
  const expenses = magnitude(movements, 'EXPENSE');
  const refunds = magnitude(movements, 'REFUND');
  return {
    income, operationalPayments, expenses, refunds, total: base + income - operationalPayments - expenses - refunds,
    expectedCash: withCash ? base + net(movements, 'CASH') : null, netTransfers: net(movements, 'TRANSFER'),
  };
}

interface State { status: CashDayStatus; origin: CashOrigin | null; base: number; openedBy: string | null; movements: CashMovement[]; closing?: { at: string; by: string } }
interface Environment { readonly now: () => number; readonly actor: () => string }

/**
 * DEMO (spec 001- DD-1): the one in-memory cash of the page, read by the source and written by the writers (plan D-03).
 * It starts, on its first use, as the fixture asks: the open day, "no-opening-day" or "closed-day-retry".
 */
export class DemoCashStore {
  private state?: State;
  private sequence = 4;
  /** A key answers once: the same key returns the same answer and records nothing more (D-07). */
  private readonly answers = new Map<string, unknown>();
  /** The corrections of the closures, by closure: a closure never changes, the corrections only add rows (RN-CJ5). */
  private readonly corrections = new Map<string, readonly CashCorrection[]>();

  constructor(private readonly env: Environment = { now: () => Date.now(), actor: () => `${WHO} (Administrador del tenant)` }) {}

  private current(): State {
    this.state ??= demoFixture('no-opening-day')
      ? { status: 'NO_OPENING', origin: null, base: 0, openedBy: null, movements: [] }
      : { status: demoFixture('closed-day-retry') ? 'CLOSED' : 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', base: BASE, openedBy: `${WHO} (Administrador del tenant)`,
        movements: demoFixture('empty-cash-day') ? [] : LEDGER.filter((m) => m.validated).map(({ validated: _validated, ...movement }) => movement) };
    return this.state;
  }

  read(): CashDay {
    const { status, origin, base, openedBy, movements } = this.current();
    return { businessDate: BUSINESS_DATE, status, origin, openingBase: base, openedBy, movements: [...movements], metrics: resolve(movements, base, status === 'OPEN_OPERATIVE' || status === 'CLOSED') };
  }

  register(movement: NewCashMovement, key: string): CashMovementResult {
    return this.once(key, (): CashMovementResult => {
      const state = this.current();
      const cash = movement.paymentMedium === 'CASH';
      if (cash && state.status === 'CLOSED') { return { kind: 'refused', reason: 'DAY_CLOSED' }; }
      if (cash && state.status !== 'OPEN_OPERATIVE') { return { kind: 'refused', reason: 'CASH_NEEDS_OPENING' }; }
      const placement = state.status === 'CLOSED' ? 'AFTER_CLOSING' : state.status === 'NO_OPENING' ? 'DAY_CREATED' : 'IN_DAY';
      if (placement === 'DAY_CREATED') { state.status = 'OPEN_AUTOMATIC'; state.origin = 'AUTOMATIC_CREATION'; }
      this.sequence += 1;
      const at = new Date(this.env.now());
      const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
      state.movements.push({
        cashMovementId: `cm-${this.sequence}`, movementType: movement.movementType, concept: movement.concept, paymentMedium: movement.paymentMedium,
        amount: movement.movementType === 'INCOME' ? movement.amountCents : -movement.amountCents, afterClosing: placement === 'AFTER_CLOSING',
        registeredAt: `${BUSINESS_DATE}T${time}:00`, registeredBy: this.env.actor(),
      });
      return { kind: 'registered', placement };
    });
  }

  close(key: string): CashClosingResult {
    return this.once(key, (): CashClosingResult => {
      const state = this.current();
      if (state.status === 'CLOSED') { return { kind: 'refused', reason: 'ALREADY_CLOSED' }; }
      if (state.status !== 'OPEN_OPERATIVE') { return { kind: 'refused', reason: 'NOT_OPERATIVE' }; }
      state.status = 'CLOSED';
      state.closing = { at: this.stamp(), by: this.env.actor() };
      return { kind: 'closed', expectedCash: this.read().metrics.expectedCash ?? 0 };
    });
  }

  /** The base of an open operative day only; the metrics are resolved again from it (RN-CJ10). No audit trail is kept: the demo has no port for it. */
  adjustBase(baseCents: number, key: string): CashBaseResult {
    return this.once(key, (): CashBaseResult => {
      const state = this.current();
      if (state.status === 'CLOSED') { return { kind: 'refused', reason: 'DAY_CLOSED' }; }
      if (state.status !== 'OPEN_OPERATIVE') { return { kind: 'refused', reason: 'NOT_OPERATIVE' }; }
      state.base = baseCents;
      return { kind: 'adjusted' };
    });
  }

  /** AC-CJ.5: a row with who and when; the closure itself is not touched. The demo closure is manual, so no automatic one is refused here. */
  registerCorrection(closureId: string, justification: string, key: string): CashCorrectionResult {
    return this.once(key, (): CashCorrectionResult => {
      if (!this.closures().some((closure) => closure.cashClosureId === closureId)) { return { kind: 'refused', reason: 'NOT_FOUND' }; }
      this.corrections.set(closureId, [...(this.corrections.get(closureId) ?? []), { appliedAt: this.stamp(), appliedBy: this.env.actor(), justification }]);
      return { kind: 'registered' };
    });
  }

  /** The closures: only the day of the page once it is closed (a second close creates none). */
  closures(): CashClosure[] {
    const state = this.current();
    if (state.status !== 'CLOSED') { return []; }
    const { metrics } = this.read();
    const closing = state.closing ?? { at: `${BUSINESS_DATE}T18:00:00`, by: `${WHO} (Administrador del tenant)` };
    return [{
      cashClosureId: `cl-${BUSINESS_DATE}`, businessDate: BUSINESS_DATE, closingMode: 'MANUAL', origin: state.origin ?? 'OPERATIONAL_OPENING', reopened: false, openingBase: state.base,
      income: metrics.income, operationalPayments: metrics.operationalPayments, expenses: metrics.expenses, refunds: metrics.refunds, total: metrics.total, expectedCash: metrics.expectedCash,
      closedBy: closing.by, closedAt: closing.at, reopenings: [], corrections: this.corrections.get(`cl-${BUSINESS_DATE}`) ?? [], movements: [...state.movements], nonCashMovements: state.movements.some((m) => m.paymentMedium === 'TRANSFER') ? 1 : 0,
    }];
  }

  private stamp(): string {
    const at = new Date(this.env.now());
    return `${BUSINESS_DATE}T${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}:00`;
  }

  private once<T>(key: string, apply: () => T): T {
    if (!this.answers.has(key)) { this.answers.set(key, apply()); }
    return this.answers.get(key) as T;
  }
}

export class DemoCashDaySource extends CashDaySource {
  constructor(private readonly store: DemoCashStore = new DemoCashStore()) { super(); }
  override today(): Promise<CashDay> {
    if (demoFixture('failing-cash-source')) { return Promise.reject(new Error('failing-cash-source')); }
    return Promise.resolve(this.store.read());
  }
}

/** DEMO: the closures of the same store; the fixtures failing-closures and empty-closures are read here only. */
export class DemoCashClosuresSource extends CashClosuresSource {
  constructor(private readonly store: DemoCashStore = new DemoCashStore()) { super(); }
  override list(): Promise<readonly CashClosure[]> {
    if (demoFixture('failing-closures')) { return Promise.reject(new Error('failing-closures')); }
    return Promise.resolve(demoFixture('empty-closures') ? [] : this.store.closures());
  }
}

export class DemoCashMovementWriter extends CashMovementWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override register(movement: NewCashMovement, idempotencyKey: string): Promise<CashMovementResult> { return Promise.resolve(this.store.register(movement, idempotencyKey)); }
}

export class DemoCashBaseWriter extends CashBaseWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override adjust(baseCents: number, idempotencyKey: string): Promise<CashBaseResult> { return Promise.resolve(this.store.adjustBase(baseCents, idempotencyKey)); }
}

export class DemoCashClosingWriter extends CashClosingWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override close(idempotencyKey: string): Promise<CashClosingResult> { return Promise.resolve(this.store.close(idempotencyKey)); }
}

export class DemoCashCorrectionWriter extends CashCorrectionWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override register(closureId: string, justification: string, idempotencyKey: string): Promise<CashCorrectionResult> {
    return Promise.resolve(this.store.registerCorrection(closureId, justification, idempotencyKey));
  }
}

/** One store for the three ports; the responsible of a new row is the role of who acts, as the mockup writes it. */
export function cashDemoProviders(): Provider[] {
  return [
    {
      provide: DemoCashStore,
      useFactory: () => {
        const clock = inject(Clock);
        const capabilities = inject(PortalCapabilities);
        return new DemoCashStore({ now: () => clock.now(), actor: () => capabilities.roleLabel() });
      },
    },
    { provide: CashDaySource, useFactory: () => new DemoCashDaySource(inject(DemoCashStore)) },
    { provide: CashClosuresSource, useFactory: () => new DemoCashClosuresSource(inject(DemoCashStore)) },
    { provide: CASH_CONSULTATION_LINKS, useValue: CashHistoryLinkComponent, multi: true },
    { provide: CASH_CONSULTATION_LINKS, useValue: CashMonthlyLinkComponent, multi: true },
    { provide: CashMovementWriter, useFactory: () => new DemoCashMovementWriter(inject(DemoCashStore)) },
    { provide: CashBaseWriter, useFactory: () => new DemoCashBaseWriter(inject(DemoCashStore)) },
    { provide: CashClosingWriter, useFactory: () => new DemoCashClosingWriter(inject(DemoCashStore)) },
    { provide: CashCorrectionWriter, useFactory: () => new DemoCashCorrectionWriter(inject(DemoCashStore)) },
  ];
}
