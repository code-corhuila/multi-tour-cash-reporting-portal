import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { formatCop, formatHour } from '../../shared/format';
import { CASH_COPY } from '../cash-copy';
import { CashMovement } from '../data/cash-day-source';

/** The table "Registro de la jornada" of screen 14: each movement once, with its medium; the amounts come signed from the port (RN-CJ1). */
@Component({
  selector: 'csh-cash-movements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="csh-cash-table-wrap">
      <table class="csh-cash-table" [attr.aria-label]="t.movementsTitle">
        <thead><tr>@for (column of t.columns; track column) { <th scope="col">{{ column }}</th> }</tr></thead>
        <tbody>
          @for (m of movements(); track m.cashMovementId) {
            <tr>
              <td>{{ hour(m) }}</td>
              <td>{{ t.types[m.movementType] }}</td>
              <td>{{ m.concept }}</td>
              <td>{{ t.mediums[m.paymentMedium] }}@if (m.afterClosing) { <small>{{ t.afterClosing }}</small> }</td>
              <td>{{ value(m) }}</td>
              <td>{{ m.registeredBy }}</td>
            </tr>
          } @empty {
            <tr><td [attr.colspan]="t.columns.length">{{ t.noMovements }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class CashMovementsComponent {
  readonly movements = input.required<readonly CashMovement[]>();
  protected readonly t = CASH_COPY;
  protected hour(m: CashMovement): string { return formatHour(m.registeredAt); }
  protected value(m: CashMovement): string { return formatCop(m.amount); }
}
