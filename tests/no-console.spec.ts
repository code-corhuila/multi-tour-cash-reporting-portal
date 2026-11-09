import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// The entry points swallowed their failures with console.error. The portal names no console at all: a failure goes
// through reportFailure (norm 5.3 on logs, HU-CSH-001 in code-corhuila/multi-tour-docs#195).
describe('thePortalSourceNamesNoConsole', () => {
  it('has no console call in src/', () => {
    const offenders = listSourceFiles()
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => /\bconsole\s*\./.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  it('routes the failures of the three entry points through reportFailure', () => {
    for (const file of ['src/bootstrap.ts', 'src/main.ts', 'src/mount-entry.ts']) {
      expect(readFileSync(file, 'utf8'), file).toContain('reportFailure');
    }
  });
});
