"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import { logActivity } from "@/lib/activityLog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { generatePickingListPdf } from "@/lib/pickingListPdf"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ClipboardList, Eye, Upload, CheckCircle2, XCircle, Loader2, Search,
  Trash2, FileText, Truck, Download, AlertTriangle, FileCheck2, PackageCheck, FileCode2,
  Info, X, ChevronDown, Building2, HardHat, Printer,
} from "lucide-react"
import {
  InventoryProduct, InventoryOrder, OrderItem, OrderInvoice, CfdiData,
  formatCurrency, formatDate, orderTypeBadge, orderStatusBadge,
  withIva, parseCfdiXml, invoiceMatchesOrder, cfdiRef, INVOICE_MATCH_TOLERANCE,
} from "@/lib/inventory"

type OrderRow = InventoryOrder & { obra_name?: string | null; item_count?: number; invoice_count?: number }
type Obra = { id: string; name: string; code: string | null; empresa_id: string | null }
type Empresa = { id: string; name: string }
type Draft = { product: InventoryProduct; quantity: string }

export function InventoryOrders({ role, headerRight }: { role: "admin" | "almacen"; headerRight?: React.ReactNode }) {
  const { user } = useAuth()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  // La obra se elige en dos pasos: primero la empresa. Hay obras con el mismo
  // nombre en empresas distintas y de un solo listado no se distinguían.
  const [newEmpresa, setNewEmpresa] = useState("")
  const [newObra, setNewObra] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [prodSearch, setProdSearch] = useState("")

  // Detail dialog
  const [detail, setDetail] = useState<OrderRow | null>(null)
  const [detailItems, setDetailItems] = useState<OrderItem[]>([])
  const [detailInvoices, setDetailInvoices] = useState<OrderInvoice[]>([])

  // Invoice form (la fecha la fija el servidor, no es editable)
  const [invNumber, setInvNumber] = useState("")
  const [invAmount, setInvAmount] = useState("")
  const [invFile, setInvFile] = useState<File | null>(null)
  const [cfdi, setCfdi] = useState<CfdiData | null>(null) // CFDI parseado del XML seleccionado
  const [parsingCfdi, setParsingCfdi] = useState(false)

  // ─── Notificaciones propias (toasts) ───
  type ToastVariant = "success" | "error" | "warning" | "info"
  type Toast = { id: number; variant: ToastVariant; title?: string; message: string }
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const notify = useCallback((message: string, variant: ToastVariant = "info", title?: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, variant, title, message }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), variant === "error" || variant === "warning" ? 7000 : 4500)
  }, [])

  // ─── Confirmación propia (reemplaza window.confirm) ───
  type ConfirmTone = "primary" | "danger" | "warn" | "success"
  type ConfirmOpts = { title: string; message: string; confirmLabel: string; tone?: ConfirmTone }
  const [confirmState, setConfirmState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const askConfirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })), [])
  function resolveConfirm(v: boolean) { setConfirmState((s) => { s?.resolve(v); return null }) }

  const loadOrders = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from("inventory_orders")
      .select("*, obras(name), inventory_order_items(id), inventory_order_invoices(id)")
      .order("created_at", { ascending: false })
    setOrders(
      (data ?? []).map((o: any) => ({
        ...o,
        obra_name: o.obras?.name ?? null,
        item_count: o.inventory_order_items?.length ?? 0,
        invoice_count: o.inventory_order_invoices?.length ?? 0,
      })),
    )
    setLoading(false)
  }, [])

  const loadRefs = useCallback(async () => {
    // Supabase corta cualquier consulta en 1000 filas. El catálogo ya pasa de
    // ese número, así que hay que pedirlo por bloques: con un solo select los
    // productos que quedaban fuera del corte nunca aparecían en el buscador.
    const PAGE = 1000
    const todos: InventoryProduct[] = []
    for (let desde = 0; ; desde += PAGE) {
      const { data, error } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_active", true)
        .order("descripcion")
        .order("codigo")
        .range(desde, desde + PAGE - 1)

      if (error) {
        console.error("Error cargando productos:", error)
        break
      }
      const bloque = (data ?? []) as InventoryProduct[]
      todos.push(...bloque)
      if (bloque.length < PAGE) break // último bloque
    }

    const [{ data: obs }, { data: emps }] = await Promise.all([
      supabase
        .from("obras")
        .select("id, name, code, empresa_id")
        .not("status", "eq", "closed")
        .order("name"),
      supabase.from("empresas").select("id, name").order("name"),
    ])

    setProducts(todos)
    setObras((obs ?? []) as Obra[])
    setEmpresas((emps ?? []) as Empresa[])
  }, [])

  useEffect(() => { loadOrders(); loadRefs() }, [loadOrders, loadRefs])

  // Almacén sólo ve lo que todavía requiere trabajo suyo: las canceladas y las
  // completadas son estados cerrados y sólo le estorban en la lista.
  const HIDDEN_FOR_ALMACEN = ["cancelled", "completed"]
  const visibleOrders = useMemo(
    () => (role === "almacen" ? orders.filter((o) => !HIDDEN_FOR_ALMACEN.includes(o.status)) : orders),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, role],
  )

  const filtered = useMemo(() => {
    let arr = [...visibleOrders]
    if (statusFilter !== "all") arr = arr.filter((o) => o.status === statusFilter)
    return arr
  }, [visibleOrders, statusFilter])

  const pendingCount = visibleOrders.filter((o) => o.status === "pending" || o.status === "in_progress").length
  const deliveredCount = visibleOrders.filter((o) => o.status === "delivered").length
  const totalCount = visibleOrders.length
  const completedCount = orders.filter((o) => o.status === "completed").length
  const porPrepararCount = visibleOrders.filter((o) => o.status === "pending").length

  // ─── Create order ───
  function openCreate() {
    setNewEmpresa(""); setNewObra(""); setNewNotes(""); setDrafts([]); setProdSearch("")
    setCreateOpen(true)
  }
  function addDraft(p: InventoryProduct) {
    if (drafts.some((d) => d.product.id === p.id)) return
    setDrafts((prev) => [...prev, { product: p, quantity: "1" }])
    setProdSearch("")
  }
  const draftTotal = drafts.reduce((s, d) => s + (Number(d.quantity) || 0) * Number(d.product.current_price), 0)

  async function createOrder() {
    if (drafts.length === 0) return
    if (!newEmpresa) { notify("Selecciona la empresa.", "warning"); return }
    if (!newObra) { notify("Selecciona la obra destino.", "warning"); return }
    if (drafts.some((d) => !(Number(d.quantity) > 0))) { notify("Todas las cantidades deben ser mayores a 0.", "warning"); return }
    setBusy(true)
    try {
      const { data: folio } = await supabase.rpc("inventory_next_folio", { p_type: "dispatch" })
      const { data: order, error } = await supabase
        .from("inventory_orders")
        .insert({
          folio: folio ?? `SA-${Date.now()}`,
          type: "dispatch",
          status: "pending",
          obra_id: newObra,
          supplier_name: null,
          notes: newNotes || null,
          created_by: user?.id ?? null,
          created_by_role: role,
        })
        .select("*")
        .single()
      if (error) throw error

      const itemRows = drafts.map((d) => ({
        order_id: order.id,
        product_id: d.product.id,
        codigo: d.product.codigo,
        descripcion: d.product.descripcion,
        quantity: Number(d.quantity),
        unit_price: Number(d.product.current_price),
      }))
      await supabase.from("inventory_order_items").insert(itemRows)
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.order", entity_id: order.id, entity_label: order.folio, metadata: { type: "dispatch", items: drafts.length } })
      setCreateOpen(false)
      await loadOrders()
      notify("Orden creada correctamente.", "success")
    } catch (e) {
      console.error(e); notify("No se pudo crear la orden.", "error")
    } finally { setBusy(false) }
  }

  // ─── Detail ───
  async function openDetail(o: OrderRow) {
    setDetail(o); setDetailItems([]); setDetailInvoices([])
    setInvNumber(""); setInvAmount(""); setInvFile(null); setCfdi(null)
    const [{ data: its }, { data: invs }] = await Promise.all([
      supabase.from("inventory_order_items").select("*").eq("order_id", o.id),
      supabase.from("inventory_order_invoices").select("*").eq("order_id", o.id).order("uploaded_at", { ascending: false }),
    ])
    setDetailItems((its ?? []) as OrderItem[])
    setDetailInvoices((invs ?? []) as OrderInvoice[])
  }

  // Al seleccionar archivo: si es XML, lo parseamos como CFDI y precargamos monto/folio.
  async function onInvoiceFile(file: File | null) {
    setInvFile(file); setCfdi(null)
    if (!file) return
    const isXml = file.name.toLowerCase().endsWith(".xml") || file.type.includes("xml")
    if (!isXml) {
      // adjunto no fiscal (PDF/imagen): no valida monto
      setCfdi({ isCfdi: false, uuid: null, total: null, subtotal: null, descuento: null, rfcEmisor: null, rfcReceptor: null, emisorNombre: null, serie: null, folio: null, fecha: null })
      return
    }
    setParsingCfdi(true)
    try {
      const text = await file.text()
      const parsed = parseCfdiXml(text)
      setCfdi(parsed)
      if (parsed.isCfdi) {
        setInvNumber(cfdiRef(parsed) || invNumber)
        if (parsed.total != null) setInvAmount(String(parsed.total))
      }
    } catch {
      setCfdi({ isCfdi: false, uuid: null, total: null, subtotal: null, descuento: null, rfcEmisor: null, rfcReceptor: null, emisorNombre: null, serie: null, folio: null, fecha: null })
    } finally { setParsingCfdi(false) }
  }

  async function uploadInvoice() {
    if (!detail || !invFile) { notify("Selecciona el archivo de la factura.", "warning"); return }
    const isCfdi = !!cfdi?.isCfdi
    // El Total del CFDI manda sobre el monto; para adjuntos no-XML se usa el monto capturado.
    const amount = isCfdi && cfdi?.total != null ? cfdi.total : (Number(invAmount) || 0)
    const matches = isCfdi ? invoiceMatchesOrder(cfdi?.total, orderTotalConIva) : false
    setBusy(true)
    try {
      const res = await fetch("/api/inventory-invoice-upload-url", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: detail.id, fileName: invFile.name }),
      })
      const up = await res.json()
      if (!res.ok) throw new Error(up?.error || "upload url error")

      const { error: upErr } = await supabase.storage.from(up.bucket).uploadToSignedUrl(up.path, up.token, invFile)
      if (upErr) throw upErr

      const { error: insErr } = await supabase.from("inventory_order_invoices").insert({
        // date: la fija la base de datos (CURRENT_DATE), no se puede modificar
        order_id: detail.id,
        invoice_number: invNumber || (isCfdi ? cfdiRef(cfdi!) : null) || null,
        amount,
        bucket: up.bucket,
        object_path: up.path,
        file_name: invFile.name,
        mime_type: invFile.type || null,
        size_bytes: invFile.size,
        uploaded_by: user?.id ?? null,
        // Datos fiscales del CFDI
        is_cfdi: isCfdi,
        cfdi_uuid: cfdi?.uuid ?? null,
        cfdi_total: cfdi?.total ?? null,
        cfdi_subtotal: cfdi?.subtotal ?? null,
        cfdi_descuento: cfdi?.descuento ?? null,
        cfdi_rfc_emisor: cfdi?.rfcEmisor ?? null,
        cfdi_rfc_receptor: cfdi?.rfcReceptor ?? null,
        cfdi_emisor_nombre: cfdi?.emisorNombre ?? null,
        cfdi_serie: cfdi?.serie ?? null,
        cfdi_folio: cfdi?.folio ?? null,
        cfdi_fecha: cfdi?.fecha ?? null,
        matches_order: matches,
      })
      if (insErr) {
        // Índice único sobre cfdi_uuid → CFDI duplicado
        if ((insErr as any).code === "23505") {
          notify("Este CFDI ya está registrado (mismo UUID). No se puede duplicar la factura.", "error", "CFDI duplicado")
          return
        }
        throw insErr
      }
      // pasar a "en proceso" si estaba pendiente
      if (detail.status === "pending") {
        await supabase.from("inventory_orders").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", detail.id)
      }
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.order_invoice", entity_id: detail.id, entity_label: detail.folio, metadata: { is_cfdi: isCfdi, cfdi_total: cfdi?.total ?? null, matches } })
      await openDetail({ ...detail, status: detail.status === "pending" ? "in_progress" : detail.status })
      await loadOrders()
      setInvNumber(""); setInvAmount(""); setInvFile(null); setCfdi(null)
      if (isCfdi && matches) {
        notify(`El CFDI cuadra con el total de la orden (${formatCurrency(orderTotalConIva)}). Ya puedes completarla al 100%.`, "success", "Factura validada")
      } else if (isCfdi && !matches) {
        notify(`El Total del CFDI (${formatCurrency(Number(cfdi?.total) || 0)}) NO cuadra con el precio final de la orden (${formatCurrency(orderTotalConIva)} c/IVA). Queda como factura pendiente; no se puede completar al 100% hasta subir un CFDI que cuadre.`, "error", "Sin correlación")
      } else {
        notify(`Archivo adjunto registrado. No es un CFDI XML, así que no valida el monto: sin un CFDI que cuadre no se puede completar al 100%.`, "warning", "Adjunto sin validar")
      }
    } catch (e) {
      console.error(e); notify("No se pudo subir la factura.", "error")
    } finally { setBusy(false) }
  }

  async function downloadInvoice(inv: OrderInvoice) {
    const { data } = await supabase.storage.from(inv.bucket).createSignedUrl(inv.object_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

  // Confirmar entrega física → queda "entregada · factura pendiente" (no 100%).
  async function deliverOrder() {
    if (!detail) return
    const ok = await askConfirm({
      title: `Confirmar entrega · ${detail.folio}`,
      message: `El pedido quedará como "entregada · factura pendiente" hasta registrar un CFDI que cuadre con el total de la orden (${formatCurrency(orderTotalConIva)} c/IVA).`,
      confirmLabel: "Confirmar entrega",
      tone: "warn",
    })
    if (!ok) return
    setBusy(true)
    try {
      const { error } = await supabase
        .from("inventory_orders")
        .update({ status: "delivered", delivered_at: new Date().toISOString(), delivered_by: user?.id ?? null, updated_at: new Date().toISOString() })
        .eq("id", detail.id)
      if (error) throw error
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.order", entity_id: detail.id, entity_label: detail.folio, metadata: { action: "delivered", type: detail.type } })
      setDetail(null)
      await loadOrders()
      notify(`Entrega confirmada. ${detail.folio} quedó como "entregada · factura pendiente".`, "success")
    } catch (e: any) {
      console.error(e); notify(e?.message || "No se pudo confirmar la entrega.", "error")
    } finally { setBusy(false) }
  }

  // Completar al 100% → requiere un CFDI que cuadre con el precio final de la orden.
  async function completeOrder() {
    if (!detail) return
    if (!hasMatchingCfdi) {
      notify(`La factura (CFDI) no tiene correlación con el precio final de la orden (${formatCurrency(orderTotalConIva)} c/IVA). Sin un CFDI cuyo Total cuadre (±${formatCurrency(INVOICE_MATCH_TOLERANCE)}) no se puede completar al 100%. Puedes confirmar la entrega y dejarla como "factura pendiente".`, "error", "Sin correlación")
      return
    }
    const ok = await askConfirm({
      title: `Completar al 100% · ${detail.folio}`,
      message: `El CFDI cuadra con el total de la orden (${formatCurrency(orderTotalConIva)}). La orden quedará marcada como completada al 100%.`,
      confirmLabel: "Completar al 100%",
      tone: "success",
    })
    if (!ok) return
    setBusy(true)
    try {
      const patch: Record<string, any> = {
        status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }
      if (!detail.delivered_at) { patch.delivered_at = new Date().toISOString(); patch.delivered_by = user?.id ?? null }
      const { error } = await supabase.from("inventory_orders").update(patch).eq("id", detail.id)
      if (error) throw error
      await logActivity({ event_type: "billing.payment_registered" as any, entity_type: "inventory.order", entity_id: detail.id, entity_label: detail.folio, metadata: { action: "completed", type: detail.type } })
      setDetail(null)
      await loadOrders()
      notify(`${detail.folio} completada al 100%.`, "success")
    } catch (e: any) {
      console.error(e); notify(e?.message || "No se pudo completar la orden.", "error")
    } finally { setBusy(false) }
  }

  async function cancelOrder() {
    if (!detail) return
    const ok = await askConfirm({
      title: `Cancelar orden · ${detail.folio}`,
      message: "La orden se marcará como cancelada. Esta acción no se puede deshacer.",
      confirmLabel: "Cancelar orden",
      tone: "danger",
    })
    if (!ok) return
    setBusy(true)
    const folio = detail.folio
    await supabase.from("inventory_orders").update({
      status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", detail.id)
    await logActivity({ event_type: "document.deleted" as any, entity_type: "inventory.order", entity_id: detail.id, entity_label: detail.folio, metadata: { action: "cancelled" } })
    setDetail(null); setBusy(false)
    await loadOrders()
    notify(`Orden ${folio} cancelada.`, "info")
  }

  // Sólo las obras de la empresa seleccionada
  const obrasDeEmpresa = useMemo(
    () => (newEmpresa ? obras.filter((o) => o.empresa_id === newEmpresa) : []),
    [obras, newEmpresa],
  )

  // Las empresas que no tienen obras abiertas no sirven aquí
  const empresasConObras = useMemo(
    () => empresas.filter((e) => obras.some((o) => o.empresa_id === e.id)),
    [empresas, obras],
  )

  const prodResults = useMemo(() => {
    if (!prodSearch) return []
    const q = prodSearch.toLowerCase()
    return products.filter((p) => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)).slice(0, 8)
  }, [prodSearch, products])

  // ─── Hoja de surtido para imprimir ───
  const [printing, setPrinting] = useState(false)
  // Folio en proceso cuando se imprime desde la fila de la tabla
  const [printingRow, setPrintingRow] = useState<string | null>(null)

  /** Imprime sin abrir el detalle: trae los artículos de esa orden al vuelo. */
  async function handlePrintRow(o: OrderRow) {
    setPrintingRow(o.id)
    try {
      const { data, error } = await supabase
        .from("inventory_order_items")
        .select("*")
        .eq("order_id", o.id)

      if (error) throw error
      const items = (data ?? []) as OrderItem[]
      if (items.length === 0) {
        notify("Esta orden no tiene artículos que surtir.", "warning")
        return
      }

      await generatePickingListPdf(
        {
          folio: o.folio,
          type: o.type,
          obra_name: o.obra_name,
          supplier_name: o.supplier_name,
          notes: o.notes,
          created_at: o.created_at,
        },
        items.map((it) => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          note: it.note,
        })),
      )
    } catch (e) {
      console.error("Error generando la hoja de surtido:", e)
      notify("No se pudo generar la hoja de surtido.", "warning")
    } finally {
      setPrintingRow(null)
    }
  }

  async function handlePrintPickingList() {
    if (!detail) return
    setPrinting(true)
    try {
      await generatePickingListPdf(
        {
          folio: detail.folio,
          type: detail.type,
          obra_name: detail.obra_name,
          supplier_name: detail.supplier_name,
          notes: detail.notes,
          created_at: detail.created_at,
        },
        detailItems.map((it) => ({
          codigo: it.codigo,
          descripcion: it.descripcion,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price), // sin IVA; el PDF lo suma
          note: it.note,
        })),
      )
    } catch (e) {
      console.error("Error generando la hoja de surtido:", e)
      notify("No se pudo generar la hoja de surtido.", "warning")
    } finally {
      setPrinting(false)
    }
  }

  // Precio final de la orden: s/IVA y c/IVA (el CFDI se compara contra el total c/IVA).
  const orderTotalSinIva = useMemo(
    () => detailItems.reduce((s, it) => s + Number(it.quantity) * Number(it.unit_price), 0),
    [detailItems],
  )
  const orderTotalConIva = useMemo(
    () => detailItems.reduce((s, it) => s + Number(it.quantity) * withIva(Number(it.unit_price)), 0),
    [detailItems],
  )
  const hasMatchingCfdi = useMemo(
    () => detailInvoices.some((inv) => inv.is_cfdi && invoiceMatchesOrder(inv.cfdi_total, orderTotalConIva)),
    [detailInvoices, orderTotalConIva],
  )
  const openState = detail && (detail.status === "pending" || detail.status === "in_progress" || detail.status === "delivered")
  const canDeliver = detail && (detail.status === "pending" || detail.status === "in_progress")
  const canComplete = !!openState && hasMatchingCfdi
  const canCancel = !!openState && (role === "admin" || detail?.created_by === user?.id)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center"><ClipboardList className="w-5 h-5 text-[#4da8e8]" /></div>
            Órdenes de inventario
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {role === "admin" ? "Genera salidas a obra con la cantidad a surtir; almacén prepara el pedido, sube la factura y confirma la entrega." : "Recibe las órdenes, prepara el pedido, sube la factura y confirma la entrega a obra."}
          </p>
        </div>
        {(role === "admin" || headerRight) && (
          <div className="flex items-center gap-2 flex-wrap sm:justify-end">
            {role === "admin" && (
              <Button size="sm" className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openCreate()}>
                <Truck className="w-4 h-4 mr-1.5" /> Nueva salida a obra
              </Button>
            )}
            {headerRight}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Pendientes", value: pendingCount, icon: ClipboardList, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
          { label: "Entregadas · fact. pend.", value: deliveredCount, icon: AlertTriangle, color: "#fb923c", bg: "rgba(251,146,60,0.12)" },
          role === "almacen"
            ? { label: "Por preparar", value: porPrepararCount, icon: PackageCheck, color: "#22c55e", bg: "rgba(34,197,94,0.12)" }
            : { label: "Completadas", value: completedCount, icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
          { label: role === "almacen" ? "Abiertas" : "Total", value: totalCount, icon: Truck, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
        ].map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: kpi.bg }}><Icon className="w-[18px] h-[18px]" style={{ color: kpi.color }} /></div>
                <div className="min-w-0"><p className="text-[11px] font-medium text-slate-500 truncate">{kpi.label}</p><p className="text-lg font-bold text-slate-100">{kpi.value}</p></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 flex items-center gap-2 flex-wrap">
        <div className="group relative w-full sm:w-64">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
            <option value="all">Todos los estados</option>
            <option value="pending">Pendiente</option>
            <option value="in_progress">En proceso</option>
            <option value="delivered">Entregada · factura pendiente</option>
            {role !== "almacen" && <option value="completed">Completada</option>}
            {role !== "almacen" && <option value="cancelled">Cancelada</option>}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 transition-colors group-hover:text-white" />
        </div>
        <span className="ml-auto text-xs text-slate-500">{filtered.length} orden{filtered.length !== 1 ? "es" : ""}</span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/60 hover:bg-transparent">
                <TableHead className="text-slate-400 font-semibold text-xs">Folio</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs">Tipo</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs">Destino / Proveedor</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs text-center">Artículos</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs text-center">Facturas</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs">Fecha</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs">Estado</TableHead>
                <TableHead className="text-slate-400 font-semibold text-xs text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-600" /> Cargando órdenes…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500"><ClipboardList className="w-10 h-10 mx-auto mb-2 text-slate-600" /><p>Sin órdenes todavía</p></TableCell></TableRow>
              ) : filtered.map((o) => {
                const tb = orderTypeBadge(o.type), sb = orderStatusBadge(o.status)
                return (
                  <TableRow key={o.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => openDetail(o)}>
                    <TableCell className="font-mono text-xs text-[#4da8e8]">{o.folio}</TableCell>
                    <TableCell><Badge className={`text-[10px] border ${tb.cls}`}>{tb.label}</Badge></TableCell>
                    <TableCell className="text-sm text-slate-300 max-w-[200px] truncate">{o.type === "dispatch" ? (o.obra_name ?? "—") : (o.supplier_name ?? "—")}</TableCell>
                    <TableCell className="text-center text-sm text-slate-300">{o.item_count}</TableCell>
                    <TableCell className="text-center text-sm text-slate-300">{o.invoice_count}</TableCell>
                    <TableCell className="text-xs text-slate-400">{formatDate(o.created_at)}</TableCell>
                    <TableCell><Badge className={`text-[10px] border ${sb.cls}`}>{sb.label}</Badge></TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Ver detalle"
                          className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                          onClick={(e) => { e.stopPropagation(); openDetail(o) }}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>

                        <Button
                          size="sm"
                          variant="ghost"
                          title="Descargar hoja de surtido"
                          disabled={printingRow === o.id}
                          className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                          onClick={(e) => { e.stopPropagation(); handlePrintRow(o) }}
                        >
                          {printingRow === o.id
                            ? <Loader2 className="w-4 h-4 animate-spin" />
                            : <Printer className="w-4 h-4" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ─── Create dialog ─── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
          <DialogHeader>
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <Truck className="w-5 h-5 text-violet-400" />
              Nueva salida a obra
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2 max-h-[72vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                label="Empresa *"
                icon={Building2}
                value={newEmpresa}
                onChange={(v) => {
                  setNewEmpresa(v)
                  setNewObra("") // la obra anterior ya no pertenece a esta empresa
                }}
              >
                <option value="">Selecciona una empresa…</option>
                {empresasConObras.map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </SelectField>

              <SelectField
                label="Obra destino *"
                icon={HardHat}
                value={newObra}
                onChange={setNewObra}
                disabled={!newEmpresa}
                hint={
                  newEmpresa && obrasDeEmpresa.length > 0
                    ? `${obrasDeEmpresa.length} ${obrasDeEmpresa.length === 1 ? "obra abierta" : "obras abiertas"}`
                    : undefined
                }
              >
                <option value="">
                  {!newEmpresa
                    ? "Primero elige la empresa"
                    : obrasDeEmpresa.length === 0
                      ? "Esta empresa no tiene obras abiertas"
                      : "Selecciona una obra…"}
                </option>
                {obrasDeEmpresa.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.code ? `${o.code} · ` : ""}{o.name}
                  </option>
                ))}
              </SelectField>
            </div>

            {/* Product picker */}
            <div>
              <label className="text-xs font-medium text-slate-400">Artículos *</label>
              <div className="relative mt-1.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={prodSearch} onChange={(e) => setProdSearch(e.target.value)} className={`pl-9 ${inputCls}`} placeholder="Buscar producto por código o descripción…" />
                {prodResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-600 bg-slate-800 shadow-xl max-h-60 overflow-y-auto">
                    {prodResults.map((p) => (
                      <button key={p.id} onClick={() => addDraft(p)} className="w-full text-left px-3 py-2 hover:bg-slate-700 flex items-center justify-between gap-2">
                        <span className="text-sm text-slate-200 truncate">{p.descripcion} <span className="font-mono text-[10px] text-[#4da8e8]">{p.codigo}</span></span>
                        <span className="text-xs text-slate-500 shrink-0">{formatCurrency(Number(p.current_price))}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {drafts.length === 0 && <p className="text-xs text-slate-500 py-3 text-center border border-dashed border-slate-700 rounded-lg">Agrega artículos a la orden.</p>}
                {drafts.map((d) => (
                  <div key={d.product.id} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-700/20 p-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 truncate">{d.product.descripcion}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{d.product.codigo} · {formatCurrency(Number(d.product.current_price))}</p>
                    </div>
                    <Input value={d.quantity} onChange={(e) => setDrafts((prev) => prev.map((x) => x.product.id === d.product.id ? { ...x, quantity: e.target.value } : x))} className={`w-20 h-9 text-center ${inputCls}`} placeholder="Cant." />
                    <span className="text-[10px] text-slate-500 w-8">{d.product.unidad_venta}</span>
                    <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDrafts((prev) => prev.filter((x) => x.product.id !== d.product.id))}><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                ))}
              </div>
              {drafts.length > 0 && (
                <div className="mt-2 flex justify-end text-sm text-slate-400">Valor estimado: <span className="ml-2 font-semibold text-slate-200">{formatCurrency(draftTotal)}</span></div>
              )}
            </div>

            <Field label="Notas"><Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} className={inputCls} placeholder="Observaciones de la orden…" /></Field>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
              <Button variant="outline" onClick={() => setCreateOpen(false)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
              <Button onClick={createOrder} disabled={busy || drafts.length === 0} className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Crear orden</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── Detail dialog ─── */}
      <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null) }}>
        <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-100 p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
            <DialogTitle className="text-slate-100 flex items-center gap-2 flex-wrap">
              <ClipboardList className="w-5 h-5 text-[#4da8e8]" /> Orden {detail?.folio}

              {detailItems.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrintPickingList}
                  disabled={printing}
                  title="Descargar la hoja para imprimir y surtir en el almacén"
                  className="ml-auto mr-7 cursor-pointer border-slate-600 bg-transparent text-slate-300 hover:bg-slate-700 hover:text-white text-xs"
                >
                  {printing ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Hoja de surtido
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="px-6 pb-6 pt-4 space-y-4 max-h-[74vh] overflow-y-auto">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`text-[10px] border ${orderTypeBadge(detail.type).cls}`}>{orderTypeBadge(detail.type).label}</Badge>
                <Badge className={`text-[10px] border ${orderStatusBadge(detail.status).cls}`}>{orderStatusBadge(detail.status).label}</Badge>
                <span className="text-xs text-slate-500">{formatDate(detail.created_at)}</span>
                {detail.type === "dispatch" && detail.obra_name && <span className="text-xs text-slate-400">· {detail.obra_name}</span>}
                {detail.type === "restock" && detail.supplier_name && <span className="text-xs text-slate-400">· {detail.supplier_name}</span>}
              </div>
              {detail.notes && <p className="text-sm text-slate-400 bg-slate-700/20 rounded-lg p-3">{detail.notes}</p>}

              {/* Items */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Artículos</p>
                <div className="rounded-lg border border-slate-700/60 overflow-hidden">
                  <table className="w-full text-sm">
                    <tbody>
                      {detailItems.map((it) => (
                        <tr key={it.id} className="border-b border-slate-700/40 last:border-0">
                          <td className="px-3 py-2 text-slate-200">{it.descripcion}<span className="font-mono text-[10px] text-[#4da8e8] ml-2">{it.codigo}</span></td>
                          <td className="px-3 py-2 text-right text-slate-300 whitespace-nowrap">{Number(it.quantity)} × {formatCurrency(Number(it.unit_price))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 flex flex-col items-end gap-0.5 text-sm">
                  <div className="text-slate-400">Subtotal (s/IVA): <span className="ml-1 text-slate-300">{formatCurrency(orderTotalSinIva)}</span></div>
                  <div className="text-slate-300 font-semibold">Precio final de la orden (c/IVA): <span className="ml-1 text-slate-100">{formatCurrency(orderTotalConIva)}</span></div>
                  <div className="text-[10px] text-slate-500">El CFDI debe cuadrar con este total (±{formatCurrency(INVOICE_MATCH_TOLERANCE)}).</div>
                </div>
              </div>

              {/* Invoices */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Facturas ({detailInvoices.length})</p>
                <div className="space-y-2">
                  {detailInvoices.length === 0 && (
                    <p className="text-xs text-slate-500">
                      {role === "admin"
                        ? "Aún no se sube factura. Aparecerá aquí cuando almacén la cargue."
                        : "Aún no se sube factura."}
                    </p>
                  )}
                  {detailInvoices.map((inv) => {
                    const match = inv.is_cfdi ? invoiceMatchesOrder(inv.cfdi_total, orderTotalConIva) : false
                    return (
                    <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-700/20 p-2.5">
                      {inv.is_cfdi ? <FileCode2 className="w-4 h-4 text-[#4da8e8] shrink-0" /> : <FileText className="w-4 h-4 text-slate-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm text-slate-200 truncate max-w-[180px]">{inv.invoice_number || inv.file_name}</p>
                          {inv.is_cfdi
                            ? <Badge className="text-[9px] border bg-[#0174bd]/15 text-[#4da8e8] border-[#0174bd]/30">CFDI</Badge>
                            : <Badge className="text-[9px] border bg-slate-600/40 text-slate-400 border-slate-600">Adjunto</Badge>}
                          {inv.is_cfdi && (match
                            ? <Badge className="text-[9px] border bg-green-500/15 text-green-400 border-green-500/30 flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Cuadra</Badge>
                            : <Badge className="text-[9px] border bg-red-500/15 text-red-400 border-red-500/30 flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> No cuadra</Badge>)}
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {formatCurrency(Number(inv.amount))} · {formatDate(inv.date)}
                          {inv.is_cfdi && inv.cfdi_emisor_nombre ? ` · ${inv.cfdi_emisor_nombre}` : ""}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => downloadInvoice(inv)}><Download className="w-4 h-4" /></Button>
                    </div>
                    )
                  })}
                </div>

                {/* Subir factura: sólo almacén. Admin ve las que almacén cargó. */}
                {openState && role === "almacen" && (
                  <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-700/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Subir factura (CFDI XML)</p>
                    <Input type="file" accept=".xml,.pdf,.jpg,.jpeg,.png" onChange={(e) => onInvoiceFile(e.target.files?.[0] ?? null)} className={`${inputCls} file:text-slate-300 file:bg-slate-600 file:border-0 file:rounded file:px-2 file:mr-2 text-xs`} />

                    {/* Correlación del CFDI con el total de la orden */}
                    {parsingCfdi && <p className="text-[11px] text-slate-400 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Leyendo CFDI…</p>}
                    {cfdi?.isCfdi && (() => {
                      const match = invoiceMatchesOrder(cfdi.total, orderTotalConIva)
                      const diff = (Number(cfdi.total) || 0) - orderTotalConIva
                      return (
                        <div className={`rounded-lg border p-2.5 text-xs space-y-1 ${match ? "border-green-500/30 bg-green-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                          <div className="flex items-center gap-1.5 font-semibold">
                            {match
                              ? <><FileCheck2 className="w-3.5 h-3.5 text-green-400" /><span className="text-green-300">El CFDI cuadra con el total de la orden</span></>
                              : <><AlertTriangle className="w-3.5 h-3.5 text-red-400" /><span className="text-red-300">El CFDI NO cuadra — sin correlación</span></>}
                          </div>
                          <div className="flex justify-between text-slate-300"><span>Total CFDI</span><span className="font-medium">{formatCurrency(Number(cfdi.total) || 0)}</span></div>
                          <div className="flex justify-between text-slate-300"><span>Total orden (c/IVA)</span><span className="font-medium">{formatCurrency(orderTotalConIva)}</span></div>
                          <div className="flex justify-between text-slate-400"><span>Diferencia</span><span className={match ? "text-green-400" : "text-red-400"}>{diff >= 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))}</span></div>
                          {cfdi.uuid && <div className="text-[10px] text-slate-500 pt-0.5 border-t border-slate-700/60">UUID {cfdi.uuid} {cfdi.rfcEmisor ? `· Emisor ${cfdi.rfcEmisor}` : ""}</div>}
                          {!match && <p className="text-[10px] text-red-300/80">Se registrará como factura pendiente; la orden no podrá completarse al 100% hasta subir un CFDI que cuadre.</p>}
                        </div>
                      )
                    })()}
                    {invFile && cfdi && !cfdi.isCfdi && (
                      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-200/90 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                        <span>Este archivo no es un CFDI XML válido. Se guardará como adjunto pero <b>no valida el monto</b>: sin un CFDI que cuadre, la orden no se puede completar al 100%.</span>
                      </div>
                    )}

                    {/* Referencia / monto (el monto lo fija el CFDI; editable solo para adjuntos) */}
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} className={inputCls} placeholder="No. factura / Serie-Folio" />
                      <Input value={invAmount} onChange={(e) => setInvAmount(e.target.value)} disabled={!!cfdi?.isCfdi} className={`${inputCls} disabled:opacity-60`} placeholder="Monto" />
                    </div>
                    <p className="text-[10px] text-slate-500">La fecha de la factura se registra automáticamente al subirla y no se puede modificar.{cfdi?.isCfdi ? " El monto proviene del CFDI." : ""}</p>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={uploadInvoice} disabled={busy || !invFile || parsingCfdi} className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Subir factura</Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-between gap-2 pt-3 border-t border-slate-700">
                <div>
                  {canCancel && (
                    <Button variant="outline" onClick={cancelOrder} disabled={busy} className="cursor-pointer bg-transparent border-red-500/30 text-red-400 hover:bg-red-500/10"><XCircle className="w-4 h-4 mr-1.5" /> Cancelar orden</Button>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  <Button variant="outline" onClick={() => setDetail(null)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cerrar</Button>
                  {canDeliver && role === "almacen" && (
                    <Button onClick={deliverOrder} disabled={busy} className="cursor-pointer bg-orange-600 hover:bg-orange-700 text-white">
                      {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}<PackageCheck className="w-4 h-4 mr-1.5" /> Confirmar entrega
                    </Button>
                  )}
                  {openState && role === "almacen" && (
                    <Button onClick={completeOrder} disabled={busy || !canComplete} title={!canComplete ? "Requiere un CFDI que cuadre con el total de la orden" : ""} className="cursor-pointer bg-green-600 hover:bg-green-700 text-white disabled:opacity-40">
                      {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}<CheckCircle2 className="w-4 h-4 mr-1.5" /> Completar al 100%
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Confirmación propia (sustituye window.confirm) ─── */}
      <Dialog open={!!confirmState} onOpenChange={(v) => { if (!v) resolveConfirm(false) }}>
        <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
          {confirmState && (() => {
            const tone = confirmState.tone ?? "primary"
            const toneIcon: Record<string, React.ReactNode> = {
              primary: <CheckCircle2 className="w-5 h-5 text-[#4da8e8]" />,
              danger: <XCircle className="w-5 h-5 text-red-400" />,
              warn: <PackageCheck className="w-5 h-5 text-orange-400" />,
              success: <CheckCircle2 className="w-5 h-5 text-green-400" />,
            }
            const toneBtn: Record<string, string> = {
              primary: "bg-[#0174bd] hover:bg-[#0163a3]",
              danger: "bg-red-600 hover:bg-red-700",
              warn: "bg-orange-600 hover:bg-orange-700",
              success: "bg-green-600 hover:bg-green-700",
            }
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-slate-100 flex items-center gap-2">{toneIcon[tone]} {confirmState.title}</DialogTitle>
                </DialogHeader>
                <p className="text-sm text-slate-300 mt-1">{confirmState.message}</p>
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => resolveConfirm(false)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
                  <Button onClick={() => resolveConfirm(true)} className={`cursor-pointer text-white ${toneBtn[tone]}`}>{confirmState.confirmLabel}</Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Toasts propios (sustituye window.alert) ─── */}
      {toasts.length > 0 && (
        <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 w-[min(92vw,22rem)] pointer-events-none">
          {toasts.map((t) => {
            const cfg = {
              success: { icon: <CheckCircle2 className="w-4 h-4 text-green-400" />, bar: "bg-green-500", ring: "border-green-500/30" },
              error: { icon: <AlertTriangle className="w-4 h-4 text-red-400" />, bar: "bg-red-500", ring: "border-red-500/30" },
              warning: { icon: <AlertTriangle className="w-4 h-4 text-amber-400" />, bar: "bg-amber-500", ring: "border-amber-500/30" },
              info: { icon: <Info className="w-4 h-4 text-[#4da8e8]" />, bar: "bg-[#0174bd]", ring: "border-[#0174bd]/30" },
            }[t.variant]
            return (
              <div key={t.id} className={`pointer-events-auto relative overflow-hidden flex items-start gap-2.5 rounded-xl border ${cfg.ring} bg-slate-800/95 backdrop-blur shadow-2xl shadow-black/40 p-3 pr-8`}>
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${cfg.bar}`} />
                <div className="shrink-0 mt-0.5">{cfg.icon}</div>
                <div className="min-w-0 flex-1">
                  {t.title && <p className="text-sm font-semibold text-slate-100">{t.title}</p>}
                  <p className="text-xs text-slate-300 leading-relaxed">{t.message}</p>
                </div>
                <button onClick={() => dismissToast(t.id)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-200 cursor-pointer" aria-label="Cerrar"><X className="w-3.5 h-3.5" /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const inputCls = "bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
const selectCls =
  "h-10 w-full appearance-none rounded-xl border border-slate-600 bg-slate-700/60 " +
  "pl-3 pr-9 text-sm text-slate-100 outline-none cursor-pointer transition-all " +
  "hover:border-slate-400 hover:bg-slate-700/80 " +
  "focus:border-[#0174bd]/70 focus:bg-slate-900/70 focus:shadow-[0_0_0_3px_rgba(1,116,189,0.12)] " +
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-600 " +
  "[&>option]:bg-slate-800 [&>option]:text-slate-100"

/**
 * Select con etiqueta, icono opcional y flecha propia.
 *
 * El <select> nativo dibuja su flecha con el estilo del sistema operativo y no
 * se puede tematizar, así que se oculta con appearance-none y se pinta aquí.
 */
function SelectField({
  label,
  icon: Icon,
  value,
  onChange,
  disabled,
  children,
  hint,
}: {
  label: string
  icon?: typeof ChevronDown
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  children: React.ReactNode
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
        {label}
      </label>

      <div className="group relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={selectCls}
        >
          {children}
        </select>

        <ChevronDown
          className={`
            pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4
            transition-colors
            ${disabled ? "text-slate-600" : "text-slate-500 group-hover:text-white"}
          `}
        />
      </div>

      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}
