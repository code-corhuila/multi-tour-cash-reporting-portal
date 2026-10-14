import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_STATE_COPY, PageLoad, PageState, PageStateComponent } from '../src/app/shared/page-state';

// AC-CJ.12 and plan D-07 (Annex H, norm 5.3.8): every screen shows loading, error with retry, empty or data,
// never a blank; the newest request wins over an older answer that arrives late.
afterEach(() => TestBed.resetTestingModule());

@Component({
  selector: 'csh-test-screen',
  imports: [PageStateComponent],
  template: '<csh-page-state [state]="state()" emptyText="Aún no hay movimientos registrados en la jornada."><p class="rows">{{ count() }} filas</p></csh-page-state>',
})
class ScreenDouble {
  readonly state = signal<PageState<string>>({ kind: 'loading' });
  readonly count = () => { const s = this.state(); return s.kind === 'data' ? s.items.length : 0; };
}

async function screen() {
  const fixture = TestBed.createComponent(ScreenDouble);
  const settle = async () => { fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  await settle();
  const host: HTMLElement = fixture.nativeElement;
  const shown = () => ({ state: host.querySelector('[data-state]')?.getAttribute('data-state'), text: host.textContent?.trim() });
  return { host, settle, shown, set: async (state: PageState<string>) => { fixture.componentInstance.state.set(state); await settle(); } };
}

describe('everyCashScreenShowsOneOfTheFourStates', () => {
  it('draws loading as a status with "Cargando…"', async () => {
    const { host, shown } = await screen();
    expect(shown()).toEqual({ state: 'loading', text: 'Cargando…' });
    expect(host.querySelector('[role="status"]')?.textContent?.trim()).toBe(PAGE_STATE_COPY.loading);
  });

  it('draws an error as an alert with "Reintentar", which calls the retry of the state', async () => {
    const { host, set, shown } = await screen();
    let retried = 0;
    await set({ kind: 'error', retry: () => { retried += 1; } });
    expect(shown().state).toBe('error');
    expect(host.querySelector('[role="alert"]')?.textContent?.trim()).toBe('No se pudo completar la solicitud.');
    const retry = host.querySelector<HTMLButtonElement>('button[type="button"]')!;
    expect(retry.textContent?.trim()).toBe('Reintentar');
    retry.click();
    expect(retried).toBe(1);
  });

  it('draws empty with the text of its screen, and the data only in the data state', async () => {
    const { set, shown } = await screen();
    await set({ kind: 'empty' });
    expect(shown()).toEqual({ state: 'empty', text: 'Aún no hay movimientos registrados en la jornada.' });
    await set({ kind: 'data', items: ['a', 'b'] });
    expect(shown()).toEqual({ state: 'data', text: '2 filas' });
  });
});

describe('theNewestRequestWins', () => {
  it('goes loading, then data or empty by what the source answers', () => {
    const load = new PageLoad<string>();
    const first = new Subject<readonly string[]>();
    load.run(() => first);
    expect(load.state().kind).toBe('loading');
    first.next(['a']);
    expect(load.state()).toEqual({ kind: 'data', items: ['a'] });
    const second = new Subject<readonly string[]>();
    load.run(() => second);
    second.next([]);
    expect(load.state()).toEqual({ kind: 'empty' });
  });

  it('drops the answer of an older request that arrives after a newer one', () => {
    const load = new PageLoad<string>();
    const older = new Subject<readonly string[]>();
    const newer = new Subject<readonly string[]>();
    load.run(() => older);
    load.run(() => newer);
    newer.next(['nuevo']);
    older.next(['viejo']);
    older.error(new Error('late'));
    expect(load.state()).toEqual({ kind: 'data', items: ['nuevo'] });
  });

  it('turns a failure into an error whose retry repeats the same request, and stops listening when stopped', () => {
    const load = new PageLoad<string>();
    let calls = 0;
    let answer = new Subject<readonly string[]>();
    load.run(() => { calls += 1; answer = new Subject(); return answer; });
    answer.error(new Error('down'));
    const failed = load.state();
    expect(failed.kind).toBe('error');
    if (failed.kind === 'error') failed.retry();
    expect(calls).toBe(2);
    expect(load.state().kind).toBe('loading');
    load.stop();
    answer.next(['tarde']);
    expect(load.state().kind).toBe('loading');
  });
});
