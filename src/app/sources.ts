import { Provider } from '@angular/core';
import { PortalApiClient } from './shell-contract';

/** Production: one adapter per port over the container client; none until the API exists (micro plan D-CSH-01). */
export function sourceProviders(_client: PortalApiClient): Provider[] {
  return [];
}
