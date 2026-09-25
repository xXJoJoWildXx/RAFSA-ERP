"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import { logActivity } from "@/lib/activityLog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ClipboardList, Eye, Upload, CheckCircle2, XCircle, Loader2, Search,
  Trash2, FileText, ArrowDownToLine, ArrowUpFromLine, PackagePlus, Truck, Download,
} from "lucide-react"
import {
  InventoryProduct, InventoryOrder, OrderItem, OrderInvoice, OrderType,
  formatCurrency, formatDate, orderTypeBadge, orderStatusBadge, ORDER_TYPE_LABEL,
} from "@/lib/inventory"

type OrderRow = InventoryOrder & { obra_name?: string | null; item_count?: number; invoice_count?: number }
type Obra = { id: string; name: string; code: string | null }
type Draft = { product: InventoryProduct; quantity: string }

export function InventoryOrders({ role }: { role: "admin" | "almacen" }) {
  const { user } = useAuth()
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [products, setProducts] = useState<InventoryProduct[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [typeFilter, setTypeFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false)
  const [newType, setNewType] = useState<OrderType>("restock")
  const [newObra, setNewObra] = useState("")
  const [newSupplier, setNewSupplier] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [drafts, setDrafts] = useState<Draft[]>([])
  const [prodSearch, setProdSearch] = useState("")

  // Detail dialog
  const [detail, setDetail] = useState<OrderRow | null>(null)
  const [detailItems, setDetailItems] = useState<OrderItem[]>([])
  const [detailInvoices, setDetailInvoices] = useState<OrderInvoice[]>([])

  // Invoice form
  const [invNumber, setInvNumber] = useState("")
  const [invAmount, setInvAmount] = useState("")
  const [invDate, setInvDate] = useState(new Date().toISOString().slice(0, 10))
  const [invFile, setInvFile] = useState<File | null>(null)

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
    const [{ data: prods }, { data: obs }] = await Promise.all([
      supabase.from("inventory_products").select("*").eq("is_active", true).order("descripcion"),
      supabase.from("obras").select("id, name, code").not("status", "eq", "closed").order("name"),
    ])
    setProducts((prods ?? []) as InventoryProduct[])
    setObras((obs ?? []) as Obra[])
  }, [])

  useEffect(() => { loadOrders(); loadRefs() }, [loadOrders, loadRefs])

  const filtered = useMemo(() => {
    let arr = [...orders]
    if (typeFilter !== "all") arr = arr.filter((o) => o.type === typeFilter)
    if (statusFilter !== "all") arr = arr.filter((o) => o.status === statusFilter)
    return arr
  }, [orders, typeFilter, statusFilter])

  const pendingCount = orders.filter((o) => o.status === "pending" || o.status === "in_progress").length
  const restockCount = orders.filter((o) => o.type === "restock").length
  const dispatchCount = orders.filter((o) => o.type === "dispatch").length
  const completedCount = orders.filter((o) => o.status === "completed").length

  // ─── Create order ───
  function openCreate(type: OrderType) {
    setNewType(type); setNewObra(""); setNewSupplier(""); setNewNotes(""); setDrafts([]); setProdSearch("")
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
    if (newType === "dispatch" && !newObra) { alert("Selecciona la obra destino."); return }
    if (drafts.some((d) => !(Number(d.quantity) > 0))) { alert("Todas las cantidades deben ser mayores a 0."); return }
    setBusy(true)
    try {
      const { data: folio } = await supabase.rpc("inventory_next_folio", { p_type: newType })
      const { data: order, error } = await supabase
        .from("inventory_orders")
        .insert({
          folio: folio ?? `${newType === "restock" ? "RE" : "SA"}-${Date.now()}`,
          type: newType,
          status: "pending",
          obra_id: newType === "dispatch" ? newObra : null,
          supplier_name: newType === "restock" ? (newSupplier || null) : null,
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
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.order", entity_id: order.id, entity_label: order.folio, metadata: { type: newType, items: drafts.length } })
      setCreateOpen(false)
      await loadOrders()
    } catch (e) {
      console.error(e); alert("No se pudo crear la orden.")
    } finally { setBusy(false) }
  }

  // ─── Detail ───
  async function openDetail(o: OrderRow) {
    setDetail(o); setDetailItems([]); setDetailInvoices([])
    setInvNumber(""); setInvAmount(""); setInvDate(new Date().toISOString().slice(0, 10)); setInvFile(null)
    const [{ data: its }, { data: invs }] = await Promise.all([
      supabase.from("inventory_order_items").select("*").eq("order_id", o.id),
      supabase.from("inventory_order_invoices").select("*").eq("order_id", o.id).order("uploaded_at", { ascending: false }),
    ])
    setDetailItems((its ?? []) as OrderItem[])
    setDetailInvoices((invs ?? []) as OrderInvoice[])
  }

  async function uploadInvoice() {
    if (!detail || !invFile) { alert("Selecciona el archivo de la factura."); return }
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

      await supabase.from("inventory_order_invoices").insert({
        order_id: detail.id,
        invoice_number: invNumber || null,
        amount: Number(invAmount) || 0,
        date: invDate,
        bucket: up.bucket,
        object_path: up.path,
        file_name: invFile.name,
        mime_type: invFile.type || null,
        size_bytes: invFile.size,
        uploaded_by: user?.id ?? null,
      })
      // pasar a "en proceso" si estaba pendiente
      if (detail.status === "pending") {
        await supabase.from("inventory_orders").update({ status: "in_progress", updated_at: new Date().toISOString() }).eq("id", detail.id)
      }
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.order_invoice", entity_id: detail.id, entity_label: detail.folio })
      await openDetail({ ...detail, status: detail.status === "pending" ? "in_progress" : detail.status })
      await loadOrders()
      setInvNumber(""); setInvAmount(""); setInvFile(null)
    } catch (e) {
      console.error(e); alert("No se pudo subir la factura.")
    } finally { setBusy(false) }
  }

  async function downloadInvoice(inv: OrderInvoice) {
    const { data } = await supabase.storage.from(inv.bucket).createSignedUrl(inv.object_path, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, "_blank")
  }

  async function completeOrder() {
    if (!detail) return
    if (detailInvoices.length === 0) { alert("Debes subir al menos una factura antes de confirmar."); return }
    if (!confirm(`¿Confirmar la orden ${detail.folio}? Esto ${detail.type === "restock" ? "sumará" : "restará"} el stock.`)) return
    setBusy(true)
    try {
      const { error } = await supabase.rpc("inventory_complete_order", { p_order_id: detail.id })
      if (error) throw error
      await logActivity({ event_type: "billing.payment_registered" as any, entity_type: "inventory.order", entity_id: detail.id, entity_label: detail.folio, metadata: { action: "completed", type: detail.type } })
      setDetail(null)
      await loadOrders()
    } catch (e: any) {
      console.error(e); alert(e?.message || "No se pudo completar la orden (¿stock insuficiente?).")
    } finally { setBusy(false) }
  }

  async function cancelOrder() {
    if (!detail) return
    if (!confirm(`¿Cancelar la orden ${detail.folio}?`)) return
    setBusy(true)
    await supabase.from("inventory_orders").update({
      status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", detail.id)
    await logActivity({ event_type: "document.deleted" as any, entity_type: "inventory.order", entity_id: detail.id, entity_label: detail.folio, metadata: { action: "cancelled" } })
    setDetail(null); setBusy(false)
    await loadOrders()
  }

  const prodResults = useMemo(() => {
    if (!prodSearch) return []
    const q = prodSearch.toLowerCase()
    return products.filter((p) => p.codigo.toLowerCase().includes(q) || p.descripcion.toLowerCase().includes(q)).slice(0, 8)
  }, [prodSearch, products])

  const canComplete = detail && (detail.status === "pending" || detail.status === "in_progress") && detailInvoices.length > 0
  const canCancel = detail && (detail.status === "pending" || detail.status === "in_progress") && (role === "admin" || detail.created_by === user?.id)

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
            {role === "admin" ? "Genera reabastos y salidas a obra; almacén sube facturas y confirma." : "Recibe órdenes, sube la factura y confirma la entrega/recepción."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => openCreate("restock")}>
            <PackagePlus className="w-4 h-4 mr-1.5" /> Reabasto
          </Button>
          {role === "admin" && (
            <Button size="sm" className="cursor-pointer bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openCreate("dispatch")}>
              <Truck className="w-4 h-4 mr-1.5" /> Salida a obra
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Pendientes", value: pendingCount, icon: ClipboardList, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
          { label: "Reabastos", value: restockCount, icon: ArrowDownToLine, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
          { label: "Salidas", value: dispatchCount, icon: ArrowUpFromLine, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
          { label: "Completadas", value: completedCount, icon: CheckCircle2, color: "#4da8e8", bg: "rgba(1,116,189,0.12)" },
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
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={selectCls}>
          <option value="all">Todos los tipos</option><option value="restock">Reabasto</option><option value="dispatch">Salida a obra</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
          <option value="all">Todos los estados</option><option value="pending">Pendiente</option><option value="in_progress">En proceso</option><option value="completed">Completada</option><option value="cancelled">Cancelada</option>
        </select>
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
                <TableHead className="text-slate-400 font-semibold text-xs text-right">Acción</TableHead>
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
                      <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); openDetail(o) }}><Eye className="w-4 h-4" /></Button>
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
              {newType === "restock" ? <PackagePlus className="w-5 h-5 text-emerald-400" /> : <Truck className="w-5 h-5 text-violet-400" />}
              Nueva orden · {ORDER_TYPE_LABEL[newType]}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2 max-h-[72vh] overflow-y-auto pr-1">
            {newType === "dispatch" ? (
              <Field label="Obra destino *">
                <select value={newObra} onChange={(e) => setNewObra(e.target.value)} className={selectCls}>
                  <option value="">Selecciona una obra…</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.code ? `${o.code} · ` : ""}{o.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Proveedor"><Input value={newSupplier} onChange={(e) => setNewSupplier(e.target.value)} className={inputCls} placeholder="Comex, distribuidor…" /></Field>
            )}

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
                        <span className="text-xs text-slate-500 shrink-0">stock: {Number(p.stock)}</span>
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
                      <p className="text-[10px] text-slate-500 font-mono">{d.product.codigo} · {formatCurrency(Number(d.product.current_price))} · stock {Number(d.product.stock)}</p>
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
            <DialogTitle className="text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#4da8e8]" /> Orden {detail?.folio}
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
              </div>

              {/* Invoices */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Facturas ({detailInvoices.length})</p>
                <div className="space-y-2">
                  {detailInvoices.length === 0 && <p className="text-xs text-slate-500">Aún no se sube factura.</p>}
                  {detailInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-700/20 p-2.5">
                      <FileText className="w-4 h-4 text-[#4da8e8] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 truncate">{inv.invoice_number || inv.file_name}</p>
                        <p className="text-[10px] text-slate-500">{formatCurrency(Number(inv.amount))} · {formatDate(inv.date)}</p>
                      </div>
                      <Button size="sm" variant="ghost" className="cursor-pointer h-8 px-2 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => downloadInvoice(inv)}><Download className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </div>

                {/* Upload form (both roles, only when not completed/cancelled) */}
                {(detail.status === "pending" || detail.status === "in_progress") && (
                  <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-700/10 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"><Upload className="w-3.5 h-3.5" /> Subir factura</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input value={invNumber} onChange={(e) => setInvNumber(e.target.value)} className={inputCls} placeholder="No. factura / CFDI" />
                      <Input value={invAmount} onChange={(e) => setInvAmount(e.target.value)} className={inputCls} placeholder="Monto" />
                      <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className={inputCls} />
                      <Input type="file" accept=".pdf,.xml,.jpg,.jpeg,.png" onChange={(e) => setInvFile(e.target.files?.[0] ?? null)} className={`${inputCls} file:text-slate-300 file:bg-slate-600 file:border-0 file:rounded file:px-2 file:mr-2 text-xs`} />
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={uploadInvoice} disabled={busy || !invFile} className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Subir factura</Button>
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setDetail(null)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cerrar</Button>
                  {(detail.status === "pending" || detail.status === "in_progress") && (
                    <Button onClick={completeOrder} disabled={busy || !canComplete} title={!canComplete ? "Sube al menos una factura" : ""} className="cursor-pointer bg-green-600 hover:bg-green-700 text-white disabled:opacity-40">
                      {busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}<CheckCircle2 className="w-4 h-4 mr-1.5" /> Confirmar y {detail.type === "restock" ? "sumar stock" : "restar stock"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

const inputCls = "bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
const selectCls = "h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}
