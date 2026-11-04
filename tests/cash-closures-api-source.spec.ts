import { describe, expect, it } from 'vitest';
import { CashClosure, CashClosuresSource } from '../src/app/cash/data/cash-closures-source';
import { CashClosuresApiSource } from '../src/app/http/cash-closures-api-source';
import { containerError, fakeCashClient, page } from './cash-api-client.double';

// HU-CSH-001 / HU-CSH-003, adapter of the port CashClosuresSource (plan D-03; contract listCashClosures + listCashMovements per date).
// The contract's closure carries no movements and no time zone: the adapter reads each date's movements and the zone of `cash-days/current`.
const BASE = '/api/v1/cash-reporting';
const CURRENT = `${BASE}/cash-days/current`;
const CLOSURES = (n = 1) => `${BASE}/cash-closures?page=${n}&limit=100`;
const MOVEMENTS = (date: string) => `${BASE}/cash-days/${date}/movements?page=1&limit=100`;
const ADMIN = { userId: 'u-1', roleLabel: 'Administrador del tenant', displayName: 'Fernanda Robayo' };
const ZONE = { businessDate: '2026-09-01', timeZone: 'America/Bogota', cashSessionId: 's-1', status: 'OPEN' };

const CLOSED = {
  businessDate: '2026-08-31', badge: 'CLOSED', baseCents: 30000000, incomeCents: 80000000, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0,
  totalCents: 110000000, entriesCashCents: 80000000, entriesTransferCents: 0, exitsCashCents: 0, exitsTransferCents: 0, expectedCashCents: 110000000,
  origin: 'OPERATIONAL_OPENING', hasOperationalOpening: true, closingMode: 'FORMAL', closedBy: ADMIN, closedAt: '2026-08-31T23:00:00Z', reopenings: [], corrections: [],
};
const REOPENED = {
  ...CLOSED, businessDate: '2026-08-29', badge: 'REOPENED', closedAt: '2026-08-29T23:30:00Z',
  reopenings: [{ reopenedBy: ADMIN, reopenedAt: '2026-08-29T15:00:00Z', reason: 'Faltó registrar un pago' }],
  corrections: [{ correctionId: 'c-1', businessDate: '2026-08-29', justification: 'Ajuste por error de digitación', registeredBy: { userId: 'u-2', roleLabel: 'Administrador del tenant' }, registeredAt: '2026-08-30T14:30:00Z' }],
};
const AUTOMATIC = {
  businessDate: '2026-08-30', badge: 'AUTOMATIC_CLOSING', baseCents: null, incomeCents: 20000000, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0,
  totalCents: 20000000, origin: 'AUTOMATIC_CREATION', hasOperationalOpening: false, closingMode: 'AUTOMATIC', closedBy: null, closedAt: '2026-08-31T04:59:00Z', reopenings: [], corrections: [],
};
const MOVEMENT = (id: string, change: object = {}) => ({
  cashMovementId: id, movementType: 'INCOME', paymentMedium: 'CASH', concept: 'Pago', amountCents: 80000000, afterClosing: false, registeredAt: '2026-08-31T15:00:00Z', registeredBy: ADMIN, ...change,
});
const ROUTES = {
  [CURRENT]: { ok: ZONE }, [CLOSURES()]: { ok: page([CLOSED, REOPENED, AUTOMATIC]) },
  [MOVEMENTS('2026-08-31')]: { ok: page([MOVEMENT('a1'), MOVEMENT('a2', { paymentMedium: 'TRANSFER', movementType: 'REFUND', amountCents: 5000, reservationId: 'res-9', afterClosing: true })]) },
  [MOVEMENTS('2026-08-29')]: { ok: page([]) },
  [MOVEMENTS('2026-08-30')]: { ok: page([MOVEMENT('b1', { paymentMedium: 'TRANSFER', amountCents: 20000000 })]) },
};
const PORTAL_ACTOR = 'Fernanda Robayo (Administrador del tenant)';

