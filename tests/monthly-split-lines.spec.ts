import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { CashMonthlyPageComponent } from '../src/app/cash/pages/cash-monthly-page.component';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { DemoMonthlyReportSource, consolidate } from '../src/app/demo/monthly-report-demo';
import { MonthlyReportComponent } from '../src/app/reports/components/monthly-report.component';
import { MonthlyPeriod } from '../src/app/shared/monthly-period';
import { PortalNavigation } from '../src/app/shared/portal-navigation';

// HU-CSH-003 (spec 003- AC-RM.1, plan D-10, task T-07): the sub-screen "Consolidación mensual" draws ten lines per period, in the order of the
// mockup (admin-consolidacion-mensual.html, setupOperatorCashMonthly); Reportes draws the seven it always drew.
const peso = (n: number) => n * 100;
const SEP: MonthlyPeriod = {
  reportedPeriod: '2026-09', periodIncome: peso(1290000), operationalPayments: 0, operationalExpenses: peso(250000), executedRefunds: peso(150000),
  consolidatedCashTotal: peso(890000), registeredCancellations: 2, registeredOperationalCosts: peso(480000),
  countedMovements: 3, incomeInCash: 0, incomeByTransfer: peso(1290000),
};
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class Fixed extends MonthlyReportSource {
  constructor(private readonly list: readonly MonthlyPeriod[]) { super(); }
  override periods(): Promise<readonly MonthlyPeriod[]> { return Promise.resolve(this.list); }
}

afterEach(() => TestBed.resetTestingModule());

async function render<T>(component: new () => T, list: readonly MonthlyPeriod[]) {
  TestBed.configureTestingModule({ providers: [{ provide: MonthlyReportSource, useValue: new Fixed(list) }, { provide: PortalNavigation, useValue: { open: () => undefined } }] });
  const fixture = TestBed.createComponent(component);
  for (let i = 0; i < 4; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
  const host: HTMLElement = fixture.nativeElement;
  const lines = () => Array.from(host.querySelectorAll('csh-monthly-period dl > div')).map((row) => [flat(row.querySelector('dt')?.textContent), flat(row.querySelector('dd')?.textContent)]);
  return { host, lines };
}

describe('consolidationShowsTheCashAndTransferSplitOfIncome', () => {
  it('draws the ten lines of the mockup in its order, with the counted movements and the split as the source gave them', async () => {
    const { lines } = await render(CashMonthlyPageComponent, [SEP]);
    expect(lines()).toEqual([
      ['Movimientos individuales contabilizados', '3'],
      ['Ingresos del período', '$1.290.000'],
      ['Ingresos en efectivo', '$0'],
      ['Ingresos por transferencia', '$1.290.000'],
      ['Pagos operacionales del período', '$0'],
      ['Gastos del período', '$250.000'],
      ['Devoluciones efectivamente realizadas', '$150.000'],
      ['Total consolidado de caja del período', '$890.000'],
      ['Cancelaciones registradas en el período', '2'],
      ['Costos operacionales registrados en el período', '$480.000'],
    ]);
  });

  it('draws the seven lines when the period does not carry the split, and never "undefined" or "NaN"', async () => {
    const { host, lines } = await render(CashMonthlyPageComponent, [{ ...SEP, countedMovements: undefined, incomeInCash: undefined, incomeByTransfer: undefined }]);
    expect(lines().map(([label]) => label)).toEqual([
      'Ingresos del período', 'Pagos operacionales del período', 'Gastos del período', 'Devoluciones efectivamente realizadas',
      'Total consolidado de caja del período', 'Cancelaciones registradas en el período', 'Costos operacionales registrados en el período',
    ]);
    expect(flat(host.textContent)).not.toMatch(/undefined|NaN/);
  });

  it('draws a split of zeros as "0" and "$0", not as a missing line', async () => {
    const { lines } = await render(CashMonthlyPageComponent, [{ ...SEP, countedMovements: 0, incomeInCash: 0, incomeByTransfer: 0 }]);
    expect(lines().slice(0, 4).map(([, value]) => value)).toEqual(['0', '$1.290.000', '$0', '$0']);
  });
});

describe('reportesNeverDrawsTheThreeExtraLines', () => {
  it('keeps the seven lines on the article of Reportes even when the period carries the split', async () => {
    const { lines } = await render(MonthlyReportComponent, [SEP]);
    expect(lines().map(([label]) => label)).toEqual([
      'Ingresos del período', 'Pagos operacionales del período', 'Gastos del período', 'Devoluciones efectivamente realizadas',
      'Total consolidado de caja del período', 'Cancelaciones registradas en el período', 'Costos operacionales registrados en el período',
    ]);
  });
});

describe('theDemoConsolidatesTheSplitFromTheMovements', () => {
  const CASH = { date: '2026-09-01', medium: 'CASH' as const };
  const TRANSFER = { date: '2026-09-01', medium: 'TRANSFER' as const };

  it('counts each movement once, the base never, and splits the income by medium', () => {
    const [sep] = consolidate([
      { id: 'b1', kind: 'base', amount: peso(300000), ...CASH }, { id: 'i1', kind: 'income', amount: peso(100000), ...CASH },
      { id: 'i2', kind: 'income', amount: peso(250000), ...TRANSFER }, { id: 'e1', kind: 'expense', amount: peso(40000), ...CASH },
      { id: 'i2', kind: 'income', amount: peso(250000), ...TRANSFER },
    ]);
    expect(sep).toMatchObject({ countedMovements: 3, incomeInCash: peso(100000), incomeByTransfer: peso(250000), periodIncome: peso(350000) });
  });

  it('keeps the split equal to the income and the counted movements a whole number, in every period of the demo', async () => {
    const list = await new DemoMonthlyReportSource().periods();
    expect(list.length).toBeGreaterThan(0);
    for (const period of list) {
      expect((period.incomeInCash ?? NaN) + (period.incomeByTransfer ?? NaN)).toBe(period.periodIncome);
      expect(Number.isInteger(period.countedMovements)).toBe(true);
    }
  });
});
