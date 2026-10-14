import { CashMovementType, CashPaymentMedium } from './cash-day-source';

/** What a person types: a refund is never typed (AC-CJ.10) and the sign belongs to the service; `amountCents` is a positive integer. */
export interface NewCashMovement {
  readonly movementType: Exclude<CashMovementType, 'REFUND'>;
  readonly concept: string;
  readonly amountCents: number;
  readonly paymentMedium: CashPaymentMedium;
}

/** Where the service placed it: in the open day, after the closing (a transfer, GAP-013), or creating the cash of the day (a transfer, AC-CJ.8). */
export type CashMovementResult =
  | { readonly kind: 'registered'; readonly placement: 'IN_DAY' | 'AFTER_CLOSING' | 'DAY_CREATED' }
  | { readonly kind: 'refused'; readonly reason: 'CASH_NEEDS_OPENING' | 'DAY_CLOSED' };

/** Plan D-03: records one movement of the tenant's day; the same key records it once (D-07); a transfer needs no opening (RN-CJ11). */
export abstract class CashMovementWriter {
  abstract register(movement: NewCashMovement, idempotencyKey: string): Promise<CashMovementResult>;
}
