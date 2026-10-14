import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { formatMonth } from '../../shared/format';
import { PageLoad } from '../../shared/page-state';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { REPORTS_MONTHLY_BLOCKS } from '../../shared/portal-slots';
import { DailyDashboardComponent } from '../components/daily-dashboard.component';
import { DailyDashboard, DailyDashboardSource } from '../data/daily-dashboard-source';
import { ReportBasis } from '../data/report-basis';
import { ReportExporter } from '../data/report-exporter';
import { ReportData, ReportFormat } from '../data/report-files';
import { REPORTS_COPY } from '../reports-copy';

/** Screen 16, admin-reportes.html: header, hero and the grid where this story draws its article and others contribute theirs. */
@Component({
  selector: 'csh-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet, DailyDashboardComponent],
  template: `
    <section class="csh-reports" aria-labelledby="csh-reports-title">
      <header class="csh-reports-header">
        <div class="csh-reports-header-main">
          <p class="csh-reports-eyebrow">{{ t.eyebrow }}</p>
          <h1 id="csh-reports-title" class="csh-reports-title">{{ t.title }}</h1>
        </div>
        @if (canExport()) {
          <div class="csh-reports-actions" role="group" [attr.aria-label]="t.exportLabel">
            <button type="button" [disabled]="!report()" (click)="export('csv')">{{ t.exportCsv }}</button>
            <button type="button" [disabled]="!report()" (click)="export('pdf')">{{ t.exportPdf }}</button>
          </div>
        }
      </header>
      @if (caps.isQueryOnly()) { <p class="csh-reports-access-note">{{ t.queryOnlyNote }}</p> }
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
  protected readonly caps = inject(PortalCapabilities);
  private readonly source = inject(DailyDashboardSource);
  private readonly basis = inject(ReportBasis);
  private readonly exporter = inject(ReportExporter);
  protected readonly load = new PageLoad<DailyDashboard>();
  /** The month of the date the source gave; nothing while the day is not known. */
  protected readonly month = computed(() => {
    const state = this.load.state();
    return state.kind === 'data' ? formatMonth(state.items[0].reportDate) : '';
  });
  /** Exporting is a read right and needs the report in the portal (the summary row and the monthly article). */
  protected readonly canExport = computed(() => this.caps.canReadReports() && this.blocks[0] !== undefined);
  /** The report as the screen shows it; nothing while any of the three reads loads or fails. */
  protected readonly report = computed<ReportData | undefined>(() => {
    const day = this.load.state();
    const summary = this.basis.summary();
    const periods = this.basis.periods();
    return day.kind === 'data' && summary && periods ? { dashboard: day.items[0], summary, periods } : undefined;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.reload();
  }

  /** The newest request wins (PageLoad); the source takes no tenant and no day (AC-DB.5). */
  reload(): void { this.load.run(() => this.source.today().then((day) => [day])); }

  protected export(format: ReportFormat): void {
    const data = this.report();
    if (data) { this.exporter.export(format, data); }
  }
}