describe('cashClosuresApiSourceIsAPortOverTheContainerClient', () => {
  it('is a CashClosuresSource', () => {
    expect(new CashClosuresApiSource(fakeCashClient({}).client)).toBeInstanceOf(CashClosuresSource);
  });

  it('reads with GET only through the client, newest first as the service gives them: no tenant, no header, no body', async () => {
    const { client, calls, paths } = fakeCashClient(ROUTES);
    await new CashClosuresApiSource(client).list();
    expect(paths()).toEqual([CURRENT, CLOSURES(), MOVEMENTS('2026-08-31'), MOVEMENTS('2026-08-29'), MOVEMENTS('2026-08-30')]);
    expect(calls.every((call) => (call.init?.method ?? 'GET') === 'GET' && call.init?.body === undefined && call.init?.headers === undefined)).toBe(true);
    expect(paths().join(' ')).not.toMatch(/tenant/i);
  });

  it('maps a formal closure exactly: cents, mode, origin, badge, closer and local closing time, the movements of its date and the transfers apart', async () => {
    const { client } = fakeCashClient(ROUTES);
    const [closed] = await new CashClosuresApiSource(client).list();
    expect(closed).toEqual<CashClosure>({
      cashClosureId: '2026-08-31@2026-08-31T23:00:00Z', businessDate: '2026-08-31', closingMode: 'MANUAL', origin: 'OPERATIONAL_OPENING', reopened: false,
      openingBase: 30000000, income: 80000000, operationalPayments: 0, expenses: 0, refunds: 0, total: 110000000, expectedCash: 110000000,
      closedBy: PORTAL_ACTOR, closedAt: '2026-08-31T18:00:00', reopenings: [], corrections: [], nonCashMovements: 1,
      movements: [
        { cashMovementId: 'a1', movementType: 'INCOME', concept: 'Pago', amount: 80000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-08-31T10:00:00', registeredBy: PORTAL_ACTOR },
        { cashMovementId: 'a2', movementType: 'REFUND', concept: 'Pago', amount: -5000, paymentMedium: 'TRANSFER', afterClosing: true, registeredAt: '2026-08-31T10:00:00', registeredBy: PORTAL_ACTOR, reservationId: 'res-9' },
      ],
    });
  });

  it('maps the badge REOPENED to reopened, with its reopenings and its corrections (appliedAt/appliedBy) in local time', async () => {
    const { client } = fakeCashClient(ROUTES);
    const reopened = (await new CashClosuresApiSource(client).list())[1];
    expect(reopened.reopened).toBe(true);
    expect(reopened.reopenings).toEqual([{ reopenedAt: '2026-08-29T10:00:00', reopenedBy: PORTAL_ACTOR, reason: 'Faltó registrar un pago' }]);
    expect(reopened.corrections).toEqual([{ appliedAt: '2026-08-30T09:30:00', appliedBy: 'Administrador del tenant', justification: 'Ajuste por error de digitación' }]);
  });

  it('maps an automatic closing: AUTOMATIC mode, base 0, expected cash null, the closer "Cierre automático (Multitour)"', async () => {
    const { client } = fakeCashClient(ROUTES);
    const automatic = (await new CashClosuresApiSource(client).list())[2];
    expect(automatic).toMatchObject({
      closingMode: 'AUTOMATIC', origin: 'AUTOMATIC_CREATION', reopened: false, openingBase: 0, expectedCash: null,
      closedBy: 'Cierre automático (Multitour)', closedAt: '2026-08-30T23:59:00', nonCashMovements: 1,
    });
  });

  it('gives a closure of a reopened date its own identity, and reads the movements of a date once', async () => {
    const twice = { ...CLOSED, badge: 'REOPENED', closedAt: '2026-08-31T20:00:00Z' };
    const { client, paths } = fakeCashClient({ ...ROUTES, [CLOSURES()]: { ok: page([twice, CLOSED]) } });
    const closures = await new CashClosuresApiSource(client).list();
    expect(new Set(closures.map((c) => c.cashClosureId)).size).toBe(2);
    expect(paths().filter((p) => p === MOVEMENTS('2026-08-31')).length).toBe(1);
  });

  it('reads every page of the closures', async () => {
    const { client, paths } = fakeCashClient({
      ...ROUTES, [CLOSURES(1)]: { ok: page([CLOSED], { page: 1, totalPages: 2 }) }, [CLOSURES(2)]: { ok: page([REOPENED], { page: 2, totalPages: 2 }) },
    });
    expect((await new CashClosuresApiSource(client).list()).map((c) => c.businessDate)).toEqual(['2026-08-31', '2026-08-29']);
    expect(paths()).toContain(CLOSURES(2));
  });

  it('answers an empty list, with no movements read, when there is no closure yet', async () => {
    const { client, paths } = fakeCashClient({ [CURRENT]: { ok: ZONE }, [CLOSURES()]: { ok: page([]) } });
    expect(await new CashClosuresApiSource(client).list()).toEqual([]);
    expect(paths()).toEqual([CURRENT, CLOSURES()]);
  });
});

describe('cashClosuresApiSourceLetsTheContainerErrorReachThePage', () => {
  const closuresFailure = containerError(500, 'INTERNAL_ERROR');
  const movementsFailure = containerError(503, 'SERVICE_UNAVAILABLE');
  const zoneFailure = containerError(403, 'FORBIDDEN');
  it.each([
    ['the closures', closuresFailure, { [CURRENT]: { ok: ZONE }, [CLOSURES()]: { fail: closuresFailure } }],
    ['the movements of a date', movementsFailure, { ...ROUTES, [MOVEMENTS('2026-08-29')]: { fail: movementsFailure } }],
    ['the time zone', zoneFailure, { ...ROUTES, [CURRENT]: { fail: zoneFailure } }],
  ])('rejects with the container error, untouched, when %s fails', async (_what, failure, routes) => {
    const { client } = fakeCashClient(routes);
    await expect(new CashClosuresApiSource(client).list()).rejects.toBe(failure);
  });
});
