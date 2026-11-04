import { CashDay, CashDaySource } from '../cash/data/cash-day-source';
import { PortalApiClient } from '../shell-contract';
import { cashDayPath, cashMovementsPath, currentCashDayPath, listAll, pageOf, pendingCashDaysPath } from './api-paths';
import { CashDayDto, CashMovementDto, toDay } from './cash-api-mappers';

/**
 * CashDaySource over the container client (HU-CSH-001 plan D-02/D-03): today's cash, its movements and the previous day opened and never
 * closed, which the contract keeps in three reads. The service decides "today" and the tenant; nothing is added up here (RN-CJ1).
 * TODO(contract): `parametrizedBase` has no field yet, so the opening writer must not rely on it.
 */
export class CashDayApiSource extends CashDaySource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async today(): Promise<CashDay> {
    const day = await this.client.request<CashDayDto>(currentCashDayPath());
    const [movements, pending] = await Promise.all([this.movementsOf(day), this.pendingBefore(day)]);
    return toDay(day, movements, pending);
  }

  /** The cash of a calendar date (getCashDay), same shape as today; the pending day belongs to today only. */
  async on(businessDate: string): Promise<CashDay> {
    const day = await this.client.request<CashDayDto>(cashDayPath(businessDate));
    return toDay(day, await this.movementsOf(day));
  }

  private movementsOf(day: CashDayDto): Promise<readonly CashMovementDto[]> {
    return day.cashSessionId === null ? Promise.resolve([]) : listAll<CashMovementDto>(this.client, cashMovementsPath(day.businessDate));
  }

  private async pendingBefore(day: CashDayDto): Promise<CashDayDto | undefined> {
    const { data } = await pageOf<CashDayDto>(this.client, pendingCashDaysPath(), 1, 1);
    return data.find((pending) => pending.businessDate !== day.businessDate);
  }
}
