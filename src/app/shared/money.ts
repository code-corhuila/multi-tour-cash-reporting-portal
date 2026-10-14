/** Why a typed amount was refused; each form maps the reason to its message. */
export type MoneyRejection = 'empty' | 'format' | 'too-many-decimals' | 'negative' | 'out-of-range';
export type MoneyParse = { readonly kind: 'valid'; readonly minorUnits: number } | { readonly kind: 'invalid'; readonly reason: MoneyRejection };

const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d+))?$/;
const MINOR_UNIT_DIGITS = 2;

/**
 * Reads the text typed in "Valor" or "Nueva base diaria" into cents (plan D-06). The digits are joined as text and only
 * then read as an integer: 0.07 * 100 is 7.000000000000001. Only the dot separates decimals and grouping is refused,
 * so "12.500" is never read as twelve thousand five hundred; beyond the safe integer it is refused, not rounded.
 */
export function parseMoney(text: string): MoneyParse {
  const typed = text.trim();
  if (typed === '') { return { kind: 'invalid', reason: 'empty' }; }
  if (typed.startsWith('-')) { return { kind: 'invalid', reason: 'negative' }; }
  const match = DECIMAL_AMOUNT.exec(typed);
  if (match === null) { return { kind: 'invalid', reason: 'format' }; }
  const [, whole, fraction = ''] = match;
  if (fraction.length > MINOR_UNIT_DIGITS) { return { kind: 'invalid', reason: 'too-many-decimals' }; }
  const minorUnits = Number(whole + fraction.padEnd(MINOR_UNIT_DIGITS, '0'));
  return Number.isSafeInteger(minorUnits) ? { kind: 'valid', minorUnits } : { kind: 'invalid', reason: 'out-of-range' };
}
