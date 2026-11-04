import { PortalApiClient } from '../src/app/shell-contract';

export interface Call { readonly path: string; readonly init?: { method?: string; headers?: Record<string, string>; body?: unknown } }
export type Reply = { readonly ok: unknown } | { readonly fail: unknown };

/** The error the container client rejects with: `{status, code, message, traceId}` (multi-tour-front `core/client/types.ts`). */
export const containerError = (status: number, code: string) => ({ status, code, message: 'The server could not be reached.', traceId: 'trace-1' });

/** A fake container client keyed by the FULL path (query included): it records every call and refuses any path no test announced. */
export function fakeCashClient(routes: Record<string, Reply | Reply[]>) {
  const calls: Call[] = [];
  const queues = new Map(Object.entries(routes).map(([path, reply]) => [path, Array.isArray(reply) ? [...reply] : [reply]]));
  const client: PortalApiClient = {
    request: ((path: string, init?: Call['init']) => {
      calls.push({ path, init });
      const queue = queues.get(path);
      const reply = queue?.[0];
      if (!queue || !reply) return Promise.reject(new Error(`unexpected request ${path}`));
      if (queue.length > 1) queue.shift();
      return 'fail' in reply ? Promise.reject(reply.fail) : Promise.resolve(reply.ok);
    }) as PortalApiClient['request'],
  };
  return { client, calls, paths: () => calls.map((call) => call.path) };
}

export const page = <T>(data: readonly T[], meta: { page?: number; totalPages?: number } = {}) =>
  ({ data, meta: { page: meta.page ?? 1, limit: 100, total: data.length, totalPages: meta.totalPages ?? 1 } });
