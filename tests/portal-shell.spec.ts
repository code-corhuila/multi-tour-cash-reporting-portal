import { readFileSync } from 'node:fs';
import { Component, Injector, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea, has } from '../src/app/shared/portal-areas';
import { PortalActor, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { PORTAL_INITIAL_PARAMS, PortalNavigation } from '../src/app/shared/portal-navigation';
import { PortalShellComponent } from '../src/app/shared/portal-shell.component';
import { listSourceFiles, withoutComments } from './source-files';

// Plan D-04 and D-05: the shell draws the areas of PORTAL_AREAS that the build and the role allow, opens them only
// through PortalNavigation (no router, no address) and focuses the heading of an opened area (Annex H).
afterEach(() => TestBed.resetTestingModule());

@Component({ selector: 'csh-test-day', template: '<h1>Caja</h1><button type="button">Acción</button>' })
class DayDouble {}
@Component({ selector: 'csh-test-history', template: '<h1>Historial de caja</h1><p>{{ params() }}</p>' })
class HistoryDouble {
  private readonly navigation = inject(PortalNavigation);
  protected readonly params = () => JSON.stringify(this.navigation.params());
}
@Component({ selector: 'csh-test-reports', template: '<h1>Reportes</h1>' })
class ReportsDouble {}

/** A port only some builds supply, as the cash ports of pull request 3 will be. */
abstract class SomePort {}
const AREAS: PortalArea[] = [
  { key: 'cash', label: 'Caja', component: DayDouble },
  { key: 'cash-history', label: 'Historial de caja', component: HistoryDouble, menu: false, parent: 'cash' },
  { key: 'reports', label: 'Reportes', component: ReportsDouble, isAvailable: (injector: Injector) => has(injector, SomePort) },
];

async function shellAs(roles: string[], areas: PortalArea[] = AREAS, initialParams: Record<string, string> = {}, withPort = false) {
  TestBed.configureTestingModule({ providers: [
    { provide: PortalActor, useValue: PortalActor.from(roles) },
    { provide: PORTAL_AREA_LIST, useValue: areas },
    { provide: PORTAL_INITIAL_PARAMS, useValue: initialParams },
    ...(withPort ? [{ provide: SomePort, useValue: {} }] : []),
  ] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.csh-nav button'));
  const item = (label: string) => items().find((b) => b.textContent?.trim() === label)!;
  return { host, items, item, settle, navigation: fixture.debugElement.injector.get(PortalNavigation) };
}
const labels = (buttons: HTMLButtonElement[]) => buttons.map((b) => b.textContent?.trim());

describe('finalCustomerAndUnknownRoleGetNoCashArea', () => {
  it.each([['a Cliente final', ['FINAL_CUSTOMER']], ['an unknown role', ['SUPPLIER']], ['a session with no role', []]])(
    'draws nothing at all for %s, even when the build offers every area', async (_who, roles) => {
      const { host, navigation } = await shellAs(roles, AREAS, { area: 'cash' }, true);
      expect(host.querySelectorAll('nav, button, main, h1, [data-area]').length).toBe(0);
      expect(host.textContent?.trim()).toBe('');
      expect(navigation.open('cash')).toBe(false);
    });

  it('starts with an empty frozen registry: no area is offered before its pull request', () => {
    expect(PORTAL_AREAS).toEqual([]);
    expect(Object.isFrozen(PORTAL_AREAS)).toBe(true);
  });
});

describe('portalShellSidebar', () => {
  it('draws the brand, the Spanish role and one item per available area, landing on the first one', async () => {
    const { host, items } = await shellAs(['MANAGER']);
    expect(host.querySelector('.csh-shell > aside.csh-sidebar .csh-brand')?.textContent?.trim()).toBe('MULTITOUR');
    expect(host.querySelector('.csh-role')?.textContent?.trim()).toBe('Gerente');
    expect(host.querySelector('.csh-nav')?.getAttribute('aria-label')).toBe('Administración del operador');
    expect(labels(items())).toEqual(['Caja']);
    expect(items()[0].classList).toContain('csh-is-active');
    expect(items()[0].getAttribute('aria-current')).toBe('page');
    expect(host.querySelector('.csh-shell > main.csh-content csh-test-day')).not.toBeNull();
  });

  it('offers an area guarded by a port only when the build supplies that port', async () => {
    expect(labels((await shellAs(['TENANT_ADMINISTRATOR'], AREAS, {}, true)).items())).toEqual(['Caja', 'Reportes']);
  });

  it('draws nothing for an operator when the build offers no area', async () => {
    const { host } = await shellAs(['TENANT_ADMINISTRATOR'], []);
    expect(host.textContent?.trim()).toBe('');
  });

  it('opens a sub-screen with parameters through PortalNavigation, keeping its parent item active', async () => {
    const { host, items, settle, navigation } = await shellAs(['TENANT_ADMINISTRATOR']);
    expect(navigation.open('cash-history', { date: '2026-09-02' })).toBe(true);
    await settle();
    expect(host.querySelector('main h1')?.textContent).toBe('Historial de caja');
    expect(host.querySelector('csh-test-history p')?.textContent).toBe('{"date":"2026-09-02"}');
    expect(labels(items().filter((b) => b.classList.contains('csh-is-active')))).toEqual(['Caja']);
    expect(navigation.open('unknown-area')).toBe(false);
  });

  it('opens the area of MountProps.initialParams after a remount, with its parameters', async () => {
    const { host, navigation } = await shellAs(['TENANT_ADMINISTRATOR'], AREAS, { area: 'cash-history', date: '2026-09-01' });
    expect(host.querySelector('main h1')?.textContent).toBe('Historial de caja');
    expect(navigation.params()).toEqual({ date: '2026-09-01' });
  });

  it('ignores an initial area the build or the role does not offer', async () => {
    const { host } = await shellAs(['TENANT_ADMINISTRATOR'], AREAS, { area: 'reports' });
    expect(host.querySelector('main h1')?.textContent).toBe('Caja');
  });

  it('moves the focus to the heading of an opened area, focusable by script only, and leaves it alone on the first render', async () => {
    const { host, item, settle, navigation } = await shellAs(['TENANT_ADMINISTRATOR']);
    expect(host.contains(document.activeElement)).toBe(false);
    navigation.open('cash-history');
    await settle();
    item('Caja').click();
    await settle();
    const heading = host.querySelector('csh-test-day h1');
    expect(document.activeElement).toBe(heading);
    expect(heading?.getAttribute('tabindex')).toBe('-1');
  });

  it('names every role of the table in Spanish', () => {
    const roles = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'];
    expect(roles.map((role) => PortalCapabilities.for(role).roleLabel()))
      .toEqual(['Administrador del tenant', 'Colaborador operativo', 'Gerente', 'Contador', 'Analista']);
  });
});

describe('mountHandsTheSessionToTheShell', () => {
  it('reads the role and the initial parameters from MountProps, and paints the shell inside .csh-portal', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const props: MountProps = { apiClient: { request: vi.fn() } as never, initialParams: { area: 'cash' },
      session: { roles: ['ANALYST'], open: () => undefined, close: () => undefined } };
    const cleanup = entry.mountWith(host, props, () => [{ provide: PORTAL_AREA_LIST, useValue: AREAS }]);
    await vi.waitFor(() => expect(host.querySelector('.csh-portal csh-shell .csh-role')?.textContent?.trim()).toBe('Analista'));
    expect(host.querySelector('main h1')?.textContent).toBe('Caja');
    cleanup();
    host.remove();
  });
});

describe('portalReadsNoAddress', () => {
  it('never reads location or history: the container owns the URL (lesson 12)', () => {
    const readers = listSourceFiles().filter((file) => file.endsWith('.ts'))
      .filter((file) => /\b(location|history\.(push|replace)State)\b/.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(readers).toEqual([]);
  });
});
