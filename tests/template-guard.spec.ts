import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { posix } from 'node:path';
import { listSourceFiles, withoutComments } from './source-files';

// portal-areas.ts is the composition registry: it is the one file of shared/ that names the stories.
// Transversal guard over every inline template of the portal (pillars 5, 7 and 10), not only the reports ones.
const templates = listSourceFiles()
  .filter((file) => file.endsWith('.ts'))
  .flatMap((file) => {
    const match = /template:\s*`([\s\S]*?)`/.exec(readFileSync(file, 'utf8'));
    return match ? [{ file, template: match[1] }] : [];
  });

describe('everyTemplateOfThePortalIsFreeOfLiteralsAndInaccessiblePatterns', () => {
  it('finds the templates it guards', () => {
    expect(templates.length).toBeGreaterThanOrEqual(8);
  });

  it('keeps every visible text out of the templates (pillar 5)', () => {
    for (const { file, template } of templates) {
      expect(template.replace(/\{\{[^}]*\}\}|<[^>]*>|@\w+[^\n{<]*\{?|[{}]/g, '').trim(), file).toBe('');
    }
  });

  it('keeps accessible names and tooltips out of the templates as literals (pillar 5)', () => {
    for (const { file, template } of templates) {
      expect(template, file).not.toMatch(/\s(aria-label|aria-description|title|placeholder|alt)="[^"]*[A-Za-zÁ-ú][^"]*"/);
    }
  });

  it('never fakes a link: role="link" is forbidden, and a clickable anchor needs an href (pillar 7)', () => {
    for (const { file, template } of templates) {
      expect(template, file).not.toMatch(/role="link"/);
      for (const [tag] of template.matchAll(/<a\b[^>]*>/g)) { expect(tag, file).toMatch(/\[?(attr\.)?href\]?=/); }
    }
  });

  it('keeps shared/ independent of the stories that use it (pillar 10)', () => {
    for (const file of listSourceFiles().filter((f) => f.startsWith('src/app/shared/') && f !== 'src/app/shared/portal-areas.ts')) {
      expect([...readFileSync(file, 'utf8').matchAll(/from\s+'(\.\.\/[^']*)'/g)].map(([, path]) => path).filter((path) => /^\.\.\/(cash|reports|demo)\//.test(path)), file).toEqual([]);
    }
  });

  // Pillar 10: a story is extended through a slot (InjectionToken) and never by importing the internals of another one.
  const importsOf = (file: string) => [...withoutComments(readFileSync(file, 'utf8')).matchAll(/from\s+'(\.[^']*)'/g)].map(([, path]) => posix.normalize(posix.join(posix.dirname(file), path)));
  const FEATURES = ['cash', 'reports'];
  const featureOf = (file: string) => FEATURES.find((feature) => file.startsWith(`src/app/${feature}/`));
  const INTERNAL = /^src\/app\/(cash|reports)\/(components|pages)\//;

  it('lets demo/ and every feature import no component or page of another story, only ports, slots and shared/ (pillar 10)', () => {
    const files = listSourceFiles().filter((f) => f.endsWith('.ts') && f.startsWith('src/app/'));
    expect(files.filter((f) => f.startsWith('src/app/demo/')).length).toBeGreaterThan(0);
    for (const file of files) {
      const own = featureOf(file);
      const crossed = importsOf(file).filter((path) => INTERNAL.test(path) && featureOf(path) !== own);
      expect(crossed, file).toEqual([]);
    }
  });

  it('declares MonthlyPeriod in shared/ and imports it from there, never through the cash port (pillar 10)', () => {
    for (const file of listSourceFiles().filter((f) => f.endsWith('.ts'))) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      const fromPort = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'[^']*monthly-report-source'/g)].filter(([, names]) => /\bMonthlyPeriod\b/.test(names));
      expect(fromPort, file).toEqual([]);
    }
  });
});
