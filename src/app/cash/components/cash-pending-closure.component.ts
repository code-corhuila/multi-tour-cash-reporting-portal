import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, inject, input, output, signal } from '@angular/core';
import { focusFirstError } from '../../shared/focus';
import { formatCop, formatDate } from '../../shared/format';
import { IdempotencyKeys, IntentionKey } from '../../shared/idempotency-keys';
import { CASH_COPY } from '../cash-copy';
import { CashDay } from '../data/cash-day-source';
import { CashPendingClosingWriter } from '../data/cash-pending-closing-writer';

/**
 * The panel "Caja Pendiente de cierre / Hay una caja anterior sin cerrar" of screen 14 (AC-CJ.16). The page draws it for who operates the cash,
 * while the service reports an earlier cash with opening and no closing. Closing it formally keeps its date and does not touch today's cash (GAP-012).
 */
@Component({
  selector: 'csh-cash-pending-closure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="csh-cash-panel csh-cash-pending" aria-labelledby="csh-cash-pending-title">
      <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
      <h2 id="csh-cash-pending-title">{{ t.title }}</h2>
      <p>{{ t.text(date(pending().businessDate)) }}</p>
      @if (error(); as message) { <p class="csh-cash-field-error" id="csh-cash-pending-error" role="alert">{{ message }}</p> }
      <div class="csh-cash-form-actions">
        <button class="csh-cash-primary" type="button" [disabled]="sending()" (click)="close()">{{ t.submit }}</button>
      </div>
    </section>
  `,
})
export class CashPendingClosureComponent {
  readonly day = input.required<CashDay>();
  /** The service closed it: the page reads the day again and says it. */
  readonly answered = output<string>();

  protected readonly t = CASH_COPY.pending;
  protected readonly date = formatDate;
  private readonly writer = inject(CashPendingClosingWriter);
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly key = new IntentionKey(inject(IdempotencyKeys));
  protected readonly error = signal('');
  protected readonly sending = signal(false);

  protected pending(): NonNullable<CashDay['pendingClosure']> { return this.day().pendingClosure!; }

  protected async close(): Promise<void> {
    if (this.sending()) { return; }
    this.sending.set(true);
    try {
      const result = await this.writer.closePending(this.key.keyFor({ date: this.pending().businessDate }));
      this.key.settled();
      if (result.kind === 'refused') { this.fail(this.t.noPending); return; }
      this.error.set('');
      this.answered.emit(this.t.closed(formatDate(result.businessDate), result.expectedCash === null ? CASH_COPY.notApplicable : formatCop(result.expectedCash)));
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
