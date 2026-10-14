/**
 * One entry of the monthly report (`monthly_administrative_reports`, 06-data): field names of the table, amounts in cents,
 * all resolved by the service (RN-RM2, RN-RM3). The same entry feeds the consolidation of Caja and the article of Reportes.
 */
export interface MonthlyPeriod {
  /** The month, `2026-09`. */
  readonly reportedPeriod: string;
  readonly periodIncome: number;
  readonly operationalPayments: number;
  readonly operationalExpenses: number;
  readonly executedRefunds: number;
  /** Income - payments - expenses - refunds; the daily base is never income and each movement counts once (GAP-011). */
  readonly consolidatedCashTotal: number;
  readonly registeredCancellations: number;
  /** Cents; zero when the period has none. */
  readonly registeredOperationalCosts: number;
}

/** Plan D-02: read only and with no argument; the session decides the tenant. Newest period first; a month without movements is an entry in zeros. */
export abstract class MonthlyReportSource {
  abstract periods(): Promise<readonly MonthlyPeriod[]>;
}
