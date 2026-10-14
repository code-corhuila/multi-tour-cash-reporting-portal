import { AbstractType, InjectionToken, Injector, Type } from '@angular/core';
import { CASH_COPY } from '../cash/cash-copy';
import { CashClosuresSource } from '../cash/data/cash-closures-source';
import { CashDaySource } from '../cash/data/cash-day-source';
import { MonthlyReportSource } from '../cash/data/monthly-report-source';
import { CASH_CONSULTATION_COPY } from '../cash/cash-consultation-copy';
import { CashDayPageComponent } from '../cash/pages/cash-day-page.component';
import { CashHistoryPageComponent } from '../cash/pages/cash-history-page.component';
import { CashMonthlyPageComponent } from '../cash/pages/cash-monthly-page.component';
import { DailyDashboardSource } from '../reports/data/daily-dashboard-source';
import { ReportsPageComponent } from '../reports/pages/reports-page.component';
import { REPORTS_COPY } from '../reports/reports-copy';
import { PortalCapabilities } from './portal-capabilities';

/** One area of the shell: a sidebar item, or a sub-screen opened from another area. */
export interface PortalArea {
  readonly key: string;
  /** Spanish label of the authorized screen's menu. */
  readonly label: string;
  readonly component: Type<unknown>;
  /** Drawn only when this answers true; absent means always drawn. */
  readonly isAvailable?: (injector: Injector) => boolean;
  /** false: a sub-screen opened with PortalNavigation.open, with no sidebar item; `parent` stays active ("Caja" on its history). */
  readonly menu?: false;
  readonly parent?: string;
}

/** Plan D-03: an area is offered only when the build supplies its ports (an adapter, or a store of the demo build). */
export const has = (injector: Injector, ...ports: readonly AbstractType<unknown>[]) => ports.every((port) => injector.get(port, null) !== null);

/** The sidebar, in order: a story appends ONE entry and never edits the shell. */
export const PORTAL_AREAS: readonly PortalArea[] = Object.freeze([
  // HU-CSH-001: offered only where the build supplies the day of the cash and the role may read it.
  { key: 'cash', label: CASH_COPY.areaLabel, component: CashDayPageComponent,
    isAvailable: (injector: Injector) => has(injector, CashDaySource) && injector.get(PortalCapabilities).canReadCash() },
  // HU-CSH-001 / HU-CSH-003: the read-only sub-screens of Caja (menu: false, 'cash' stays active), offered with their ports and to who reads the cash.
  { key: 'cash-history', label: CASH_CONSULTATION_COPY.history.title, component: CashHistoryPageComponent, menu: false, parent: 'cash',
    isAvailable: (injector: Injector) => has(injector, CashClosuresSource) && injector.get(PortalCapabilities).canReadCash() },
  { key: 'cash-monthly', label: CASH_CONSULTATION_COPY.monthly.title, component: CashMonthlyPageComponent, menu: false, parent: 'cash',
    isAvailable: (injector: Injector) => has(injector, MonthlyReportSource) && injector.get(PortalCapabilities).canReadCash() },
  // HU-CSH-002: offered only where the build supplies the dashboard port and the role may read reports.
  { key: 'reports', label: REPORTS_COPY.areaLabel, component: ReportsPageComponent,
    isAvailable: (injector: Injector) => has(injector, DailyDashboardSource) && injector.get(PortalCapabilities).canReadReports() },
]);

/** The areas the shell draws; PORTAL_AREAS unless a test provides others. */
export const PORTAL_AREA_LIST = new InjectionToken<readonly PortalArea[]>('PORTAL_AREA_LIST', { factory: () => PORTAL_AREAS });
