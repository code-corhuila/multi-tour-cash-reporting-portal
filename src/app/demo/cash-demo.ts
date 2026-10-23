import { Provider, inject } from '@angular/core';
import { CashClosure, CashClosuresSource } from '../cash/data/cash-closures-source';
import { cashConsultationSlotProviders } from '../cash/cash-consultation-slots';
import { CashBaseResult, CashBaseWriter } from '../cash/data/cash-base-writer';
import { CashClosingResult, CashClosingWriter } from '../cash/data/cash-closing-writer';
import { CashDay, CashDayMetrics, CashDaySource, CashDayStatus, CashMovement, CashOrigin } from '../cash/data/cash-day-source';
import { CashOpeningResult, CashOpeningWriter } from '../cash/data/cash-opening-writer';
import { CashPendingClosingResult, CashPendingClosingWriter } from '../cash/data/cash-pending-closing-writer';
import { CashReopeningResult, CashReopeningWriter } from '../cash/data/cash-reopening-writer';
import { CashMovementResult, CashMovementWriter, NewCashMovement } from '../cash/data/cash-movement-writer';
import { Clock } from '../shared/clock';
import { PortalCapabilities } from '../shared/portal-capabilities';
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

/** An earlier day with its opening and no closing (GAP-012); the fixture "pending-closure-day" seeds one. */
interface PendingCash { businessDate: string; openedBy: string; base: number; movements: CashMovement[] }
interface State {
  status: CashDayStatus; origin: CashOrigin | null; base: number; openedBy: string | null; movements: CashMovement[]; closing?: { at: string; by: string }; history: CashClosure[]; pending?: PendingCash;
}
const pendingCash = (): PendingCash => ({
  businessDate: '2026-08-31', openedBy: `${WHO} (Administrador del tenant)`, base: BASE,
  movements: [{ cashMovementId: 'cm-p1', movementType: 'INCOME', concept: 'Pago en efectivo reserva #RES-1899', amount: 8000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-08-31T10:00:00', registeredBy: WHO }],
});
interface Environment { readonly now: () => number; readonly actor: () => string }

/**
 * DEMO (spec 001- DD-1): the one in-memory cash of the page, read by the source and written by the writers (plan D-03).
 * It starts, on its first use, as the fixture asks: the open day, "no-opening-day" or "closed-day-retry".
 */
export class DemoCashStore {
  private state?: State;
  private sequence = 4;
  /** The last registered base: what the day is proposed to open with. */
  private parametrized = BASE;
  /** A key answers once: the same key returns the same answer and records nothing more (D-07). */
  private readonly answers = new Map<string, unknown>();

  constructor(private readonly env: Environment = { now: () => Date.now(), actor: () => `${WHO} (Administrador del tenant)` }) {}

  private current(): State {
    this.state ??= {
      ...(demoFixture('no-opening-day')
        ? { status: 'NO_OPENING', origin: null, base: 0, openedBy: null, movements: [], history: [] }
        : { status: demoFixture('closed-day-retry') ? 'CLOSED' : 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', base: BASE, openedBy: `${WHO} (Administrador del tenant)`, history: [],
          movements: demoFixture('empty-cash-day') ? [] : LEDGER.filter((m) => m.validated).map(({ validated: _validated, ...movement }) => movement) }),
      ...(demoFixture('pending-closure-day') && { pending: pendingCash() }),
    } as State;
    return this.state;
  }

  read(): CashDay {
    const { status, origin, base, openedBy, movements, pending } = this.current();
    return { businessDate: BUSINESS_DATE, status, origin, openingBase: base, openedBy, parametrizedBase: this.parametrized, movements: [...movements],
      ...(pending && { pendingClosure: { businessDate: pending.businessDate, openedBy: pending.openedBy, openingBase: pending.base } }), metrics: resolve(movements, base, status === 'OPEN_OPERATIVE' || status === 'CLOSED') };
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

  /** The operational opening (AC-CJ.13): also for the cash a transfer created by itself, which keeps its movements and gains the base. */
  open(baseCents: number, key: string): CashOpeningResult {
    return this.once(key, (): CashOpeningResult => {
      const state = this.current();
      if (state.status === 'CLOSED') { return { kind: 'refused', reason: 'DAY_CLOSED' }; }
      if (state.status === 'OPEN_OPERATIVE') { return { kind: 'refused', reason: 'ALREADY_OPEN' }; }
      Object.assign(state, { status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', base: baseCents, openedBy: this.env.actor() });
      this.parametrized = baseCents;
      return { kind: 'opened', baseCents };
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

  /** The reopening of the closed cash (AC-CJ.15): the closure so far stays in the history, marked as reopened, with the reason, who and when; the same cash opens again. */
  reopen(reason: string, key: string): CashReopeningResult {
    return this.once(key, (): CashReopeningResult => {
      const state = this.current();
      if (state.status !== 'CLOSED') { return { kind: 'refused', reason: 'NOT_CLOSED' }; }
      const justification = reason.trim();
      if (justification === '') { return { kind: 'refused', reason: 'REASON_REQUIRED' }; }
      const record = { reopenedAt: this.stamp(), reopenedBy: this.env.actor(), reason: justification };
      state.history.push({ ...this.liveClosure(this.todayOrder(state)), reopened: true, reopenings: [record] });
      state.status = 'OPEN_OPERATIVE';
      state.closing = undefined;
      return { kind: 'reopened' };
    });
  }

  /** The closures, newest first: the one of the closed day as it stands, and each earlier one a reopening left (DP-CJ8: every closing of the day is kept). */
  closures(): CashClosure[] {
    const state = this.current();
    return [...(state.status === 'CLOSED' ? [this.liveClosure(this.todayOrder(state))] : []), ...[...state.history].reverse()];
  }

  /** The closing of an earlier day whose cash was never closed (AC-CJ.16): it keeps its own date, today's cash is not touched, and it joins the history. */
  closePending(key: string): CashPendingClosingResult {
    return this.once(key, (): CashPendingClosingResult => {
      const state = this.current();
      const earlier = state.pending;
      if (!earlier) { return { kind: 'refused', reason: 'NO_PENDING' }; }
      const metrics = resolve(earlier.movements, earlier.base, true);
      state.history.push({
        cashClosureId: `cl-${earlier.businessDate}`, businessDate: earlier.businessDate, closingMode: 'MANUAL', origin: 'OPERATIONAL_OPENING', reopened: false, openingBase: earlier.base,
        income: metrics.income, operationalPayments: metrics.operationalPayments, expenses: metrics.expenses, refunds: metrics.refunds, total: metrics.total, expectedCash: metrics.expectedCash,
        closedBy: this.env.actor(), closedAt: this.stamp(), reopenings: [], corrections: [], movements: [...earlier.movements], nonCashMovements: 0,
      });
      state.pending = undefined;
      return { kind: 'closed', businessDate: earlier.businessDate, expectedCash: metrics.expectedCash };
    });
  }

  private todayOrder(state: State): number { return state.history.filter((closure) => closure.businessDate === BUSINESS_DATE).length + 1; }

  private liveClosure(order: number): CashClosure {
    const state = this.current();
    const { metrics } = this.read();
    const closing = state.closing ?? { at: `${BUSINESS_DATE}T18:00:00`, by: `${WHO} (Administrador del tenant)` };
    return {
      cashClosureId: order === 1 ? `cl-${BUSINESS_DATE}` : `cl-${BUSINESS_DATE}-${order}`, businessDate: BUSINESS_DATE, closingMode: 'MANUAL', origin: state.origin ?? 'OPERATIONAL_OPENING', reopened: false, openingBase: state.base,
      income: metrics.income, operationalPayments: metrics.operationalPayments, expenses: metrics.expenses, refunds: metrics.refunds, total: metrics.total, expectedCash: metrics.expectedCash,
      closedBy: closing.by, closedAt: closing.at, reopenings: [], corrections: [], movements: [...state.movements], nonCashMovements: state.movements.some((m) => m.paymentMedium === 'TRANSFER') ? 1 : 0,
    };
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

export class DemoCashOpeningWriter extends CashOpeningWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override open(baseCents: number, idempotencyKey: string): Promise<CashOpeningResult> { return Promise.resolve(this.store.open(baseCents, idempotencyKey)); }
}

export class DemoCashReopeningWriter extends CashReopeningWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override reopen(reason: string, idempotencyKey: string): Promise<CashReopeningResult> { return Promise.resolve(this.store.reopen(reason, idempotencyKey)); }
}

export class DemoCashPendingClosingWriter extends CashPendingClosingWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override closePending(idempotencyKey: string): Promise<CashPendingClosingResult> { return Promise.resolve(this.store.closePending(idempotencyKey)); }
}

export class DemoCashClosingWriter extends CashClosingWriter {
  constructor(private readonly store: DemoCashStore) { super(); }
  override close(idempotencyKey: string): Promise<CashClosingResult> { return Promise.resolve(this.store.close(idempotencyKey)); }
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
    ...cashConsultationSlotProviders(),
    { provide: CashMovementWriter, useFactory: () => new DemoCashMovementWriter(inject(DemoCashStore)) },
    { provide: CashBaseWriter, useFactory: () => new DemoCashBaseWriter(inject(DemoCashStore)) },
    { provide: CashClosingWriter, useFactory: () => new DemoCashClosingWriter(inject(DemoCashStore)) },
    { provide: CashOpeningWriter, useFactory: () => new DemoCashOpeningWriter(inject(DemoCashStore)) },
    { provide: CashReopeningWriter, useFactory: () => new DemoCashReopeningWriter(inject(DemoCashStore)) },
    { provide: CashPendingClosingWriter, useFactory: () => new DemoCashPendingClosingWriter(inject(DemoCashStore)) },
  ];
}
