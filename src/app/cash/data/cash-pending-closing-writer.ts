/** `expectedCash` in cents at the formal closing of the earlier day; null for a cash without cash. */
export type CashPendingClosingResult =
  | { readonly kind: 'closed'; readonly businessDate: string; readonly expectedCash: number | null }
  | { readonly kind: 'refused'; readonly reason: 'NO_PENDING' };

/** Plan D-03: the formal closing of a cash with opening that was not closed at the end of its day (AC-CJ.16); it keeps its own date and today's cash is untouched. */
export abstract class CashPendingClosingWriter {
  abstract closePending(idempotencyKey: string): Promise<CashPendingClosingResult>;
}
