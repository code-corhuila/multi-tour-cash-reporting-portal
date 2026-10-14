/** `expectedCash` in cents: base + cash entries - cash exits at the closing (RN-CJ10); the service computes it. */
export type CashClosingResult =
  | { readonly kind: 'closed'; readonly expectedCash: number }
  | { readonly kind: 'refused'; readonly reason: 'ALREADY_CLOSED' | 'NOT_OPERATIVE' };

/** Plan D-03: the explicit closing of the day (AC-CJ.3); one ordinary closing per tenant and date, and a cash created by a transfer closes by itself (job 8). */
export abstract class CashClosingWriter {
  abstract close(idempotencyKey: string): Promise<CashClosingResult>;
}
