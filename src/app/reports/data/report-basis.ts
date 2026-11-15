import { Injectable, signal } from '@angular/core';
import { MonthlyPeriod } from '../../shared/monthly-period';
import { PeriodSummary } from './period-summary-source';

/**
 * What the summary row and the article "Reporte mensual" loaded, kept for the export (RN-RM6): the file holds the values the
 * screen already shows, so no port is read twice. `undefined` while a view loads or failed; an empty month is an empty list.
 */
@Injectable({ providedIn: 'root' })
export class ReportBasis {
  readonly summary = signal<PeriodSummary | undefined>(undefined);
  readonly periods = signal<readonly MonthlyPeriod[] | undefined>(undefined);
}
