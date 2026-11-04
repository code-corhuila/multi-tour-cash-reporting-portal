import { Provider } from '@angular/core';
import { cashConsultationSlotProviders } from './cash/cash-consultation-slots';
import { CashClosuresSource } from './cash/data/cash-closures-source';
import { CashDaySource } from './cash/data/cash-day-source';
import { CashClosuresApiSource } from './http/cash-closures-api-source';
import { CashDayApiSource } from './http/cash-day-api-source';
import { PortalApiClient } from './shell-contract';

/**
 * Production: one adapter per port over the container client (micro plan D-CSH-02). Registered so far: the READ ports of the day and the
 * closures (HU-CSH-001 A1, branch 1). The writers, the dashboard and the monthly report have none yet, so their areas are not offered
 * (`has` in portal-areas) and the actions of a screen whose writer is missing are not drawn.
 */
export function sourceProviders(client: PortalApiClient): Provider[] {
  return [
    { provide: CashDaySource, useValue: new CashDayApiSource(client) },
    { provide: CashClosuresSource, useValue: new CashClosuresApiSource(client) },
    ...cashConsultationSlotProviders(),
  ];
}
