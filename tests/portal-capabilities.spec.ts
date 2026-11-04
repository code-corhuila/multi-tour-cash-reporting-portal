import { readFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { PortalActor, PortalCapabilities, roleOf } from '../src/app/shared/portal-capabilities';
import { listSourceFiles, withoutComments } from './source-files';

// Plan D-04 (RBAC rows Open, close and reopen the daily cash; Change the cash base; Consult movements and closings):
// one table, one row per role, answers what an actor may do; a screen asks a capability, never compares a role.
afterEach(() => TestBed.resetTestingModule());

/** Every answer of the table for one actor. */
const answers = (c: PortalCapabilities) => ({
  label: c.roleLabel(), denied: c.isDenied(), readCash: c.canReadCash(), operateCash: c.canOperateCash(),
  changeBase: c.canChangeBase(), correctClosure: c.canCorrectClosure(),
});
const DENIED_ANSWERS = { label: '', denied: true, readCash: false, operateCash: false, changeBase: false, correctClosure: false };
const reader = (label: string) => ({ label, denied: false, readCash: true, operateCash: false, changeBase: false, correctClosure: false });

describe('portalCapabilitiesOfTheCash', () => {
  it('gives the Administrador del tenant every cash action, the base included', () => {
    expect(answers(PortalCapabilities.for('TENANT_ADMINISTRATOR'))).toEqual(
      { label: 'Administrador del tenant', denied: false, readCash: true, operateCash: true, changeBase: true, correctClosure: true });
  });

  it('lets the Colaborador operativo operate and correct only with Gestionar caja, and never change the base (AC9, G-PERM)', () => {
    expect(answers(PortalCapabilities.for('OPERATIONAL_COLLABORATOR'))).toEqual(reader('Colaborador operativo'));
    expect(answers(PortalCapabilities.for('OPERATIONAL_COLLABORATOR', true))).toEqual(
      { ...reader('Colaborador operativo'), operateCash: true });
  });

  it.each([['MANAGER', 'Gerente'], ['ACCOUNTANT', 'Contador'], ['ANALYST', 'Analista']])(
    'lets the optional role %s read only, even with the grant', (role, label) => {
      expect(answers(PortalCapabilities.for(role))).toEqual(reader(label));
      expect(answers(PortalCapabilities.for(role, true))).toEqual(reader(label));
    });

  it.each(['FINAL_CUSTOMER', 'PLATFORM_ADMINISTRATOR', 'tenant_administrator', ''])(
    'denies everything to %j: the Cliente final and any unknown role fail closed', (role) => {
      expect(answers(PortalCapabilities.for(role, true))).toEqual(DENIED_ANSWERS);
    });

  it('takes the first known role of the session and fails closed without one', () => {
    expect(roleOf(['FINAL_CUSTOMER', 'MANAGER'])).toBe('MANAGER');
    expect(roleOf(['FINAL_CUSTOMER'])).toBe('DENIED');
    expect(roleOf([])).toBe('DENIED');
  });

  it('is denied when no actor is provided, and reads the provided actor otherwise', () => {
    expect(answers(TestBed.inject(PortalCapabilities))).toEqual(DENIED_ANSWERS);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(['OPERATIONAL_COLLABORATOR'], true) }] });
    expect(TestBed.inject(PortalCapabilities).canOperateCash()).toBe(true);
  });
});

describe('noRoleNameOutsideThePortalCapabilities', () => {
  const ROLE_NAME = /\b(TENANT_ADMINISTRATOR|OPERATIONAL_COLLABORATOR|MANAGER|ACCOUNTANT|ANALYST|FINAL_CUSTOMER|DENIED)\b/;
  const CAPABILITIES = 'src/app/shared/portal-capabilities.ts';

  it('finds a role name only in src/app/shared/portal-capabilities.ts', () => {
    const files = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(files).toContain(CAPABILITIES);
    const offenders = files.filter((file) => file !== CAPABILITIES)
      .filter((file) => ROLE_NAME.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('detects a role literal, so the check above cannot pass by blindness', () => {
    expect(ROLE_NAME.test(withoutComments("if (role === 'ANALYST') {}"))).toBe(true);
    expect(ROLE_NAME.test(withoutComments('// only the ANALYST reads'))).toBe(false);
  });
});
