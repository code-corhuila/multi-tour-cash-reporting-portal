import { Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { CashMonthlyPageComponent } from '../src/app/cash/pages/cash-monthly-page.component';
import { DemoMonthlyReportSource } from '../src/app/demo/monthly-report-demo';
import { MonthlyReportComponent } from '../src/app/reports/components/monthly-report.component';
import { MonthlyPeriod } from '../src/app/shared/monthly-period';
import { MonthlyPeriodComponent } from '../src/app/shared/monthly-period.component';
import { PortalNavigation } from '../src/app/shared/portal-navigation';

// HU-CSH-003 spec A1, T-07 / AC-RM.1 / plan D-10: the sub-screen "Consolidación mensual" draws ten lines per period, as the mockup does
// (admin-consolidacion-mensual.html, app.js getOperatorMonthlyConsolidation): the count of movements first, then the income, its two media
// and the rest. Screen 16 draws the seven lines and none of the three. The mockup wins on these three lines (decision of the project owner).
const peso = (n: number) => n * 100;
const SEVEN = ['Ingresos del período', 'Pagos operacionales del período', 'Gastos del período', 'Devoluciones efectivamente realizadas', 'Total consolidado de caja del período', 'Cancelaciones registradas en el período', 'Costos operacionales registrados en el período'];
const TEN = [
  'Movimientos individuales contabilizados', 'Ingresos del período', 'Ingresos en efectivo', 'Ingresos por transferencia', 'Pagos operacionales del período',
  'Gastos del período', 'Devoluciones efectivamente realizadas', 'Total consolidado de caja del período', 'Cancelaciones registradas en el período', 'Costos operacionales registrados en el período',
];
const SPLIT: MonthlyPeriod = {
  reportedPeriod: '2026-09', periodIncome: peso(1290000), operationalPayments: 0, operationalExpenses: peso(250000), executedRefunds: 0, consolidatedCashTotal: peso(1040000),
  registeredCancellations: 0, registeredOperationalCosts: 0, countedMovements: 4, incomeInCash: peso(290000), incomeByTransfer: peso(1000000),
};
const { countedMovements: _a, incomeInCash: _b, incomeByTransfer: _c, ...WITHOUT_SPLIT } = SPLIT;
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
const labels = (host: HTMLElement) => Array.from(host.querySelectorAll('.csh-monthly-lines dt')).map((dt) => flat(dt.textContent));
const values = (host: HTMLElement) => Array.from(host.querySelectorAll('.csh-monthly-lines dd')).map((dd) => flat(dd.textContent));

class Fixed extends MonthlyReportSource {
  constructor(private readonly list: readonly MonthlyPeriod[]) { super(); }
  override periods(): Promise<readonly MonthlyPeriod[]> { return Promise.resolve(this.list); }
}
@Component({ selector: 'csh-test-host', imports: [MonthlyPeriodComponent], template: '<csh-monthly-period [period]="period" [detail]="detail" />' })
class Host { period: MonthlyPeriod = SPLIT; detail = true; }

afterEach(() => TestBed.resetTestingModule());
async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 3; i += 1) { fixture.detectChanges(); await fixture.whenStable(); }
}
async function renderHost(period: MonthlyPeriod, detail: boolean) {
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(Host);
  fixture.componentInstance.period = period; fixture.componentInstance.detail = detail;
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}
async function renderWith<T>(type: new () => T, providers: Provider[]) {
  TestBed.configureTestingModule({ providers });
  const fixture = TestBed.createComponent(type);
  await settle(fixture);
  return fixture.nativeElement as HTMLElement;
}

describe('consolidationShowsTheCashAndTransferSplitOfIncome', () => {
  it('draws the ten lines in the order of the mockup when the period carries the split and the detail is asked', async () => {
    const host = await renderHost(SPLIT, true);
    expect(labels(host)).toEqual(TEN);
    expect(values(host).slice(0, 4)).toEqual(['4', '$1.290.000', '$290.000', '$1.000.000']);
  });

  it('draws the seven lines by default, even when the period carries the split (screen 16 never passes the detail)', async () => {
    const host = await renderHost(SPLIT, false);
    expect(labels(host)).toEqual(SEVEN);
  });

  it('draws the seven lines, and no "undefined", when the detail is asked but the period carries no split', async () => {
    const host = await renderHost(WITHOUT_SPLIT, true);
    expect(labels(host)).toEqual(SEVEN);
    expect(host.textContent).not.toContain('undefined');
  });

  it('the sub-screen of Caja draws the ten lines of each period', async () => {
    const host = await renderWith(CashMonthlyPageComponent, [{ provide: MonthlyReportSource, useValue: new Fixed([SPLIT]) }, PortalNavigation]);
    expect(labels(host)).toEqual(TEN);
  });

  it('the article of Reportes draws the seven lines and none of the three', async () => {
    const host = await renderWith(MonthlyReportComponent, [{ provide: MonthlyReportSource, useValue: new Fixed([SPLIT]) }]);
    expect(labels(host)).toEqual(SEVEN);
    expect(flat(host.textContent)).not.toMatch(/Ingresos en efectivo|Ingresos por transferencia|Movimientos individuales/);
  });

  it('the demo carries a split that adds up to the income, so the delivered sub-screen shows data (not empty)', async () => {
    const [sep] = await new DemoMonthlyReportSource().periods();
    expect(Number.isInteger(sep.countedMovements) && (sep.countedMovements ?? 0) > 0).toBe(true);
    expect((sep.incomeInCash ?? -1) + (sep.incomeByTransfer ?? -1)).toBe(sep.periodIncome);
  });
});
