import { describe, expect, it } from 'vitest';
import { CashCorrectionWriter } from '../src/app/cash/data/cash-correction-writer';
import { CashCorrectionApiWriter } from '../src/app/http/cash-correction-api';
import { sourceProviders } from '../src/app/sources';
import { containerError, fakeCashClient } from './cash-api-client.double';

// HU-CSH-001, TD-12: adapter of CashCorrectionWriter (contract registerCashCorrection, AC-CJ.5). The history knows a closure by
// "date@closedAt"; the service takes the correction on the DATE of that closure. Every request goes through props.apiClient and the
// portal sends no tenant.
const BASE = '/api/v1/cash-reporting';
const DATE = '2026-09-01';
const PATH = `${BASE}/cash-days/${DATE}/corrections`;
const CLOSURE = `${DATE}@2026-09-01T23:00:00Z`;
const KEY = 'key-00000001';
const NOTE = 'Se corrige la descripción de un gasto';
const CREATED = { correctionId: 'c-1', businessDate: DATE, justification: NOTE, registeredBy: { userId: 'u-1', roleLabel: 'Administrador del tenant' }, registeredAt: '2026-09-02T10:00:00Z' };
const rule = (status: number, code: string) => ({ fail: containerError(status, code) });

describe('cashCorrectionApiWriter', () => {
  it('registers with POST on the date of the closure, the Idempotency-Key and the justification, and nothing else', async () => {
    const { client, calls } = fakeCashClient({ [PATH]: { ok: CREATED } });

    expect(await new CashCorrectionApiWriter(client).register(CLOSURE, NOTE, KEY)).toEqual({ kind: 'registered' });

    expect(calls).toEqual([{ path: PATH, init: { method: 'POST', headers: { 'Idempotency-Key': KEY }, body: { justification: NOTE } } }]);
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('a retry sends the same key and the replay answer counts as registered', async () => {
    const { client, calls } = fakeCashClient({ [PATH]: [rule(503, 'SERVICE_UNAVAILABLE'), { ok: CREATED }] });
    const writer = new CashCorrectionApiWriter(client);

    await expect(writer.register(CLOSURE, NOTE, KEY)).rejects.toMatchObject({ status: 503 });
    expect(await writer.register(CLOSURE, NOTE, KEY)).toEqual({ kind: 'registered' });

    expect(calls.map((call) => call.init?.headers?.['Idempotency-Key'])).toEqual([KEY, KEY]);
  });

  it.each([
    ['an automatic closure (422 BUSINESS_RULE_VIOLATION)', rule(422, 'BUSINESS_RULE_VIOLATION'), 'AUTOMATIC_CLOSURE'],
    ['a date without cash (404 NOT_FOUND)', rule(404, 'NOT_FOUND'), 'NOT_FOUND'],
    ['a day that is not closed any more (422 INVALID_STATUS_TRANSITION)', rule(422, 'INVALID_STATUS_TRANSITION'), 'NOT_FOUND'],
  ])('turns the refusal of %s into a domain result', async (_what, failure, reason) => {
    const { client } = fakeCashClient({ [PATH]: failure });
    expect(await new CashCorrectionApiWriter(client).register(CLOSURE, NOTE, KEY)).toEqual({ kind: 'refused', reason });
  });

  it('rethrows what the portal does not know (403, a blank justification, the network) untouched', async () => {
    for (const failure of [rule(403, 'FORBIDDEN'), rule(400, 'REASON_REQUIRED'), rule(503, 'SERVICE_UNAVAILABLE')]) {
      const { client } = fakeCashClient({ [PATH]: failure });
      await expect(new CashCorrectionApiWriter(client).register(CLOSURE, NOTE, KEY)).rejects.toBe(failure.fail);
    }
  });

  it('the production module registers it for the port', () => {
    const { client } = fakeCashClient({});
    const provider = sourceProviders(client).find((entry) => (entry as { provide?: unknown }).provide === CashCorrectionWriter) as { useValue?: unknown } | undefined;
    expect(provider?.useValue).toBeInstanceOf(CashCorrectionApiWriter);
  });
});
