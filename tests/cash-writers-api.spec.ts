import { Injector } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { CashBaseWriter } from '../src/app/cash/data/cash-base-writer';
import { CashMovementWriter, NewCashMovement } from '../src/app/cash/data/cash-movement-writer';
import { CashOpeningWriter } from '../src/app/cash/data/cash-opening-writer';
import { CashBaseApiWriter, CashMovementApiWriter, CashOpeningApiWriter } from '../src/app/http/cash-writers-api';
import { PortalCapabilities } from '../src/app/shared/portal-capabilities';
import { sourceProviders } from '../src/app/sources';
import { containerError, fakeCashClient } from './cash-api-client.double';

// HU-CSH-001, branch 2: adapters of CashOpeningWriter, CashBaseWriter and CashMovementWriter (contract openCashDay, adjustCashBase, registerCashMovement).
// Every request goes through props.apiClient. The date of the path is the tenant's today, read from getCurrentCashDay; the portal sends no tenant.
const BASE = '/api/v1/cash-reporting';
const CURRENT = `${BASE}/cash-days/current`;
const DATE = '2026-09-01';
const OPEN_PATH = `${BASE}/cash-days/${DATE}/open`;
const ADJUST_PATH = `${BASE}/cash-days/${DATE}/adjust-base`;
const MOVEMENTS_PATH = `${BASE}/cash-days/${DATE}/movements`;
const ADMIN = { userId: 'u-1', roleLabel: 'Administrador del tenant' };
const DAY = {
  businessDate: DATE, timeZone: 'America/Bogota', cashSessionId: 's-1', status: 'OPEN', origin: 'OPERATIONAL_OPENING', hasOperationalOpening: true, pendingClosure: false,
  openingBaseCents: 30000000, openedBy: ADMIN, incomeCents: 0, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0, totalCents: 30000000, expectedCashCents: 30000000, netTransfersCents: 0,
};
const NO_CASH = { ...DAY, cashSessionId: null, status: 'NO_OPENING', origin: null, hasOperationalOpening: false, openingBaseCents: null, totalCents: 0, expectedCashCents: null };
const WIRE_MOVEMENT = {
  cashMovementId: 'm-1', businessDate: DATE, movementType: 'OPERATIONAL_EXPENSE', paymentMedium: 'CASH', concept: 'Compra operativa', amountCents: 25000000,
  afterClosing: false, registeredAt: '2026-09-01T16:45:00Z', registeredBy: ADMIN,
};
const rule = (code: string) => ({ fail: containerError(422, code) });
const KEY = 'key-00000001';
type Sent = { path: string; init?: { method?: string; headers?: Record<string, string>; body?: unknown } };
const keysSentTo = (calls: Sent[], path: string) => calls.filter((call) => call.path === path).map((call) => call.init?.headers?.['Idempotency-Key']);

describe('cashOpeningApiWriter', () => {
  it('opens with POST on the date of the service, the Idempotency-Key and the exact body; the Administrador sends the base', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [OPEN_PATH]: { ok: { ...DAY, openingBaseCents: 35000000 } } });
    const result = await new CashOpeningApiWriter(client, () => true).open(35000000, KEY);
    expect(result).toEqual({ kind: 'opened', baseCents: 35000000 });
    expect(calls[0]).toEqual({ path: CURRENT, init: undefined });
    expect(calls[1]).toEqual({ path: OPEN_PATH, init: { method: 'POST', headers: { 'Idempotency-Key': KEY }, body: { openingBaseCents: 35000000 } } });
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it('a Colaborador sends no body, so the service uses the parametrized base, and the portal shows the base the service opened with', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: NO_CASH }, [OPEN_PATH]: { ok: DAY } });
    const result = await new CashOpeningApiWriter(client, () => false).open(99999, KEY);
    expect(result).toEqual({ kind: 'opened', baseCents: 30000000 });
    expect(calls[1].init).toEqual({ method: 'POST', headers: { 'Idempotency-Key': KEY } });
  });

  it('a retry sends the same key and the replay answer counts as opened', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [OPEN_PATH]: [{ fail: containerError(503, 'SERVICE_UNAVAILABLE') }, { ok: DAY }] });
    const writer = new CashOpeningApiWriter(client, () => true);
    await expect(writer.open(30000000, KEY)).rejects.toMatchObject({ status: 503 });
    await expect(writer.open(30000000, KEY)).resolves.toEqual({ kind: 'opened', baseCents: 30000000 });
    expect(keysSentTo(calls, OPEN_PATH)).toEqual([KEY, KEY]);
  });

  it.each([['ALREADY_OPEN', 'ALREADY_OPEN'], ['ALREADY_CLOSED', 'DAY_CLOSED']])('maps the %s refusal to the domain reason %s', async (code, reason) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [OPEN_PATH]: rule(code) });
    expect(await new CashOpeningApiWriter(client, () => true).open(1, KEY)).toEqual({ kind: 'refused', reason });
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'BUSINESS_RULE_VIOLATION'], [401, 'UNAUTHORIZED']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [OPEN_PATH]: { fail: error } });
    await expect(new CashOpeningApiWriter(client, () => true).open(1, KEY)).rejects.toBe(error);
  });
});

