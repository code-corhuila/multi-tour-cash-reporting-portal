/** The summary row of screen 16 for the period of the report: names of `monthly_administrative_reports`, amounts in cents. */
export interface PeriodSummary {
  /** The month the four values are of, `2026-09`. */
  readonly reportedPeriod: string;
  /** Not in 06-data yet (gap G-SALES, PROPUESTO): the commercial value confirmed in the period. */
  readonly confirmedSales: number;
  readonly periodIncome: number;
  readonly registeredOperationalCosts: number;
  readonly registeredCancellations: number;
}

/** Plan D-02: read only and with no argument; the session decides the tenant. A period without movements is four zeros. */
export abstract class PeriodSummarySource {
  abstract current(): Promise<PeriodSummary>;
}
