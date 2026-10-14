import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// The skeleton of plan D-01 (HU-CSH-001, pull request 1): the Annex H portal tree before any feature.
// Adding or removing a file of src/ is a decision, so it must change this list in the same commit.
const SPECIFIED_TREE = [
  'src/app/app.component.ts',
  'src/app/app.config.ts',
  'src/app/shell-contract.ts',
  'src/app/sources.demo.ts',
  'src/app/sources.ts',
  'src/bootstrap.ts',
  'src/index.html',
  'src/main.ts',
  'src/mount-entry.ts',
  'src/styles/portal.css',
];

describe('portalTreeMatchesTheSpecifiedTree', () => {
  it('has exactly the files of the specified tree under src/, no more and no less', () => {
    expect(listSourceFiles()).toEqual([...SPECIFIED_TREE].sort());
  });
});
