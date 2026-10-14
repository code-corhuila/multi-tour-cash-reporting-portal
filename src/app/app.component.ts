import { ChangeDetectionStrategy, Component } from '@angular/core';
import { PortalShellComponent } from './shared/portal-shell.component';

/** The root the container mounts: the shell, which offers the areas the build and the role allow (plan D-04, D-05). */
@Component({
  selector: 'csh-portal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PortalShellComponent],
  template: '<div class="csh-portal"><csh-shell /></div>',
})
export class AppComponent {}
