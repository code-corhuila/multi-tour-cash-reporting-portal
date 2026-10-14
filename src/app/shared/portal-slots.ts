import { InjectionToken, Type } from '@angular/core';

/**
 * Where a story contributes to the screen of another without editing it (plan D-01): provide the token with `multi: true`,
 * one component per provider. HU-CSH-003 puts its summary row and "Reporte mensual" here; with none, the place stays empty.
 */
export const REPORTS_MONTHLY_BLOCKS = new InjectionToken<readonly Type<unknown>[]>('REPORTS_MONTHLY_BLOCKS', { factory: () => [] });

/** Where the container is asked to go when a link leaves the portal (PROPUESTO, DP-DB6): the portal names no address. */
export interface ContainerTarget { readonly portal: string; readonly area: string }
export type ContainerNavigation = (target: ContainerTarget) => void;

/** MountProps.navigate when the container offers it; null otherwise, and the links that need it are not drawn. */
export const CONTAINER_NAVIGATION = new InjectionToken<ContainerNavigation | null>('CONTAINER_NAVIGATION', { factory: () => null });
