import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { formatCop } from '../../shared/format';
import { PageLoad, PageStateComponent } from '../../shared/page-state';
import { CASH_CONSULTATION_LINKS } from '../../shared/portal-slots';
import { CASH_COPY } from '../cash-copy';
import { CashMovementsComponent } from '../components/cash-movements.component';
import { CashDay, CashDaySource } from '../data/cash-day-source';

/** Screen 14, admin-caja.html, read side: the day as the service resolved it. Nothing is added up here (RN-CJ1, RN-CJ10). */
@Component({
  selector: 'csh-cash-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, PageStateComponent, CashMovementsComponent],
  template: `
    <section class="csh-cash" aria-labelledby="csh-cash-title">
      <header class="csh-cash-header">
        <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
        <h1 id="csh-cash-title" class="csh-cash-title">{{ t.title }}</h1>
      </header>
      <p class="csh-cash-access-note">{{ t.accessNote }}</p>
      <csh-page-state [state]="load.state()" emptyText="">
        @let s = load.state();
        @if (s.kind === 'data') {
          @let day = s.items[0];
          @let hero = heroOf(day);
          <section class="csh-cash-hero">
            <div>
              <p class="csh-cash-eyebrow">{{ t.status[day.status] }}</p>
              <h2>{{ hero.headline }}</h2>
              @if (hero.consolidated) { <p>{{ hero.consolidated }}</p> }
            </div>
            <p>{{ hero.note }}</p>
          </section>
          <dl class="csh-cash-metrics">
            @for (row of rows(day); track row.label) {
              <div class="csh-cash-metric">
                <dt>{{ row.label }}</dt>
                <dd class="csh-cash-value">{{ row.value }}</dd>
                <dd class="csh-cash-note">{{ row.note }}</dd>
              </div>
            }
          </dl>
          <section class="csh-cash-panel" aria-labelledby="csh-cash-movements-title">
            <p class="csh-cash-eyebrow">{{ t.movementsEyebrow }}</p>
            <h2 id="csh-cash-movements-title">{{ t.movementsTitle }}</h2>
            <csh-cash-movements [movements]="day.movements" />
          </section>
        }
      </csh-page-state>
      @if (links.length) {
        <section class="csh-cash-panel csh-cash-consultation">
          <p class="csh-cash-eyebrow">{{ t.consultationEyebrow }}</p>
          <h2>{{ t.consultationTitle }}</h2>
          <div class="csh-cash-links">@for (link of links; track link) { <ng-container *ngComponentOutlet="link" /> }</div>
        </section>
      }
    </section>
  `,
})
export class CashDayPageComponent {
  protected readonly t = CASH_COPY;
  protected readonly links = inject(CASH_CONSULTATION_LINKS);
  private readonly source = inject(CashDaySource);
  protected readonly load = new PageLoad<CashDay>();

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.reload();
  }

  /** The newest request wins (PageLoad); the source takes no tenant and no day. */
  reload(): void { this.load.run(() => this.source.today().then((day) => [day])); }

  /** The words around the figures of the hero (app.js:7016); the figures are the source's. */
  protected heroOf(day: CashDay): { headline: string; consolidated: string; note: string } {
    const { expectedCash, total } = day.metrics;
    const headline = day.status === 'NO_OPENING' ? this.t.headlineNoDay
      : expectedCash === null ? this.t.headlineNoCash : this.t.headline(formatCop(expectedCash));
    const consolidated = day.status === 'NO_OPENING' ? '' : this.t.consolidated(formatCop(total), day.openingBase ? formatCop(day.openingBase) : '');
    const note = day.status === 'OPEN_OPERATIVE' ? this.t.opened(day.openedBy ?? '') : this.t.originNote[day.status];
    return { headline, consolidated, note };
  }

  /** The seven metrics, in the order of the mockup; "Efectivo esperado" reads "No aplica" where the source gives none. */
  protected rows(day: CashDay): readonly { label: string; value: string; note: string }[] {
    const { metrics } = day;
    const m = this.t.metrics;
    return [
      { label: m.base[0], note: m.base[1], value: formatCop(day.openingBase) },
      { label: m.income[0], note: m.income[1], value: formatCop(metrics.income) },
      { label: m.payments[0], note: m.payments[1], value: formatCop(metrics.operationalPayments) },
      { label: m.expenses[0], note: m.expenses[1], value: formatCop(metrics.expenses) },
      { label: m.refunds[0], note: m.refunds[1], value: formatCop(metrics.refunds) },
      { label: m.expected[0], note: m.expected[1], value: metrics.expectedCash === null ? this.t.notApplicable : formatCop(metrics.expectedCash) },
      { label: m.transfers[0], note: m.transfers[1], value: formatCop(metrics.netTransfers) },
    ];
  }
}
