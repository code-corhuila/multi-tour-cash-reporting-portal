import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Standalone run of the portal, for development only; the container calls mount() instead.
bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
