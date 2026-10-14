import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// Plan D-08 (pillar 6) and lesson 7: one stylesheet, src/styles/portal.css; every rule under .csh-root with
// the csh- prefix; colours only as --csh-* tokens taken from the mockup main.css; the portal stays in its column.
const css = readFileSync('src/styles/portal.css', 'utf8');
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = [...code.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));

describe('portalCssUsesOnlyItsTokensAndPrefix', () => {
  it('declares the --csh-* tokens of the mockup on .csh-root', () => {
    const root = rules.find((rule) => rule.selector === '.csh-root')!;
    expect(root.body).toMatch(/--csh-bg:\s*#f5f7f7;/);
    expect(root.body).toMatch(/--csh-text:\s*#17252b;/);
    expect(root.body).toMatch(/--csh-accent:\s*#2f6b57;/);
    expect(root.body).toMatch(/--csh-error:\s*#b34a4a;/);
  });

  it('writes a colour literal only as the value of a --csh-* token', () => {
    const literals = rules.flatMap(({ selector, body }) => body.split(';')
      .filter((declaration) => /#[0-9a-f]{3,8}\b|rgba?\(/i.test(declaration) && !/^\s*--csh-[\w-]+\s*:/.test(declaration))
      .map((declaration) => `${selector} { ${declaration.trim()} }`));
    expect(literals).toEqual([]);
  });

  it('scopes every rule under .csh-root and names every class with csh-', () => {
    const selectors = rules.map((rule) => rule.selector).filter((selector) => !selector.startsWith('@'))
      .flatMap((selector) => selector.split(',').map((part) => part.trim()));
    expect(selectors.filter((selector) => !selector.startsWith('.csh-root'))).toEqual([]);
    const classes = selectors.flatMap((selector) => [...selector.matchAll(/\.([\w-]+)/g)].map(([, name]) => name));
    expect(classes.filter((name) => !name.startsWith('csh-'))).toEqual([]);
  });

  it('has no viewport bleed, no fixed or sticky position and no z-index', () => {
    expect(code).not.toMatch(/100vmax|100vw|100vh|clip-path|z-index/);
    expect(code).not.toMatch(/position:\s*(fixed|sticky)/);
  });

  it('keeps CSS out of the components and every template class under csh-', () => {
    const sources = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(listSourceFiles().filter((file) => /\.(css|scss)$/.test(file))).toEqual(['src/styles/portal.css']);
    const styled = sources.filter((file) => /\bstyles\s*:|\bstyleUrls?\s*:/.test(withoutComments(readFileSync(file, 'utf8'))));
    expect(styled).toEqual([]);
    const loose = sources.flatMap((file) => [...readFileSync(file, 'utf8').matchAll(/\bclass="([^"]*)"/g)]
      .flatMap(([, names]) => names.split(/\s+/).filter((name) => name && !name.startsWith('csh-')).map((name) => `${file}: ${name}`)));
    expect(loose).toEqual([]);
  });
});
