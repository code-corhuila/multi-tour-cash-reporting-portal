import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { MonthlyPeriodComponent } from '../../shared/monthly-period.component';
import { PageLoad, PageStateComponent } from '../../shared/page-state';
import { PortalNavigation } from '../../shared/portal-navigation';
import { CASH_CONSULTATION_COPY } from '../cash-consultation-copy';
import { MonthlyPeriod } from '../../shared/monthly-period';
import { MonthlyReportSource } from '../data/monthly-report-source';

/** Sub-screen of 14, admin-consolidacion-mensual.html: the periods as the service consolidated them; read only, nothing is added up here (RN-RM1). */
@Component({
  selector: 'csh-cash-monthly',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageStateComponent, MonthlyPeriodComponent],
  template: `
    <section class="csh-cash" aria-labelledby="csh-monthly-title">
      <header class="csh-cash-header csh-history-header">
        <div>
          <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
          <h1 id="csh-monthly-title" class="csh-cash-title">{{ t.title }}</h1>
        </div>
        <button type="button" (click)="navigation.open('cash')">{{ back }}</button>
      </header>
      <p class="csh-history-copy">{{ t.note }}</p>
      <csh-page-state [state]="load.state()" [emptyText]="t.empty">
        @let s = load.state();
        @if (s.kind === 'data') {
          @for (period of s.items; track period.reportedPeriod) { <section class="csh-cash-panel csh-history-period"><csh-monthly-period [period]="period" /></section> }
        }
      </csh-page-state>
    </section>
  `,
})
export class CashMonthlyPageComponent {
  protected readonly t = CASH_CONSULTATION_COPY.monthly;
  protected readonly back = CASH_CONSULTATION_COPY.back;
  protected readonly navigation = inject(PortalNavigation);
  private readonly source = inject(MonthlyReportSource);
  protected readonly load = new PageLoad<MonthlyPeriod>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.load.run(() => this.source.periods());
  }
}
