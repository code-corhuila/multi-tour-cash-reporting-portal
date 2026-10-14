import { readFileSync } from 'node:fs';
import { Component, Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthlyPeriod, MonthlyReportSource } from '../src/app/cash/data/monthly-report-source';
import { CashMovement, DemoMonthlyReportSource, DemoPeriodSummarySource, consolidate, monthlyReportDemoProviders } from '../src/app/demo/monthly-report-demo';
import { DailyDashboard, DailyDashboardSource } from '../src/app/reports/data/daily-dashboard-source';
import { PeriodSummary, PeriodSummarySource } from '../src/app/reports/data/period-summary-source';
import { MonthlyReportComponent } from '../src/app/reports/components/monthly-report.component';
import { PeriodSummaryComponent } from '../src/app/reports/components/period-summary.component';
import { ReportsPageComponent } from '../src/app/reports/pages/reports-page.component';
import { PORTAL_AREAS, PORTAL_AREA_LIST } from '../src/app/shared/portal-areas';
import { PortalActor } from '../src/app/shared/portal-capabilities';
import { PortalShellComponent } from '../src/app/shared/portal-shell.component';
import { REPORTS_MONTHLY_BLOCKS } from '../src/app/shared/portal-slots';
import { sourceProviders as demoSources } from '../src/app/sources.demo';
import { listSourceFiles, withoutComments } from './source-files';

// HU-CSH-003 (spec 003-, tasks T-02 and T-03): the summary row and the article "Reporte mensual" of screen 16, admin-reportes.html.
// Amounts are cents (formatCop). Demo: Septiembre 2026 income 3.380.000, payments 300.000, expenses 500.000, refunds 0, total 2.580.000.
const peso = (n: number) => n * 100;
const SEP: MonthlyPeriod = {
  reportedPeriod: '2026-09', periodIncome: peso(3380000), operationalPayments: peso(300000), operationalExpenses: peso(500000),
  executedRefunds: 0, consolidatedCashTotal: peso(2580000), registeredCancellations: 2, registeredOperationalCosts: peso(480000),
};
const AUG: MonthlyPeriod = {
  reportedPeriod: '2026-08', periodIncome: peso(800000), operationalPayments: 0, operationalExpenses: 0,
  executedRefunds: 0, consolidatedCashTotal: peso(800000), registeredCancellations: 0, registeredOperationalCosts: 0,
};
const ZERO: MonthlyPeriod = { ...AUG, reportedPeriod: '2026-09', periodIncome: 0, consolidatedCashTotal: 0 };
const SUMMARY: PeriodSummary = { reportedPeriod: '2026-09', confirmedSales: peso(4150000), periodIncome: peso(3380000), registeredOperationalCosts: peso(480000), registeredCancellations: 2 };
const DAY: DailyDashboard = { reportDate: '2026-09-03', createdReservations: 12, pendingPaymentReservations: 6, confirmedReservations: 18, confirmedWithBalance: 3, cancelledReservations: 2, upcomingServices: 4 };
const flat = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

class FixedMonthly extends MonthlyReportSource {
  constructor(private readonly list: readonly MonthlyPeriod[]) { super(); }
  override periods(): Promise<readonly MonthlyPeriod[]> { return Promise.resolve(this.list); }
}
class MonthlyDouble extends MonthlyReportSource {
  readonly reads: { resolve: (list: readonly MonthlyPeriod[]) => void; reject: (error: unknown) => void }[] = [];
  override periods(): Promise<readonly MonthlyPeriod[]> { return new Promise((resolve, reject) => this.reads.push({ resolve, reject })); }
}
class FixedSummary extends PeriodSummarySource {
  constructor(private readonly summary: PeriodSummary) { super(); }
  override current(): Promise<PeriodSummary> { return Promise.resolve(this.summary); }
}
class SummaryDouble extends PeriodSummarySource {
  readonly reads: { resolve: (summary: PeriodSummary) => void; reject: (error: unknown) => void }[] = [];
  override current(): Promise<PeriodSummary> { return new Promise((resolve, reject) => this.reads.push({ resolve, reject })); }
}
class FixedDay extends DailyDashboardSource { override today(): Promise<DailyDashboard> { return Promise.resolve(DAY); } }

