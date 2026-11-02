import { ApplicationRef, Provider, provideZonelessChangeDetection } from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { MountProps, PortalApiClient } from './app/shell-contract';
import { sourceProviders } from './app/sources';
import { PortalActor } from './app/shared/portal-capabilities';
import { PORTAL_INITIAL_PARAMS } from './app/shared/portal-navigation';
import { CONTAINER_AREA_REPORTER, CONTAINER_CHROME, CONTAINER_NAVIGATION } from './app/shared/portal-slots';

/** Portals mounted now; the stylesheet leaves with the last one. */
let mounted = 0;

/** One <link> to the portal CSS, next to this module, however many times the portal is mounted. */
export function ensureStylesheet(): void {
  if (document.querySelector('link[data-csh-stylesheet]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('cash-reporting-portal.css', import.meta.url).href;
  link.dataset['cshStylesheet'] = '';
  document.head.append(link);
}

/** ADR-007 contract. Sources come from ./app/sources (the demo build swaps in the in-memory stores). */
export function mount(element: HTMLElement, props: MountProps): () => void {
  return mountWith(element, props, sourceProviders);
}

/** The same mount over other sources, e.g. the in-memory stores of sources.demo.ts in tests. */
export function mountWith(element: HTMLElement, props: MountProps, sources: (client: PortalApiClient) => Provider[]): () => void {
  ensureStylesheet();
  mounted += 1;
  element.classList.add('csh-root');
  let app: ApplicationRef | undefined;
  let cleaned = false;
  const release = () => {
    app?.destroy();
    element.replaceChildren();
    element.classList.remove('csh-root');
    mounted -= 1;
    if (mounted === 0) document.querySelector('link[data-csh-stylesheet]')?.remove();
  };
  createApplication({
    providers: [
      provideZonelessChangeDetection(),
      // The actor and the area to show come from the container (plan D-04, D-05).
      { provide: PortalActor, useValue: PortalActor.from(props.session.roles) },
      { provide: CONTAINER_CHROME, useValue: props.chrome === 'container' },
      { provide: PORTAL_INITIAL_PARAMS, useValue: props.initialParams ?? {} },
      ...(props.navigate ? [{ provide: CONTAINER_NAVIGATION, useValue: props.navigate }] : []),
      ...(props.chrome === 'container' && props.onAreaChange ? [{ provide: CONTAINER_AREA_REPORTER, useValue: props.onAreaChange }] : []),
      ...sources(props.apiClient),
    ],
  }).then((created) => {
    app = created;
    if (cleaned) return app.destroy();
    created.bootstrap(AppComponent, element);
  }).catch((err) => console.error(err));
  return () => { if (!cleaned) { cleaned = true; release(); } };
}
