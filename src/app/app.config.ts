import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';

/** Standalone runs only. No HTTP client and no router: the container owns both (norm 5.4.1, plan D-05). */
export const appConfig: ApplicationConfig = {
  providers: [provideZonelessChangeDetection()],
};
