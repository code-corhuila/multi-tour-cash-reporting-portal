import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { PageState, PageStateComponent } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CONTAINER_NAVIGATION } from '../../shared/portal-slots';
import { DailyDashboard, RESERVATIONS_TARGET } from '../data/daily-dashboard-source';
import { REPORTS_COPY } from '../reports-copy';

/** The article "Dashboard diario" of screen 16: the six numbers as the source gives them, with no action of its own (RN-DB4). */
@Component({
  selector: 'csh-daily-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageStateComponent],
  template: `
    <article class="csh-reports-card" aria-labelledby="csh-reports-dashboard-title">
      <p class="csh-reports-eyebrow">{{ t.dashboardEyebrow }}</p>
      <h2 id="csh-reports-dashboard-title" class="csh-reports-card-title">{{ t.dashboardTitle }}</h2>
      <csh-page-state [state]="state()" emptyText="">
        @let s = state();
        @if (s.kind === 'data') {
          <dl class="csh-reports-metrics">
            @for (row of rows(s.items[0]); track row.label) {
              <div class="csh-reports-metric">
                <dt>{{ row.label }}</dt>
                <dd class="csh-reports-value">{{ row.value }}</dd>
                @if (row.note) { <dd class="csh-reports-note">{{ row.note }}</dd> }
              </div>
            }
          </dl>
        }
      </csh-page-state>
      @if (navigate && caps.canReadReservations()) {
        <button type="button" class="csh-reports-link" (click)="leave()">{{ t.reservations }}</button>
      }
    </article>
  `,
})
export class DailyDashboardComponent {
  readonly state = input.required<PageState<DailyDashboard>>();
  protected readonly t = REPORTS_COPY;
  protected readonly navigate = inject(CONTAINER_NAVIGATION);
  protected readonly caps = inject(PortalCapabilities);

  protected rows(day: DailyDashboard): readonly { label: string; value: number; note?: string }[] {
    return [
      { label: this.t.created, value: day.createdReservations },
      { label: this.t.pending, value: day.pendingPaymentReservations, note: this.t.pendingNote },
      { label: this.t.confirmed, value: day.confirmedReservations, note: this.t.confirmedNote },
      { label: this.t.withBalance, value: day.confirmedWithBalance, note: this.t.withBalanceNote },
      { label: this.t.cancelled, value: day.cancelledReservations },
      { label: this.t.upcoming, value: day.upcomingServices },
    ];
  }

  protected leave(): void { this.navigate?.(RESERVATIONS_TARGET); }
}
