/** Why the service refused the change: a closed day, or a day with no operative opening (a cash created by a transfer has no base). */
export type CashBaseResult =
  | { readonly kind: 'adjusted' }
  | { readonly kind: 'refused'; readonly reason: 'DAY_CLOSED' | 'NOT_OPERATIVE' };

/** Plan D-03: "Ajustar base diaria" (AC-CJ.9). Only the Administrador changes it (RN-CJ6): the portal hides the action, the service refuses regardless. `baseCents` is in cents. */
export abstract class CashBaseWriter {
  abstract adjust(baseCents: number, idempotencyKey: string): Promise<CashBaseResult>;
}
