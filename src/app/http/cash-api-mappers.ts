import { CashClosure } from '../cash/data/cash-closures-source';
import { CashDay, CashDayStatus, CashMovement, CashMovementType } from '../cash/data/cash-day-source';

// Wire shapes of `openapi/openapi.yaml` of the -api (schemas CashDay, CashMovement, CashClosure). Money is integer cents; instants are UTC.
interface Actor { readonly roleLabel: string; readonly displayName?: string | null }
export interface CashDayDto {
  readonly businessDate: string; readonly timeZone: string; readonly cashSessionId: string | null; readonly status: 'NO_OPENING' | 'OPEN' | 'CLOSED';
  readonly origin?: CashDay['origin']; readonly hasOperationalOpening: boolean; readonly openingBaseCents?: number | null; readonly parametrizedBaseCents?: number | null; readonly openedBy?: Actor | null;
  readonly incomeCents: number; readonly operationalPaymentsCents: number; readonly expensesCents: number; readonly refundsCents: number;
  readonly totalCents: number; readonly expectedCashCents?: number | null; readonly netTransfersCents: number;
}
export interface CashMovementDto {
  readonly cashMovementId: string; readonly movementType: 'INCOME' | 'OPERATIONAL_PAYMENT' | 'OPERATIONAL_EXPENSE' | 'REFUND'; readonly paymentMedium: CashMovement['paymentMedium'];
  readonly concept: string; readonly amountCents: number; readonly afterClosing: boolean; readonly reservationId?: string | null; readonly registeredAt: string; readonly registeredBy: Actor;
}
export interface CashClosureDto {
  readonly businessDate: string; readonly badge: 'CLOSED' | 'REOPENED' | 'AUTOMATIC_CLOSING'; readonly baseCents?: number | null; readonly incomeCents: number;
  readonly operationalPaymentsCents: number; readonly expensesCents: number; readonly refundsCents: number; readonly totalCents: number; readonly expectedCashCents?: number | null;
  readonly origin: CashClosure['origin']; readonly closingMode: 'FORMAL' | 'AUTOMATIC'; readonly closedBy?: Actor | null; readonly closedAt: string;
  readonly reopenings: readonly { readonly reopenedBy: Actor; readonly reopenedAt: string; readonly reason: string }[];
  readonly corrections: readonly { readonly registeredBy: Actor; readonly registeredAt: string; readonly justification: string }[];
}

/** The session names no user yet (G-USR): "Name (Role)" when the name is known, otherwise the role label. */
export const actorText = (actor: Actor): string => (actor.displayName ? `${actor.displayName} (${actor.roleLabel})` : actor.roleLabel);

/** The tenant's local wall time, `2026-09-01T09:20:00`, of a UTC instant: the portal draws what the tenant lived (plan D-06), never the browser's zone. */
export function localTime(instant: string, timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(instant)).map((part) => [part.type, part.value]));
  return `${parts['year']}-${parts['month']}-${parts['day']}T${parts['hour']}:${parts['minute']}:${parts['second']}`;
}

const TYPES: Record<CashMovementDto['movementType'], CashMovementType> = { INCOME: 'INCOME', OPERATIONAL_PAYMENT: 'OPERATIONAL_PAYMENT', OPERATIONAL_EXPENSE: 'EXPENSE', REFUND: 'REFUND' };

/** Outflows are signed negative in the portal (AC-CJ.10); the contract sends the magnitude. A refund keeps its reservation. */
export function toMovement(dto: CashMovementDto, timeZone: string): CashMovement {
  const movementType = TYPES[dto.movementType];
  return {
    cashMovementId: dto.cashMovementId, movementType, concept: dto.concept, amount: movementType === 'INCOME' ? dto.amountCents : -dto.amountCents,
    paymentMedium: dto.paymentMedium, afterClosing: dto.afterClosing, registeredAt: localTime(dto.registeredAt, timeZone), registeredBy: actorText(dto.registeredBy),
    ...(dto.reservationId ? { reservationId: dto.reservationId } : {}),
  };
}

/** `OPEN` is operative once the day had its operational opening; an automatic creation without it stays `OPEN_AUTOMATIC` (the mark pendingClosure is the pending day, not a status). */
function statusOf(dto: CashDayDto): CashDayStatus {
  return dto.status === 'OPEN' ? (dto.hasOperationalOpening ? 'OPEN_OPERATIVE' : 'OPEN_AUTOMATIC') : dto.status;
}

export function toDay(dto: CashDayDto, movements: readonly CashMovementDto[], pending?: CashDayDto): CashDay {
  return {
    businessDate: dto.businessDate, status: statusOf(dto), origin: dto.origin ?? null, openingBase: dto.openingBaseCents ?? 0,
    openedBy: dto.openedBy ? actorText(dto.openedBy) : null,
    ...(typeof dto.parametrizedBaseCents === 'number' ? { parametrizedBase: dto.parametrizedBaseCents } : {}),
    ...(pending ? { pendingClosure: { businessDate: pending.businessDate, openedBy: pending.openedBy ? actorText(pending.openedBy) : '', openingBase: pending.openingBaseCents ?? 0 } } : {}),
    movements: movements.map((movement) => toMovement(movement, dto.timeZone)),
    metrics: {
      income: dto.incomeCents, operationalPayments: dto.operationalPaymentsCents, expenses: dto.expensesCents, refunds: dto.refundsCents,
      total: dto.totalCents, expectedCash: dto.expectedCashCents ?? null, netTransfers: dto.netTransfersCents,
    },
  };
}

/** The contract has no closure id: the date and the closing instant identify it, since a reopened date closes again (DP-CJ8). */
export function toClosure(dto: CashClosureDto, movements: readonly CashMovementDto[], timeZone: string): CashClosure {
  const mapped = movements.map((movement) => toMovement(movement, timeZone));
  return {
    cashClosureId: `${dto.businessDate}@${dto.closedAt}`, businessDate: dto.businessDate, closingMode: dto.closingMode === 'FORMAL' ? 'MANUAL' : 'AUTOMATIC',
    origin: dto.origin, reopened: dto.badge === 'REOPENED', openingBase: dto.baseCents ?? 0, income: dto.incomeCents, operationalPayments: dto.operationalPaymentsCents,
    expenses: dto.expensesCents, refunds: dto.refundsCents, total: dto.totalCents, expectedCash: dto.expectedCashCents ?? null,
    closedBy: dto.closedBy ? actorText(dto.closedBy) : dto.closingMode === 'AUTOMATIC' ? 'Cierre automático (Multitour)' : '',
    closedAt: localTime(dto.closedAt, timeZone),
    reopenings: dto.reopenings.map((r) => ({ reopenedAt: localTime(r.reopenedAt, timeZone), reopenedBy: actorText(r.reopenedBy), reason: r.reason })),
    corrections: dto.corrections.map((c) => ({ appliedAt: localTime(c.registeredAt, timeZone), appliedBy: actorText(c.registeredBy), justification: c.justification })),
    movements: mapped, nonCashMovements: mapped.filter((movement) => movement.paymentMedium === 'TRANSFER').length,
  };
}
