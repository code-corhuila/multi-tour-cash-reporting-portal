import { CashCorrectionResult, CashCorrectionWriter } from '../cash/data/cash-correction-writer';
import { PortalApiClient } from '../shell-contract';
import { cashDayPath } from './api-paths';
import { write } from './cash-writers-api';

/**
 * CashCorrectionWriter over the container client (HU-CSH-001, TD-12; contract registerCashCorrection, AC-CJ.5). The history knows a closure by
 * "date@closedAt" (cash-api-mappers), and the service takes the note on the DATE of that closure, so the date is read from the id. The call carries
 * the Idempotency-Key and the justification only. An automatic closure (422 BUSINESS_RULE_VIOLATION) takes no correction; a date without cash
 * (404) or a day that is not closed any more (422 INVALID_STATUS_TRANSITION) has no closure to correct. 403, a blank justification (400) and the
 * network reach the screen as the generic failure.
 */
export class CashCorrectionApiWriter extends CashCorrectionWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async register(cashClosureId: string, justification: string, idempotencyKey: string): Promise<CashCorrectionResult> {
    const businessDate = cashClosureId.split('@')[0];
    const notThere: CashCorrectionResult = { kind: 'refused', reason: 'NOT_FOUND' };
    return write(
      () => this.client.request<unknown>(`${cashDayPath(businessDate)}/corrections`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: { justification } }),
      (): CashCorrectionResult => ({ kind: 'registered' }),
      { BUSINESS_RULE_VIOLATION: { kind: 'refused', reason: 'AUTOMATIC_CLOSURE' }, NOT_FOUND: notThere, INVALID_STATUS_TRANSITION: notThere },
    );
  }
}
