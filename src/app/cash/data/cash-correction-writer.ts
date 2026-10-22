/** Why the service refused the correction: an automatic closure takes none (it never had cash), or the closure is not there. */
export type CashCorrectionResult =
  | { readonly kind: 'registered' }
  | { readonly kind: 'refused'; readonly reason: 'AUTOMATIC_CLOSURE' | 'NOT_FOUND' };

/**
 * Plan D-03, T-07: "Registrar corrección" of the history (AC-CJ.5, RN-CJ5). Only the Administrador registers it: the portal hides the form, the service refuses
 * regardless. It adds a row (who, when, justification) and never overwrites the closure nor creates a second one. One key per intention.
 */
export abstract class CashCorrectionWriter {
  abstract register(cashClosureId: string, justification: string, idempotencyKey: string): Promise<CashCorrectionResult>;
}
