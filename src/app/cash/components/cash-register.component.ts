import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { formatCop } from '../../shared/format';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { MoneyRejection, parseMoney } from '../../shared/money';
import { PortalCapabilities } from '../../shared/portal-capabilities';
import { CASH_COPY } from '../cash-copy';
import { CashClosingWriter } from '../data/cash-closing-writer';
import { CashDay, CashPaymentMedium } from '../data/cash-day-source';
import { CashMovementResult, CashMovementWriter, NewCashMovement } from '../data/cash-movement-writer';
import { CashMovementsComponent } from './cash-movements.component';

type MovementType = NewCashMovement['movementType'];
type Field = 'type' | 'concept' | 'amount';

/** Types a person may type: never a refund (AC-CJ.10). */
const TYPES: readonly MovementType[] = ['INCOME', 'OPERATIONAL_PAYMENT', 'EXPENSE'];
const AMOUNT_ERRORS: Record<MoneyRejection, string> = {
  empty: CASH_COPY.form.amountEmpty, negative: CASH_COPY.form.amountEmpty, format: CASH_COPY.form.amountFormat,
  'too-many-decimals': CASH_COPY.form.amountDecimals, 'out-of-range': CASH_COPY.form.amountRange,
};

/**
 * The panel "Movimientos / Registro de la jornada" of screen 14: the form of movements, "Cerrar caja" and the table.
 * Who may operate the cash sees the form and the closing (RN-CJ8); the others, and a build with no writer, see the table.
 * Money is read from the text into cents, one key per intention is reused on a retry, and nothing is added up here (RN-CJ1).
 */
@Component({
  selector: 'csh-cash-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CashMovementsComponent],
  template: `
    <section class="csh-cash-panel csh-cash-register" aria-labelledby="csh-cash-movements-title">
      <div class="csh-cash-register-head">
        <div>
          <p class="csh-cash-eyebrow">{{ t.movementsEyebrow }}</p>
          <h2 id="csh-cash-movements-title">{{ t.movementsTitle }}</h2>
        </div>
        @if (operable) {
          <button type="button" [disabled]="sending() || closed()" (click)="close()">{{ f.close }}</button>
        }
      </div>
      @if (operable) {
        <form class="csh-cash-form" novalidate (submit)="submit($event)">
          <div class="csh-cash-form-grid">
            <div class="csh-cash-field">
              <label for="csh-cash-movement-type">{{ f.type }}</label>
              <select id="csh-cash-movement-type" [attr.aria-invalid]="errors().type ? 'true' : null" [attr.aria-describedby]="errors().type ? 'csh-cash-movement-type-error' : null"
                (change)="type.set($any($event.target).value)">
                <option value="" [selected]="type() === ''">{{ f.typePlaceholder }}</option>
                @for (option of types; track option) { <option [value]="option" [selected]="type() === option">{{ t.types[option] }}</option> }
              </select>
              @if (errors().type; as error) { <p class="csh-cash-field-error" id="csh-cash-movement-type-error">{{ error }}</p> }
            </div>
            <div class="csh-cash-field">
              <label for="csh-cash-movement-medium">{{ f.medium }}</label>
              <select id="csh-cash-movement-medium" (change)="medium.set($any($event.target).value)">
                <option value="CASH" [selected]="shownMedium() === 'CASH'" [disabled]="closed()">{{ t.mediums.CASH }}</option>
                <option value="TRANSFER" [selected]="shownMedium() === 'TRANSFER'">{{ t.mediums.TRANSFER }}</option>
              </select>
            </div>
            <div class="csh-cash-field">
              <label for="csh-cash-movement-concept">{{ f.concept }}</label>
              <input id="csh-cash-movement-concept" type="text" autocomplete="off" [placeholder]="f.conceptPlaceholder" [value]="concept()" (input)="concept.set($any($event.target).value)"
                [attr.aria-invalid]="errors().concept ? 'true' : null" [attr.aria-describedby]="errors().concept ? 'csh-cash-movement-concept-error' : null" />
              @if (errors().concept; as error) { <p class="csh-cash-field-error" id="csh-cash-movement-concept-error">{{ error }}</p> }
            </div>
            <div class="csh-cash-field">
              <label for="csh-cash-movement-amount">{{ f.amount }}</label>
              <input id="csh-cash-movement-amount" type="text" inputmode="decimal" autocomplete="off" [value]="amount()" (input)="amount.set($any($event.target).value)"
                [attr.aria-invalid]="errors().amount ? 'true' : null" [attr.aria-describedby]="errors().amount ? 'csh-cash-movement-amount-error' : null" />
              @if (errors().amount; as error) { <p class="csh-cash-field-error" id="csh-cash-movement-amount-error">{{ error }}</p> }
            </div>
          </div>
          <p id="csh-cash-feedback" class="csh-cash-feedback" [class.csh-cash-feedback-ok]="feedback().tone === 'ok'" [class.csh-cash-feedback-error]="feedback().tone === 'error'" aria-live="polite">{{ feedback().text }}</p>
          <div class="csh-cash-form-actions"><button class="csh-cash-primary" type="submit" [disabled]="sending()">{{ f.submit }}</button></div>
        </form>
      }
      <csh-cash-movements [movements]="day().movements" />
    </section>
  `,
})
export class CashRegisterComponent {
  readonly day = input.required<CashDay>();
  /** The service answered (done or refused): the page reads the day again. */
  readonly answered = output<void>();

