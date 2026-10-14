import { CashClosingMode } from './data/cash-closures-source';
import { CashOrigin } from './data/cash-day-source';

/** Texts of the sub-screens of screen 14, admin-historial-caja.html and admin-consolidacion-mensual.html (specs 001- and 003- section 5). */
export const CASH_CONSULTATION_COPY = Object.freeze({
  historyLink: 'Historial de caja',
  monthlyLink: 'Consolidación mensual',
  back: 'Volver a caja',
  history: {
    eyebrow: 'Control diario',
    title: 'Historial de caja',
    note: 'Todo cierre queda conservado sin borrarse, con sus aperturas, reaperturas y movimientos. Una corrección posterior al cierre solo puede registrarla el Administrador del tenant, con justificación obligatoria y trazabilidad, y nunca sobrescribe los valores originales del cierre. Las cajas creadas automáticamente por movimientos no efectivos y sin apertura operativa se cierran solas al finalizar el día.',
    empty: 'Aún no se han registrado cierres de caja.',
    closure: (date: string) => `Cierre ${date}`,
    total: 'Total',
    badge: { closed: 'Cerrado', reopened: 'Reabierto', automatic: 'Cierre automático' },
    lines: {
      base: 'Base', income: 'Ingresos', payments: 'Pagos operacionales', expenses: 'Gastos', refunds: 'Devoluciones',
      expected: 'Efectivo esperado al cierre', origin: 'Origen de la caja', closedBy: 'Cerrado por', closedAt: 'Fecha y hora de cierre',
    },
    origins: { operative: 'Apertura operativa', later: 'Creación automática con apertura operativa posterior', automatic: 'Creación automática, sin apertura operativa ni efectivo (cierre automático)' },
    reopenings: { title: 'Reaperturas', columns: ['Fecha', 'Responsable', 'Motivo'] },
    corrections: { title: 'Correcciones posteriores', columns: ['Fecha', 'Responsable', 'Justificación'], none: 'Sin correcciones registradas para este cierre.' },
    movements: { title: 'Movimientos de la jornada (cada uno se contabiliza una sola vez)', nonCash: (n: number) => `${n} movimiento(s) no efectivo(s): se concilian aparte y no modifican el efectivo esperado.` },
  },
  monthly: {
    eyebrow: 'Control económico',
    title: 'Consolidación mensual',
    note: 'El total del mes se construye con todos los movimientos individuales del período: ingresos efectivamente recibidos (efectivo y transferencias validadas), menos pagos operacionales, menos gastos y menos devoluciones efectivamente ejecutadas. Los cierres diarios no se vuelven a sumar entre sí, cada movimiento se contabiliza una sola vez y la base diaria no cuenta como ingreso nuevo del período.',
    empty: 'Aún no hay movimientos registrados para consolidar.',
  },
});

/** The origin line of a closure: an automatic closing never had cash; a late creation had an opening afterwards. */
export function originOf(mode: CashClosingMode, origin: CashOrigin): string {
  const o = CASH_CONSULTATION_COPY.history.origins;
  return mode === 'AUTOMATIC' ? o.automatic : origin === 'AUTOMATIC_CREATION' ? o.later : o.operative;
}
