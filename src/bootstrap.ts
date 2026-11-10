import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';
import { reportFailure } from './app/shared/error-report';

// Standalone run of the portal, for development only; the container calls mount() instead.
bootstrapApplication(AppComponent, appConfig).catch(reportFailure);
