import { inject, provideAppInitializer } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import * as entry from '../src/mount-entry';
import type { MountProps } from '../src/app/shell-contract';

// ADR-007: the container imports the module and calls mount(element, props); the cleanup it returns
// leaves the element as it was. Plan D-01, D-08: the portal paints under .csh-root and brings its own CSS.
const request = vi.fn(async () => ({}));
const props: MountProps = {
  apiClient: { request } as never,
  session: { roles: ['TENANT_ADMINISTRATOR'], open: () => undefined, close: () => undefined },
};

const hosts: HTMLElement[] = [];
const newHost = () => {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  return host;
};
const stylesheets = () => document.querySelectorAll('link[data-csh-stylesheet]');

afterEach(() => {
  hosts.splice(0).forEach((host) => host.remove());
  request.mockClear();
});

describe('mountRendersAndUnmounts', () => {
  it('exports mount and mountWith', () => {
    expect(typeof entry.mount).toBe('function');
    expect(typeof entry.mountWith).toBe('function');
  });

  it('paints the portal root into the element under .csh-root and its cleanup empties it', async () => {
    const host = newHost();
    const cleanup = entry.mount(host, props);
    expect(host.classList.contains('csh-root')).toBe(true);
    await vi.waitFor(() => expect(host.querySelector('.csh-portal')).toBeTruthy());
    cleanup();
    expect(host.innerHTML).toBe('');
    expect(host.classList.contains('csh-root')).toBe(false);
  });

  it('links its stylesheet, next to the module, once however many times it is mounted; the last cleanup removes it', async () => {
    const first = entry.mount(newHost(), props);
    const second = entry.mount(newHost(), props);
    expect(stylesheets().length).toBe(1);
    expect((stylesheets()[0] as HTMLLinkElement).href).toMatch(/cash-reporting-portal\.css$/);
    first();
    expect(stylesheets().length).toBe(1);
    second();
    expect(stylesheets().length).toBe(0);
  });

  it('a cleanup called before the application exists still leaves the element empty, and twice is harmless', async () => {
    const host = newHost();
    const cleanup = entry.mount(host, props);
    cleanup();
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.innerHTML).toBe('');
    expect(stylesheets().length).toBe(0);
  });

  it('makes no direct network call while mounted', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const host = newHost();
    const cleanup = entry.mount(host, props);
    await vi.waitFor(() => expect(host.querySelector('.csh-portal')).toBeTruthy());
    expect(fetchSpy).not.toHaveBeenCalled();
    cleanup();
    fetchSpy.mockRestore();
  });

  it.each([
    ["a Colaborador whose session carries MANAGE_CASH", ["OPERATIONAL_COLLABORATOR"], ["MANAGE_CASH"], true],
    ["a Colaborador whose session carries other permissions", ["OPERATIONAL_COLLABORATOR"], ["VALIDATE_PAYMENT_PROOFS"], false],
    ["a container that reports no permissions", ["OPERATIONAL_COLLABORATOR"], undefined, false],
  ])("gives the actor Gestionar caja from the session permissions: %s", async (_who, roles, permissions, expected) => {
    let actor: PortalActor | undefined;
    const cleanup = entry.mountWith(
      newHost(),
      { ...props, session: { ...props.session, roles, permissions } as never },
      (client) => [provideAppInitializer(() => { actor = inject(PortalActor); }) as never, { provide: "unused", useValue: client }],
    );
    await vi.waitFor(() => expect(actor).toBeDefined());
    expect(actor!.mayManageCash).toBe(expected);
    cleanup();
  });
});
