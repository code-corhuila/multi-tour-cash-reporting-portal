import { CashBaseResult, CashBaseWriter } from '../cash/data/cash-base-writer';
import { CashDayStatus } from '../cash/data/cash-day-source';
import { CashMovementResult, CashMovementWriter, NewCashMovement } from '../cash/data/cash-movement-writer';
import { CashOpeningResult, CashOpeningWriter } from '../cash/data/cash-opening-writer';
import { PortalApiClient } from '../shell-contract';
import { cashDayPath, currentCashDayPath } from './api-paths';
import { CashDayDto, CashMovementDto } from './cash-api-mappers';

/** The tenant's today and whether that day already has a cash: the service decides both (the path of a write carries the date, never a tenant). */
export async function today(client: PortalApiClient): Promise<CashDayDto> {
  return client.request<CashDayDto>(currentCashDayPath());
}

/** The domain code of a refusal the portal can know (400, 404 or 422 of the container error `{status, code}`); the map of each write decides which codes it knows, any other failure reaches the screen as it came. */
const ruleCode = (error: unknown): string | undefined =>
  [400, 404, 422].includes((error as { status?: number } | null)?.status ?? 0) ? (error as { code?: string }).code : undefined;

/** Runs a write: a refusal the portal knows becomes a domain result, any other rejection (403, 400, PENDING_CLOSURE, network) is rethrown untouched. */
export async function write<T, R>(send: () => Promise<T>, done: (answer: T) => R, refuse: Readonly<Record<string, R>>): Promise<R> {
  try {
    return done(await send());
  } catch (error) {
    const refused = refuse[ruleCode(error) ?? ''];
    if (refused === undefined) throw error;
    return refused;
  }
}

/**
 * CashOpeningWriter over the container client (HU-CSH-001 branch 2; contract openCashDay). Only the Administrador sends the base: a
 * Colaborador sends no body and the service opens with the parametrized base, so `baseCents` is read back from the answer.
 */
export class CashOpeningApiWriter extends CashOpeningWriter {
  constructor(private readonly client: PortalApiClient, private readonly sendsBase: () => boolean) { super(); }

  override async open(baseCents: number, idempotencyKey: string): Promise<CashOpeningResult> {
    const day = await today(this.client);
    const init = { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, ...(this.sendsBase() ? { body: { openingBaseCents: baseCents } } : {}) };
    return write(
      () => this.client.request<CashDayDto>(`${cashDayPath(day.businessDate)}/open`, init),
      (opened): CashOpeningResult => ({ kind: 'opened', baseCents: opened.openingBaseCents ?? baseCents }),
      { ALREADY_OPEN: { kind: 'refused', reason: 'ALREADY_OPEN' }, ALREADY_CLOSED: { kind: 'refused', reason: 'DAY_CLOSED' } },
    );
  }
}

/** CashBaseWriter over the container client (contract adjustCashBase). The contract takes no Idempotency-Key here: the same value again changes nothing. */
export class CashBaseApiWriter extends CashBaseWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async adjust(baseCents: number, _idempotencyKey: string): Promise<CashBaseResult> {
    const day = await today(this.client);
    return write(
      () => this.client.request<CashDayDto>(`${cashDayPath(day.businessDate)}/adjust-base`, { method: 'POST', body: { openingBaseCents: baseCents } }),
      (): CashBaseResult => ({ kind: 'adjusted' }),
      { ALREADY_CLOSED: { kind: 'refused', reason: 'DAY_CLOSED' }, NO_OPEN_CASH: { kind: 'refused', reason: 'NOT_OPERATIVE' } },
    );
  }
}

/** The portal says EXPENSE where the contract says OPERATIONAL_EXPENSE; the amount is already the positive magnitude both sides use. */
const WIRE_TYPE: Record<NewCashMovement['movementType'], CashMovementDto['movementType']> = { INCOME: 'INCOME', OPERATIONAL_PAYMENT: 'OPERATIONAL_PAYMENT', EXPENSE: 'OPERATIONAL_EXPENSE' };
const NO_CASH: CashDayStatus = 'NO_OPENING';

/**
 * CashMovementWriter over the container client (contract registerCashMovement). The placement is not in the answer: `afterClosing` says
 * after the closing, and a day read with no cash before the write says the service created it (a transfer, AC-CJ.8).
 */
export class CashMovementApiWriter extends CashMovementWriter {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async register(movement: NewCashMovement, idempotencyKey: string): Promise<CashMovementResult> {
    const day = await today(this.client);
    const body = { movementType: WIRE_TYPE[movement.movementType], paymentMedium: movement.paymentMedium, concept: movement.concept, amountCents: movement.amountCents };
    return write(
      () => this.client.request<CashMovementDto>(`${cashDayPath(day.businessDate)}/movements`, { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body }),
      (stored): CashMovementResult => ({ kind: 'registered', placement: stored.afterClosing ? 'AFTER_CLOSING' : day.status === NO_CASH ? 'DAY_CREATED' : 'IN_DAY' }),
      { NO_OPEN_CASH: { kind: 'refused', reason: 'CASH_NEEDS_OPENING' }, ALREADY_CLOSED: { kind: 'refused', reason: 'DAY_CLOSED' } },
    );
  }
}
