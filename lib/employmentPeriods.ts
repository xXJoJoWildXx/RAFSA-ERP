/**
 * Periodos de contratación de un empleado.
 *
 * En construcción es común que un trabajador salga y vuelva. La antigüedad
 * total ya la lleva employees.tenure_accumulated_days (ver employeeTenure.ts);
 * esta tabla guarda el DETALLE: en qué rangos de fechas estuvo contratado.
 *
 * La escribe sola el trigger trg_sync_employment_periods siguiendo a
 * employees.tenure_started_on. Desde el cliente es de sólo lectura.
 */

import { supabase } from "@/lib/supabaseClient"

export type EmploymentPeriod = {
  id: string
  employee_id: string
  started_on: string          // YYYY-MM-DD
  ended_on: string | null     // null = sigue contratado
  /** El tramo se dedujo de la antigüedad acumulada al migrar: fechas aproximadas. */
  reconstruido: boolean
}

/** Periodos de un empleado, del más antiguo al más reciente.
 *  Devuelve [] si la migración todavía no corre en esta base. */
export async function cargarPeriodos(employeeId: string): Promise<EmploymentPeriod[]> {
  const { data, error } = await supabase
    .from("employee_employment_periods")
    .select("id, employee_id, started_on, ended_on, reconstruido")
    .eq("employee_id", employeeId)
    .order("started_on", { ascending: true })

  if (error) {
    // La tabla puede no existir todavía: no es motivo para romper el perfil.
    console.warn("cargarPeriodos:", error.message)
    return []
  }
  return (data ?? []) as EmploymentPeriod[]
}

/** true cuando el empleado ha trabajado en más de un tramo, es decir, fue
 *  recontratado. Es la condición para cambiar las etiquetas del perfil. */
export function fueRecontratado(periodos: EmploymentPeriod[]): boolean {
  return periodos.length > 1
}

function fechaCorta(iso: string | null): string {
  if (!iso) return ""
  const partes = iso.split("T")[0]?.split("-")
  if (!partes || partes.length !== 3) return iso
  const [y, m, d] = partes.map(Number)
  if (!y || !m || !d) return iso
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

/** "15 feb 2023 — 30 ago 2024", o "10 ene 2026 — Actual" si sigue abierto. */
export function formatPeriodo(p: EmploymentPeriod): string {
  const inicio = fechaCorta(p.started_on)
  const fin = p.ended_on ? fechaCorta(p.ended_on) : "Actual"
  return `${inicio} — ${fin}`
}

/** Días que duró un tramo ya cerrado, o los que lleva el abierto. */
export function diasDePeriodo(p: EmploymentPeriod): number {
  const parse = (iso: string) => {
    const [y, m, d] = iso.split("T")[0].split("-").map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0)
  }
  const inicio = parse(p.started_on)
  const fin = p.ended_on ? parse(p.ended_on) : new Date()
  const dias = Math.round((fin.getTime() - inicio.getTime()) / 86_400_000)
  return Math.max(0, dias)
}
