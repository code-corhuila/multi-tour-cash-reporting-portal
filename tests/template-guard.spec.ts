import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

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
    for (const file of listSourceFiles().filter((f) => f.startsWith('src/app/shared/'))) {
      expect([...readFileSync(file, 'utf8').matchAll(/from\s+'(\.\.\/[^']*)'/g)].map(([, path]) => path), file).toEqual([]);
    }
  });
});
