import { supabase } from "@/lib/supabaseClient"

export type ActivityEventType =
  | "employee.created" | "employee.deleted" | "employee.status_changed"
  | "employee.updated" | "employee.salary_updated" | "employee.document_uploaded"
  | "empresa.created" | "empresa.deleted" | "empresa.updated"
  | "obra.created" | "obra.deleted" | "obra.status_changed" | "obra.updated"
  | "team.member_added" | "team.member_removed" | "team.director_assigned"
  | "billing.payment_registered" | "billing.payment_deleted"
  | "billing.cotizacion_registered" | "billing.cotizacion_updated" | "billing.cotizacion_deleted"
  | "billing.aditivo_added" | "billing.aditivo_updated" | "billing.aditivo_deleted"
  | "document.uploaded" | "document.deleted"

export async function logActivity(params: {
  event_type: ActivityEventType
  entity_type: string
  entity_id?: string | null
  entity_label?: string | null
  metadata?: Record<string, any>
}): Promise<void> {
  try {
    const { data: authData } = await supabase.auth.getUser()
    const user = authData?.user
    await supabase.from("activity_log").insert({
      actor_user_id: user?.id ?? null,
      actor_email: user?.email ?? null,
      event_type: params.event_type,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      entity_label: params.entity_label ?? null,
      metadata: params.metadata ?? {},
    })
  } catch (err) {
    console.error("logActivity error:", err)
  }
}

export function formatEventType(event_type: string): string {
  const map: Record<string, string> = {
    "employee.created":              "Empleado creado",
    "employee.deleted":              "Empleado eliminado",
    "employee.status_changed":       "Estatus de empleado cambiado",
    "employee.updated":              "Empleado actualizado",
    "employee.salary_updated":       "Salario de empleado actualizado",
    "employee.document_uploaded":    "Documento de empleado subido",
    "empresa.created":               "Empresa creada",
    "empresa.deleted":               "Empresa eliminada",
    "empresa.updated":               "Empresa actualizada",
    "obra.created":                  "Obra creada",
    "obra.deleted":                  "Obra eliminada",
    "obra.status_changed":           "Estatus de obra cambiado",
    "obra.updated":                  "Obra actualizada",
    "team.member_added":             "Miembro agregado al equipo",
    "team.member_removed":           "Miembro removido del equipo",
    "team.director_assigned":        "Director de obra asignado",
    "billing.payment_registered":    "Pago registrado",
    "billing.payment_deleted":       "Pago eliminado",
    "billing.cotizacion_registered": "Cotización registrada",
    "billing.cotizacion_updated":    "Cotización actualizada",
    "billing.cotizacion_deleted":    "Cotización eliminada",
    "billing.aditivo_added":         "Aditivo agregado",
    "billing.aditivo_updated":       "Aditivo actualizado",
    "billing.aditivo_deleted":       "Aditivo eliminado",
    "document.uploaded":             "Documento subido",
    "document.deleted":              "Documento eliminado",
  }
  return map[event_type] ?? event_type
}

export function entityBadgeClass(entity_type: string): string {
  const t = entity_type.split(".")[0]
  const m: Record<string, string> = {
    employee: "bg-blue-500/15 text-blue-400",
    obra:     "bg-green-500/15 text-green-400",
    empresa:  "bg-purple-500/15 text-purple-400",
    team:     "bg-amber-500/15 text-amber-400",
    billing:  "bg-emerald-500/15 text-emerald-400",
    document: "bg-slate-600/40 text-slate-400",
  }
  return m[t] ?? "bg-slate-600/40 text-slate-400"
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "ahora"
  if (mins < 60) return `hace ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `hace ${days}d`
  return new Date(dateStr).toLocaleDateString("es-MX", { day: "numeric", month: "short" })
}
