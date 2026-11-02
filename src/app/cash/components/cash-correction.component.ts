import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { CASH_CONSULTATION_COPY } from '../cash-consultation-copy';
import { CashCorrectionWriter } from '../data/cash-correction-writer';

/**
 * "Registrar corrección" under a closure of admin-historial-caja.html (AC-CJ.5): a mandatory justification, one key per intention reused on a retry.
 * The page draws it only for who registers it (the Administrador) and never on an automatic closure; the service refuses regardless.
 */
@Component({
  selector: 'csh-cash-correction',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="csh-cash-form csh-cash-correction" novalidate (submit)="submit($event)">
      <div class="csh-cash-field">
        <label [for]="id()">{{ t.label }}</label>
        <textarea [id]="id()" rows="3" [placeholder]="t.placeholder" [value]="text()" (input)="text.set($any($event.target).value)"
          [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="id() + '-feedback'"></textarea>
      </div>
      <p class="csh-cash-feedback" [class.csh-cash-feedback-error]="!!error()" [id]="id() + '-feedback'">{{ error() || t.note }}</p>
      <div class="csh-cash-form-actions"><button type="submit" [disabled]="sending()">{{ t.submit }}</button></div>
    </form>
  `,
})
export class CashCorrectionComponent {
  readonly closureId = input.required<string>();
  /** The service kept the correction: the page reads the history again. */
  readonly registered = output<void>();

  protected readonly t = CASH_CONSULTATION_COPY.history.correction;
  private readonly writer = inject(CashCorrectionWriter);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly key = new IntentionKey(inject(IdempotencyKeys));
  protected readonly text = signal('');
  protected readonly error = signal('');
  protected readonly sending = signal(false);
  protected id(): string { return `csh-correction-${this.closureId()}`; }

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) { return; }
    const justification = this.text().trim();
    if (!justification) { this.fail(this.t.required); return; }
    this.sending.set(true);
    try {
      const result = await this.writer.register(this.closureId(), justification, this.key.keyFor({ closure: this.closureId(), justification }));
      this.key.settled();
      if (result.kind === 'refused') { this.fail(result.reason === 'AUTOMATIC_CLOSURE' ? this.t.automatic : this.t.failed); return; }
      this.error.set('');
      this.text.set('');
      this.registered.emit();
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
