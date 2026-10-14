import { AbstractType, InjectionToken, Injector, Type } from '@angular/core';
import { CASH_COPY } from '../cash/cash-copy';
import { CashDaySource } from '../cash/data/cash-day-source';
import { CashDayPageComponent } from '../cash/pages/cash-day-page.component';
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
  // HU-CSH-002: offered only where the build supplies the dashboard port and the role may read reports.
  { key: 'reports', label: REPORTS_COPY.areaLabel, component: ReportsPageComponent,
    isAvailable: (injector: Injector) => has(injector, DailyDashboardSource) && injector.get(PortalCapabilities).canReadReports() },
]);

/** The areas the shell draws; PORTAL_AREAS unless a test provides others. */
export const PORTAL_AREA_LIST = new InjectionToken<readonly PortalArea[]>('PORTAL_AREA_LIST', { factory: () => PORTAL_AREAS });
