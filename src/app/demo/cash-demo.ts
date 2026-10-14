import { Provider } from '@angular/core';
import { CashDay, CashDayMetrics, CashDaySource, CashMovement } from '../cash/data/cash-day-source';
import { demoFixture } from './demo-fixtures';

/** The demo day of 001- (01 sep 2026, the mockup's demo clock): one base, one income and one refund by transfer, one cash expense (spec section 6). */
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
  entry('cm-3', '14:10', 'REFUND', 'Devolución reserva #RES-1902', -15000000, 'TRANSFER'),
  entry('cm-4', '15:30', 'INCOME', 'Pago reserva #RES-1903', 50000000, 'TRANSFER', false),
];

const magnitude = (movements: readonly CashMovement[], type: Type) =>
  movements.filter((m) => m.movementType === type).reduce((total, m) => total + Math.abs(m.amount), 0);
const net = (movements: readonly CashMovement[], medium: Medium) =>
  movements.filter((m) => m.paymentMedium === medium).reduce((total, m) => total + m.amount, 0);

/** The rules of RN-CJ1 and RN-CJ10 live here, in the demo that stands for the service (plan D-03). */
function resolve(movements: readonly CashMovement[]): CashDayMetrics {
  const income = magnitude(movements, 'INCOME');
  const operationalPayments = magnitude(movements, 'OPERATIONAL_PAYMENT');
  const expenses = magnitude(movements, 'EXPENSE');
  const refunds = magnitude(movements, 'REFUND');
  return {
    income, operationalPayments, expenses, refunds, total: BASE + income - operationalPayments - expenses - refunds,
    expectedCash: BASE + net(movements, 'CASH'), netTransfers: net(movements, 'TRANSFER'),
  };
}

/** DEMO (spec 001- DD-1): one in-memory store; the later ports of the story are implemented over this same instance. */
export class DemoCashDaySource extends CashDaySource {
  override today(): Promise<CashDay> {
    if (demoFixture('failing-cash-source')) { return Promise.reject(new Error('failing-cash-source')); }
    const movements = demoFixture('empty-cash-day') ? [] : LEDGER.filter((m) => m.validated).map(({ validated: _validated, ...movement }) => movement);
    return Promise.resolve({
      businessDate: BUSINESS_DATE, status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: BASE,
      openedBy: `${WHO} (Administrador del tenant)`, movements, metrics: resolve(movements),
    });
  }
}

export function cashDemoProviders(): Provider[] {
  return [{ provide: CashDaySource, useValue: new DemoCashDaySource() }];
}
