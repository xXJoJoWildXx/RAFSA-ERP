/**
 * Antigüedad ("tiempo contratado") de un empleado.
 *
 * En construcción es normal que un trabajador salga y vuelva, así que la
 * antigüedad NO es (hoy − fecha de contratación): es la suma de los periodos
 * en que realmente estuvo contratado. Mientras está inactivo, no corre.
 *
 * La base de datos lleva la cuenta (trigger sync_employee_tenure):
 *   tenure_accumulated_days → días de los periodos ya cerrados
 *   tenure_started_on       → inicio del periodo abierto (null si está de baja)
 */

export type TenureFields = {
  hire_date?: string | null
  status?: string | null
  tenure_accumulated_days?: number | null
  tenure_started_on?: string | null
}

/** Parsea un 'date' de Postgres (YYYY-MM-DD) a mediodía local, para que el
 *  cambio de huso no lo corra un día. */
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const parts = String(value).split("T")[0]?.split("-")
  if (!parts || parts.length !== 3) return null
  const [y, m, d] = parts.map(Number)
  if (!y || !m || !d) return null
  const date = new Date(y, m - 1, d, 12, 0, 0, 0)
  return Number.isNaN(date.getTime()) ? null : date
}

function hoyMediodia(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0)
}

const DIA_MS = 24 * 60 * 60 * 1000

/** Días totales de antigüedad, o null si no hay con qué calcularla. */
export function tenureDays(e: TenureFields): number | null {
  const acumulado = Number(e.tenure_accumulated_days ?? 0)
  const inicio = parseDate(e.tenure_started_on)
  const tieneDatosNuevos =
    e.tenure_accumulated_days !== null && e.tenure_accumulated_days !== undefined
      ? true
      : !!e.tenure_started_on

  if (tieneDatosNuevos) {
    const abierto = inicio ? Math.max(0, Math.round((hoyMediodia().getTime() - inicio.getTime()) / DIA_MS)) : 0
    return Math.max(0, acumulado) + abierto
  }

  // La migración de antigüedad aún no corre en esta base: se cae al cálculo
  // viejo para no dejar la pantalla sin dato.
  const contratacion = parseDate(e.hire_date)
  if (!contratacion) return null
  return Math.max(0, Math.round((hoyMediodia().getTime() - contratacion.getTime()) / DIA_MS))
}

/** true si la antigüedad está detenida porque el empleado está de baja. */
export function tenurePaused(e: TenureFields): boolean {
  const estatus = String(e.status ?? "").toLowerCase()
  return estatus !== "" && estatus !== "active"
}

/**
 * Formatea la antigüedad como "2 años, 3 meses, 5 días".
 *
 * El truco: en vez de convertir días a años/meses con promedios (que
 * desajustan por los meses de distinta duración), se calcula una fecha de
 * inicio EQUIVALENTE (hoy − días trabajados) y de ahí se saca la diferencia
 * con el calendario real. Para un empleado que nunca se dio de baja, el
 * resultado es idéntico al de siempre.
 */
export function formatTenure(e: TenureFields): string {
  const dias = tenureDays(e)
  if (dias === null) return "No especificado"

  const hoy = hoyMediodia()
  const inicio = new Date(hoy)
  inicio.setDate(hoy.getDate() - dias)

  let years = hoy.getFullYear() - inicio.getFullYear()
  let months = hoy.getMonth() - inicio.getMonth()
  let days = hoy.getDate() - inicio.getDate()
  if (days < 0) {
    months--
    days += new Date(hoy.getFullYear(), hoy.getMonth(), 0).getDate()
  }
  if (months < 0) {
    years--
    months += 12
  }

  const segs: string[] = []
  if (years > 0) segs.push(`${years} ${years === 1 ? "año" : "años"}`)
  if (months > 0) segs.push(`${months} ${months === 1 ? "mes" : "meses"}`)
  if (days > 0 || segs.length === 0) segs.push(`${days} ${days === 1 ? "día" : "días"}`)
  return segs.join(", ")
}

/** Normaliza un nombre para comparar: sin acentos, sin dobles espacios, en
 *  mayúsculas. Se usa para detectar empleados repetidos. */
export function normalizeName(name: string | null | undefined): string {
  return String(name ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
}
