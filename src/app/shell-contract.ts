/**
 * An area of a portal, possibly another one than the caller; the container owns the address (HU-FRT-001 spec 003-, plan D-04).
 * Local copy of `PortalTarget` of its `core/client/types.ts`: the portal never imports the container (norm 5.4.1, pillar 10).
 */
export interface PortalTarget {
  /** Key of the portal in the container's federation manifest. */
  readonly portal: string;
  /** Area key declared by that portal. */
  readonly area: string;
}

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
  /** Asks the container to open an area of another portal (the container also takes a path text, which this portal never sends); absent, the links to it are not drawn. */
  navigate?: (target: PortalTarget) => void;
}

export type PortalApiClient = MountProps['apiClient'];
