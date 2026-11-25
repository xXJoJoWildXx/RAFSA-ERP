// lib/payroll/vacaciones.ts
//
// Vacaciones y prima vacacional para agregarlas a la nómina de la semana.
//
// Tabla del artículo 76 de la LFT (reforma de Vacaciones Dignas, vigente
// desde el 1 de enero de 2023): 12 días al primer año, +2 por año hasta los
// 20 al quinto, y de ahí +2 cada cinco años.
//
// Prima vacacional: 25% sobre el salario de esos días (artículo 80). Es el
// mínimo de ley; si la empresa paga más, se cambia PRIMA_PORCENTAJE.
//
// ANTIGÜEDAD: se cuenta desde la ÚLTIMA fecha de contratación. A un
// recontratado NO se le suma el tiempo de etapas anteriores. Es una decisión
// de la empresa y va a propósito en contra de tenure_accumulated_days, que
// sí acumula y se usa para la antigüedad que se muestra en el perfil.

/** Porcentaje de prima vacacional. 25% es el mínimo del artículo 80. */
export const PRIMA_PORCENTAJE = 0.25

/** Tramos del artículo 76: desde qué año cumplido aplica cada cantidad. */
const TABLA: { desde: number; dias: number }[] = [
  { desde: 1,  dias: 12 },
  { desde: 2,  dias: 14 },
  { desde: 3,  dias: 16 },
  { desde: 4,  dias: 18 },
  { desde: 5,  dias: 20 },
  { desde: 6,  dias: 22 },
  { desde: 11, dias: 24 },
  { desde: 16, dias: 26 },
  { desde: 21, dias: 28 },
  { desde: 26, dias: 30 },
]

/** Días laborables que corresponden a una antigüedad en años cumplidos. */
export function diasPorAntiguedad(aniosCumplidos: number): number {
  if (aniosCumplidos < 1) return 0
  let dias = 0
  for (const t of TABLA) {
    if (aniosCumplidos >= t.desde) dias = t.dias
  }
  // Más de 30 años: la tabla sigue subiendo 2 días cada 5.
  if (aniosCumplidos >= 31) {
    dias = 30 + 2 * Math.floor((aniosCumplidos - 26) / 5)
  }
  return dias
}

function parseFecha(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const partes = String(iso).split("T")[0]?.split("-")
  if (!partes || partes.length !== 3) return null
  const [y, m, d] = partes.map(Number)
  if (!y || !m || !d) return null
  const f = new Date(y, m - 1, d, 12, 0, 0, 0)
  return Number.isNaN(f.getTime()) ? null : f
}

/**
 * Años cumplidos entre la contratación y la fecha de corte.
 *
 * Se cuenta por calendario, no dividiendo días entre 365: quien entró el 29
 * de febrero cumple su año el 28 de febrero del año siguiente, y con la
 * división quedaría un día corto.
 */
export function aniosCumplidos(
  hireDate: string | null | undefined,
  corte: Date = new Date(),
): number {
  const alta = parseFecha(hireDate)
  if (!alta) return 0
  const fin = new Date(corte.getFullYear(), corte.getMonth(), corte.getDate(), 12, 0, 0, 0)
  if (fin < alta) return 0

  let anios = fin.getFullYear() - alta.getFullYear()
  const cumpleEsteAnio = new Date(fin.getFullYear(), alta.getMonth(), alta.getDate(), 12, 0, 0, 0)
  if (fin < cumpleEsteAnio) anios--
  return Math.max(0, anios)
}

/**
 * Fecha del aniversario que corresponde a una antigüedad dada.
 *
 * Es la llave con la que se registra el pago: alta + años cumplidos. Un
 * recontratado tiene fecha de alta nueva, así que sus aniversarios caen en
 * otros días y no chocan con los de su etapa anterior.
 */
export function fechaAniversario(
  hireDate: string | null | undefined,
  anios: number,
): string | null {
  const alta = parseFecha(hireDate)
  if (!alta || anios < 1) return null
  const a = new Date(alta.getFullYear() + anios, alta.getMonth(), alta.getDate(), 12, 0, 0, 0)
  const mes = String(a.getMonth() + 1).padStart(2, "0")
  const dia = String(a.getDate()).padStart(2, "0")
  return `${a.getFullYear()}-${mes}-${dia}`
}

/** Cuándo vuelve a tener derecho, y con cuántos días. */
export function proximoPeriodo(
  hireDate: string | null | undefined,
  aniosActuales: number,
): { fecha: string | null; dias: number } {
  const siguiente = aniosActuales + 1
  return {
    fecha: fechaAniversario(hireDate, siguiente),
    dias: diasPorAntiguedad(siguiente),
  }
}

export type CalculoVacaciones = {
  /** Años cumplidos desde la última contratación. */
  anios: number
  /** Días laborables del artículo 76. */
  dias: number
  /** Sueldo semanal entre 7, igual que en el cálculo de aguinaldo. */
  salarioDiario: number
  /** Salario de los días de vacaciones. */
  importeVacaciones: number
  /** 25% sobre ese salario. */
  prima: number
  /** Lo que se suma a la nómina de la semana. */
  total: number
  /** Aniversario del periodo que se está pagando. Es la llave del registro. */
  aniversario: string | null
  /** Por qué no se puede calcular, si es el caso. */
  impedimento: string | null
}

/**
 * Calcula vacaciones y prima de un trabajador a una fecha de corte.
 *
 * `hireDate` debe ser la ÚLTIMA fecha de contratación. En el ERP eso es
 * employees.hire_date, que al reactivar a alguien se sobrescribe con la
 * fecha nueva: por eso un recontratado arranca de cero aquí.
 */
export function calcularVacaciones(args: {
  hireDate: string | null | undefined
  salarioSemanal: number | null | undefined
  corte?: Date
  /** Para pagar menos días de los que marca la tabla (pago parcial). */
  diasOverride?: number | null
  primaPorcentaje?: number
}): CalculoVacaciones {
  const { hireDate, salarioSemanal, corte, diasOverride } = args
  const pct = args.primaPorcentaje ?? PRIMA_PORCENTAJE

  const anios = aniosCumplidos(hireDate, corte)
  const semanal = Number(salarioSemanal ?? 0)
  const salarioDiario = redondear(semanal / 7)

  const diasTabla = diasPorAntiguedad(anios)
  const dias = diasOverride != null ? Math.max(0, diasOverride) : diasTabla

  let impedimento: string | null = null
  if (!hireDate) impedimento = "No tiene fecha de contratación registrada."
  else if (anios < 1) impedimento = "Todavía no cumple un año desde su última contratación."
  else if (semanal <= 0) impedimento = "No tiene sueldo semanal capturado."

  const importeVacaciones = redondear(dias * salarioDiario)
  const prima = redondear(importeVacaciones * pct)

  return {
    anios,
    dias,
    salarioDiario,
    importeVacaciones,
    prima,
    total: redondear(importeVacaciones + prima),
    aniversario: fechaAniversario(hireDate, anios),
    impedimento,
  }
}

export function redondear(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100
}

/** Texto de la antigüedad para el popup: "3 años cumplidos → 16 días". */
export function resumenAntiguedad(c: CalculoVacaciones): string {
  if (c.anios < 1) return "Menos de un año"
  return `${c.anios} ${c.anios === 1 ? "año cumplido" : "años cumplidos"} → ${c.dias} días`
}
