import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { withoutComments } from './source-files';

// Pillar 13 (performance) and pillar 9 (resources): the size limits of the bundles live in the build and the
// CSP impact of the exported files is declared where the files are produced and in the README.
const angular = JSON.parse(readFileSync('angular.json', 'utf8')).projects['cash-reporting-portal'].architect;
const bytes = (value: string) => Number.parseFloat(value) * ({ kB: 1000, MB: 1_000_000 } as Record<string, number>)[value.replace(/[\d.]/g, '')];

describe('bundleBudgetsAreDeclared', () => {
  it('limits the initial bundle and the whole output of the application build, with a margin over the measured sizes', () => {
    const budgets: { type: string; maximumWarning: string; maximumError: string }[] = angular.esbuild.configurations.production.budgets;
    for (const type of ['initial', 'anyComponentStyle']) { expect(budgets.map((b) => b.type)).toContain(type); }
    const initial = budgets.find((b) => b.type === 'initial')!;
    expect(bytes(initial.maximumWarning)).toBeGreaterThan(40_550);
    expect(bytes(initial.maximumError)).toBeGreaterThan(bytes(initial.maximumWarning));
    expect(bytes(initial.maximumError)).toBeLessThanOrEqual(200_000);
  });

  it('limits the mounted module as well, the artifact the container actually loads', () => {
    const budgets: { type: string; maximumWarning: string; maximumError: string }[] = angular.module.options.budgets;
    const initial = budgets.find((b) => b.type === 'initial')!;
    expect(bytes(initial.maximumWarning)).toBeGreaterThan(201_970);
    expect(bytes(initial.maximumError)).toBeGreaterThan(bytes(initial.maximumWarning));
    expect(bytes(initial.maximumError)).toBeLessThanOrEqual(300_000);
  });

  it('records the measured sizes in the README', () => {
    const readme = readFileSync('README.md', 'utf8');
    expect(readme).toMatch(/## Performance budgets/);
    for (const size of ['40,55 kB', '76,31 kB', '187,86 kB', '201,97 kB']) { expect(readme).toContain(size); }
  });
});

describe('exportedFilesDeclareTheirCspImpact', () => {
  it('says in the exporter and in the README that the files are saved through a blob: link and nothing needs data:', () => {
    const exporter = readFileSync('src/app/reports/data/report-exporter.ts', 'utf8');
    expect(exporter).toMatch(/CSP[\s\S]*blob:/);
    expect(withoutComments(exporter)).not.toMatch(/['"`]data:/);
    expect(readFileSync('README.md', 'utf8')).toMatch(/## CSP impact[\s\S]*blob:[\s\S]*data:/);
  });
});
