import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as entry from '../src/mount-entry';
import { sourceProviders } from '../src/app/sources';
import type { MountProps } from '../src/app/shell-contract';
import { withoutComments } from './source-files';

// RN-CJ9 and the micro spec (D-CSH-03): demo data reaches only the demo build, which swaps
// src/app/sources.ts for src/app/sources.demo.ts. The production module registers no demo store and,
// until the HTTP adapters exist, offers no area: nothing to open, nothing to operate.
const PRODUCTION_FILES = ['src/mount-entry.ts', 'src/app/sources.ts'];

describe('productionMountRegistersNoDemoAndOffersNoArea', () => {
  it.each(PRODUCTION_FILES)('%s imports nothing from src/app/demo and names no demo store', (file) => {
    const code = withoutComments(readFileSync(file, 'utf8'));
    expect(code).not.toMatch(/from\s+['"][^'"]*\/demo\//);
    expect(code).not.toMatch(/sources\.demo/);
    expect(code).not.toMatch(/\bDemo[A-Z]\w*|\w+DemoProviders\b/);
  });

  it('the production sources register no provider and never call the container client yet', () => {
    const request = vi.fn();
    expect(sourceProviders({ request })).toEqual([]);
    expect(request).not.toHaveBeenCalled();
  });

  it('the demo build is the only one that swaps the sources, through the module:demo configuration', () => {
    const angular = JSON.parse(readFileSync('angular.json', 'utf8'));
    const module = angular.projects['cash-reporting-portal'].architect.module;
    expect(module.options.browser).toBe('src/mount-entry.ts');
    expect(module.options.fileReplacements).toBeUndefined();
    expect(module.configurations.demo.fileReplacements).toEqual([
      { replace: 'src/app/sources.ts', with: 'src/app/sources.demo.ts' },
    ]);
  });

  describe('mounted', () => {
    let host: HTMLElement;
    let cleanup: () => void;
    afterEach(() => { cleanup(); host.remove(); });

    it.each([
      { who: 'the tenant administrator', roles: ['TENANT_ADMINISTRATOR'] },
      { who: 'a final customer', roles: ['FINAL_CUSTOMER'] },
      { who: 'a session with no role', roles: [] as string[] },
    ])('offers no area, link or action to $who', async ({ roles }) => {
      host = document.createElement('div');
      document.body.append(host);
      const props: MountProps = {
        apiClient: { request: vi.fn() } as never,
        session: { roles, open: () => undefined, close: () => undefined },
      };
      cleanup = entry.mount(host, props);
      await vi.waitFor(() => expect(host.querySelector('.csh-portal')).toBeTruthy());
      expect(host.querySelectorAll('nav, a, button, form, input, select, [data-area]').length).toBe(0);
      expect(host.textContent?.trim()).toBe('');
    });
  });
});
