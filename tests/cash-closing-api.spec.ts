import { describe, expect, it } from 'vitest';
import { CashClosingApiWriter, CashPendingClosingApiWriter, CashReopeningApiWriter } from '../src/app/http/cash-closing-api';
import { containerError, fakeCashClient, page } from './cash-api-client.double';

// HU-CSH-001, branch 3: adapters of CashClosingWriter, CashPendingClosingWriter and CashReopeningWriter (contract closeCashDay, reopenCashDay, listCashDays).
// Every request goes through props.apiClient; the portal sends no tenant. The pending closing sends the PAST date of the pending day (formal closing).
const BASE = '/api/v1/cash-reporting';
const CURRENT = `${BASE}/cash-days/current`;
const PENDING_LIST = `${BASE}/cash-days?pendingClosure=true&page=1&limit=1`;
const DATE = '2026-09-01';
const EARLIER = '2026-08-31';
const CLOSE_PATH = `${BASE}/cash-days/${DATE}/close`;
const REOPEN_PATH = `${BASE}/cash-days/${DATE}/reopen`;
const EARLIER_CLOSE_PATH = `${BASE}/cash-days/${EARLIER}/close`;
const ADMIN = { userId: 'u-1', roleLabel: 'Administrador del tenant' };
const DAY = {
  businessDate: DATE, timeZone: 'America/Bogota', cashSessionId: 's-1', status: 'OPEN', origin: 'OPERATIONAL_OPENING', hasOperationalOpening: true, pendingClosure: false,
  openingBaseCents: 30000000, openedBy: ADMIN, incomeCents: 0, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0, totalCents: 30000000, expectedCashCents: 30000000, netTransfersCents: 0,
};
const CLOSED = { ...DAY, status: 'CLOSED', expectedCashCents: 27500000 };
const EARLIER_DAY = { ...DAY, businessDate: EARLIER, pendingClosure: true };
const EARLIER_CLOSED = { ...EARLIER_DAY, pendingClosure: false, status: 'CLOSED', expectedCashCents: 41000000, formalClosureOfPending: true };
const KEY = 'key-00000001';
const rule = (code: string, status = 422) => ({ fail: containerError(status, code) });
type Sent = { path: string; init?: { method?: string; headers?: Record<string, string>; body?: unknown } };
const keysSentTo = (calls: Sent[], path: string) => calls.filter((call) => call.path === path).map((call) => call.init?.headers?.['Idempotency-Key']);

describe('cashClosingApiWriter', () => {
  it('closes with POST on the date of the service, the Idempotency-Key and no body, and shows the expected cash of the answer', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [CLOSE_PATH]: { ok: CLOSED } });
    expect(await new CashClosingApiWriter(client).close(KEY)).toEqual({ kind: 'closed', expectedCash: 27500000 });
    expect(calls[0]).toEqual({ path: CURRENT, init: undefined });
    expect(calls[1]).toEqual({ path: CLOSE_PATH, init: { method: 'POST', headers: { 'Idempotency-Key': KEY } } });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('a retry sends the same key and the replay answer counts as closed', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [CLOSE_PATH]: [{ fail: containerError(503, 'SERVICE_UNAVAILABLE') }, { ok: CLOSED }] });
    const writer = new CashClosingApiWriter(client);
    await expect(writer.close(KEY)).rejects.toMatchObject({ status: 503 });
    await expect(writer.close(KEY)).resolves.toEqual({ kind: 'closed', expectedCash: 27500000 });
    expect(keysSentTo(calls, CLOSE_PATH)).toEqual([KEY, KEY]);
  });

  it.each([['ALREADY_CLOSED', 'ALREADY_CLOSED'], ['NO_OPEN_CASH', 'NOT_OPERATIVE']])('maps the %s refusal to the domain reason %s', async (code, reason) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [CLOSE_PATH]: rule(code) });
    expect(await new CashClosingApiWriter(client).close(KEY)).toEqual({ kind: 'refused', reason });
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'PENDING_CLOSURE'], [422, 'BUSINESS_RULE_VIOLATION'], [401, 'UNAUTHORIZED']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [CLOSE_PATH]: { fail: error } });
    await expect(new CashClosingApiWriter(client).close(KEY)).rejects.toBe(error);
  });
});

