import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DemoDailyDashboardSource } from '../src/app/demo/reports-demo';
import { ReportsPageComponent } from '../src/app/reports/pages/reports-page.component';
import { DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { PortalActor, PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { CONTAINER_NAVIGATION } from '../src/app/shared/portal-slots';

// HU-FRT-001 spec 003-, plan D-04 and task FM-04: the portal asks the container to leave it with { portal, area } and keeps a local copy of the type.
const INTERNAL = ['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'];
const read = (file: string) => readFileSync(file, 'utf8');
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

afterEach(() => { TestBed.resetTestingModule(); });

describe('portalTargetContractMatchesTheContainer', () => {
  // The fields of the table in spec 003- section 3; the container declares the same two in core/client/types.ts.
  const body = (file: string, name: string) => new RegExp(`export interface ${name} \{([^}]*)\}`).exec(read(file))?.[1] ?? '';
  const fields = (text: string) => text.split(';').map((f) => f.replace(/\/\*[\s\S]*?\*\//g, '').trim()).filter(Boolean).map((f) => f.replace(/^readonly\s+/, '')).sort();

  it('declares PortalTarget locally with exactly portal and area as text', () => {
    expect(fields(body('src/app/shell-contract.ts', 'PortalTarget'))).toEqual(['area: string', 'portal: string']);
  });

  it('types the navigate of MountProps with it and keeps no second copy of the target', () => {
    expect(read('src/app/shell-contract.ts')).toMatch(/navigate\?: \(target: PortalTarget\) => void/);
    expect(read('src/app/shared/portal-slots.ts')).not.toContain('ContainerTarget');
    expect(read('src/app/reports/data/daily-dashboard-source.ts')).toMatch(/RESERVATIONS_TARGET: PortalTarget/);
  });
});

describe('canReadReservationsFollowsTheRbacRow', () => {
  it.each(INTERNAL)('%s may consult reservations (own portal row "Consult reservations")', (role) => {
    expect(PortalCapabilities.for(role).canReadReservations()).toBe(true);
  });

  it.each(['FINAL_CUSTOMER', 'SUPPLIER', 'DENIED', ''])('%j may not (fails closed)', (role) => {
    expect(PortalCapabilities.for(role).canReadReservations()).toBe(false);
  });
});

describe('irAReservasIsDrawnOnlyWhenTheContainerOffersItAndTheRoleMayUseTheTarget', () => {
  async function render(providers: unknown[]) {
    TestBed.configureTestingModule({ providers: [{ provide: DailyDashboardSource, useValue: new DemoDailyDashboardSource() }, ...(providers as never[])] });
    const fixture = TestBed.createComponent(ReportsPageComponent);
    for (let i = 0; i < 3; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
    const host: HTMLElement = fixture.nativeElement;
    return { host, link: () => Array.from(host.querySelectorAll<HTMLElement>('button.csh-reports-link')).find((l) => flat(l.textContent) === 'Ir a reservas') };
  }

  it.each(INTERNAL)('asks the container for the area reservations of the commercial portal as %s', async (role) => {
    const navigate = vi.fn();
    const { link } = await render([{ provide: PortalActor, useValue: PortalActor.from([role]) }, { provide: CONTAINER_NAVIGATION, useValue: navigate }]);
    link()!.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith({ portal: 'commercial-reservation-portal', area: 'reservations' });
  });

  it('is not drawn when the container offers no navigate', async () => {
    const { link } = await render([{ provide: PortalActor, useValue: PortalActor.from(['MANAGER']) }]);
    expect(link()).toBeUndefined();
  });

  it('is not drawn when the capabilities say the person cannot consult reservations', async () => {
    const denied = { canReadReports: () => true, canReadReservations: () => false, isQueryOnly: () => false };
    const { link } = await render([{ provide: PortalCapabilities, useValue: denied }, { provide: CONTAINER_NAVIGATION, useValue: vi.fn() }]);
    expect(link()).toBeUndefined();
  });
});