@Component({ selector: 'csh-test-cash', template: '<h1>Caja</h1>' })
class FakeCash {}

afterEach(() => { TestBed.resetTestingModule(); history.replaceState({}, '', '/'); });

async function settle(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
}

const BLOCKS: Provider[] = [
  { provide: REPORTS_MONTHLY_BLOCKS, useValue: PeriodSummaryComponent, multi: true },
  { provide: REPORTS_MONTHLY_BLOCKS, useValue: MonthlyReportComponent, multi: true },
];

async function renderPage(monthly: MonthlyReportSource, summary: PeriodSummarySource, extra: Provider[] = []) {
  TestBed.configureTestingModule({ providers: [
    { provide: DailyDashboardSource, useValue: new FixedDay() }, { provide: MonthlyReportSource, useValue: monthly },
    { provide: PeriodSummarySource, useValue: summary }, ...BLOCKS, ...extra] });
  const fixture = TestBed.createComponent(ReportsPageComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, fixture, settle: () => settle(fixture), text: () => flat(host.textContent) };
}

async function shellAs(roles: string[], providers: Provider[] = [...demoSources({ request: vi.fn() }) as Provider[]]) {
  TestBed.configureTestingModule({ providers: [{ provide: PortalActor, useValue: PortalActor.from(roles) }, ...providers] });
  const fixture = TestBed.createComponent(PortalShellComponent);
  await settle(fixture);
  const host: HTMLElement = fixture.nativeElement;
  return { host, fixture, settle: () => settle(fixture) };
}

const article = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('article')).find((a) => flat(a.querySelector('p')?.textContent) === 'Reporte mensual')!;
const entries = (host: HTMLElement) => Array.from(article(host).querySelectorAll('section.csh-monthly-period'));
const fields = (entry: Element) => Array.from(entry.querySelectorAll('dl > div')).map((row) => [flat(row.querySelector('dt')?.textContent), flat(row.querySelector('dd')?.textContent)]);
const metrics = (host: HTMLElement) => Array.from(host.querySelectorAll('.csh-monthly-summary dl > div')).map((row) => Array.from(row.children).map((c) => flat(c.textContent)));

const LABELS = ['Ingresos del período', 'Pagos operacionales del período', 'Gastos del período', 'Devoluciones efectivamente realizadas',
  'Total consolidado de caja del período', 'Cancelaciones registradas en el período', 'Costos operacionales registrados en el período'];

