import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { PortalNavigation } from '../../shared/portal-navigation';
import { CASH_CONSULTATION_COPY } from '../cash-consultation-copy';

/** "Historial de caja" of the panel "Consulta" of screen 14: drawn only when the build offers the area (plan D-02). */
@Component({
  selector: 'csh-cash-history-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (navigation.has('cash-history')) { <button type="button" (click)="navigation.open('cash-history')">{{ label }}</button> }`,
})
export class CashHistoryLinkComponent {
  protected readonly navigation = inject(PortalNavigation);
  protected readonly label = CASH_CONSULTATION_COPY.historyLink;
}

/** "Consolidación mensual" of the same panel (HU-CSH-003). */
@Component({
  selector: 'csh-cash-monthly-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (navigation.has('cash-monthly')) { <button type="button" (click)="navigation.open('cash-monthly')">{{ label }}</button> }`,
})
export class CashMonthlyLinkComponent {
  protected readonly navigation = inject(PortalNavigation);
  protected readonly label = CASH_CONSULTATION_COPY.monthlyLink;
}
