import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The norm asks every repository for the pull request template (HU-CSH-001, code-corhuila/multi-tour-docs#195).
describe('thePortalRepositoryHasItsPullRequestTemplate', () => {
  const path = '.github/pull_request_template.md';

  it('exists', () => {
    expect(existsSync(path)).toBe(true);
  });

  it('asks for the story, the change, the tests, the promotion trail and the checklist', () => {
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    for (const heading of ['## User story', '## What changes and why', '## How it was tested', '## Promotion trail', '## Checklist']) {
      expect(text, heading).toContain(heading);
    }
  });

  it('forbids secrets in the checklist', () => {
    const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
    expect(text).toContain('No secrets');
  });
});
