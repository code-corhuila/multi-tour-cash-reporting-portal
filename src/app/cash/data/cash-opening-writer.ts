/** `baseCents` is the base the cash was opened with, cents of physical cash. */
export type CashOpeningResult =
  | { readonly kind: 'opened'; readonly baseCents: number }
  | { readonly kind: 'refused'; readonly reason: 'ALREADY_OPEN' | 'DAY_CLOSED' };

/** Plan D-03: the operational opening of the day (AC-CJ.13); one per tenant and date, and the cash a transfer created by itself goes through it too. */
export abstract class CashOpeningWriter {
  abstract open(baseCents: number, idempotencyKey: string): Promise<CashOpeningResult>;
}
