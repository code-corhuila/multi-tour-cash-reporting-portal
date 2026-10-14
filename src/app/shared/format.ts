/** Formats of the authorized screens (12-ux-ui section 3, plan D-06). Pure: the source gives dates and times in the tenant's time zone. */
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'] as const;

/** Cents as the mockup writes pesos: `$1.290.000`, a negative `-$250.000` (formatSignedCOP, app.js:5026). */
export function formatCop(cents: number): string {
  const pesos = Math.round(Math.abs(cents) / 100);
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cents < 0 && pesos > 0 ? '-' : ''}$${grouped}`;
}

/** `2026-09-03` (or an ISO date-time) to `03 sep 2026`; any other text is returned as it came. */
export function formatDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  const month = match ? MONTHS[Number(match[2]) - 1] : undefined;
  return match && month ? `${match[3]} ${month} ${match[1]}` : isoDate;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const;

/** `2026-09-03` (or an ISO date-time) to `Septiembre 2026`, the month of a report (screen 16); any other text is returned as it came. */
export function formatMonth(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate);
  const month = match ? MONTH_NAMES[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : isoDate;
}

/** `2026-09-03T09:20:00` to `09:20`; any other text is returned as it came. */
export function formatHour(isoDateTime: string): string { return /T(\d{2}:\d{2})/.exec(isoDateTime)?.[1] ?? isoDateTime; }

/** `2026-09-03T18:05:00` to `03 sep 2026 · 18:05`; a date alone stays a date. */
export function formatDateTime(isoDateTime: string): string {
  const hour = formatHour(isoDateTime);
  return hour === isoDateTime ? formatDate(isoDateTime) : `${formatDate(isoDateTime)} · ${hour}`;
}
