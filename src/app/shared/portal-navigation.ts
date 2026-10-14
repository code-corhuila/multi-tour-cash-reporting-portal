import { Injectable, InjectionToken, signal } from '@angular/core';

type Params = Readonly<Record<string, string>>;

/** MountProps.initialParams (plan D-05): `area` names the area to show after a remount (PROPUESTO), the rest are its parameters. */
export const PORTAL_INITIAL_PARAMS = new InjectionToken<Params>('PORTAL_INITIAL_PARAMS', { factory: () => ({}) });

/**
 * The area the shell shows; a page opens another one through it ("Historial de caja", "Volver a caja"). No router and
 * no address: the container owns the URL. Provided by the shell, so a page outside it gets none.
 */
@Injectable()
export class PortalNavigation {
  readonly selected = signal<string | undefined>(undefined);
  /** Every opening, also of the open area: the shell draws it anew, back at its start. */
  readonly visit = signal(0);
  /** Parameters of the last opening; every opening replaces them. */
  readonly params = signal<Params>({});
  private keys: readonly string[] = [];
  private opened: () => void = () => undefined;

  /** The shell declares the areas it can show and what follows an opening (the focus). */
  register(keys: readonly string[], opened: () => void = () => undefined): void { this.keys = keys; this.opened = opened; }

  has(key: string): boolean { return this.keys.includes(key); }

  /** Shows an area without an opening (the first render); false, and nothing changes, when the build has no such area. */
  start(key: string, params: Params = {}): boolean {
    if (!this.has(key)) { return false; }
    this.params.set(params);
    this.selected.set(key);
    return true;
  }

  open(key: string, params: Params = {}): boolean {
    if (!this.start(key, params)) { return false; }
    this.visit.update((n) => n + 1);
    this.opened();
    return true;
  }
}
