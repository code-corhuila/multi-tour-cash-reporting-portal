import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { formatMonth } from '../../shared/format';
import { PageLoad } from '../../shared/page-state';
import { REPORTS_MONTHLY_BLOCKS } from '../../shared/portal-slots';
import { DailyDashboardComponent } from '../components/daily-dashboard.component';
import { DailyDashboard, DailyDashboardSource } from '../data/daily-dashboard-source';
import { REPORTS_COPY } from '../reports-copy';

/** Screen 16, admin-reportes.html: header, hero and the grid where this story draws its article and others contribute theirs. */
@Component({
  selector: 'csh-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, DailyDashboardComponent],
  template: `
    <section class="csh-reports" aria-labelledby="csh-reports-title">
      <header class="csh-reports-header">
        <p class="csh-reports-eyebrow">{{ t.eyebrow }}</p>
        <h1 id="csh-reports-title" class="csh-reports-title">{{ t.title }}</h1>
      </header>
      <section class="csh-reports-hero">
        <div>
          @if (month(); as m) { <p class="csh-reports-eyebrow" data-month>{{ m }}</p> }
          <h2>{{ t.heroTitle }}</h2>
        </div>
        <p>{{ t.heroText }}</p>
      </section>
      <div class="csh-reports-grid">
        <csh-daily-dashboard [state]="load.state()" />
        @for (block of blocks; track block) { <ng-container *ngComponentOutlet="block" /> }
      </div>
    </section>
  `,
})
export class ReportsPageComponent {
  protected readonly t = REPORTS_COPY;
  protected readonly blocks = inject(REPORTS_MONTHLY_BLOCKS);
  private readonly source = inject(DailyDashboardSource);
  protected readonly load = new PageLoad<DailyDashboard>();
  /** The month of the date the source gave; nothing while the day is not known. */
  protected readonly month = computed(() => {
    const state = this.load.state();
    return state.kind === 'data' ? formatMonth(state.items[0].reportDate) : '';
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.reload();
  }

  /** The newest request wins (PageLoad); the source takes no tenant and no day (AC-DB.5). */
  reload(): void { this.load.run(() => this.source.today().then((day) => [day])); }
}
