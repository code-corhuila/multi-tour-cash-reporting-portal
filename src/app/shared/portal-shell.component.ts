import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject } from '@angular/core';
import { focusHeading } from './focus';
import { SHELL_COPY } from './shell-copy';
import { PORTAL_AREA_LIST } from './portal-areas';
import { PortalCapabilities } from './portal-capabilities';
import { CONTAINER_AREA_REPORTER, CONTAINER_CHROME } from './portal-slots';
import { PORTAL_INITIAL_PARAMS, PortalNavigation } from './portal-navigation';

/**
 * The operator sidebar of admin-caja.html, drawn from PORTAL_AREAS: the areas the build supplies, for a role the table
 * does not deny. A denied role, or a build with no area, gets nothing at all (AC-CJ.11).
 */
@Component({
  selector: 'csh-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgComponentOutlet],
  providers: [PortalNavigation],
  template: `
    @if (menu.length) {
      <div class="csh-shell" [class.csh-no-sidebar]="hideSidebar">
        @if (!hideSidebar) {
        <aside class="csh-sidebar">
          <p class="csh-brand">{{ t.brand }}</p>
          <p class="csh-role">{{ roleLabel }}</p>
          <nav class="csh-nav" [attr.aria-label]="t.navigation">
            @for (area of menu; track area.key) {
              <button type="button" [class.csh-is-active]="area.key === active()" [attr.aria-current]="area.key === active() ? 'page' : null"
                (click)="navigation.open(area.key)">{{ area.label }}</button>
            }
          </nav>
        </aside>
        }
        <main class="csh-content">
          @for (s of [screen()]; track s) { @if (s.area; as area) { <ng-container *ngComponentOutlet="area.component" /> } }
        </main>
      </div>
    }
  `,
})
export class PortalShellComponent {
  private readonly injector = inject(Injector);
  protected readonly navigation = inject(PortalNavigation);
  protected readonly t = SHELL_COPY;
  private readonly capabilities = inject(PortalCapabilities);
  private readonly areas = this.capabilities.isDenied() ? [] : inject(PORTAL_AREA_LIST).filter((area) => area.isAvailable?.(this.injector) ?? true);
  /** The sidebar items: every area but the sub-screens (menu: false); with none, nothing is offered. */
  protected readonly menu = this.areas.filter((area) => area.menu !== false);
  protected readonly current = computed(() => this.areas.find((area) => area.key === this.navigation.selected()) ?? this.menu[0]);
  /** A new value on every opening, so the outlet recreates the area. */
  protected readonly screen = computed(() => ({ area: this.current(), visit: this.navigation.visit() }));
  /** The item marked active: the parent of an open sub-screen, or the open area itself. */
  protected readonly active = computed(() => this.current()?.parent ?? this.current()?.key);
  /** The container draws the navigation (MountProps.chrome): the shell keeps its content and drops the sidebar. */
  protected readonly hideSidebar = inject(CONTAINER_CHROME);
  protected readonly roleLabel = this.capabilities.roleLabel();
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  /** Lands on the area of MountProps.initialParams when offered; an opened area gets the focus on its h1. */
  constructor() {
    this.navigation.register(this.menu.length ? this.areas.map((area) => area.key) : [], () =>
      afterNextRender(() => focusHeading(this.host.querySelector('main') ?? this.host), { injector: this.injector }));
    // The container draws the sidebar: it marks the entry the portal reports, also when a button of one area opens another ("Ir a caja" of Reportes).
    const report = inject(CONTAINER_AREA_REPORTER);
    if (report) { effect(() => { const entry = this.active(); if (entry) { report(entry); } }); }
    const { area, ...params } = inject(PORTAL_INITIAL_PARAMS);
    if (area) { this.navigation.start(area, params); }
  }
}
