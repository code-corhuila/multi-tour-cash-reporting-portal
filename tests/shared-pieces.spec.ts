import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { Clock } from '../src/app/shared/clock';
import { focusFirstError, focusHeading } from '../src/app/shared/focus';
import { IdempotencyKeys, IntentionKey } from '../src/app/shared/idempotency-keys';

afterEach(() => { TestBed.resetTestingModule(); document.body.replaceChildren(); });

/** Keys a test can follow: key-1, key-2, ... */
class CountingKeys extends IdempotencyKeys {
  private count = 0;
  override generate(): string { this.count += 1; return `key-${this.count}`; }
}

// Plan D-07: one key per intention (a movement, a base change, a closing, a correction), reused on a retry of the same data.
describe('oneIdempotencyKeyPerIntention', () => {
  it('reuses the key while the same data is retried, and makes a new one for other data or after it settled', () => {
    const intention = new IntentionKey(new CountingKeys());
    const movement = { movementType: 'OPERATIONAL_PAYMENT', concept: 'Transporte guía', amount: 10_000_000 };
    expect(intention.keyFor(movement)).toBe('key-1');
    expect(intention.keyFor({ ...movement })).toBe('key-1');
    expect(intention.keyFor({ ...movement, amount: 20_000_000 })).toBe('key-2');
    intention.settled();
    expect(intention.keyFor({ ...movement, amount: 20_000_000 })).toBe('key-3');
  });

  it('runs with UUID keys, inside the 8 to 128 characters a key header accepts', () => {
    const key = TestBed.inject(IdempotencyKeys).generate();
    expect(key).toMatch(/^[0-9a-f-]{36}$/);
    expect(TestBed.inject(IdempotencyKeys).generate()).not.toBe(key);
  });
});

describe('theClockThePortsRead', () => {
  it('reads the system time unless a build provides its own clock', () => {
    const before = Date.now();
    const now = TestBed.inject(Clock).now();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

// Plan pillar 7 (Annex H, NFR-008): a refused form focuses its first field in error; an opened area its h1.
describe('focusHelpers', () => {
  it('focuses the first field marked invalid, and answers false when none is', () => {
    const form = document.createElement('form');
    form.innerHTML = '<input id="tipo"><input id="concepto" aria-invalid="true"><input id="valor" aria-invalid="true">';
    document.body.append(form);
    expect(focusFirstError(form)).toBe(true);
    expect(document.activeElement?.id).toBe('concepto');
    form.querySelectorAll('input').forEach((input) => input.removeAttribute('aria-invalid'));
    expect(focusFirstError(form)).toBe(false);
  });

  it('focuses the h1 of an area, focusable by script only, and answers false without one', () => {
    const area = document.createElement('section');
    area.innerHTML = '<h1>Caja</h1>';
    document.body.append(area);
    expect(focusHeading(area)).toBe(true);
    expect(document.activeElement?.tagName).toBe('H1');
    expect(area.querySelector('h1')?.getAttribute('tabindex')).toBe('-1');
    expect(focusHeading(document.createElement('div'))).toBe(false);
  });
});
