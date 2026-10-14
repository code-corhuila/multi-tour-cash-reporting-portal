import { Provider } from '@angular/core';
import { DailyDashboard, DailyDashboardSource } from '../reports/data/daily-dashboard-source';
import { demoFixture } from './demo-fixtures';

/** The demo day of 001- (03 sep 2026): the static numbers of screen 9, with 3 invented for Confirmadas con saldo (spec section 6). */
const SEED: DailyDashboard = {
  reportDate: '2026-09-03', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18,
  confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4,
};
const EMPTY_DAY: DailyDashboard = { ...SEED, createdReservations: 0, pendingPaymentReservations: 0, confirmedReservations: 0, confirmedWithBalance: 0, cancelledReservations: 0, upcomingServices: 0 };

/** DEMO (spec 002- DD-1): the projection is seeded, consistent, and counted by nobody here. */
export class DemoDailyDashboardSource extends DailyDashboardSource {
  override today(): Promise<DailyDashboard> {
    if (demoFixture('failing-dashboard')) { return Promise.reject(new Error('failing-dashboard')); }
    return Promise.resolve(demoFixture('empty-day') ? EMPTY_DAY : SEED);
  }
}

export function reportsDemoProviders(): Provider[] {
  return [{ provide: DailyDashboardSource, useValue: new DemoDailyDashboardSource() }];
}
