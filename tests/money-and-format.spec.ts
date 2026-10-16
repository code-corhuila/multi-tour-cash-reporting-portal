import { describe, expect, it } from 'vitest';
import { formatCop, formatDate, formatDateTime, formatHour } from '../src/app/shared/format';
import { centsFromPesos, parseMoney } from '../src/app/shared/money';

// Plan D-06 and AC-CJ.12: "Valor" and "Nueva base diaria" are typed as text and read in cents, never as
// Number(x) * 100; the screens write pesos, dates and hours as 12-ux-ui section 3 and the mockup do.
describe('amountTextIsReadInCents', () => {
  it.each([
    ['0.07', 7], ['100000', 10_000_000], ['400000', 40_000_000], ['1290000', 129_000_000], ['12.5', 1_250], [' 300000 ', 30_000_000], ['0', 0],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseMoney(text)).toEqual({ kind: 'valid', minorUnits: cents });
  });

  it.each([
    ['', 'empty'], ['   ', 'empty'], ['-1', 'negative'], ['12.500', 'too-many-decimals'], ['1,234', 'format'],
    ['$300.000', 'format'], ['1e5', 'format'], ['abc', 'format'], ['99999999999999999', 'out-of-range'],
  ])('refuses %j (%s) instead of guessing', (text, reason) => {
    expect(parseMoney(text)).toEqual({ kind: 'invalid', reason });
  });
});

// Pillar 2: a seeded whole-peso amount is turned into cents by text, never by a float product.
describe('wholePesosAreConvertedToCentsWithoutFloatProducts', () => {
  it.each([[0, 0], [7677400, 767_740_000], [1, 100], [90_071_992_547_409, 9_007_199_254_740_900]])('reads %i pesos as %i cents', (pesos, cents) => {
    expect(centsFromPesos(pesos)).toBe(cents);
  });

  it.each([[1.5], [0.07], [-3], [Number.NaN], [Number.MAX_SAFE_INTEGER]])('refuses %s instead of rounding it', (pesos) => {
    expect(() => centsFromPesos(pesos)).toThrow(RangeError);
  });
});

describe('formatsOfTheAuthorizedScreens', () => {
  it('writes cents as the mockup writes pesos, a negative with its sign before the symbol', () => {
    expect(formatCop(129_000_000)).toBe('$1.290.000');
    expect(formatCop(30_000_000)).toBe('$300.000');
    expect(formatCop(-25_000_000)).toBe('-$250.000');
    expect(formatCop(0)).toBe('$0');
    expect(formatCop(-49)).toBe('$0');
  });

  it('writes the date, the date and time, and the hour the source gives in the tenant time zone', () => {
    expect(formatDate('2026-09-03')).toBe('03 sep 2026');
    expect(formatDate('2026-08-31T23:59:00')).toBe('31 ago 2026');
    expect(formatDateTime('2026-09-03T18:05:00')).toBe('03 sep 2026 · 18:05');
    expect(formatHour('2026-09-03T09:20:00')).toBe('09:20');
  });

  it('returns any other text as it came, never an invented date', () => {
    expect(formatDate('pendiente')).toBe('pendiente');
    expect(formatDateTime('2026-09-03')).toBe('03 sep 2026');
    expect(formatHour('sin hora')).toBe('sin hora');
  });
});
