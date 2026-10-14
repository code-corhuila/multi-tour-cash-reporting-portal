import { describe, expect, it } from 'vitest';
import { listSourceFiles } from './source-files';

// The skeleton of plan D-01 (HU-CSH-001, pull request 1) and the shared base of plan D-04 to D-08 (pull request 2):
// the Annex H portal tree before any feature.
// Adding or removing a file of src/ is a decision, so it must change this list in the same commit.
const SPECIFIED_TREE = [
  'src/app/app.component.ts',
  'src/app/app.config.ts',
  'src/app/cash/cash-copy.ts',
  'src/app/cash/components/cash-movements.component.ts',
  'src/app/cash/components/cash-register.component.ts',
  'src/app/cash/data/cash-closing-writer.ts',
  'src/app/cash/data/cash-day-source.ts',
  'src/app/cash/data/cash-movement-writer.ts',
  'src/app/cash/data/monthly-report-source.ts',
  'src/app/cash/pages/cash-day-page.component.ts',
  'src/app/demo/cash-demo.ts',
  'src/app/demo/demo-fixtures.ts',
  'src/app/demo/monthly-report-demo.ts',
  'src/app/demo/reports-demo.ts',
  'src/app/reports/components/daily-dashboard.component.ts',
  'src/app/reports/components/monthly-report.component.ts',
  'src/app/reports/components/period-summary.component.ts',
  'src/app/reports/data/daily-dashboard-source.ts',
  'src/app/reports/data/period-summary-source.ts',
  'src/app/reports/data/report-basis.ts',
  'src/app/reports/data/report-exporter.ts',
  'src/app/reports/data/report-files.ts',
  'src/app/reports/pages/reports-page.component.ts',
  'src/app/reports/reports-copy.ts',
  'src/app/shared/clock.ts',
  'src/app/shared/focus.ts',
  'src/app/shared/format.ts',
  'src/app/shared/idempotency-keys.ts',
  'src/app/shared/minimal-pdf.ts',
  'src/app/shared/money.ts',
  'src/app/shared/monthly-period-copy.ts',
  'src/app/shared/monthly-period.component.ts',
  'src/app/shared/page-state.ts',
  'src/app/shared/portal-areas.ts',
  'src/app/shared/portal-capabilities.ts',
  'src/app/shared/portal-navigation.ts',
  'src/app/shared/portal-shell.component.ts',
  'src/app/shared/portal-slots.ts',
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
