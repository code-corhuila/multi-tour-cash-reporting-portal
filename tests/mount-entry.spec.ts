import { afterEach, describe, expect, it, vi } from 'vitest';
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
});
