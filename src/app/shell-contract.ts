/**
 * What the multi-tour-front container hands to `mount` (ADR-007); mirrors its `core/client/types.ts`.
 * Fields the portal does not read yet (`scope`, `navigate`, the visual identity) are left out on purpose.
 */
export interface MountProps {
  identifier?: string;
  /** The container client: it carries the session, the credential and the trace of every request. */
  apiClient: { request<T>(path: string, init?: unknown): Promise<T> };
  session: { readonly roles: string[]; open(answer: unknown): void; close(): void };
  /** PROPUESTO for ADR-007 (as the commercial portal): parameters the container keeps across a remount. */
  initialParams?: Readonly<Record<string, string>>;
}

export type PortalApiClient = MountProps['apiClient'];