  protected readonly t = CASH_COPY;
  protected readonly f = CASH_COPY.form;
  protected readonly types = TYPES;
  private readonly movements = inject(CashMovementWriter, { optional: true });
  private readonly closing = inject(CashClosingWriter, { optional: true });
  /** RN-CJ8: who operates the cash, in a build that has the writers. */
  protected readonly operable = inject(PortalCapabilities).canOperateCash() && this.movements !== null && this.closing !== null;
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly keys = inject(IdempotencyKeys);
  private readonly movementKey = new IntentionKey(this.keys);
  private readonly closingKey = new IntentionKey(this.keys);

  protected readonly type = signal<string>('');
  protected readonly medium = signal<CashPaymentMedium>('CASH');
  protected readonly concept = signal('');
  protected readonly amount = signal('');
  protected readonly errors = signal<Partial<Record<Field, string>>>({});
  protected readonly sending = signal(false);
  protected readonly feedback = signal<{ text: string; tone: 'note' | 'ok' | 'error' }>({ text: CASH_COPY.form.note, tone: 'note' });
  protected readonly closed = computed(() => this.day().status === 'CLOSED');
  /** A closed day takes no cash (AC-CJ.4): the medium reads "Transferencia" until the day is reopened. */
  protected readonly shownMedium = computed<CashPaymentMedium>(() => (this.closed() ? 'TRANSFER' : this.medium()));

  protected async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.sending()) { return; }
    const amount = parseMoney(this.amount());
    const concept = this.concept().trim();
    const errors: Partial<Record<Field, string>> = {
      ...(TYPES.includes(this.type() as MovementType) ? {} : { type: this.f.typeError }),
      ...(concept === '' ? { concept: this.f.conceptError } : {}),
      ...(amount.kind === 'invalid' ? { amount: AMOUNT_ERRORS[amount.reason] } : amount.minorUnits === 0 ? { amount: this.f.amountEmpty } : {}),
    };
    this.errors.set(errors);
    if (amount.kind === 'invalid' || Object.values(errors).some(Boolean)) {
      this.feedback.set({ text: this.f.invalid, tone: 'error' });
      afterNextRender(() => focusFirstError(this.host), { injector: this.injector });
      return;
    }
    const movement: NewCashMovement = { movementType: this.type() as MovementType, concept, amountCents: amount.minorUnits, paymentMedium: this.shownMedium() };
    this.sending.set(true);
    try {
      const result = await this.movements!.register(movement, this.movementKey.keyFor(movement));
      this.movementKey.settled();
      if (result.kind === 'registered') { this.reset(); }
      this.feedback.set({ text: this.movementMessage(result), tone: result.kind === 'registered' ? 'ok' : 'error' });
      this.answered.emit();
    } catch {
      this.feedback.set({ text: this.f.failed, tone: 'error' });
    } finally {
      this.sending.set(false);
    }
  }

  protected async close(): Promise<void> {
    if (this.sending()) { return; }
    this.sending.set(true);
    try {
      const result = await this.closing!.close(this.closingKey.keyFor({ closing: this.day().businessDate }));
      this.closingKey.settled();
      const text = result.kind === 'closed' ? this.f.closed(formatCop(result.expectedCash)) : result.reason === 'ALREADY_CLOSED' ? this.f.alreadyClosed : this.f.notOperative;
      this.feedback.set({ text, tone: result.kind === 'closed' ? 'ok' : 'error' });
      this.answered.emit();
    } catch {
      this.feedback.set({ text: this.f.failed, tone: 'error' });
    } finally {
      this.sending.set(false);
    }
  }

  private movementMessage(result: CashMovementResult): string {
    if (result.kind === 'refused') { return result.reason === 'DAY_CLOSED' ? this.f.dayClosed : this.f.cashNeedsOpening; }
    return result.placement === 'AFTER_CLOSING' ? this.f.afterClosing : result.placement === 'DAY_CREATED' ? this.f.dayCreated : this.f.registered;
  }

  private reset(): void {
    this.type.set('');
    this.medium.set('CASH');
    this.concept.set('');
    this.amount.set('');
    this.errors.set({});
  }
}
