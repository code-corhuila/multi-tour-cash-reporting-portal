import { CashDayStatus, CashMovementType, CashPaymentMedium } from './data/cash-day-source';

/** Texts of screen 14, admin-caja.html (spec section 5); the states are the shared ones of the base. */
export const CASH_COPY = Object.freeze({
  areaLabel: 'Caja',
  eyebrow: 'Control diario',
  title: 'Caja',
  accessNote: 'Cada tenant tiene una única caja por día calendario, que consolida todos los medios de pago. La abre, cierra y reabre el Administrador del tenant o un usuario con el permiso Gestionar caja (la reapertura exige motivo y queda auditada). La base representa solo efectivo físico y solo el Administrador del tenant puede modificarla.',
  headline: (expectedCash: string) => `Efectivo esperado al cierre: ${expectedCash}.`,
  headlineNoCash: 'Efectivo esperado al cierre: no aplica (caja sin efectivo).',
  headlineNoDay: 'La caja de hoy todavía no existe.',
  consolidated: (total: string, base: string) => `Total consolidado de la jornada (todos los medios): ${total}${base === '' ? '' : ` · incluye la base de ${base}`}.`,
  notApplicable: 'No aplica',
  opened: (by: string) => `Apertura operativa${by === '' ? '' : ` por ${by}`}. La base representa solo efectivo físico; el efectivo esperado al cierre es la base más las entradas en efectivo menos las salidas en efectivo.`,
  status: { OPEN_OPERATIVE: 'Jornada abierta', OPEN_AUTOMATIC: 'Abierta · creación automática', NO_OPENING: 'Sin apertura', CLOSED: 'Jornada cerrada' } satisfies Record<CashDayStatus, string>,
  originNote: {
    NO_OPENING: 'No hay apertura operativa ni movimientos no efectivos hoy. Ábrela con la base del día para registrar efectivo; un movimiento no efectivo (transferencia validada) crea la caja automáticamente, sin base.',
    OPEN_AUTOMATIC: 'Caja creada automáticamente por un movimiento no efectivo: no tiene base ni apertura física y no modifica el efectivo esperado. Para registrar efectivo debe pasar por la apertura operativa; si no la tiene, se cierra sola al finalizar el día con cierre automático auditado.',
    CLOSED: 'La caja está cerrada. Un movimiento en efectivo exige reabrirla con motivo; las transferencias validadas hoy se registran como movimientos no efectivos posteriores al cierre, sin reabrirla.',
  } satisfies Partial<Record<CashDayStatus, string>>,
  metrics: {
    base: ['Base inicial', 'Efectivo físico de apertura'],
    income: ['Ingresos', 'Dinero efectivamente recibido (efectivo y transferencias validadas)'],
    payments: ['Pagos operacionales', 'Obligaciones operativas del día'],
    expenses: ['Gastos', 'Salidas administrativas o menores'],
    refunds: ['Devoluciones', 'Salida efectiva de dinero ejecutada hoy'],
    expected: ['Efectivo esperado', 'Base + entradas en efectivo - salidas en efectivo'],
    transfers: ['Transferencias netas', 'Se concilian aparte; no modifican el efectivo esperado'],
  },
  base: {
    action: 'Ajustar base diaria', eyebrow: 'Ajuste', title: 'Ajustar base diaria', label: 'Nueva base diaria', note: 'Registra la nueva base diaria parametrizada para hoy.',
    cancel: 'Cancelar', save: 'Guardar base diaria', invalid: 'Registra una base diaria válida.', saved: 'Base diaria actualizada correctamente.',
    refused: 'La base solo se ajusta con la caja abierta con apertura operativa.', failed: 'No se pudo completar la solicitud.',
  },
  movementsEyebrow: 'Movimientos',
  movementsTitle: 'Registro de la jornada',
  columns: ['Hora', 'Tipo', 'Concepto', 'Medio', 'Valor', 'Responsable'],
  noMovements: 'Sin movimientos registrados hoy.',
  afterClosing: 'Posterior al cierre',
  types: { INCOME: 'Ingreso', OPERATIONAL_PAYMENT: 'Pago operacional', EXPENSE: 'Gasto', REFUND: 'Devolución' } satisfies Record<CashMovementType, string>,
  mediums: { CASH: 'Efectivo', TRANSFER: 'Transferencia' } satisfies Record<CashPaymentMedium, string>,
  consultationEyebrow: 'Consulta',
  consultationTitle: 'Historial y consolidación',
});
