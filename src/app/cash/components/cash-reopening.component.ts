import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { CASH_COPY } from '../cash-copy';
import { CashReopeningWriter } from '../data/cash-reopening-writer';

/**
 * The panel "Reapertura / Reabrir la caja cerrada" of screen 14 (AC-CJ.15). The page draws it for who operates the cash, on a closed day.
 * The reason is mandatory; one key per intention is reused on a retry, and the closure is kept by the service (RN-CJ12).
 */
@Component({
  selector: 'csh-cash-reopening',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="csh-cash-panel csh-cash-reopening" aria-labelledby="csh-cash-reopening-title">
      <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
      <h2 id="csh-cash-reopening-title">{{ t.title }}</h2>
      <p class="csh-cash-feedback" id="csh-cash-reopening-note">{{ t.note }}</p>
      <form class="csh-cash-form" novalidate (submit)="submit($event)">
        <div class="csh-cash-field">
          <label for="csh-cash-reopening-reason">{{ t.label }}</label>
          <textarea id="csh-cash-reopening-reason" rows="3" [placeholder]="t.placeholder" [value]="reason()" (input)="reason.set($any($event.target).value)"
            [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'csh-cash-reopening-error csh-cash-reopening-note' : 'csh-cash-reopening-note'"></textarea>
          @if (error(); as message) { <p class="csh-cash-field-error" id="csh-cash-reopening-error">{{ message }}</p> }
        </div>
        <div class="csh-cash-form-actions">
          <button type="submit" [disabled]="sending()">{{ t.submit }}</button>
        </div>
      </form>
    </section>
  `,
})
export class CashReopeningComponent {
  /** The service reopened the cash: the page reads the day again and says it. */
  readonly answered = output<string>();

  protected readonly t = CASH_COPY.reopening;
  private readonly writer = inject(CashReopeningWriter);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly key = new IntentionKey(inject(IdempotencyKeys));
  protected readonly reason = signal('');
  protected readonly error = signal('');
  protected readonly sending = signal(false);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) { return; }
    const reason = this.reason().trim();
    if (reason === '') { this.fail(this.t.reasonRequired); return; }
    this.sending.set(true);
    try {
      const result = await this.writer.reopen(reason, this.key.keyFor({ reason }));
      this.key.settled();
      if (result.kind === 'refused') { this.fail(result.reason === 'NOT_CLOSED' ? this.t.notClosed : this.t.reasonRequired); return; }
      this.error.set('');
      this.reason.set('');
      this.answered.emit(this.t.reopened);
    } catch {
      this.fail(this.t.failed);
    } finally {
      this.sending.set(false);
    }
  }

  private fail(message: string): void {
    this.error.set(message);
    afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
  }
}
