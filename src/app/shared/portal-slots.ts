import { InjectionToken, Type } from '@angular/core';
import type { PortalTarget } from '../shell-contract';
export type { PortalTarget };

/**
 * Where a story contributes to the screen of another without editing it (plan D-01): provide the token with `multi: true`,
 * one component per provider. HU-CSH-003 puts its summary row and "Reporte mensual" here; with none, the place stays empty.
 */
export const REPORTS_MONTHLY_BLOCKS = new InjectionToken<readonly Type<unknown>[]>('REPORTS_MONTHLY_BLOCKS', { factory: () => [] });

/** Where the container is asked to go when a link leaves the portal (DP-DB6): the portal names no address. */
export type ContainerNavigation = (target: PortalTarget) => void;

/** MountProps.navigate when the container offers it; null otherwise, and the links that need it are not drawn. */
export const CONTAINER_NAVIGATION = new InjectionToken<ContainerNavigation | null>('CONTAINER_NAVIGATION', { factory: () => null });

/** The container's `onAreaChange`, or null: the shell reports the sidebar entry it shows whenever it changes (only with the container chrome). */
export const CONTAINER_AREA_REPORTER = new InjectionToken<((area: string) => void) | null>('CONTAINER_AREA_REPORTER', { factory: () => null });

/** true when the container draws the navigation (MountProps.chrome === 'container'): the shell then omits its sidebar. */
export const CONTAINER_CHROME = new InjectionToken<boolean>('CONTAINER_CHROME', { factory: () => false });

/** Where the panel "Consulta · Historial y consolidación" of screen 14 gets its links (plan D-02): HU-CSH-003 contributes "Consolidación mensual"; with none, the panel is not drawn. */
export const CASH_CONSULTATION_LINKS = new InjectionToken<readonly Type<unknown>[]>('CASH_CONSULTATION_LINKS', { factory: () => [] });
