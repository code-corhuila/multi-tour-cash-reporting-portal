import { Provider } from '@angular/core';
import { cashDemoProviders } from './demo/cash-demo';
import { monthlyReportDemoProviders } from './demo/monthly-report-demo';
import { reportsDemoProviders } from './demo/reports-demo';
import { PortalApiClient } from './shell-contract';

/** DEMO build only (`build:module:demo` swaps sources.ts for this file): the in-memory stores, one per page (plan D-03). */
export function sourceProviders(_client: PortalApiClient): Provider[] {
  return [...cashDemoProviders(), ...reportsDemoProviders(), ...monthlyReportDemoProviders()];
}
