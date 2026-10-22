/** How the day stands: with its operational opening, created by a transfer, not created yet, or closed (spec section 5, AC-CJ.13). */
export type CashDayStatus = 'OPEN_OPERATIVE' | 'OPEN_AUTOMATIC' | 'NO_OPENING' | 'CLOSED';
/** `cash_sessions.origin` (06-data); null while the day has no cash. */
export type CashOrigin = 'OPERATIONAL_OPENING' | 'AUTOMATIC_CREATION';
/** `cash_movements.movementType`; a REFUND is never typed by a person (AC-CJ.10). */
export type CashMovementType = 'INCOME' | 'OPERATIONAL_PAYMENT' | 'EXPENSE' | 'REFUND';
/** `cash_movements.paymentMedium`: only CASH reaches the expected cash (RN-CJ10). */
export type CashPaymentMedium = 'CASH' | 'TRANSFER';

/** A movement of the day, field names of `cash_movements`; `amount` is signed cents (outflows negative), `registeredAt` the tenant's local time. */
export interface CashMovement {
  readonly cashMovementId: string;
  readonly movementType: CashMovementType;
  readonly concept: string;
  readonly amount: number;
  readonly paymentMedium: CashPaymentMedium;
  readonly afterClosing: boolean;
  readonly registeredAt: string;
  readonly registeredBy: string;
}

/** Everything the screen shows as a number, resolved by the service (RN-CJ1, RN-CJ10); cents, the five outflow and inflow figures unsigned. */
export interface CashDayMetrics {
  readonly income: number;
  readonly operationalPayments: number;
  readonly expenses: number;
  readonly refunds: number;
  /** Base + income - payments - expenses - refunds, every medium. */
  readonly total: number;
  /** Base + cash entries - cash exits; null where it does not apply (a day without cash). */
  readonly expectedCash: number | null;
  /** Signed: transfers are reconciled apart and never change the expected cash. */
  readonly netTransfers: number;
}

export interface CashDay {
  /** The tenant's calendar day, `2026-09-01`. */
  readonly businessDate: string;
  readonly status: CashDayStatus;
  readonly origin: CashOrigin | null;
  /** Cents of physical cash; 0 while the day has no opening. */
  readonly openingBase: number;
  readonly openedBy: string | null;
  /** The base the service proposes to open the day with (the last registered one); the Colaborador opens with exactly this (AC-CJ.13). */
  readonly parametrizedBase?: number;
  /** An earlier day whose cash had its operational opening and was never closed: it accepts no movement and today's cash is independent (AC-CJ.16, GAP-012). */
  readonly pendingClosure?: { readonly businessDate: string; readonly openedBy: string; readonly openingBase: number };
  readonly movements: readonly CashMovement[];
  readonly metrics: CashDayMetrics;
}

/** Plan D-03: read only and with no argument; the session decides the tenant and the service the day (Article VIII). */
export abstract class CashDaySource {
  abstract today(): Promise<CashDay>;
}
