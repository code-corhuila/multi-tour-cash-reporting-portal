import { CashClosure, CashClosuresSource } from '../cash/data/cash-closures-source';
import { PortalApiClient } from '../shell-contract';
import { cashClosuresPath, cashMovementsPath, currentCashDayPath, listAll } from './api-paths';
import { CashClosureDto, CashDayDto, CashMovementDto, toClosure } from './cash-api-mappers';

/** Movements of how many dates are read at once: a long history must not open hundreds of requests together. */
const AT_ONCE = 6;

/**
 * CashClosuresSource over the container client (HU-CSH-001 / HU-CSH-003 plan D-03): the closures newest first, each with the movements of its
 * date, which the contract serves apart. TODO(contract): a closure carries neither its time zone nor its movements, so the zone comes from
 * `cash-days/current` and the movements from one read per date.
 */
export class CashClosuresApiSource extends CashClosuresSource {
  constructor(private readonly client: PortalApiClient) { super(); }

  override async list(): Promise<readonly CashClosure[]> {
    const { timeZone } = await this.client.request<CashDayDto>(currentCashDayPath());
    const closures = await listAll<CashClosureDto>(this.client, cashClosuresPath());
    const dates = [...new Set(closures.map((closure) => closure.businessDate))];
    const movements = new Map<string, readonly CashMovementDto[]>();
    for (let from = 0; from < dates.length; from += AT_ONCE) {
      const chunk = dates.slice(from, from + AT_ONCE);
      const found = await Promise.all(chunk.map((date) => listAll<CashMovementDto>(this.client, cashMovementsPath(date))));
      chunk.forEach((date, index) => movements.set(date, found[index]));
    }
    return closures.map((closure) => toClosure(closure, movements.get(closure.businessDate) ?? [], timeZone));
  }
}
