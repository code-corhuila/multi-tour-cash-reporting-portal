import { Provider } from '@angular/core';
import { REPORTS_MONTHLY_BLOCKS } from '../shared/portal-slots';
import { MonthlyReportComponent } from './components/monthly-report.component';
import { PeriodSummaryComponent } from './components/period-summary.component';

/** What this story contributes to screen 16 (plan D-01): its summary row and "Reporte mensual"; a build composes these providers and never imports the components. */
export function reportsMonthlySlotProviders(): Provider[] {
  return [
    { provide: REPORTS_MONTHLY_BLOCKS, useValue: PeriodSummaryComponent, multi: true },
    { provide: REPORTS_MONTHLY_BLOCKS, useValue: MonthlyReportComponent, multi: true },
  ];
}
