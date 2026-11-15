export type CashReopeningResult =
  | { readonly kind: 'reopened' }
  | { readonly kind: 'refused'; readonly reason: 'NOT_CLOSED' | 'REASON_REQUIRED' };

/** Plan D-03: the reopening of the closed cash of the day (AC-CJ.15); the reason is mandatory, no second cash is created and the closure stays in the history. */
export abstract class CashReopeningWriter {
  abstract reopen(reason: string, idempotencyKey: string): Promise<CashReopeningResult>;
}
