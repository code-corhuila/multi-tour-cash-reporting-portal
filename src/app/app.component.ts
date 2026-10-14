import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The root the container mounts. No area yet: the shell and the areas arrive with the shared base (plan D-02, D-05). */
@Component({
  selector: 'csh-portal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<main class="csh-portal"></main>',
})
export class AppComponent {}
