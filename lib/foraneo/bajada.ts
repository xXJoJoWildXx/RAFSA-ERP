// lib/foraneo/bajada.ts
// Recurrencia bimestral de la fecha de bajada (viaje redondo) a partir de un rango ancla.
// Todas las fechas son 'yyyy-mm-dd'. La recurrencia es +2 meses conservando el día.

export type Occurrence = { index: number; start: string; end: string }

export const CYCLE_MONTHS = 2

/** Suma `months` meses a 'yyyy-mm-dd' conservando el día (con clamp al último día del mes). */
export function addMonthsISO(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number)
  const firstOfTarget = new Date(Date.UTC(y, m - 1 + months, 1))
  const year = firstOfTarget.getUTCFullYear()
  const mon = firstOfTarget.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, mon + 1, 0)).getUTCDate()
  const day = Math.min(d, lastDay)
  return `${year}-${String(mon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Ocurrencia i del rango ancla (i = 0 es el ancla). */
export function occurrenceAt(anchorStart: string, anchorEnd: string, i: number): Occurrence {
  return {
    index: i,
    start: addMonthsISO(anchorStart, CYCLE_MONTHS * i),
    end: addMonthsISO(anchorEnd, CYCLE_MONTHS * i),
  }
}

/** Ocurrencia vigente o próxima respecto a `today`: la de menor índice cuyo fin ≥ hoy. */
export function currentOrNextOccurrence(
  anchorStart: string,
  anchorEnd: string,
  today: string,
  cap = 240,
): Occurrence {
  for (let i = 0; i < cap; i++) {
    const occ = occurrenceAt(anchorStart, anchorEnd, i)
    if (occ.end >= today) return occ
  }
  return occurrenceAt(anchorStart, anchorEnd, 0)
}

/** Ocurrencias desde el índice 0 cuyo inicio es ≤ `limitISO`. */
export function occurrencesUpTo(
  anchorStart: string,
  anchorEnd: string,
  limitISO: string,
  cap = 240,
): Occurrence[] {
  const out: Occurrence[] = []
  for (let i = 0; i < cap; i++) {
    const occ = occurrenceAt(anchorStart, anchorEnd, i)
    if (occ.start > limitISO) break
    out.push(occ)
  }
  return out
}

/** Próximas `n` ocurrencias a partir de hoy (incluye la vigente). */
export function upcomingOccurrences(
  anchorStart: string,
  anchorEnd: string,
  today: string,
  n = 3,
): Occurrence[] {
  const first = currentOrNextOccurrence(anchorStart, anchorEnd, today)
  const out: Occurrence[] = []
  for (let k = 0; k < n; k++) out.push(occurrenceAt(anchorStart, anchorEnd, first.index + k))
  return out
}

/** Hoy en zona horaria de México como 'yyyy-mm-dd'. */
export function mexicoTodayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/** Lista inclusiva de fechas 'yyyy-mm-dd' entre start y end. */
export function datesInRange(start: string, end: string, cap = 120): string[] {
  const out: string[] = []
  let cur = start
  let guard = 0
  while (cur <= end && guard < cap) {
    out.push(cur)
    const d = new Date(cur + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + 1)
    cur = d.toISOString().split("T")[0]
    guard++
  }
  return out
}
