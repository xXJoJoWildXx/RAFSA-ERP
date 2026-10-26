/**
 * Catálogo de roles de trabajador.
 *
 * Única fuente de verdad: la tabla public.employee_roles_catalog.
 * Agregar un rol nuevo es sólo un INSERT ahí; ninguna pantalla necesita
 * cambios. El orden lo define la columna sort_order (menor = más arriba).
 */

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabaseClient"

export type RoleOption = {
  id: string
  value: string // code
  label: string // name
  sort_order: number
}

export async function fetchRoleOptions(): Promise<RoleOption[]> {
  const { data, error } = await supabase
    .from("employee_roles_catalog")
    .select("id, code, name, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })

  if (error) throw error

  return (data || []).map((r: any) => ({
    id: r.id,
    value: r.code,
    label: r.name,
    sort_order: r.sort_order ?? 100,
  }))
}

/** Diccionario código → nombre, para traducir valores guardados. */
export function buildRoleLabelMap(options: RoleOption[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const o of options) map[o.value] = o.label
  return map
}

/**
 * Convierte un código en etiqueta legible. Si el rol ya no está en el
 * catálogo (se desactivó, pero quedan asignaciones viejas), se muestra el
 * código formateado en vez de dejar el renglón vacío.
 */
export function roleLabelFrom(
  map: Record<string, string>,
  code: string | null | undefined,
  fallback = "-",
): string {
  if (!code) return fallback
  if (map[code]) return map[code]
  return code
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

/** Carga el catálogo una vez por montaje del componente. */
export function useRoleOptions() {
  const [options, setOptions] = useState<RoleOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const opts = await fetchRoleOptions()
        if (!cancelled) setOptions(opts)
      } catch (e) {
        console.error("Error cargando el catálogo de roles:", e)
        if (!cancelled) setError("No se pudo cargar el catálogo de roles.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { options, labelMap: buildRoleLabelMap(options), loading, error }
}
