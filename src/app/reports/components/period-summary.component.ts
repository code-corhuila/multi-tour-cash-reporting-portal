import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { formatCop } from '../../shared/format';
import { PageLoad, PageStateComponent } from '../../shared/page-state';
import { PeriodSummary, PeriodSummarySource } from '../data/period-summary-source';
import { REPORTS_COPY } from '../reports-copy';

/** The summary row of screen 16: four values of the period as the source gives them, no action (RN-RM4, RN-RM5). */
@Component({
  selector: 'csh-period-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageStateComponent],
  template: `
    <section class="csh-monthly-summary" [attr.aria-label]="t.summaryLabel">
      <csh-page-state [state]="load.state()" emptyText="">
        @let s = load.state();
        @if (s.kind === 'data') {
          <dl>
            @for (metric of metrics(s.items[0]); track metric.label) {
              <div class="csh-monthly-metric">
                <dt>{{ metric.label }}</dt>
                <dd class="csh-reports-value">{{ metric.value }}</dd>
                <dd class="csh-reports-note">{{ metric.note }}</dd>
              </div>
            }
          </dl>
        }
      </csh-page-state>
    </section>
  `,
})
export class PeriodSummaryComponent {
  protected readonly t = REPORTS_COPY;
  private readonly source = inject(PeriodSummarySource);
  protected readonly load = new PageLoad<PeriodSummary>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.reload();
  }

  /** The newest request wins (PageLoad); the source takes no tenant and no period. */
  reload(): void { this.load.run(() => this.source.current().then((summary) => [summary])); }

  protected metrics(summary: PeriodSummary): readonly { label: string; value: string; note: string }[] {
    return [
      { label: this.t.sales, value: formatCop(summary.confirmedSales), note: this.t.salesNote },
      { label: this.t.income, value: formatCop(summary.periodIncome), note: this.t.incomeNote },
      { label: this.t.costs, value: formatCop(summary.registeredOperationalCosts), note: this.t.costsNote },
      { label: this.t.cancellations, value: String(summary.registeredCancellations), note: this.t.cancellationsNote },
    ];
  }
}
