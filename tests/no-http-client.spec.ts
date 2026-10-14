import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { listSourceFiles, withoutComments } from './source-files';

// RN-CJ9 (norm 5.4.1, Annex H): the HTTP client, the session and the token live only in the
// multi-tour-front container. A portal that builds its own sends requests with no interceptor:
// unauthenticated and in silence.
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['provideHttpClient', /\bprovideHttpClient\b/],
  ['HttpClientModule', /\bHttpClientModule\b/],
  ['HttpClient', /\bHttpClient\b/],
  ['fetch(', /\bfetch\s*\(/],
  ['XMLHttpRequest', /\bXMLHttpRequest\b/],
  ['axios', /\baxios\b/],
  ['localStorage', /\blocalStorage\b/],
  ['sessionStorage', /\bsessionStorage\b/],
  ['document.cookie', /\bdocument\s*\.\s*cookie\b/],
  ['Authorization', /\bAuthorization\b/],
];

/** The forbidden constructs found in one piece of source text. */
export function findViolations(source: string): string[] {
  const code = withoutComments(source);
  return FORBIDDEN.filter(([, pattern]) => pattern.test(code)).map(([name]) => name);
}

describe('portalDeclaresNoHttpClientOfItsOwn', () => {
  it('finds no HTTP client, session, token or direct request anywhere in src/', () => {
    const files = listSourceFiles().filter((file) => file.endsWith('.ts'));
    expect(files).toContain('src/mount-entry.ts');
    const offenders = files
      .map((file) => ({ file, found: findViolations(readFileSync(file, 'utf8')) }))
      .filter(({ found }) => found.length > 0);
    expect(offenders).toEqual([]);
  });

  it('detects each forbidden construct, so the check above cannot pass by blindness', () => {
    const samples: Record<string, string> = {
      provideHttpClient: 'providers: [provideHttpClient()]',
      HttpClientModule: 'imports: [HttpClientModule]',
      HttpClient: 'inject(HttpClient)',
      'fetch(': "await fetch('/x');",
      XMLHttpRequest: 'const request = new XMLHttpRequest();',
      axios: "import axios from 'axios';",
      localStorage: "localStorage.setItem('k', 'v');",
      sessionStorage: "sessionStorage.getItem('k');",
      'document.cookie': 'const c = document.cookie;',
      Authorization: "headers: { Authorization: 'Bearer x' }",
    };
    for (const [name, sample] of Object.entries(samples)) {
      expect(findViolations(sample)).toContain(name);
    }
  });

  it('ignores the same words inside comments', () => {
    const commented = '// no provideHttpClient() here\n/* never fetch( directly, never localStorage */\nexport const a = 1;';
    expect(findViolations(commented)).toEqual([]);
  });
});
