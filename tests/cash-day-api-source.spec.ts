import { describe, expect, it } from 'vitest';
import { CashDay, CashDaySource } from '../src/app/cash/data/cash-day-source';
import { CashDayApiSource } from '../src/app/http/cash-day-api-source';
import { containerError, fakeCashClient, page } from './cash-api-client.double';

// HU-CSH-001, adapter of the port CashDaySource (spec 001-, plan D-02/D-03; contract getCurrentCashDay, getCashDay, listCashMovements, listCashDays).
// Every request goes through props.apiClient: no tenant, no header, no body. Amounts are cents; the contract gives UTC, the portal the tenant's local time.
const BASE = '/api/v1/cash-reporting';
const CURRENT = `${BASE}/cash-days/current`;
const MOVEMENTS = (date: string, n = 1) => `${BASE}/cash-days/${date}/movements?page=${n}&limit=100`;
const PENDING = `${BASE}/cash-days?pendingClosure=true&page=1&limit=1`;
const ADMIN = { userId: 'u-1', roleLabel: 'Administrador del tenant', displayName: 'Fernanda Robayo' };

const OPEN = {
  businessDate: '2026-09-01', timeZone: 'America/Bogota', cashSessionId: 's-1', status: 'OPEN', origin: 'OPERATIONAL_OPENING',
  hasOperationalOpening: true, pendingClosure: false, openingBaseCents: 30000000, openedAt: '2026-09-01T13:05:00Z', openedBy: ADMIN,
  incomeCents: 129000000, operationalPaymentsCents: 0, expensesCents: 25000000, refundsCents: 15000000, totalCents: 119000000,
  expectedCashCents: 5000000, netTransfersCents: 114000000, closedAt: null, closedBy: null, closingMode: null,
};
const NO_OPENING = {
  businessDate: '2026-09-02', timeZone: 'America/Bogota', cashSessionId: null, status: 'NO_OPENING', origin: null, hasOperationalOpening: false,
  pendingClosure: false, openingBaseCents: null, parametrizedBaseCents: 30000000, incomeCents: 0, operationalPaymentsCents: 0, expensesCents: 0, refundsCents: 0, totalCents: 0,
  expectedCashCents: null, netTransfersCents: 0,
};
const WIRE_MOVEMENTS = [
  { cashMovementId: 'm1', businessDate: '2026-09-01', movementType: 'INCOME', paymentMedium: 'TRANSFER', concept: 'Pago reserva #RES-1901', amountCents: 129000000, afterClosing: false, reservationId: null, registeredAt: '2026-09-01T14:20:00Z', registeredBy: ADMIN },
  { cashMovementId: 'm2', businessDate: '2026-09-01', movementType: 'OPERATIONAL_EXPENSE', paymentMedium: 'CASH', concept: 'Compra operativa', amountCents: 25000000, afterClosing: false, registeredAt: '2026-09-01T16:45:00Z', registeredBy: ADMIN },
  { cashMovementId: 'm3', businessDate: '2026-09-01', movementType: 'REFUND', paymentMedium: 'TRANSFER', concept: 'Devolución reserva #RES-1902', amountCents: 15000000, afterClosing: true, reservationId: 'res-1902', registeredAt: '2026-09-01T19:10:00Z', registeredBy: { userId: 'u-2', roleLabel: 'Colaborador operativo' } },
  { cashMovementId: 'm4', businessDate: '2026-09-01', movementType: 'OPERATIONAL_PAYMENT', paymentMedium: 'CASH', concept: 'Pago a guía', amountCents: 1000000, afterClosing: false, registeredAt: '2026-09-02T04:30:00Z', registeredBy: ADMIN },
];
const PORTAL_MOVEMENTS = [
  { cashMovementId: 'm1', movementType: 'INCOME', concept: 'Pago reserva #RES-1901', amount: 129000000, paymentMedium: 'TRANSFER', afterClosing: false, registeredAt: '2026-09-01T09:20:00', registeredBy: 'Fernanda Robayo (Administrador del tenant)' },
  { cashMovementId: 'm2', movementType: 'EXPENSE', concept: 'Compra operativa', amount: -25000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-09-01T11:45:00', registeredBy: 'Fernanda Robayo (Administrador del tenant)' },
  { cashMovementId: 'm3', movementType: 'REFUND', concept: 'Devolución reserva #RES-1902', amount: -15000000, paymentMedium: 'TRANSFER', afterClosing: true, registeredAt: '2026-09-01T14:10:00', registeredBy: 'Colaborador operativo', reservationId: 'res-1902' },
  { cashMovementId: 'm4', movementType: 'OPERATIONAL_PAYMENT', concept: 'Pago a guía', amount: -1000000, paymentMedium: 'CASH', afterClosing: false, registeredAt: '2026-09-01T23:30:00', registeredBy: 'Fernanda Robayo (Administrador del tenant)' },
];
const PORTAL_DAY: CashDay = {
  businessDate: '2026-09-01', status: 'OPEN_OPERATIVE', origin: 'OPERATIONAL_OPENING', openingBase: 30000000, openedBy: 'Fernanda Robayo (Administrador del tenant)',
  movements: PORTAL_MOVEMENTS as never,
  metrics: { income: 129000000, operationalPayments: 0, expenses: 25000000, refunds: 15000000, total: 119000000, expectedCash: 5000000, netTransfers: 114000000 },
};
const NO_PENDING = { ok: page([]) };

describe('cashDayApiSourceIsAPortOverTheContainerClient', () => {
  it('is a CashDaySource', () => {
    expect(new CashDayApiSource(fakeCashClient({}).client)).toBeInstanceOf(CashDaySource);
  });

  it('reads today with GET only, through the client: no tenant, no header, no body, in the paths or beside them', async () => {
    const { client, calls, paths } = fakeCashClient({ [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page(WIRE_MOVEMENTS) }, [PENDING]: NO_PENDING });
    await new CashDayApiSource(client).today();
    expect(paths()).toEqual([CURRENT, MOVEMENTS('2026-09-01'), PENDING]);
    expect(calls.every((call) => (call.init?.method ?? 'GET') === 'GET' && call.init?.body === undefined && call.init?.headers === undefined)).toBe(true);
    expect(paths().join(' ')).not.toMatch(/tenant/i);
  });

  it('maps the open day exactly: cents kept, outflows signed, UTC to the tenant local time, the actor as "name (role)", reservationId on the refund', async () => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page(WIRE_MOVEMENTS) }, [PENDING]: NO_PENDING });
    expect(await new CashDayApiSource(client).today()).toEqual(PORTAL_DAY);
  });

  it('maps the previous day opened and never closed to pendingClosure', async () => {
    const pending = { ...OPEN, businessDate: '2026-08-31', pendingClosure: true, openingBaseCents: 20000000, openedBy: { userId: 'u-3', roleLabel: 'Colaborador operativo' } };
    const { client } = fakeCashClient({ [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page([]) }, [PENDING]: { ok: page([pending]) } });
    const day = await new CashDayApiSource(client).today();
    expect(day.pendingClosure).toEqual({ businessDate: '2026-08-31', openedBy: 'Colaborador operativo', openingBase: 20000000 });
  });

  it('maps a day without cash to NO_OPENING with base 0, no opener and "No aplica" (null) expected cash; it asks for no movements', async () => {
    const { client, paths } = fakeCashClient({ [CURRENT]: { ok: NO_OPENING }, [PENDING]: NO_PENDING });
    expect(await new CashDayApiSource(client).today()).toEqual({
      businessDate: '2026-09-02', status: 'NO_OPENING', origin: null, openingBase: 0, openedBy: null, parametrizedBase: 30000000, movements: [],
      metrics: { income: 0, operationalPayments: 0, expenses: 0, refunds: 0, total: 0, expectedCash: null, netTransfers: 0 },
    });
    expect(paths()).toEqual([CURRENT, PENDING]);
  });

  it.each([
    ['CLOSED', { status: 'CLOSED', closedAt: '2026-09-01T23:00:00Z', closingMode: 'FORMAL' }, 'CLOSED'],
    ['OPEN with an automatic origin and no operational opening', { origin: 'AUTOMATIC_CREATION', hasOperationalOpening: false, openingBaseCents: null, expectedCashCents: null }, 'OPEN_AUTOMATIC'],
    ['OPEN with an automatic origin that later had its operational opening', { origin: 'AUTOMATIC_CREATION', hasOperationalOpening: true }, 'OPEN_OPERATIVE'],
  ])('derives the portal status from %s', async (_name, change, expected) => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: { ...OPEN, ...change } }, [MOVEMENTS('2026-09-01')]: { ok: page([]) }, [PENDING]: NO_PENDING });
    expect((await new CashDayApiSource(client).today()).status).toBe(expected);
  });

  it('carries no parametrized base for a day that already has its operational opening', async () => {
    const { client } = fakeCashClient({ [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page([]) }, [PENDING]: NO_PENDING });
    expect('parametrizedBase' in (await new CashDayApiSource(client).today())).toBe(false);
  });

  it('reads every page of the movements of the day, in the order the service gives them', async () => {
    const { client, paths } = fakeCashClient({
      [CURRENT]: { ok: OPEN }, [PENDING]: NO_PENDING,
      [MOVEMENTS('2026-09-01', 1)]: { ok: page(WIRE_MOVEMENTS.slice(0, 2), { page: 1, totalPages: 2 }) },
      [MOVEMENTS('2026-09-01', 2)]: { ok: page(WIRE_MOVEMENTS.slice(2), { page: 2, totalPages: 2 }) },
    });
    const day = await new CashDayApiSource(client).today();
    expect(day.movements.map((m) => m.cashMovementId)).toEqual(['m1', 'm2', 'm3', 'm4']);
    expect(paths()).toContain(MOVEMENTS('2026-09-01', 2));
  });

  it('reads the cash of a calendar date with GET cash-days/{businessDate} and its movements, and asks for no pending day', async () => {
    const { client, paths } = fakeCashClient({ [`${BASE}/cash-days/2026-09-01`]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page(WIRE_MOVEMENTS) } });
    expect(await new CashDayApiSource(client).on('2026-09-01')).toEqual(PORTAL_DAY);
    expect(paths()).toEqual([`${BASE}/cash-days/2026-09-01`, MOVEMENTS('2026-09-01')]);
  });
});

describe('cashDayApiSourceLetsTheContainerErrorReachThePage', () => {
  const dayFailure = containerError(503, 'SERVICE_UNAVAILABLE');
  const movementsFailure = containerError(500, 'INTERNAL_ERROR');
  const pendingFailure = containerError(403, 'FORBIDDEN');
  it.each([
    ['the day', dayFailure, { [CURRENT]: { fail: dayFailure } }],
    ['the movements', movementsFailure, { [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { fail: movementsFailure }, [PENDING]: NO_PENDING }],
    ['the pending day', pendingFailure, { [CURRENT]: { ok: OPEN }, [MOVEMENTS('2026-09-01')]: { ok: page([]) }, [PENDING]: { fail: pendingFailure } }],
  ])('rejects with the container error, untouched, when %s fails', async (_what, failure, routes) => {
    const { client } = fakeCashClient(routes);
    await expect(new CashDayApiSource(client).today()).rejects.toBe(failure);
  });
});
