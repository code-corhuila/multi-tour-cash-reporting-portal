import { MonthlyPeriod } from '../../shared/monthly-period';

/** Plan D-02: read only and with no argument; the session decides the tenant. Newest period first; a month without movements is an entry in zeros. */
export abstract class MonthlyReportSource {
  abstract periods(): Promise<readonly MonthlyPeriod[]>;
}