describe('cashPendingClosingApiWriter', () => {
  it('closes the PAST date of the pending day with the same close route, the key and no body; today is not asked', async () => {
    const { client, calls } = fakeCashClient({ [PENDING_LIST]: { ok: page([EARLIER_DAY]) }, [EARLIER_CLOSE_PATH]: { ok: EARLIER_CLOSED } });
    expect(await new CashPendingClosingApiWriter(client).closePending(KEY)).toEqual({ kind: 'closed', businessDate: EARLIER, expectedCash: 41000000 });
    expect(calls).toEqual([{ path: PENDING_LIST, init: undefined }, { path: EARLIER_CLOSE_PATH, init: { method: 'POST', headers: { 'Idempotency-Key': KEY } } }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('keeps no expected cash when the answer has none', async () => {
    const { client } = fakeCashClient({ [PENDING_LIST]: { ok: page([EARLIER_DAY]) }, [EARLIER_CLOSE_PATH]: { ok: { ...EARLIER_CLOSED, expectedCashCents: null } } });
    expect(await new CashPendingClosingApiWriter(client).closePending(KEY)).toEqual({ kind: 'closed', businessDate: EARLIER, expectedCash: null });
  });

  it('is refused as NO_PENDING, without any write, when the service lists no pending day', async () => {
    const { client, calls } = fakeCashClient({ [PENDING_LIST]: { ok: page([]) } });
    expect(await new CashPendingClosingApiWriter(client).closePending(KEY)).toEqual({ kind: 'refused', reason: 'NO_PENDING' });
    expect(calls.map((call) => call.path)).toEqual([PENDING_LIST]);
  });

  it.each([['ALREADY_CLOSED'], ['NO_OPEN_CASH']])('maps the %s refusal (someone closed it first) to NO_PENDING', async (code) => {
    const { client } = fakeCashClient({ [PENDING_LIST]: { ok: page([EARLIER_DAY]) }, [EARLIER_CLOSE_PATH]: rule(code) });
    expect(await new CashPendingClosingApiWriter(client).closePending(KEY)).toEqual({ kind: 'refused', reason: 'NO_PENDING' });
  });

  it('a retry sends the same key to the same past date', async () => {
    const { client, calls } = fakeCashClient({ [PENDING_LIST]: { ok: page([EARLIER_DAY]) }, [EARLIER_CLOSE_PATH]: [{ fail: containerError(503, 'SERVICE_UNAVAILABLE') }, { ok: EARLIER_CLOSED }] });
    const writer = new CashPendingClosingApiWriter(client);
    await expect(writer.closePending(KEY)).rejects.toMatchObject({ status: 503 });
    await expect(writer.closePending(KEY)).resolves.toMatchObject({ kind: 'closed' });
    expect(keysSentTo(calls, EARLIER_CLOSE_PATH)).toEqual([KEY, KEY]);
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'PENDING_CLOSURE']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [PENDING_LIST]: { ok: page([EARLIER_DAY]) }, [EARLIER_CLOSE_PATH]: { fail: error } });
    await expect(new CashPendingClosingApiWriter(client).closePending(KEY)).rejects.toBe(error);
  });
});

describe('cashReopeningApiWriter', () => {
  it('reopens with POST on the date of the service, the Idempotency-Key and the exact body {reason}', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: CLOSED }, [REOPEN_PATH]: { ok: DAY } });
    expect(await new CashReopeningApiWriter(client).reopen('Se omitió un pago', KEY)).toEqual({ kind: 'reopened' });
    expect(calls[1]).toEqual({ path: REOPEN_PATH, init: { method: 'POST', headers: { 'Idempotency-Key': KEY }, body: { reason: 'Se omitió un pago' } } });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('a retry sends the same key and the replay answer counts as reopened', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: CLOSED }, [REOPEN_PATH]: [{ fail: containerError(503, 'SERVICE_UNAVAILABLE') }, { ok: DAY }] });
    const writer = new CashReopeningApiWriter(client);
    await expect(writer.reopen('Motivo', KEY)).rejects.toMatchObject({ status: 503 });
    await expect(writer.reopen('Motivo', KEY)).resolves.toEqual({ kind: 'reopened' });
    expect(keysSentTo(calls, REOPEN_PATH)).toEqual([KEY, KEY]);
  });

  it.each([[rule('ALREADY_OPEN'), 'NOT_CLOSED'], [rule('NOT_FOUND', 404), 'NOT_CLOSED'], [rule('REASON_REQUIRED', 400), 'REASON_REQUIRED']])('maps the refusal %j to the domain reason %s', async (reply, reason) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: CLOSED }, [REOPEN_PATH]: reply });
    expect(await new CashReopeningApiWriter(client).reopen('Motivo', KEY)).toEqual({ kind: 'refused', reason });
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'BUSINESS_RULE_VIOLATION'], [401, 'UNAUTHORIZED']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [CURRENT]: { ok: CLOSED }, [REOPEN_PATH]: { fail: error } });
    await expect(new CashReopeningApiWriter(client).reopen('Motivo', KEY)).rejects.toBe(error);
  });
});
