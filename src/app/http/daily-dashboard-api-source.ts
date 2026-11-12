import { DailyDashboard, DailyDashboardSource } from '../reports/data/daily-dashboard-source';
import { PortalApiClient } from '../shell-contract';
import { dailyDashboardPath } from './api-paths';

/** The seven fields of the contract schema `DailyDashboard`; the six counts are integers of zero or more. */
const COUNTS = ['createdReservations', 'pendingPaymentReservations', 'confirmedReservations', 'confirmedWithBalance', 'cancelledReservations', 'upcomingServices'] as const;

/**
 * DailyDashboardSource over the container client (HU-CSH-002 spec A1.9, plan D-07): one GET with no body, no query and no tenant; the service
 * decides the day and the tenant (AC-DB.5, AC-DB.11). Nothing is converted or counted here: the schema has no amount. A body that lacks a field
 * is rejected so "undefined" is never drawn, and every rejection of the client reaches the page as it came (AC-DB.10): a failure is never
 * turned into an empty day.
 */
export class DailyDashboardApiSource extends DailyDashboardSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async today(): Promise<DailyDashboard> {
    const body = await this.client.request<Record<string, unknown> | null>(dailyDashboardPath());
    if (typeof body !== 'object' || body === null || typeof body['reportDate'] !== 'string') { throw new Error('daily-dashboard: no reportDate'); }
    const counts = COUNTS.map((field) => body[field]);
    if (!counts.every((count) => Number.isInteger(count) && (count as number) >= 0)) { throw new Error('daily-dashboard: a count is missing or not a whole number'); }
    return {
      reportDate: body['reportDate'], createdReservations: counts[0] as number, pendingPaymentReservations: counts[1] as number, confirmedReservations: counts[2] as number,
      confirmedWithBalance: counts[3] as number, cancelledReservations: counts[4] as number, upcomingServices: counts[5] as number,
    };
  }
}
