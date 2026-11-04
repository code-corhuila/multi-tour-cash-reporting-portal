import { PortalApiClient } from '../shell-contract';

/** The gateway route of this service (contract `servers`); only a path: the container client owns the host, the token and the tenant. */
export const API_BASE = '/api/v1/cash-reporting';

export const currentCashDayPath = (): string => `${API_BASE}/cash-days/current`;
export const cashDayPath = (businessDate: string): string => `${API_BASE}/cash-days/${businessDate}`;
export const cashClosuresPath = (): string => `${API_BASE}/cash-closures`;
export const cashMovementsPath = (businessDate: string): string => `${cashDayPath(businessDate)}/movements`;
/** The days opened and never closed, most recent first (listCashDays); the caller adds `page` and `limit`. */
export const pendingCashDaysPath = (): string => `${API_BASE}/cash-days?pendingClosure=true`;

interface Page<T> { readonly data: readonly T[]; readonly meta: { readonly page: number; readonly totalPages: number } }

/** One page of a list: `page` and `limit` go after any filter already in the path. */
export function pageOf<T>(client: PortalApiClient, path: string, page: number, limit: number): Promise<Page<T>> {
  return client.request<Page<T>>(`${path}${path.includes('?') ? '&' : '?'}page=${page}&limit=${limit}`);
}

/** Every page of a list, 100 at a time (the contract's cap), in the order the service gives them. Rejections reach the caller as they came. */
export async function listAll<T>(client: PortalApiClient, path: string): Promise<readonly T[]> {
  const all: T[] = [];
  for (let page = 1, last = 1; page <= last; page += 1) {
    const result = await pageOf<T>(client, path, page, 100);
    all.push(...result.data);
    last = result.meta.totalPages;
  }
  return all;
}
