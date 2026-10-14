import { AbstractType, InjectionToken, Injector, Type } from '@angular/core';

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

/** The sidebar, in order: a story appends ONE entry and never edits the shell. Empty until the cash screens (plan D-09, PR 3). */
export const PORTAL_AREAS: readonly PortalArea[] = Object.freeze([]);

/** The areas the shell draws; PORTAL_AREAS unless a test provides others. */
export const PORTAL_AREA_LIST = new InjectionToken<readonly PortalArea[]>('PORTAL_AREA_LIST', { factory: () => PORTAL_AREAS });
