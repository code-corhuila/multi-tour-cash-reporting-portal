import { Injectable, inject } from '@angular/core';

/**
 * The only place of the portal where a role name appears (plan D-04): one row per internal role of the RBAC matrix
 * (`07-api/authentication.md`, Cash and Reports); a screen asks a capability, never compares a role. DENIED is not
 * a role of the matrix: the Cliente final and any unknown role fail closed to it. The service refuses regardless.
 */
export type ActorRole = 'TENANT_ADMINISTRATOR' | 'OPERATIONAL_COLLABORATOR' | 'MANAGER' | 'ACCOUNTANT' | 'ANALYST' | 'DENIED';
export const FAIL_CLOSED_ROLE = 'DENIED' satisfies ActorRole;

interface Row {
  readonly label: string;
  /** HU-CSH-001: RBAC row Consult movements and closings. */
  readonly readCash: boolean;
  /** HU-CSH-001: RBAC row Open, close and reopen the daily cash; the Colaborador only with Gestionar caja (HU-SEC-006, G-PERM). */
  readonly operateCash: 'always' | 'if-granted' | 'never';
  /** HU-CSH-001 AC9: RBAC row Change the cash base. */
  readonly changeBase: boolean;
  /** HU-CSH-002: RBAC row Daily dashboard, read only (the Contador reads, DP-DB5). */
  readonly readReports: boolean;
}

const NONE: Row = { label: '', readCash: false, operateCash: 'never', changeBase: false, readReports: false };
const READER: Row = { ...NONE, readCash: true, readReports: true };
const TABLE: Readonly<Record<ActorRole, Row>> = Object.freeze({
  TENANT_ADMINISTRATOR: { label: 'Administrador del tenant', readCash: true, operateCash: 'always', changeBase: true, readReports: true },
  OPERATIONAL_COLLABORATOR: { ...READER, label: 'Colaborador operativo', operateCash: 'if-granted' },
  MANAGER: { ...READER, label: 'Gerente' },
  ACCOUNTANT: { ...READER, label: 'Contador' },
  ANALYST: { ...READER, label: 'Analista' },
  DENIED: NONE,
});

const isKnown = (role: string): role is ActorRole => Object.prototype.hasOwnProperty.call(TABLE, role);

/** One role is assumed (as the commercial portal, DP-PT-06): the first known one of the session; otherwise DENIED. */
export function roleOf(roles: readonly string[]): ActorRole {
  return (roles.find((role) => isKnown(role) && role !== FAIL_CLOSED_ROLE) as ActorRole | undefined) ?? FAIL_CLOSED_ROLE;
}

/** Who acts, as the container reported (norm 5.4.1). G-PERM: the session carries only roles, so Gestionar caja is false until it is reported. */
@Injectable({ providedIn: 'root', useFactory: () => PortalActor.from([]) })
export class PortalActor {
  private constructor(readonly role: ActorRole, readonly mayManageCash: boolean) {}
  static from(roles: readonly string[], mayManageCash = false): PortalActor { return new PortalActor(roleOf(roles), mayManageCash); }
}

/** What an actor may do, read from the table; injected from the actor the container reported. */
@Injectable({ providedIn: 'root', useFactory: () => PortalCapabilities.of(inject(PortalActor)) })
export class PortalCapabilities {
  private readonly row: Row;

  private constructor(role: string, private readonly mayManageCash: boolean) { this.row = TABLE[isKnown(role) ? role : FAIL_CLOSED_ROLE]; }

  static for(role: string, mayManageCash = false): PortalCapabilities { return new PortalCapabilities(role, mayManageCash); }
  static of(actor: PortalActor): PortalCapabilities { return PortalCapabilities.for(actor.role, actor.mayManageCash); }

  /** No area of this portal is offered (AC-CJ.11). */
  isDenied(): boolean { return this.row === NONE; }
  canReadCash(): boolean { return this.row.readCash; }
  canOperateCash(): boolean { return this.row.operateCash === 'always' || (this.row.operateCash === 'if-granted' && this.mayManageCash); }
  canChangeBase(): boolean { return this.row.changeBase; }
  /** DP-CJ3: the correction after a closing is the reopening record, so it follows the operate row. */
  canCorrectClosure(): boolean { return this.canOperateCash(); }
  /** HU-CSH-002: the area Reportes and its dashboard; the screen has no action to ask for. */
  canReadReports(): boolean { return this.row.readReports; }
  roleLabel(): string { return this.row.label; }
}
