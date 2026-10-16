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
  price_with_iva: number
  price_valid_from: string | null
  price_valid_until: string | null
  price_updated_at: string | null
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
// delivered = entrega confirmada pero con factura pendiente (sin CFDI que cuadre).
// completed = 100%: entregada + CFDI cuya correlación con el total de la orden cuadra.
export type OrderStatus = "pending" | "in_progress" | "delivered" | "completed" | "cancelled"

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
  delivered_at: string | null
  delivered_by: string | null
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
  // CFDI (factura fiscal XML)
  is_cfdi?: boolean
  cfdi_uuid?: string | null
  cfdi_total?: number | null
  cfdi_subtotal?: number | null
  cfdi_descuento?: number | null
  cfdi_rfc_emisor?: string | null
  cfdi_rfc_receptor?: string | null
  cfdi_emisor_nombre?: string | null
  cfdi_serie?: string | null
  cfdi_folio?: string | null
  cfdi_fecha?: string | null
  matches_order?: boolean
}

// ─── CFDI (factura fiscal XML) ──────────────────────────────────────────────

/** Tolerancia de correlación entre el Total del CFDI y el total de la orden (±$1.00 MXN). */
export const INVOICE_MATCH_TOLERANCE = 1.0

export type CfdiData = {
  isCfdi: boolean
  uuid: string | null
  total: number | null
  subtotal: number | null
  descuento: number | null
  rfcEmisor: string | null
  rfcReceptor: string | null
  emisorNombre: string | null
  serie: string | null
  folio: string | null
  fecha: string | null
}

const EMPTY_CFDI: CfdiData = {
  isCfdi: false, uuid: null, total: null, subtotal: null, descuento: null,
  rfcEmisor: null, rfcReceptor: null, emisorNombre: null, serie: null, folio: null, fecha: null,
}

/** Busca el primer elemento con ese localName, prefiriendo un prefijo (p. ej. "cfdi") para
 *  evitar homónimos dentro de la Addenda (fx:Emisor, fx:Receptor, etc.). */
function findByLocal(doc: Document, local: string, preferPrefix?: string): Element | null {
  const els = doc.getElementsByTagName("*")
  let fallback: Element | null = null
  for (let i = 0; i < els.length; i++) {
    const el = els[i]
    if (el.localName !== local) continue
    if (!preferPrefix) return el
    if (el.nodeName.toLowerCase().startsWith(preferPrefix + ":")) return el
    if (!fallback) fallback = el
  }
  return fallback
}

/** Parsea un CFDI 4.0/3.3 y extrae los datos fiscales relevantes. En entornos sin DOMParser
 *  (servidor) o si el XML no es un CFDI válido devuelve { isCfdi: false }. */
export function parseCfdiXml(xmlText: string): CfdiData {
  try {
    if (typeof DOMParser === "undefined" || !xmlText) return EMPTY_CFDI
    const doc = new DOMParser().parseFromString(xmlText, "application/xml")
    if (doc.getElementsByTagName("parsererror").length > 0) return EMPTY_CFDI
    const comp = findByLocal(doc, "Comprobante", "cfdi")
    if (!comp) return EMPTY_CFDI
    const num = (v: string | null) => {
      if (v == null || v === "") return null
      const n = Number(v)
      return Number.isFinite(n) ? n : null
    }
    const tfd = findByLocal(doc, "TimbreFiscalDigital", "tfd")
    const emisor = findByLocal(doc, "Emisor", "cfdi")
    const receptor = findByLocal(doc, "Receptor", "cfdi")
    return {
      isCfdi: true,
      uuid: tfd?.getAttribute("UUID") ?? null,
      total: num(comp.getAttribute("Total")),
      subtotal: num(comp.getAttribute("SubTotal")),
      descuento: num(comp.getAttribute("Descuento")),
      rfcEmisor: emisor?.getAttribute("Rfc") ?? null,
      rfcReceptor: receptor?.getAttribute("Rfc") ?? null,
      emisorNombre: emisor?.getAttribute("Nombre") ?? null,
      serie: comp.getAttribute("Serie"),
      folio: comp.getAttribute("Folio"),
      fecha: comp.getAttribute("Fecha"),
    }
  } catch {
    return EMPTY_CFDI
  }
}

/** Serie-Folio del CFDI como referencia legible (o el UUID corto si no hay folio). */
export function cfdiRef(c: Pick<CfdiData, "serie" | "folio" | "uuid">): string {
  const sf = [c.serie, c.folio].filter(Boolean).join("-")
  if (sf) return sf
  return c.uuid ? c.uuid.slice(0, 8).toUpperCase() : ""
}

/** ¿El Total del CFDI cuadra con el total de la orden (dentro de la tolerancia)? */
export function invoiceMatchesOrder(cfdiTotal: number | null | undefined, orderTotal: number): boolean {
  if (cfdiTotal == null || !Number.isFinite(Number(cfdiTotal))) return false
  return Math.abs(Number(cfdiTotal) - orderTotal) <= INVOICE_MATCH_TOLERANCE
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

// ─── IVA ──────────────────────────────────────────────────────────────────────

/** Tasa de IVA (16%). */
export const IVA_RATE = 0.16

/** Precio con IVA a partir del precio base (redondeado a 2 decimales). */
export function withIva(base: number | null | undefined): number {
  return Math.round((Number(base) || 0) * (1 + IVA_RATE) * 100) / 100
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
  delivered: "Entregada · factura pendiente",
  completed: "Completada",
  cancelled: "Cancelada",
}

export function orderStatusBadge(status: OrderStatus) {
  const map: Record<OrderStatus, string> = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    in_progress: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    delivered: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    completed: "bg-green-500/15 text-green-400 border-green-500/30",
    cancelled: "bg-slate-600/40 text-slate-400 border-slate-600",
  }
  return { label: ORDER_STATUS_LABEL[status], cls: map[status] }
}