describe('cashBaseApiWriter', () => {
  it('adjusts with POST and the exact body; the contract takes no Idempotency-Key here because the same value changes nothing', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [ADJUST_PATH]: { ok: { ...DAY, openingBaseCents: 35000000 } } });
    expect(await new CashBaseApiWriter(client).adjust(35000000, KEY)).toEqual({ kind: 'adjusted' });
    expect(calls[1]).toEqual({ path: ADJUST_PATH, init: { method: 'POST', body: { openingBaseCents: 35000000 } } });
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it.each([['ALREADY_CLOSED', 'DAY_CLOSED'], ['NO_OPEN_CASH', 'NOT_OPERATIVE']])('maps the %s refusal to the domain reason %s', async (code, reason) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [ADJUST_PATH]: rule(code) });
    expect(await new CashBaseApiWriter(client).adjust(1, KEY)).toEqual({ kind: 'refused', reason });
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'PENDING_CLOSURE']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [ADJUST_PATH]: { fail: error } });
    await expect(new CashBaseApiWriter(client).adjust(1, KEY)).rejects.toBe(error);
  });
});

describe('cashMovementApiWriter', () => {
  const EXPENSE: NewCashMovement = { movementType: 'EXPENSE', concept: 'Compra operativa', amountCents: 25000000, paymentMedium: 'CASH' };

  it('registers with POST, the key and the exact body: the portal EXPENSE is OPERATIONAL_EXPENSE and the amount is the positive cents', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [MOVEMENTS_PATH]: { ok: WIRE_MOVEMENT } });
    expect(await new CashMovementApiWriter(client).register(EXPENSE, KEY)).toEqual({ kind: 'registered', placement: 'IN_DAY' });
    expect(calls[1]).toEqual({
      path: MOVEMENTS_PATH,
      init: { method: 'POST', headers: { 'Idempotency-Key': KEY }, body: { movementType: 'OPERATIONAL_EXPENSE', paymentMedium: 'CASH', concept: 'Compra operativa', amountCents: 25000000 } },
    });
    expect(JSON.stringify(calls).toLowerCase()).not.toContain('tenant');
  });

  it.each(['INCOME', 'OPERATIONAL_PAYMENT'] as const)('sends %s as it is', async (movementType) => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [MOVEMENTS_PATH]: { ok: { ...WIRE_MOVEMENT, movementType } } });
    await new CashMovementApiWriter(client).register({ ...EXPENSE, movementType }, KEY);
    expect((calls[1].init?.body as { movementType: string }).movementType).toBe(movementType);
  });

  it('places a movement stored after the closing as AFTER_CLOSING', async () => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: { ...DAY, status: 'CLOSED' } }, [MOVEMENTS_PATH]: { ok: { ...WIRE_MOVEMENT, paymentMedium: 'TRANSFER', afterClosing: true } } });
    expect(await new CashMovementApiWriter(client).register({ ...EXPENSE, paymentMedium: 'TRANSFER' }, KEY)).toEqual({ kind: 'registered', placement: 'AFTER_CLOSING' });
  });

  it('places a transfer that found the day with no cash as DAY_CREATED', async () => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: NO_CASH }, [MOVEMENTS_PATH]: { ok: { ...WIRE_MOVEMENT, paymentMedium: 'TRANSFER' } } });
    expect(await new CashMovementApiWriter(client).register({ ...EXPENSE, paymentMedium: 'TRANSFER' }, KEY)).toEqual({ kind: 'registered', placement: 'DAY_CREATED' });
  });

  it('a retry sends the same key and the 200 replay counts as registered', async () => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [MOVEMENTS_PATH]: [{ fail: containerError(503, 'SERVICE_UNAVAILABLE') }, { ok: WIRE_MOVEMENT }] });
    const writer = new CashMovementApiWriter(client);
    await expect(writer.register(EXPENSE, KEY)).rejects.toMatchObject({ status: 503 });
    await expect(writer.register(EXPENSE, KEY)).resolves.toEqual({ kind: 'registered', placement: 'IN_DAY' });
    expect(keysSentTo(calls, MOVEMENTS_PATH)).toEqual([KEY, KEY]);
  });

  it.each([['NO_OPEN_CASH', 'CASH_NEEDS_OPENING'], ['ALREADY_CLOSED', 'DAY_CLOSED']])('maps the %s refusal to the domain reason %s', async (code, reason) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [MOVEMENTS_PATH]: rule(code) });
    expect(await new CashMovementApiWriter(client).register(EXPENSE, KEY)).toEqual({ kind: 'refused', reason });
  });

  it.each([[403, 'FORBIDDEN'], [400, 'VALIDATION_ERROR'], [422, 'PENDING_CLOSURE']])('lets the error %s %s reach the screen as the container gave it', async (status, code) => {
    const error = containerError(status, code);
    const { client } = fakeCashClient({ [CURRENT]: { ok: DAY }, [MOVEMENTS_PATH]: { fail: error } });
    await expect(new CashMovementApiWriter(client).register(EXPENSE, KEY)).rejects.toBe(error);
  });
});

describe('productionWritersAreRegisteredOverTheContainerClient', () => {
  const resolve = (canChangeBase: boolean) => {
    const { client, calls } = fakeCashClient({ [CURRENT]: { ok: DAY }, [OPEN_PATH]: { ok: DAY } });
    const providers = [...sourceProviders(client), { provide: PortalCapabilities, useValue: { canChangeBase: () => canChangeBase } }];
    return { injector: Injector.create({ providers }), calls };
  };

  it('registers the three writers, each one an adapter', () => {
    const { injector } = resolve(true);
    expect(injector.get(CashOpeningWriter)).toBeInstanceOf(CashOpeningApiWriter);
    expect(injector.get(CashBaseWriter)).toBeInstanceOf(CashBaseApiWriter);
    expect(injector.get(CashMovementWriter)).toBeInstanceOf(CashMovementApiWriter);
  });

  it.each([[true, { openingBaseCents: 1 }], [false, undefined]])('the opening sends the base only to who may change it (changeBase %s)', async (canChangeBase, body) => {
    const { injector, calls } = resolve(canChangeBase);
    await injector.get(CashOpeningWriter).open(1, KEY);
    expect(calls[1].init?.body).toEqual(body);
  });
});
