import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { MonthlyPeriod, MonthlyReportSource } from '../../cash/data/monthly-report-source';
import { MonthlyPeriodComponent } from '../../shared/monthly-period.component';
import { PageLoad, PageStateComponent } from '../../shared/page-state';
import { PortalNavigation } from '../../shared/portal-navigation';
import { REPORTS_COPY } from '../reports-copy';

/** The article "Reporte mensual" of screen 16: the periods of the one monthly port, the same entries as the consolidation of Caja. */
@Component({
  selector: 'csh-monthly-report',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageStateComponent, MonthlyPeriodComponent],
  template: `
    <article class="csh-reports-card" aria-labelledby="csh-reports-monthly-title">
      <p class="csh-reports-eyebrow">{{ t.monthlyEyebrow }}</p>
      <h2 id="csh-reports-monthly-title" class="csh-reports-card-title">{{ t.monthlyTitle }}</h2>
      <p class="csh-reports-note">{{ t.monthlyIntro }}</p>
      <csh-page-state [state]="load.state()" [emptyText]="t.monthlyEmpty">
        @let s = load.state();
        @if (s.kind === 'data') {
          @for (period of s.items; track period.reportedPeriod) { <csh-monthly-period [period]="period" /> }
        }
      </csh-page-state>
      @if (navigation?.has('cash')) {
        <a class="csh-reports-link" role="link" tabindex="0" (click)="toCash()" (keydown.enter)="toCash()">{{ t.cash }}</a>
      }
    </article>
  `,
})
export class MonthlyReportComponent {
  protected readonly t = REPORTS_COPY;
  protected readonly navigation = inject(PortalNavigation, { optional: true });
  private readonly source = inject(MonthlyReportSource);
  protected readonly load = new PageLoad<MonthlyPeriod>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.reload();
  }

  /** The newest request wins (PageLoad); the source takes no tenant and no period. */
  reload(): void { this.load.run(() => this.source.periods()); }

  protected toCash(): void { this.navigation?.open('cash'); }
}
