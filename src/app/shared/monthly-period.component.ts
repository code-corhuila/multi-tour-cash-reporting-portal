import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MonthlyPeriod } from './monthly-period';
import { formatCop, formatMonth } from './format';
import { MONTHLY_PERIOD_COPY } from './monthly-period-copy';

/**
 * One period of the monthly report: the month and its seven lines, exactly as the source gave them (RN-RM1); it computes none. With `detail` and a
 * period that carries the split, the three lines of the consolidation of Caja are drawn as the mockup orders them (plan D-10); Reportes never asks.
 */
@Component({
  selector: 'csh-monthly-period',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="csh-monthly-period" [attr.aria-labelledby]="headingId()">
      <p class="csh-reports-eyebrow">{{ t.reported }}</p>
      <h3 class="csh-monthly-heading" [id]="headingId()">{{ month() }}</h3>
      <dl class="csh-monthly-lines">
        @for (line of lines(); track line.label) {
          <div><dt>{{ line.label }}</dt><dd>{{ line.value }}</dd></div>
        }
      </dl>

    </section>
  `,
})
export class MonthlyPeriodComponent {
  readonly period = input.required<MonthlyPeriod>();
  readonly detail = input(false);
  protected readonly t = MONTHLY_PERIOD_COPY;

  protected headingId(): string { return `csh-monthly-${this.period().reportedPeriod}`; }
  protected month(): string { return formatMonth(this.period().reportedPeriod); }

  protected lines(): readonly { label: string; value: string }[] {
    const p = this.period();
    const split = this.detail() && p.countedMovements !== undefined && p.incomeInCash !== undefined && p.incomeByTransfer !== undefined;
    return [
      ...(split ? [{ label: this.t.counted, value: String(p.countedMovements) }] : []),
      { label: this.t.income, value: formatCop(p.periodIncome) },
      ...(split ? [{ label: this.t.cash, value: formatCop(p.incomeInCash!) }, { label: this.t.transfer, value: formatCop(p.incomeByTransfer!) }] : []),
      { label: this.t.payments, value: formatCop(p.operationalPayments) },
      { label: this.t.expenses, value: formatCop(p.operationalExpenses) },
      { label: this.t.refunds, value: formatCop(p.executedRefunds) },
      { label: this.t.total, value: formatCop(p.consolidatedCashTotal) },
      { label: this.t.cancellations, value: String(p.registeredCancellations) },
      { label: this.t.costs, value: p.registeredOperationalCosts === 0 ? this.t.noCosts : formatCop(p.registeredOperationalCosts) },
    ];
  }
}
