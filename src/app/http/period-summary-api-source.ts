import { PeriodSummary, PeriodSummarySource } from '../reports/data/period-summary-source';
import { PortalApiClient } from '../shell-contract';
import { periodSummaryPath, wholeNumbers } from './api-paths';

/** The body of `getMonthlyReportSummary` (contract `PeriodSummary`): amounts in cents. */
interface SummaryDto {
  readonly reportedPeriod: string;
  readonly confirmedSalesCents: number;
  readonly periodIncomeCents: number;
  readonly operationalCostsCents: number;
  readonly cancellations: number;
}

/**
 * PeriodSummarySource over the container client (HU-CSH-003 spec A1.9, plan D-08): one GET with no `period`, so the service answers the latest
 * period of the report. Only the names change; a body with a field missing is rejected and every rejection reaches the page as it came (AC-RM.10).
 */
export class PeriodSummaryApiSource extends PeriodSummarySource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async current(): Promise<PeriodSummary> {
    const body = await this.client.request<SummaryDto | null>(periodSummaryPath());
    if (typeof body !== 'object' || body === null || typeof body.reportedPeriod !== 'string'
      || !wholeNumbers(body, ['confirmedSalesCents', 'periodIncomeCents', 'operationalCostsCents', 'cancellations'])) {
      throw new Error('monthly-reports/summary: the body is incomplete');
    }
    return {
      reportedPeriod: body.reportedPeriod, confirmedSales: body.confirmedSalesCents, periodIncome: body.periodIncomeCents,
      registeredOperationalCosts: body.operationalCostsCents, registeredCancellations: body.cancellations,
    };
  }
}
