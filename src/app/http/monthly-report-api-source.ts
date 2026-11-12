import { MonthlyReportSource } from '../cash/data/monthly-report-source';
import { MonthlyPeriod } from '../shared/monthly-period';
import { PortalApiClient } from '../shell-contract';
import { listAll, monthlyConsolidationsPath, wholeNumbers } from './api-paths';

/** A period of `listMonthlyConsolidations` (contract `MonthlyConsolidationPeriod`): amounts in cents. */
interface PeriodDto {
  readonly reportedPeriod: string;
  readonly periodIncomeCents: number;
  readonly operationalPaymentsCents: number;
  readonly operationalExpensesCents: number;
  readonly executedRefundsCents: number;
  readonly consolidatedCashTotalCents: number;
  readonly registeredCancellations: number;
  readonly registeredOperationalCostsCents: number;
  readonly individualMovementsCounted: number;
  readonly cashIncomeCents: number;
  readonly transferIncomeCents: number;
}

/**
 * MonthlyReportSource over the container client (HU-CSH-003 spec A1.9, plan D-08): every page of the consolidation, 100 at a time, which both
 * screens read so they never list different periods. Only the names change; amounts stay in cents and nothing is added up here (RN-RM1).
 * A period with a missing or non-numeric field is rejected, and every rejection of the client reaches the page as it came (AC-RM.10).
 */
export class MonthlyReportApiSource extends MonthlyReportSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async periods(): Promise<readonly MonthlyPeriod[]> {
    const periods = await listAll<PeriodDto>(this.client, monthlyConsolidationsPath());
    return periods.map((p) => {
      if (typeof p?.reportedPeriod !== 'string' || !wholeNumbers(p, [
        'periodIncomeCents', 'operationalPaymentsCents', 'operationalExpensesCents', 'executedRefundsCents', 'consolidatedCashTotalCents',
        'registeredCancellations', 'registeredOperationalCostsCents', 'individualMovementsCounted', 'cashIncomeCents', 'transferIncomeCents',
      ])) { throw new Error('monthly-consolidations: a period is incomplete'); }
      return {
        reportedPeriod: p.reportedPeriod, periodIncome: p.periodIncomeCents, operationalPayments: p.operationalPaymentsCents,
        operationalExpenses: p.operationalExpensesCents, executedRefunds: p.executedRefundsCents, consolidatedCashTotal: p.consolidatedCashTotalCents,
        registeredCancellations: p.registeredCancellations, registeredOperationalCosts: p.registeredOperationalCostsCents,
        countedMovements: p.individualMovementsCounted, incomeInCash: p.cashIncomeCents, incomeByTransfer: p.transferIncomeCents,
      };
    });
  }
}
