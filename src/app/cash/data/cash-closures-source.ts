import { CashMovement, CashOrigin } from './cash-day-source';

/** `MANUAL`: closed by a person; `AUTOMATIC`: a cash without opening or cash, closed by job 8 at the end of its day (AC-CJ.8). */
export type CashClosingMode = 'MANUAL' | 'AUTOMATIC';
/** A reopening, field names of `cash_session_reopenings`; the mandatory reason stays with who and when (AC-CJ.15). */
export interface CashReopening { readonly reopenedAt: string; readonly reopenedBy: string; readonly reason: string }
/** A correction after the closing: it never overwrites the closure (RN-CJ5). */
export interface CashCorrection { readonly appliedAt: string; readonly appliedBy: string; readonly justification: string }

/** One closed day, every figure resolved by the service and in cents (RN-CJ1, RN-CJ10); `expectedCash` is null for a cash without cash. */
export interface CashClosure {
  readonly cashClosureId: string;
  /** The tenant's calendar day, `2026-08-31`. */
  readonly businessDate: string;
  readonly closingMode: CashClosingMode;
  readonly origin: CashOrigin;
  readonly reopened: boolean;
  readonly openingBase: number;
  readonly income: number;
  readonly operationalPayments: number;
  readonly expenses: number;
  readonly refunds: number;
  readonly total: number;
  readonly expectedCash: number | null;
  readonly closedBy: string;
  readonly closedAt: string;
  readonly reopenings: readonly CashReopening[];
  readonly corrections: readonly CashCorrection[];
  readonly movements: readonly CashMovement[];
  /** How many of `movements` were paid by transfer: reconciled apart, they never change the expected cash (RN-CJ10). */
  readonly nonCashMovements: number;
}

/** Plan D-03: read only and with no argument; newest day first, the automatic closings included. The session decides the tenant. */
export abstract class CashClosuresSource {
  abstract list(): Promise<readonly CashClosure[]>;
}
