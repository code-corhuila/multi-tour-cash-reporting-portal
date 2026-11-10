import { reportFailure } from './app/shared/error-report';
import { initFederation } from '@angular-architects/native-federation';

initFederation()
  .catch(reportFailure)
  .then(() => import('./bootstrap'))
  .catch(reportFailure);
