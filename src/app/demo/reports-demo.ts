import { Provider } from '@angular/core';
import { DailyDashboard, DailyDashboardSource } from '../reports/data/daily-dashboard-source';
import { demoFixture } from './demo-fixtures';

/** The demo day of 001- (01 sep 2026, the mockup clock): the figures the mockup draws on admin-reportes.html. */
const SEED: DailyDashboard = {
  reportDate: '2026-09-01', createdReservations: 0, pendingPaymentReservations: 3, confirmedReservations: 3,
  confirmedWithBalance: 1, cancelledReservations: 0, upcomingServices: 4,
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
