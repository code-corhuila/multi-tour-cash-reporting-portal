import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, linkedSignal, model, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { parseMoney } from '../../shared/money';
import { CASH_COPY } from '../cash-copy';
import { CashBaseWriter } from '../data/cash-base-writer';
import { CashDay } from '../data/cash-day-source';

/** Cents as the pesos typed in the field, `300000` or `300000.5`: the digits are split as text, nothing is multiplied. */
function pesosText(cents: number): string {
  const fraction = String(cents % 100).padStart(2, '0').replace(/0$/, '');
  return `${Math.floor(cents / 100)}${fraction === '0' ? '' : `.${fraction}`}`;
}

/**
 * The panel "Ajuste / Ajustar base diaria" of screen 14, opened by the button of the header (AC-CJ.9). The page draws it only
 * for who changes the base (RN-CJ6). The value is read from the text into cents and one key per intention is reused on a retry.
 */
@Component({
  selector: 'csh-cash-base-adjust',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <section class="csh-cash-panel csh-cash-base" aria-labelledby="csh-cash-base-title">
        <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
        <h2 id="csh-cash-base-title">{{ t.title }}</h2>
        <form class="csh-cash-form" novalidate (submit)="submit($event)">
          <div class="csh-cash-field">
            <label for="csh-cash-base-input">{{ t.label }}</label>
            <input id="csh-cash-base-input" type="text" inputmode="decimal" autocomplete="off" [value]="text()" (input)="text.set($any($event.target).value)"
              [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'csh-cash-base-error csh-cash-base-note' : 'csh-cash-base-note'" />
            @if (error(); as message) { <p class="csh-cash-field-error" id="csh-cash-base-error">{{ message }}</p> }
          </div>
          <p id="csh-cash-base-note" class="csh-cash-feedback">{{ t.note }}</p>
          <div class="csh-cash-form-actions">
            <button type="button" (click)="open.set(false)">{{ t.cancel }}</button>
            <button class="csh-cash-primary" type="submit" [disabled]="sending()">{{ t.save }}</button>
          </div>
        </form>
      </section>
    } @else if (notice(); as message) {
      <p id="csh-cash-base-notice" class="csh-cash-feedback csh-cash-feedback-ok" role="status">{{ message }}</p>
    }
  `,
})
export class CashBaseAdjustComponent {
  readonly day = input.required<CashDay>();
  readonly open = model(false);
  /** The service changed the base: the page reads the day again. */
  readonly answered = output<void>();

  protected readonly t = CASH_COPY.base;
  private readonly writer = inject(CashBaseWriter);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly key = new IntentionKey(inject(IdempotencyKeys));
  /** Each opening starts from the current base, with no error and no earlier notice. */
  protected readonly text = linkedSignal(() => (this.open() ? pesosText(this.day().openingBase) : ''));
  protected readonly error = linkedSignal(() => { this.open(); return ''; });
  protected readonly notice = linkedSignal(() => { this.open(); return ''; });
  protected readonly sending = signal(false);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) { return; }
    const base = parseMoney(this.text());
    if (base.kind === 'invalid') { this.fail(this.t.invalid); return; }
    this.sending.set(true);
    try {
      const result = await this.writer.adjust(base.minorUnits, this.key.keyFor({ base: base.minorUnits }));
      this.key.settled();
      if (result.kind === 'refused') { this.fail(this.t.refused); return; }
      this.open.set(false);
      this.notice.set(this.t.saved);
      this.answered.emit();
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
