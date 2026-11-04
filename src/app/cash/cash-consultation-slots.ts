import { Provider } from '@angular/core';
import { CASH_CONSULTATION_LINKS } from '../shared/portal-slots';
import { CashHistoryLinkComponent, CashMonthlyLinkComponent } from './components/cash-consultation-links.component';

/** What this story contributes to the panel "Consulta" of screen 14 (plan D-02): a build composes these providers and never imports the components. */
export function cashConsultationSlotProviders(): Provider[] {
  return [
    { provide: CASH_CONSULTATION_LINKS, useValue: CashHistoryLinkComponent, multi: true },
    { provide: CASH_CONSULTATION_LINKS, useValue: CashMonthlyLinkComponent, multi: true },
  ];
}
