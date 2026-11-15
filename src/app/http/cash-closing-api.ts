import { CashClosingResult, CashClosingWriter } from '../cash/data/cash-closing-writer';
import { CashPendingClosingResult, CashPendingClosingWriter } from '../cash/data/cash-pending-closing-writer';
import { CashReopeningResult, CashReopeningWriter } from '../cash/data/cash-reopening-writer';
import { PortalApiClient } from '../shell-contract';
import { cashDayPath, pageOf, pendingCashDaysPath } from './api-paths';
import { CashDayDto } from './cash-api-mappers';
import { today, write } from './cash-writers-api';

/**
 * CashClosingWriter over the container client (HU-CSH-001 branch 3; contract closeCashDay). The date of the path is the tenant's today and
 * the call carries the Idempotency-Key and no body. The answer is the closed day: its expected cash is what the screen shows (the service computes it).
 * PENDING_CLOSURE, 403 and 400 have no reason of their own in the domain: they reach the screen as the generic failure.
 */
export class CashClosingApiWriter extends CashClosingWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async close(idempotencyKey: string): Promise<CashClosingResult> {
    const day = await today(this.client);
    return write(
      () => this.client.request<CashDayDto>(`${cashDayPath(day.businessDate)}/close`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }),
      (closed): CashClosingResult => ({ kind: 'closed', expectedCash: closed.expectedCashCents ?? 0 }),
      { ALREADY_CLOSED: { kind: 'refused', reason: 'ALREADY_CLOSED' }, NO_OPEN_CASH: { kind: 'refused', reason: 'NOT_OPERATIVE' } },
    );
  }
}

/**
 * CashPendingClosingWriter over the container client: the same closeCashDay with the PAST date of the pending day (formal closing, GAP-012). The port
 * carries no date, so the day is read from the list `pendingClosure=true` (previous days only, most recent first); today is not asked. Someone
 * closing it first (ALREADY_CLOSED, NO_OPEN_CASH) leaves nothing pending.
 */
export class CashPendingClosingApiWriter extends CashPendingClosingWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async closePending(idempotencyKey: string): Promise<CashPendingClosingResult> {
    const [pending] = (await pageOf<CashDayDto>(this.client, pendingCashDaysPath(), 1, 1)).data;
    if (!pending) return { kind: 'refused', reason: 'NO_PENDING' };
    const none: CashPendingClosingResult = { kind: 'refused', reason: 'NO_PENDING' };
    return write(
      () => this.client.request<CashDayDto>(`${cashDayPath(pending.businessDate)}/close`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey } }),
      (closed): CashPendingClosingResult => ({ kind: 'closed', businessDate: closed.businessDate, expectedCash: closed.expectedCashCents ?? null }),
      { ALREADY_CLOSED: none, NO_OPEN_CASH: none },
    );
  }
}

/**
 * CashReopeningWriter over the container client (contract reopenCashDay): the body is the mandatory `reason`. A day that is not closed (ALREADY_OPEN)
 * or has no cash (404 NOT_FOUND) is "not closed"; a blank reason the service refuses is REASON_REQUIRED (400).
 */
export class CashReopeningApiWriter extends CashReopeningWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async reopen(reason: string, idempotencyKey: string): Promise<CashReopeningResult> {
    const day = await today(this.client);
    const notClosed: CashReopeningResult = { kind: 'refused', reason: 'NOT_CLOSED' };
    return write(
      () => this.client.request<CashDayDto>(`${cashDayPath(day.businessDate)}/reopen`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { reason } }),
      (): CashReopeningResult => ({ kind: 'reopened' }),
      { ALREADY_OPEN: notClosed, NOT_FOUND: notClosed, REASON_REQUIRED: { kind: 'refused', reason: 'REASON_REQUIRED' } },
    );
  }
}
