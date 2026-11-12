import { Provider } from '@angular/core';
import { cashConsultationSlotProviders } from './cash/cash-consultation-slots';
import { CashClosuresSource } from './cash/data/cash-closures-source';
import { CashBaseWriter } from './cash/data/cash-base-writer';
import { CashClosingWriter } from './cash/data/cash-closing-writer';
import { CashCorrectionWriter } from './cash/data/cash-correction-writer';
import { CashDaySource } from './cash/data/cash-day-source';
import { CashMovementWriter } from './cash/data/cash-movement-writer';
import { CashOpeningWriter } from './cash/data/cash-opening-writer';
import { CashPendingClosingWriter } from './cash/data/cash-pending-closing-writer';
import { CashReopeningWriter } from './cash/data/cash-reopening-writer';
import { CashClosingApiWriter, CashPendingClosingApiWriter, CashReopeningApiWriter } from './http/cash-closing-api';
import { CashClosuresApiSource } from './http/cash-closures-api-source';
import { CashCorrectionApiWriter } from './http/cash-correction-api';
import { CashDayApiSource } from './http/cash-day-api-source';
import { DailyDashboardApiSource } from './http/daily-dashboard-api-source';
import { CashBaseApiWriter, CashMovementApiWriter, CashOpeningApiWriter } from './http/cash-writers-api';
import { MonthlyReportApiSource, PeriodSummaryApiSource } from './http/monthly-report-api-sources';
import { MonthlyReportSource } from './cash/data/monthly-report-source';
import { reportsMonthlySlotProviders } from './reports/reports-monthly-slots';
import { PeriodSummarySource } from './reports/data/period-summary-source';
import { DailyDashboardSource } from './reports/data/daily-dashboard-source';
import { PortalCapabilities } from './shared/portal-capabilities';
import { PortalApiClient } from './shell-contract';

/**
 * Production: one adapter per port over the container client (micro plan D-CSH-02). Registered so far: the READ ports of the day and the
 * closures (HU-CSH-001 A1, branch 1) and the writers of the opening, the base and the movements (branch 2) and of the closing, the pending closing and the reopening (branch 3) and of the correction (TD-12). The dashboard (HU-CSH-002) and the monthly report (HU-CSH-003) read through their adapters;
 * the actions of a screen whose writer is missing are not drawn.
 */
export function sourceProviders(client: PortalApiClient): Provider[] {
  return [
    { provide: CashDaySource, useValue: new CashDayApiSource(client) },
    { provide: CashClosuresSource, useValue: new CashClosuresApiSource(client) },
    // Only the Administrador sends the base of the opening (AC-CJ.13): the capability is read when the writer acts, with the session of the mount.
    { provide: CashOpeningWriter, useFactory: (capabilities: PortalCapabilities) => new CashOpeningApiWriter(client, () => capabilities.canChangeBase()), deps: [PortalCapabilities] },
    { provide: CashBaseWriter, useValue: new CashBaseApiWriter(client) },
    { provide: CashMovementWriter, useValue: new CashMovementApiWriter(client) },
    { provide: CashClosingWriter, useValue: new CashClosingApiWriter(client) },
    { provide: CashPendingClosingWriter, useValue: new CashPendingClosingApiWriter(client) },
    { provide: CashReopeningWriter, useValue: new CashReopeningApiWriter(client) },
    { provide: CashCorrectionWriter, useValue: new CashCorrectionApiWriter(client) },
    // HU-CSH-002: the area "Reportes" appears by itself, because it asks for this port (portal-areas `has`).
    { provide: DailyDashboardSource, useValue: new DailyDashboardApiSource(client) },
    // HU-CSH-003: the sub-screen "Consolidación mensual" and the two blocks of Reportes appear by themselves, because they ask for these ports.
    { provide: MonthlyReportSource, useValue: new MonthlyReportApiSource(client) },
    { provide: PeriodSummarySource, useValue: new PeriodSummaryApiSource(client) },
    ...cashConsultationSlotProviders(),
    ...reportsMonthlySlotProviders(),
  ];
}
