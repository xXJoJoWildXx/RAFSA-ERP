// ───────────────────────────────────────────────────────────────────────────
//  Tipos y helpers compartidos del módulo de Inventario (admin + almacen)
// ───────────────────────────────────────────────────────────────────────────

export type InventoryProduct = {
  id: string
  codigo: string
  descripcion: string
  unidad_venta: string
  multiplo_venta: number
  capacidad: string | null
  peso: number | null
  um_peso: string
  linea: string | null
  codigo_barras: string | null
  current_price: number
  price_valid_from: string | null
  price_valid_until: string | null
  price_updated_at: string | null
  stock: number
  stock_min: number
  ubicacion: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type PriceHistoryRow = {
  id: string
  product_id: string
  price: number
  valid_from: string
  valid_until: string | null
  is_current: boolean
  source: string
  note: string | null
  created_at: string
}

export type PriceNotification = {
  id: string
  product_id: string
  price_valid_until: string
  notify_date: string
  status: "pending" | "acknowledged" | "resolved" | "dismissed"
  message: string | null
  created_at: string
  resolved_at: string | null
}

export type OrderType = "restock" | "dispatch"
export type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled"

export type InventoryOrder = {
  id: string
  folio: string
  type: OrderType
  status: OrderStatus
  obra_id: string | null
  supplier_name: string | null
  notes: string | null
  created_by: string | null
  created_by_role: string | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

export type OrderItem = {
  id: string
  order_id: string
  product_id: string
  codigo: string | null
  descripcion: string | null
  quantity: number
  unit_price: number
  note: string | null
}

export type OrderInvoice = {
  id: string
  order_id: string
  invoice_number: string | null
  amount: number
  date: string
  bucket: string
  object_path: string
  file_name: string | null
  uploaded_at: string
}

export type StockMovement = {
  id: string
  product_id: string
  movement_type: "in" | "out" | "adjustment"
  quantity: number
  stock_before: number
  stock_after: number
  reason: string
  order_id: string | null
  obra_id: string | null
  note: string | null
  created_at: string
}

// ─── Formatters ─────────────────────────────────────────────────────────────

export function formatCurrency(val: number | null | undefined): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val ?? 0)
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return "—"
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  })
}

// ─── Stock ──────────────────────────────────────────────────────────────────

export function getStockBadge(stock: number, min: number) {
  if (stock <= 0) return { label: "Agotado", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
  if (stock <= min) return { label: "Bajo", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
  return { label: "OK", cls: "bg-green-500/15 text-green-400 border-green-500/30" }
}

// ─── Price expiry ─────────────────────────────────────────────────────────────

/** Días restantes para la caducidad del precio (null si no hay fecha). */
export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + "T00:00:00")
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export function getPriceExpiryBadge(validUntil: string | null | undefined) {
  const d = daysUntil(validUntil)
  if (d === null) return { label: "Sin fecha", cls: "bg-slate-600/40 text-slate-400 border-slate-600", days: null }
  if (d < 0) return { label: "Caducado", cls: "bg-red-500/15 text-red-400 border-red-500/30", days: d }
  if (d <= 7) return { label: `${d} día${d === 1 ? "" : "s"}`, cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", days: d }
  return { label: formatDate(validUntil), cls: "bg-slate-700/60 text-slate-300 border-slate-600", days: d }
}

// ─── Orders ───────────────────────────────────────────────────────────────────

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  restock: "Reabastecimiento",
  dispatch: "Salida a obra",
}

export function orderTypeBadge(type: OrderType) {
  return type === "restock"
    ? { label: "Reabasto", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
    : { label: "Salida", cls: "bg-violet-500/15 text-violet-400 border-violet-500/30" }
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  completed: "Completada",
  cancelled: "Cancelada",
}

export function orderStatusBadge(status: OrderStatus) {
  const map: Record<OrderStatus, string> = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    completed: "bg-green-500/15 text-green-400 border-green-500/30",
    cancelled: "bg-slate-600/40 text-slate-400 border-slate-600",
  }
  return { label: ORDER_STATUS_LABEL[status], cls: map[status] }
}
