import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
import { formatCop, formatDate, formatDateTime, formatHour } from '../../shared/format';
import { PageLoad, PageStateComponent } from '../../shared/page-state';
import { PortalNavigation } from '../../shared/portal-navigation';
import { CASH_COPY } from '../cash-copy';
import { CASH_CONSULTATION_COPY, originOf } from '../cash-consultation-copy';
import { CashClosure, CashClosuresSource } from '../data/cash-closures-source';
import { CashMovement } from '../data/cash-day-source';

/** Sub-screen of 14, admin-historial-caja.html: every closure with what it kept, newest first. Read only: it draws what the source resolved (RN-CJ1). */
@Component({
  selector: 'csh-cash-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageStateComponent],
  template: `
    <section class="csh-cash" aria-labelledby="csh-history-title">
      <header class="csh-cash-header csh-history-header">
        <div>
          <p class="csh-cash-eyebrow">{{ t.eyebrow }}</p>
          <h1 id="csh-history-title" class="csh-cash-title">{{ t.title }}</h1>
        </div>
        <button type="button" (click)="navigation.open('cash')">{{ back }}</button>
      </header>
      <p class="csh-cash-access-note">{{ t.note }}</p>
      <csh-page-state [state]="load.state()" [emptyText]="t.empty">
        @let s = load.state();
        @if (s.kind === 'data') {
          @for (closure of s.items; track closure.cashClosureId) {
            <section class="csh-cash-panel csh-history-closure" [attr.aria-labelledby]="'csh-closure-' + closure.cashClosureId">
              <div class="csh-history-head">
                <div>
                  <p class="csh-cash-eyebrow" [id]="'csh-closure-' + closure.cashClosureId">{{ t.closure(date(closure.businessDate)) }}</p>
                  <h2>{{ t.total }}: {{ money(closure.total) }}</h2>
                </div>
                <span class="csh-history-badge" [class.csh-history-badge-open]="closure.reopened">{{ badge(closure) }}</span>
              </div>
              <dl class="csh-history-lines">
                @for (line of lines(closure); track line.label) { <div><dt>{{ line.label }}</dt><dd>{{ line.value }}</dd></div> }
              </dl>
              @if (closure.reopenings.length) {
                <p class="csh-cash-eyebrow">{{ t.reopenings.title }}</p>
                <div class="csh-cash-table-wrap"><table class="csh-cash-table">
                  <thead><tr>@for (c of t.reopenings.columns; track c) { <th scope="col">{{ c }}</th> }</tr></thead>
                  <tbody>@for (r of closure.reopenings; track r) { <tr><td>{{ dateTime(r.reopenedAt) }}</td><td>{{ r.reopenedBy }}</td><td>{{ r.reason }}</td></tr> }</tbody>
                </table></div>
              }
              @if (closure.movements.length) {
                <p class="csh-cash-eyebrow">{{ t.movements.title }}</p>
                <div class="csh-cash-table-wrap"><table class="csh-cash-table">
                  <thead><tr>@for (c of movementColumns; track c) { <th scope="col">{{ c }}</th> }</tr></thead>
                  <tbody>@for (m of closure.movements; track m.cashMovementId) {
                    <tr><td>{{ hour(m.registeredAt) }}</td><td>{{ types[m.movementType] }}</td><td>{{ m.concept }}</td><td>{{ medium(m) }}</td><td>{{ money(m.amount) }}</td></tr>
                  }</tbody>
                </table></div>
                @if (nonCash(closure); as n) { <p class="csh-history-note">{{ t.movements.nonCash(n) }}</p> }
              }
              <p class="csh-cash-eyebrow">{{ t.corrections.title }}</p>
              @if (closure.corrections.length) {
                <div class="csh-cash-table-wrap"><table class="csh-cash-table">
                  <thead><tr>@for (c of t.corrections.columns; track c) { <th scope="col">{{ c }}</th> }</tr></thead>
                  <tbody>@for (c of closure.corrections; track c) { <tr><td>{{ dateTime(c.appliedAt) }}</td><td>{{ c.appliedBy }}</td><td>{{ c.justification }}</td></tr> }</tbody>
                </table></div>
              } @else { <p class="csh-history-note">{{ t.corrections.none }}</p> }
            </section>
          }
        }
      </csh-page-state>
    </section>
  `,
})
export class CashHistoryPageComponent {
  protected readonly t = CASH_CONSULTATION_COPY.history;
  protected readonly back = CASH_CONSULTATION_COPY.back;
  protected readonly types = CASH_COPY.types;
  protected readonly movementColumns = CASH_COPY.columns.slice(0, 5);
  protected readonly navigation = inject(PortalNavigation);
  private readonly source = inject(CashClosuresSource);
  protected readonly load = new PageLoad<CashClosure>();
  protected readonly money = formatCop;
  protected readonly date = formatDate;
  protected readonly dateTime = formatDateTime;
  protected readonly hour = formatHour;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.load.stop());
    this.load.run(() => this.source.list());
  }

  protected badge(closure: CashClosure): string {
    return closure.reopened ? this.t.badge.reopened : closure.closingMode === 'AUTOMATIC' ? this.t.badge.automatic : this.t.badge.closed;
  }

  /** The lines of the mockup in its order; a cash without cash (expectedCash null) has no "Efectivo esperado al cierre". */
  protected lines(closure: CashClosure): readonly { label: string; value: string }[] {
    const l = this.t.lines;
    return [
      { label: l.base, value: formatCop(closure.openingBase) }, { label: l.income, value: formatCop(closure.income) },
      { label: l.payments, value: formatCop(closure.operationalPayments) }, { label: l.expenses, value: formatCop(closure.expenses) },
      { label: l.refunds, value: formatCop(closure.refunds) },
      ...(closure.expectedCash === null ? [] : [{ label: l.expected, value: formatCop(closure.expectedCash) }]),
      { label: l.origin, value: originOf(closure.closingMode, closure.origin) },
      { label: l.closedBy, value: closure.closedBy }, { label: l.closedAt, value: formatDateTime(closure.closedAt) },
    ];
  }

  protected medium(movement: CashMovement): string {
    const medium = CASH_COPY.mediums[movement.paymentMedium];
    return movement.afterClosing ? `${medium} · ${CASH_COPY.afterClosing}` : medium;
  }

  protected nonCash(closure: CashClosure): number { return closure.movements.filter((m) => m.paymentMedium === 'TRANSFER').length; }
}
