// lib/payroll/weeks.ts
// Helpers de periodo semanal (Jueves → Miércoles), idénticos a los de nominasTab,
// para que week_start empate EXACTAMENTE con lo guardado en obra_nominas.

/** Jueves del periodo con un offset (0 = periodo actual, -1 = anterior, ...). */
export function getThursdayOfPeriod(offset = 0): Date {
  const now = new Date()
  const day = now.getDay() // 0=Dom..6=Sab
  let diff = day - 4 // Jueves = 4
  if (diff < 0) diff += 7
  const thursday = new Date(now)
  thursday.setDate(now.getDate() - diff + offset * 7)
  thursday.setHours(0, 0, 0, 0)
  return thursday
}

export function getWednesdayFromThursday(thursday: Date): Date {
  const wed = new Date(thursday)
  wed.setDate(thursday.getDate() + 6)
  return wed
}

/** yyyy-mm-dd — misma conversión que nominasTab (toISOString). */
export function fmtDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

export function fmtDateDisplay(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Las 6 fechas laborales (Jue–Sáb + Lun–Mié, se salta el domingo) a partir del
 * week_start (jueves, 'yyyy-mm-dd'). Cálculo en UTC para que no dependa de la
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

/** Lista de los periodos recientes (jue→mié), del más nuevo al más viejo. */
export function listRecentPeriods(count = 8): WeekPeriod[] {
  const periods: WeekPeriod[] = []
  for (let i = 0; i > -count; i--) {
    const thursday = getThursdayOfPeriod(i)
    const wednesday = getWednesdayFromThursday(thursday)
    const weekStart = fmtDate(thursday)
    const weekEnd = fmtDate(wednesday)
    periods.push({
      weekStart,
      weekEnd,
      label: `${fmtDateDisplay(weekStart)} – ${fmtDateDisplay(weekEnd)}`,
    })
  }
  return periods
}