describe('everyMonthlyViewShowsOneOfTheFourStates', () => {
  it('shows loading, then an error with "Reintentar" that loads again, then the periods, in the article', async () => {
    const monthly = new MonthlyDouble();
    const { host, settle: again } = await renderPage(monthly, new FixedSummary(SUMMARY));
    expect(flat(article(host).querySelector('[data-state="loading"]')?.textContent)).toBe('Cargando…');
    monthly.reads[0].reject(new Error('down')); await again();
    expect(flat(article(host).querySelector('[role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
    (Array.from(article(host).querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Reintentar') as HTMLElement).click(); await again();
    expect(monthly.reads.length).toBe(2);
    monthly.reads[1].resolve([SEP]); await again();
    expect(entries(host).length).toBe(1);
  });

  it('shows loading, an error with "Reintentar" and then the four values, in the summary row', async () => {
    const summary = new SummaryDouble();
    const { host, settle: again } = await renderPage(new FixedMonthly([SEP]), summary);
    expect(flat(host.querySelector('.csh-monthly-summary [data-state="loading"]')?.textContent)).toBe('Cargando…');
    summary.reads[0].reject(new Error('down')); await again();
    expect(flat(host.querySelector('.csh-monthly-summary [role="alert"]')?.textContent)).toContain('No se pudo completar la solicitud.');
    (Array.from(host.querySelectorAll('.csh-monthly-summary button')).find((b) => b.textContent?.trim() === 'Reintentar') as HTMLElement).click(); await again();
    summary.reads[1].resolve(SUMMARY); await again();
    expect(metrics(host).length).toBe(4);
  });

  it('shows the empty text of the mockup when the source has no period', async () => {
    const { host } = await renderPage(new FixedMonthly([]), new FixedSummary(SUMMARY));
    expect(flat(article(host).querySelector('[data-state="empty"]')?.textContent)).toBe('Aún no hay movimientos de caja registrados para consolidar el reporte mensual.');
  });

  it('the newest load wins and the port is asked once, with no argument', async () => {
    const monthly = new MonthlyDouble();
    const periods = vi.spyOn(monthly, 'periods');
    const { host, fixture, settle: again } = await renderPage(monthly, new FixedSummary(SUMMARY));
    fixture.debugElement.query((d) => d.componentInstance instanceof MonthlyReportComponent).componentInstance.reload();
    await again();
    monthly.reads[1].resolve([AUG]); await again();
    monthly.reads[0].resolve([SEP]); await again();
    expect(entries(host).map((e) => flat(e.querySelector('h3')?.textContent))).toEqual(['Agosto 2026']);
    expect(periods.mock.calls.every((call) => call.length === 0)).toBe(true);
  });
});

describe('eachPeriodShowsItsEightFieldsWithTheMockupLabels', () => {
  it('writes the period and the seven lines of the mockup, in order, with the amounts as $1.234.567', async () => {
    const { host } = await renderPage(new FixedMonthly([SEP]), new FixedSummary(SUMMARY));
    const [entry] = entries(host);
    expect(flat(entry.querySelector('p')?.textContent)).toBe('Período reportado');
    expect(fields(entry)).toEqual(LABELS.map((label, i) => [label, ['$3.380.000', '$300.000', '$500.000', '$0', '$2.580.000', '2', '$480.000'][i]]));
    expect(entry.querySelector('dl')).not.toBeNull();
    expect(entry.getAttribute('aria-labelledby')).toBe(entry.querySelector('h3')?.id);
  });

  it('draws the heading of the article and the way to the cash of the mockup copy', async () => {
    const { host } = await renderPage(new FixedMonthly([SEP]), new FixedSummary(SUMMARY));
    expect(Array.from(article(host).querySelectorAll(':scope > p, :scope > h2')).map((e) => flat(e.textContent))).toEqual([
      'Reporte mensual', 'Control económico',
      'Se calcula con los movimientos de caja del mes (ingresos, pagos operacionales, gastos y devoluciones efectivamente realizadas), sin volver a sumar los cierres diarios ni la base.']);
  });
});

describe('theConsolidatedTotalAddsNoDailyBase', () => {
  const CLOSURES: CashMovement[] = [
    { id: 'b1', date: '2026-09-01', kind: 'base', amount: peso(300000) }, { id: 'i1', date: '2026-09-01', kind: 'income', amount: peso(1000000) },
    { id: 'b2', date: '2026-09-02', kind: 'base', amount: peso(300000) }, { id: 'i2', date: '2026-09-02', kind: 'income', amount: peso(500000) },
    { id: 'p1', date: '2026-09-02', kind: 'operational-payment', amount: peso(100000) }, { id: 'e1', date: '2026-09-02', kind: 'expense', amount: peso(50000) },
    { id: 'r1', date: '2026-09-02', kind: 'refund', amount: peso(25000) },
  ];

  it('is income minus payments, expenses and executed refunds, with the two bases of 300.000 left out', () => {
    const [sep] = consolidate(CLOSURES);
    expect(sep).toMatchObject({ reportedPeriod: '2026-09', periodIncome: peso(1500000), operationalPayments: peso(100000), operationalExpenses: peso(50000), executedRefunds: peso(25000) });
    expect(sep.consolidatedCashTotal).toBe(peso(1325000));
  });

  it('counts a movement once even when two sources report it', () => {
    const twice = [...CLOSURES, { ...CLOSURES[1] }, { ...CLOSURES[5] }];
    expect(consolidate(twice)).toEqual(consolidate(CLOSURES));
  });

  it('lists the periods newest first and takes the registered cancellations and costs of each', () => {
    const list = consolidate([{ id: 'a', date: '2026-08-31', kind: 'income', amount: 100 }, { id: 'b', date: '2026-09-01', kind: 'income', amount: 200 }], { '2026-09': { cancellations: 2, costs: 500 } });
    expect(list.map((p) => p.reportedPeriod)).toEqual(['2026-09', '2026-08']);
    expect(list[0]).toMatchObject({ registeredCancellations: 2, registeredOperationalCosts: 500 });
    expect(list[1]).toMatchObject({ registeredCancellations: 0, registeredOperationalCosts: 0 });
  });

  it('the demo answers Septiembre 2026 with 2.580.000, not 3.180.000, and Agosto 2026 with 800.000', async () => {
    const list = await new DemoMonthlyReportSource().periods();
    expect(list).toEqual([SEP, AUG]);
  });
});

describe('periodsAreListedNewestFirstAsSeptiembre2026', () => {
  it('writes each period as the month in full, in the order the source gave', async () => {
    const { host } = await renderPage(new FixedMonthly([SEP, AUG]), new FixedSummary(SUMMARY));
    expect(entries(host).map((e) => flat(e.querySelector('h3')?.textContent))).toEqual(['Septiembre 2026', 'Agosto 2026']);
    expect(flat(article(host).textContent)).not.toContain('2026-09');
  });
});

describe('aPeriodWithoutMovementsIsShownInZeroWithoutError', () => {
  it('shows the period with $0 and 0, with no empty text and no error', async () => {
    const { host } = await renderPage(new FixedMonthly([ZERO]), new FixedSummary({ ...SUMMARY, confirmedSales: 0, periodIncome: 0, registeredOperationalCosts: 0, registeredCancellations: 0 }));
    expect(fields(entries(host)[0]).map(([, value]) => value)).toEqual(['$0', '$0', '$0', '$0', '$0', '0', 'Sin costos operacionales registrados']);
    expect(host.querySelector('[data-state="empty"], [role="alert"], [data-state="loading"]')).toBeNull();
    expect(metrics(host).map((m) => m[1])).toEqual(['$0', '$0', '$0', '0']);
  });

  it('the demo lists the month of the report date in zeros for the fixture empty-period, and an error for failing-monthly', async () => {
    history.replaceState({}, '', '/?demoFixtures=empty-period');
    const monthly = new DemoMonthlyReportSource();
    expect(await monthly.periods()).toEqual([ZERO]);
    expect(await new DemoPeriodSummarySource(monthly).current()).toEqual({ reportedPeriod: '2026-09', confirmedSales: 0, periodIncome: 0, registeredOperationalCosts: 0, registeredCancellations: 0 });
    history.replaceState({}, '', '/?demoFixtures=failing-monthly');
    await expect(monthly.periods()).rejects.toBeTruthy();
    await expect(new DemoPeriodSummarySource(monthly).current()).rejects.toBeTruthy();
  });
});

describe('noOperationalCostSaysSinCostosOperacionalesRegistrados', () => {
  it('says it for August and shows the amount for September', async () => {
    const { host } = await renderPage(new FixedMonthly([SEP, AUG]), new FixedSummary(SUMMARY));
    expect(fields(entries(host)[1])[6]).toEqual(['Costos operacionales registrados en el período', 'Sin costos operacionales registrados']);
    expect(fields(entries(host)[0])[6]).toEqual(['Costos operacionales registrados en el período', '$480.000']);
  });
});

describe('summaryRowShowsTheFourValuesOfThePeriod', () => {
  it('writes the four labels, values and notes of the mockup over the seeded September', async () => {
    const { host } = await renderPage(new FixedMonthly([SEP]), new FixedSummary(SUMMARY));
    expect(metrics(host)).toEqual([
      ['Ventas confirmadas', '$4.150.000', 'Valor comercial confirmado'], ['Ingresos del período', '$3.380.000', 'Dinero recibido o validado en caja'],
      ['Costos operacionales', '$480.000', 'Servicios ejecutados'], ['Cancelaciones', '2', 'Con causal registrada']]);
  });

  it('shows what the source gives: the view computes none', async () => {
    const odd = { ...SUMMARY, confirmedSales: peso(1), periodIncome: peso(9), registeredOperationalCosts: peso(7), registeredCancellations: 5 };
    const { host } = await renderPage(new FixedMonthly([SEP]), new FixedSummary(odd));
    expect(metrics(host).map((m) => m[1])).toEqual(['$1', '$9', '$7', '5']);
  });

  it('is drawn above the dashboard, and holds no Exportar, CSV, PDF or note about exporting', async () => {
    const { host, text } = await renderPage(new FixedMonthly([SEP]), new FixedSummary(SUMMARY));
    expect(host.querySelector('.csh-monthly-summary')).not.toBeNull();
    expect(text()).not.toMatch(/Exportar|CSV|PDF|solo de consulta|revisar y exportar/);
    expect(host.querySelector('header button, header a')).toBeNull();
  });

  it('the demo summary is the income, costs and cancellations of the newest period plus the seeded sales', async () => {
    expect(await new DemoPeriodSummarySource(new DemoMonthlyReportSource()).current()).toEqual(SUMMARY);
  });
});

describe('reportArticleShowsTheSamePeriodsAsTheConsolidation', () => {
  it('draws the periods of the one port, the same entries the consolidation will draw', async () => {
    const source = new DemoMonthlyReportSource();
    const { host } = await renderPage(source, new DemoPeriodSummarySource(source));
    const list = await source.periods();
    expect(entries(host).map((e) => flat(e.querySelector('h3')?.textContent))).toEqual(['Septiembre 2026', 'Agosto 2026']);
    expect(entries(host).map((e) => fields(e)[4][1])).toEqual(list.map((p) => `$${String(p.consolidatedCashTotal / 100).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`));
  });
});

describe('irACajaOpensTheCash', () => {
  const link = (host: HTMLElement) => Array.from(host.querySelectorAll<HTMLElement>('[role="link"]')).find((l) => l.textContent?.trim() === 'Ir a caja');
  const withCash = [{ provide: PORTAL_AREA_LIST, useValue: [...PORTAL_AREAS, { key: 'cash', label: 'Caja', component: FakeCash }] }];

  it('opens the area Caja of this portal by click and by Enter', async () => {
    const { host, settle: again } = await shellAs(['MANAGER'], [...demoSources({ request: vi.fn() }) as Provider[], ...withCash]);
    expect(link(host)!.getAttribute('tabindex')).toBe('0');
    link(host)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await again();
    expect(host.querySelector('main h1')?.textContent?.trim()).toBe('Caja');
  });

  it('is not drawn while the build has no area Caja', async () => {
    const { host } = await shellAs(['MANAGER']);
    expect(link(host)).toBeUndefined();
    expect(flat(host.textContent)).not.toContain('Ir a caja');
  });
});

describe('optionalRolesReadTheReportWithNoAction', () => {
  it.each(['TENANT_ADMINISTRATOR', 'OPERATIONAL_COLLABORATOR', 'MANAGER', 'ACCOUNTANT', 'ANALYST'])('%s sees the summary and the periods and no button in the content area', async (role) => {
    const { host, settle: again } = await shellAs([role]);
    const content = host.querySelector('main') as HTMLElement;
    await vi.waitFor(async () => { await again(); expect(metrics(content).length).toBe(4); });
    expect(metrics(content).map((m) => m[1])).toEqual(['$4.150.000', '$3.380.000', '$480.000', '2']);
    expect(entries(content).length).toBe(2);
    expect(content.querySelectorAll('button, input, select, textarea, form').length).toBe(0);
  });
});

describe('finalCustomerGetsNoReportOrConsolidation', () => {
  it.each([['a Cliente final', ['FINAL_CUSTOMER']], ['an unknown role', ['SUPPLIER']], ['no role', []]])('offers nothing to %s', async (_who, roles) => {
    const { host } = await shellAs(roles);
    expect(host.querySelectorAll('nav, main, h1, article, .csh-monthly-summary').length).toBe(0);
  });

  it('only the demo build registers the sources and the two blocks; the area has no monthly block without them', async () => {
    const providers = demoSources({ request: vi.fn() }) as { provide: unknown; useValue?: unknown }[];
    expect(providers.map((p) => p.provide)).toEqual(expect.arrayContaining([MonthlyReportSource, PeriodSummarySource, REPORTS_MONTHLY_BLOCKS]));
    expect(providers.filter((p) => p.provide === REPORTS_MONTHLY_BLOCKS).map((p) => p.useValue)).toEqual([PeriodSummaryComponent, MonthlyReportComponent]);
    expect(monthlyReportDemoProviders().length).toBe(4);
    const { host } = await shellAs(['MANAGER'], [{ provide: DailyDashboardSource, useValue: new FixedDay() }]);
    expect(host.querySelector('.csh-monthly-summary')).toBeNull();
  });
});

describe('monthlyTextsAreSpanishWithAccentsAndNoRawCodes', () => {
  it('writes the report in Spanish with accents and shows no field name, code or placeholder', async () => {
    const { text } = await renderPage(new FixedMonthly([SEP, AUG]), new FixedSummary(SUMMARY));
    for (const word of ['Período', 'Devoluciones efectivamente realizadas', 'Cancelaciones', 'económico', 'Dinero recibido o validado en caja']) { expect(text()).toContain(word); }
    expect(text()).not.toMatch(/periodIncome|operationalPayments|consolidatedCashTotal|registered[A-Z]|confirmedSales|[A-Z]{3,}_[A-Z_]+|undefined|NaN|null|\[object/);
  });

  it('keeps the texts in the copy files, not in the templates', () => {
    expect(readFileSync('src/app/reports/reports-copy.ts', 'utf8')).toContain('Control económico');
    expect(readFileSync('src/app/shared/monthly-period-copy.ts', 'utf8')).toContain('Sin costos operacionales registrados');
    for (const file of ['src/app/reports/components/monthly-report.component.ts', 'src/app/reports/components/period-summary.component.ts', 'src/app/shared/monthly-period.component.ts']) {
      const template = /template:\s*`([\s\S]*?)`/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
      expect(template.replace(/\{\{[^}]*\}\}|<[^>]*>|@\w+[^\n{<]*\{?|[{}]/g, '').trim(), file).toBe('');
    }
  });

  it('keeps role names, arithmetic and the demo out of the monthly views and imports only shared/ and public ports', () => {
    const files = ['src/app/reports/components/monthly-report.component.ts', 'src/app/reports/components/period-summary.component.ts', 'src/app/shared/monthly-period.component.ts', 'src/app/cash/data/monthly-report-source.ts', 'src/app/reports/data/period-summary-source.ts'];
    expect(listSourceFiles()).toEqual(expect.arrayContaining(files));
    for (const file of files) {
      const code = withoutComments(readFileSync(file, 'utf8'));
      expect(code, file).not.toMatch(/TENANT_ADMINISTRATOR|OPERATIONAL_COLLABORATOR|MANAGER|ACCOUNTANT|ANALYST|FINAL_CUSTOMER/);
      expect(code, file).not.toMatch(/\/demo\//);
      expect(code, file).not.toMatch(/Exportar|\bCSV\b|\bPDF\b|Blob|createObjectURL/);
    }
  });
});
