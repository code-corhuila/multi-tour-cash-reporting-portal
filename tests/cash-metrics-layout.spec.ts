import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// HU-CSH-001, screen 14 (admin-caja.html): the seven metrics of the day read in two rows (four, then three) with a wider column than the five of the
// mockup squeezed into the content column, a dark bold label like the mockup's, and they fold to two columns and to one on narrow screens.
const css = readFileSync('src/styles/portal.css', 'utf8').replace(/\r\n/g, '\n');
const ruleOf = (selector: string) => {
  const start = css.indexOf(`\n${selector} {`);
  return start < 0 ? '' : css.slice(start, css.indexOf('}', start) + 1);
};
// Every block of that query, joined: the stylesheet has one per group of screens.
const mediaOf = (query: string) => [...css.matchAll(new RegExp(`@media \\(${query}\\) \\{[\\s\\S]*?\\n\\}`, 'g'))].map(([block]) => block).join('\n');

describe('theSevenMetricsAreArrangedInTwoRows', () => {
  it('lays them on a twelve-column grid with room between rows and columns', () => {
    const rule = ruleOf('.csh-root .csh-cash-metrics');
    expect(rule).toMatch(/grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\);/);
    expect(rule).toMatch(/gap:\s*22px 24px;/);
  });

  it('gives each of the first four a quarter of the row and each of the last three a third', () => {
    expect(ruleOf('.csh-root .csh-cash-metric')).toMatch(/grid-column:\s*span 3;/);
    expect(ruleOf('.csh-root .csh-cash-metric:nth-child(n+5)')).toMatch(/grid-column:\s*span 4;/);
  });

  it('writes the label dark and bold, as the mockup does', () => {
    const rule = ruleOf('.csh-root .csh-cash-metric dt');
    expect(rule).toMatch(/color:\s*var\(--csh-text\);/);
    expect(rule).toMatch(/font-weight:\s*700;/);
  });
});

describe('theMetricsFoldOnNarrowScreens', () => {
  it('shows two per row up to 860px, the seventh using the whole row', () => {
    const media = mediaOf('max-width: 860px');
    expect(media).toMatch(/\.csh-root \.csh-cash-metric, \.csh-root \.csh-cash-metric:nth-child\(n\+5\) \{ grid-column: span 6; \}/);
    expect(media).toMatch(/\.csh-root \.csh-cash-metric:last-child \{ grid-column: 1 \/ -1; \}/);
  });

  it('shows one per row up to 620px', () => {
    expect(mediaOf('max-width: 620px')).toMatch(/\.csh-root \.csh-cash-metric, \.csh-root \.csh-cash-metric:nth-child\(n\+5\), \.csh-root \.csh-cash-metric:last-child \{ grid-column: 1 \/ -1; \}/);
  });
});
