import { readFileSync } from 'node:fs';
import { Component, inject } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';
import { PORTAL_AREAS, PORTAL_AREA_LIST, PortalArea } from '../src/app/shared/portal-areas';
import { PortalNavigation } from '../src/app/shared/portal-navigation';

// HU-CSH-001 container chrome: with chrome 'container' the portal draws no sidebar of its own and opens the area the container asks.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');

@Component({ selector: 'csh-test-day', template: '<h1>Caja</h1>' })
class DayDouble {}
@Component({ selector: 'csh-test-reports', template: '<h1>Reportes</h1>' })
class ReportsDouble {}
const AREAS: PortalArea[] = [
  { key: 'cash', label: 'Caja', component: DayDouble },
  { key: 'reports', label: 'Reportes', component: ReportsDouble },
];

let host: HTMLElement;
let cleanup: (() => void) | undefined;
const mountWith = (extra: Partial<MountProps> = {}, areas: readonly PortalArea[] = AREAS) => {
  host = document.createElement('div');
  document.body.append(host);
  const props: MountProps = { apiClient: { request: vi.fn() } as never,
    session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined }, ...extra };
  cleanup = entry.mountWith(host, props, () => [{ provide: PORTAL_AREA_LIST, useValue: areas }]);
};
const heading = () => host.querySelector('main h1')?.textContent;

afterEach(() => { cleanup?.(); host.remove(); });

describe('portalChromeOfTheContainer', () => {
  it('draws its own sidebar when the container does not say anything (compatibility)', async () => {
    mountWith();
    await vi.waitFor(() => expect(host.querySelector('.csh-sidebar')).toBeTruthy());
    expect(host.querySelector('.csh-shell')?.classList.contains('csh-no-sidebar')).toBe(false);
  });

  it('draws no sidebar and keeps the content when the container owns the chrome', async () => {
    mountWith({ chrome: 'container' });
    await vi.waitFor(() => expect(heading()).toBe('Caja'));
    expect(host.querySelector('.csh-sidebar')).toBeNull();
    expect(host.querySelector('.csh-shell')?.classList.contains('csh-no-sidebar')).toBe(true);
  });

  it('opens the reports area the container asks for', async () => {
    mountWith({ chrome: 'container', initialParams: { area: 'reports' } });
    await vi.waitFor(() => expect(heading()).toBe('Reportes'));
  });

  it('falls back to the default area for an unknown area, without failing', async () => {
    mountWith({ chrome: 'container', initialParams: { area: 'does-not-exist' } });
    await vi.waitFor(() => expect(heading()).toBe('Caja'));
  });

  it('opens cash and reports of the real areas by the keys the container uses', () => {
    expect(PORTAL_AREAS.filter((area) => area.menu !== false).map((area) => area.key)).toEqual(expect.arrayContaining(['cash', 'reports']));
  });

  it('lays the shell out in one column without the sidebar', () => {
    expect(css).toMatch(/\.csh-root \.csh-shell\.csh-no-sidebar \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/);
  });
});

// The container marks its sidebar entry from what the portal reports (MountProps.onAreaChange), so "Ir a caja" of Reportes moves it to Caja.
@Component({ selector: 'csh-test-reports-link', template: '<h1>Reportes</h1><button type="button" (click)="go()">Ir a caja</button>' })
class ReportsWithLink {
  private readonly navigation = inject(PortalNavigation);
  protected go(): void { this.navigation.open('cash'); }
}
@Component({ selector: 'csh-test-history', template: '<h1>Historial</h1>' })
class HistoryDouble {}
const LINKED_AREAS: PortalArea[] = [
  { key: 'cash', label: 'Caja', component: DayDouble },
  { key: 'cash-history', label: 'Historial', component: HistoryDouble, menu: false, parent: 'cash' },
  { key: 'reports', label: 'Reportes', component: ReportsWithLink },
];

describe('reportsTheAreaItShowsToTheContainer', () => {
  it('reports the area it opens at mount', async () => {
    const reported: string[] = [];
    mountWith({ chrome: 'container', initialParams: { area: 'reports' }, onAreaChange: (area) => reported.push(area) }, LINKED_AREAS);
    await vi.waitFor(() => expect(heading()).toBe('Reportes'));
    expect(reported.at(-1)).toBe('reports');
  });

  it('reports Caja when the button "Ir a caja" of Reportes opens it', async () => {
    const reported: string[] = [];
    mountWith({ chrome: 'container', initialParams: { area: 'reports' }, onAreaChange: (area) => reported.push(area) }, LINKED_AREAS);
    await vi.waitFor(() => expect(heading()).toBe('Reportes'));
    Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Ir a caja')!.click();
    await vi.waitFor(() => expect(heading()).toBe('Caja'));
    expect(reported.at(-1)).toBe('cash');
  });

  it('reports the parent entry of a sub-screen, as the sidebar of the portal marks it', async () => {
    const reported: string[] = [];
    mountWith({ chrome: 'container', initialParams: { area: 'cash-history' }, onAreaChange: (area) => reported.push(area) }, LINKED_AREAS);
    await vi.waitFor(() => expect(heading()).toBe('Historial'));
    expect(reported.at(-1)).toBe('cash');
  });

  it('does not report anything when the portal draws its own sidebar', async () => {
    const reported: string[] = [];
    mountWith({ onAreaChange: (area) => reported.push(area) }, LINKED_AREAS);
    await vi.waitFor(() => expect(host.querySelector('.csh-sidebar')).toBeTruthy());
    expect(reported).toEqual([]);
  });
});
