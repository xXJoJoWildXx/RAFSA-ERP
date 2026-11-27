// lib/payroll/weeks.ts
// Helpers de periodo semanal (Lunes → Domingo).
//
// La semana laboral corre de lunes a domingo, con el domingo de descanso: los
// seis días que se pagan son lunes a sábado. Antes el periodo iba de jueves a
// miércoles; se regresó a la semana natural.
//
// week_start es SIEMPRE el lunes del periodo, y es la llave con la que se
// guardan las nóminas (obra_nominas.week_start, payroll_runs.week_start).

/** Lunes del periodo con un offset (0 = periodo actual, -1 = anterior, ...). */
export function getMondayOfPeriod(offset = 0): Date {
  const now = new Date()
  const day = now.getDay() // 0=Dom..6=Sab
  // Domingo cierra la semana que empezó el lunes anterior, no abre una nueva.
  let diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff + offset * 7)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function getSundayFromMonday(monday: Date): Date {
  const sun = new Date(monday)
  sun.setDate(monday.getDate() + 6)
  return sun
}

/** yyyy-mm-dd */
export function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

export function fmtDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Las 6 fechas laborales (Lun–Sáb, se salta el domingo) a partir del
 * week_start (lunes, 'yyyy-mm-dd'). Cálculo en UTC para que no dependa de la
 * zona horaria del servidor y empate con las fechas de obra_attendance.
 */
export function getWorkDatesFromWeekStart(weekStart: string): string[] {
  const start = new Date(weekStart + "T00:00:00Z")
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setUTCDate(start.getUTCDate() + i)
    if (d.getUTCDay() !== 0) out.push(d.toISOString().split("T")[0])
  }
  return out // 6 fechas
}

export type WeekPeriod = { weekStart: string; weekEnd: string; label: string }

/** Lista de los periodos recientes (lun→dom), del más nuevo al más viejo. */
export function listRecentPeriods(count = 8): WeekPeriod[] {
  const periods: WeekPeriod[] = []
  for (let i = 0; i > -count; i--) {
    const monday = getMondayOfPeriod(i)
    const sunday = getSundayFromMonday(monday)
    const weekStart = fmtDate(monday)
    const weekEnd = fmtDate(sunday)
    periods.push({
      weekStart,
      weekEnd,
      label: `${fmtDateDisplay(weekStart)} – ${fmtDateDisplay(weekEnd)}`,
    })
  }
  return periods
}
