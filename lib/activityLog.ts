import { supabase } from "@/lib/supabaseClient"

export type ActivityEventType =
  | "employee.created" | "employee.deleted" | "employee.status_changed"
  | "employee.updated" | "employee.salary_updated" | "employee.document_uploaded"
  | "employee.viatics_updated"
  | "empresa.created" | "empresa.deleted" | "empresa.updated"
  | "obra.created" | "obra.deleted" | "obra.status_changed" | "obra.updated"
  | "obra.completed"
  | "team.member_added" | "team.member_removed" | "team.director_assigned"
  | "billing.payment_registered" | "billing.payment_deleted"
  | "billing.cotizacion_registered" | "billing.cotizacion_updated" | "billing.cotizacion_deleted"
  | "billing.aditivo_added" | "billing.aditivo_updated" | "billing.aditivo_deleted"
  | "billing.financials_registered" | "billing.financials_deleted"
  | "inventory.order_created" | "inventory.order_deleted"
  | "inventory.order_delivered" | "inventory.order_completed"
  | "inventory.invoice_uploaded"
  | "document.uploaded" | "document.deleted"
  // Proveedores. Los cuatro últimos los genera el job de pg_cron, no un usuario.
  | "proveedor.factura_subida" | "proveedor.envio_confirmado"
  | "proveedor.pago_registrado" | "proveedor.pago_eliminado"
  | "proveedor.factura_pagada" | "proveedor.factura_por_vencer"
  | "proveedor.factura_vence_hoy" | "proveedor.factura_vencida"
  | "proveedor.factura_eliminada" | "proveedor.envio_eliminado"
  | "proveedor.renta_asignada" | "proveedor.renta_devuelta"

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
    "employee.viatics_updated":      "Viáticos actualizados",
    "empresa.created":               "Empresa creada",
    "empresa.deleted":               "Empresa eliminada",
    "empresa.updated":               "Empresa actualizada",
    "obra.created":                  "Obra creada",
    "obra.deleted":                  "Obra eliminada",
    "obra.status_changed":           "Estatus de obra cambiado",
    "obra.updated":                  "Obra actualizada",
    "obra.completed":                "Obra completada",
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
    "billing.financials_registered": "Financieros registrados",
    "billing.financials_deleted":    "Financieros eliminados",
    "inventory.order_created":       "Orden creada",
    "inventory.order_deleted":       "Orden eliminada",
    "inventory.order_delivered":     "Orden entregada",
    "inventory.order_completed":     "Orden completada",
    "inventory.invoice_uploaded":    "Factura de orden subida",
    "document.uploaded":             "Documento subido",
    "document.deleted":              "Documento eliminado",
    "proveedor.factura_subida":      "Factura de proveedor subida",
    "proveedor.envio_confirmado":    "Envío a obra confirmado",
    "proveedor.pago_registrado":     "Pago a proveedor registrado",
    "proveedor.pago_eliminado":      "Pago a proveedor eliminado",
    "proveedor.factura_pagada":      "Factura de proveedor liquidada",
    "proveedor.factura_por_vencer":  "Factura por vencer",
    "proveedor.factura_vence_hoy":   "Factura vence hoy",
    "proveedor.factura_vencida":     "Factura vencida",
    "proveedor.factura_eliminada":   "Factura de proveedor eliminada",
    "proveedor.envio_eliminado":     "Envío a obra eliminado",
    "proveedor.renta_asignada":      "Renta asignada a obra",
    "proveedor.renta_devuelta":      "Renta devuelta",
  }
  return map[event_type] ?? event_type
}

/* ───────────────────────────────────────────
   Tono del evento
   Lo usa el toast para elegir color e icono. Separado de la etiqueta
   porque el mismo tono sirve para eventos que todavía no existen.
   ─────────────────────────────────────────── */
export type ActivityTone = "info" | "success" | "warning" | "danger"

export function activityTone(event_type: string): ActivityTone {
  const explicitos: Record<string, ActivityTone> = {
    "proveedor.factura_vencida":    "danger",
    "proveedor.factura_vence_hoy":  "warning",
    "proveedor.factura_por_vencer": "warning",
    "proveedor.factura_pagada":     "success",
    "proveedor.pago_registrado":    "success",
    "proveedor.pago_eliminado":     "danger",
    "proveedor.envio_confirmado":   "success",
    "proveedor.factura_eliminada":  "danger",
    "proveedor.envio_eliminado":    "danger",
    "proveedor.renta_asignada":     "success",
    "proveedor.renta_devuelta":     "info",
    "obra.completed":               "success",
    "inventory.order_delivered":    "success",
    "inventory.order_completed":    "success",
  }
  if (explicitos[event_type]) return explicitos[event_type]

  if (/(\.deleted|_deleted|_removed)$/.test(event_type)) return "danger"
  if (/(\.created|_created|_registered|_added|_uploaded|\.uploaded|_subida)$/.test(event_type)) return "success"
  return "info"
}

export function entityBadgeClass(entity_type: string): string {
  const t = entity_type.split(".")[0]
  const m: Record<string, string> = {
    employee:            "bg-blue-500/15 text-blue-400",
    obra:                "bg-green-500/15 text-green-400",
    empresa:             "bg-purple-500/15 text-purple-400",
    team:                "bg-amber-500/15 text-amber-400",
    billing:             "bg-emerald-500/15 text-emerald-400",
    inventory:           "bg-cyan-500/15 text-cyan-400",
    document:            "bg-slate-600/40 text-slate-400",
    proveedores_factura: "bg-orange-500/15 text-orange-400",
    proveedores_envio:   "bg-orange-500/15 text-orange-400",
    proveedores_renta:   "bg-orange-500/15 text-orange-400",
    proveedor:           "bg-orange-500/15 text-orange-400",
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
