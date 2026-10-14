import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ObservableInput, Subscription, from } from 'rxjs';

/** The four states of a screen (AC-CJ.12, Annex H) as one value: booleans would allow the blank screens Annex H forbids. */
export type PageState<T = unknown> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'error'; readonly retry: () => void }
  | { readonly kind: 'empty' }
  | { readonly kind: 'data'; readonly items: readonly T[] };

/** The shared texts of the states (spec section 5, the commercial portal's). */
export const PAGE_STATE_COPY = Object.freeze({ loading: 'Cargando…', error: 'No se pudo completar la solicitud.', retry: 'Reintentar' });

/** Loads a list into a PageState (plan D-07): a newer request replaces an older one, whose late answer is dropped. */
export class PageLoad<T> {
  readonly state = signal<PageState<T>>({ kind: 'loading' });
  private running?: Subscription;

  run(request: () => ObservableInput<readonly T[]>): void {
    this.stop();
    this.state.set({ kind: 'loading' });
    this.running = from(request()).subscribe({
      next: (items) => this.state.set(items.length ? { kind: 'data', items } : { kind: 'empty' }),
      error: () => this.state.set({ kind: 'error', retry: () => this.run(request) }),
    });
  }

  stop(): void { this.running?.unsubscribe(); this.running = undefined; }
}

/** Draws one PageState: loading, error with "Reintentar", the screen's empty text, or its projected data. */
@Component({
  selector: 'csh-page-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let s = state();
    <div class="csh-state" [attr.data-state]="s.kind">
      @switch (s.kind) {
        @case ('loading') { <p class="csh-state-note" role="status">{{ copy.loading }}</p> }
        @case ('error') { <p class="csh-state-error" role="alert">{{ copy.error }}</p><button type="button" (click)="retry(s)">{{ copy.retry }}</button> }
        @case ('empty') { <p class="csh-state-note">{{ emptyText() }}</p> }
        @default { <ng-content /> }
      }
    </div>
  `,
})
export class PageStateComponent {
  readonly state = input.required<PageState>();
  readonly emptyText = input.required<string>();
  protected readonly copy = PAGE_STATE_COPY;
  protected retry(state: PageState): void { if (state.kind === 'error') { state.retry(); } }
}
