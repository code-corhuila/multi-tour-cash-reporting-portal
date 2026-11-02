import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, linkedSignal, output, signal } from '@angular/core';
import { formatCop } from '../../shared/format';
import { focusFirstError } from '../../shared/focus';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { parseMoney } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CASH_COPY } from '../cash-copy';
import { CashDay } from '../data/cash-day-source';
import { CashOpeningWriter } from '../data/cash-opening-writer';

/** Cents as the pesos typed in the field, `300000` or `300000.5`: the digits are split as text, nothing is multiplied. */
function pesosText(cents: number): string {
  const fraction = String(cents % 100).padStart(2, '0').replace(/0$/, '');
  return `${Math.floor(cents / 100)}${fraction === '0' ? '' : `.${fraction}`}`;
}

/**
 * The panel "Apertura operativa / Abrir la caja de hoy" of screen 14 (AC-CJ.13). The page draws it for who operates the cash, on a day that
 * has no opening or whose cash a transfer created. The Administrador types the base; the Colaborador opens with the parametrized one, read only (RN-CJ6).
 */
@Component({
  selector: 'csh-cash-opening',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="csh-cash-panel csh-cash-opening" aria-labelledby="csh-cash-opening-title">
      <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
      <h2 id="csh-cash-opening-title">{{ t.title }}</h2>
      <p class="csh-cash-feedback" id="csh-cash-opening-note">{{ t.note }}</p>
      <form class="csh-cash-form" novalidate (submit)="submit($event)">
        <div class="csh-cash-field">
          <label for="csh-cash-opening-input">{{ t.label }}</label>
          <input id="csh-cash-opening-input" type="text" inputmode="decimal" autocomplete="off" [readOnly]="!typesBase" [value]="text()" (input)="text.set($any($event.target).value)"
            [attr.aria-invalid]="error() ? 'true' : null" [attr.aria-describedby]="error() ? 'csh-cash-opening-error csh-cash-opening-note' : 'csh-cash-opening-note'" />
          @if (error(); as message) { <p class="csh-cash-field-error" id="csh-cash-opening-error">{{ message }}</p> }
        </div>
        <div class="csh-cash-form-actions">
          <button class="csh-cash-primary" type="submit" [disabled]="sending()">{{ t.submit }}</button>
        </div>
      </form>
    </section>
  `,
})
export class CashOpeningComponent {
  readonly day = input.required<CashDay>();
  /** The service opened the cash: the page reads the day again and says it. */
  readonly answered = output<string>();

  protected readonly t = CASH_COPY.opening;
  protected readonly typesBase = inject(PortalCapabilities).canChangeBase();
  private readonly writer = inject(CashOpeningWriter);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly key = new IntentionKey(inject(IdempotencyKeys));
  protected readonly text = linkedSignal(() => pesosText(this.day().parametrizedBase ?? 0));
  protected readonly error = signal('');
  protected readonly sending = signal(false);

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) { return; }
    const base = parseMoney(this.text());
    if (base.kind === 'invalid') { this.fail(this.t.invalid); return; }
    this.sending.set(true);
    try {
      const result = await this.writer.open(base.minorUnits, this.key.keyFor({ base: base.minorUnits }));
      this.key.settled();
      if (result.kind === 'refused') { this.fail(result.reason === 'ALREADY_OPEN' ? this.t.alreadyOpen : this.t.dayClosed); return; }
      this.error.set('');
      this.answered.emit(this.t.opened(formatCop(result.baseCents)));
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
