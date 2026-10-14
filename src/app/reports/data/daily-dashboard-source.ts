import type { PortalTarget } from '../../shared/portal-slots';
/** The projection of the day (`daily_dashboard_projections`, 06-data): field names of the table, counts resolved by the service (RN-DB2). */
export interface DailyDashboard {
  /** The day the numbers are of, `2026-09-03`. */
  readonly reportDate: string;
  readonly createdReservations: number;
  /** Only what has not met the economic condition (RF-011). */
  readonly pendingPaymentReservations: number;
  /** Includes the confirmed with balance. */
  readonly confirmedReservations: number;
  readonly confirmedWithBalance: number;
  /** What the service counts is DP-DB3. */
  readonly cancelledReservations: number;
  /** Which window is DP-DB4. */
  readonly upcomingServices: number;
}

/** Plan D-02: read only and with no argument; the session decides the tenant (AC-DB.5, Article VIII). A day without reservations is six zeros. */
export abstract class DailyDashboardSource {
  abstract today(): Promise<DailyDashboard>;
}

/** Reservas (screen 10) belongs to the commercial portal: the container is asked to open it (DP-DB6). */
export const RESERVATIONS_TARGET: PortalTarget = Object.freeze({ portal: 'commercial-reservation-portal', area: 'reservations' });
