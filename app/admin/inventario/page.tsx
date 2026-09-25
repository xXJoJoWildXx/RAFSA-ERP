"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { supabase } from "@/lib/supabaseClient"
import { logActivity } from "@/lib/activityLog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Package, Search, Plus, Eye, Pencil, Trash2, Download, Layers, DollarSign,
  AlertTriangle, ChevronLeft, ChevronRight, X, Barcode, Weight, Ruler, Tag,
  ArrowUpDown, ArrowUp, ArrowDown, BoxIcon, ClipboardList, CalendarClock, History, Loader2,
} from "lucide-react"
import {
  InventoryProduct, PriceNotification, PriceHistoryRow,
  formatCurrency, formatDate, getStockBadge, getPriceExpiryBadge, daysUntil,
} from "@/lib/inventory"

type SortField = "codigo" | "descripcion" | "linea" | "current_price" | "stock" | "price_valid_until"
type SortDir = "asc" | "desc"

const emptyForm = {
  codigo: "", descripcion: "", unidad_venta: "pz", multiplo_venta: "1",
  capacidad: "", peso: "", um_peso: "kg", linea: "", codigo_barras: "",
  current_price: "", price_valid_until: "", stock: "0", stock_min: "0", ubicacion: "",
}

export default function InventarioAdminPage() {
  const [items, setItems] = useState<InventoryProduct[]>([])
  const [notifs, setNotifs] = useState<(PriceNotification & { producto?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [search, setSearch] = useState("")
  const [lineaFilter, setLineaFilter] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<string>("all") // all | low | out | price_soon
  const [sortField, setSortField] = useState<SortField>("descripcion")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [page, setPage] = useState(1)
  const perPage = 10

  const [detailItem, setDetailItem] = useState<InventoryProduct | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryProduct | null>(null)
  const [formData, setFormData] = useState({ ...emptyForm })
  const [deleteItem, setDeleteItem] = useState<InventoryProduct | null>(null)

  // Price + history dialogs
  const [priceItem, setPriceItem] = useState<InventoryProduct | null>(null)
  const [priceForm, setPriceForm] = useState({ price: "", valid_until: "", note: "" })
  const [historyItem, setHistoryItem] = useState<InventoryProduct | null>(null)
  const [history, setHistory] = useState<PriceHistoryRow[]>([])

  // ─── Data loading ───
  const loadData = useCallback(async () => {
    setLoading(true)
    const { data: products } = await supabase
      .from("inventory_products")
      .select("*")
      .order("descripcion", { ascending: true })

    const { data: notifRows } = await supabase
      .from("inventory_price_notifications")
      .select("*, inventory_products(descripcion, codigo)")
      .eq("status", "pending")
      .order("price_valid_until", { ascending: true })

    setItems((products ?? []) as InventoryProduct[])
    setNotifs(
      (notifRows ?? []).map((n: any) => ({
        ...n,
        producto: n.inventory_products
          ? `${n.inventory_products.descripcion} (${n.inventory_products.codigo})`
          : undefined,
      })),
    )
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const LINEAS = useMemo(
    () => [...new Set(items.map((i) => i.linea).filter(Boolean) as string[])].sort(),
    [items],
  )

  // ─── Filtering / sorting ───
  const filtered = useMemo(() => {
    let arr = [...items]
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter((i) =>
        i.codigo.toLowerCase().includes(q) ||
        i.descripcion.toLowerCase().includes(q) ||
        (i.codigo_barras ?? "").includes(q) ||
        (i.linea ?? "").toLowerCase().includes(q),
      )
    }
    if (lineaFilter !== "all") arr = arr.filter((i) => i.linea === lineaFilter)
    if (stockFilter === "low") arr = arr.filter((i) => i.stock > 0 && i.stock <= i.stock_min)
    if (stockFilter === "out") arr = arr.filter((i) => i.stock <= 0)
    if (stockFilter === "price_soon") arr = arr.filter((i) => {
      const d = daysUntil(i.price_valid_until); return d !== null && d <= 7
    })

    arr.sort((a, b) => {
      const av = a[sortField] as any, bv = b[sortField] as any
      if (av === null || av === undefined) return 1
      if (bv === null || bv === undefined) return -1
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number)
    })
    return arr
  }, [items, search, lineaFilter, stockFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  // KPIs
  const totalItems = items.length
  const totalStock = items.reduce((s, i) => s + Number(i.stock), 0)
  const totalValue = items.reduce((s, i) => s + Number(i.current_price) * Number(i.stock), 0)
  const lowStockCount = items.filter((i) => i.stock > 0 && i.stock <= i.stock_min).length
  const outOfStockCount = items.filter((i) => i.stock <= 0).length
  const priceSoonCount = items.filter((i) => { const d = daysUntil(i.price_valid_until); return d !== null && d <= 7 }).length

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc")
    else { setSortField(field); setSortDir("asc") }
  }
  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 text-slate-600" />
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1 text-[#4da8e8]" /> : <ArrowDown className="w-3 h-3 ml-1 text-[#4da8e8]" />
  }

  function openAddDialog() {
    setEditingItem(null)
    setFormData({ ...emptyForm })
    setFormOpen(true)
  }
  function openEditDialog(item: InventoryProduct) {
    setEditingItem(item)
    setFormData({
      codigo: item.codigo, descripcion: item.descripcion, unidad_venta: item.unidad_venta,
      multiplo_venta: String(item.multiplo_venta), capacidad: item.capacidad ?? "", peso: item.peso != null ? String(item.peso) : "",
      um_peso: item.um_peso, linea: item.linea ?? "", codigo_barras: item.codigo_barras ?? "",
      current_price: String(item.current_price), price_valid_until: item.price_valid_until ?? "",
      stock: String(item.stock), stock_min: String(item.stock_min), ubicacion: item.ubicacion ?? "",
    })
    setFormOpen(true)
  }

  // ─── Save product ───
  async function saveProduct() {
    if (!formData.codigo.trim() || !formData.descripcion.trim()) return
    setSaving(true)
    try {
      const base = {
        codigo: formData.codigo.trim(),
        descripcion: formData.descripcion.trim(),
        unidad_venta: formData.unidad_venta,
        multiplo_venta: Number(formData.multiplo_venta) || 1,
        capacidad: formData.capacidad || null,
        peso: formData.peso ? Number(formData.peso) : null,
        um_peso: formData.um_peso,
        linea: formData.linea || null,
        codigo_barras: formData.codigo_barras || null,
        stock_min: Number(formData.stock_min) || 0,
        ubicacion: formData.ubicacion || null,
      }
      const price = Number(formData.current_price) || 0
      const validUntil = formData.price_valid_until || null

      if (editingItem) {
        await supabase.from("inventory_products").update(base).eq("id", editingItem.id)
        // si cambió el precio o la fecha de caducidad → rotar historial
        if (price !== Number(editingItem.current_price) || validUntil !== editingItem.price_valid_until) {
          await supabase.rpc("inventory_set_price", {
            p_product_id: editingItem.id, p_price: price,
            p_valid_until: validUntil, p_note: "Edición de producto",
          })
        }
        await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.product", entity_id: editingItem.id, entity_label: base.descripcion, metadata: { action: "updated" } })
      } else {
        const { data: created, error } = await supabase
          .from("inventory_products")
          .insert({ ...base, current_price: price, stock: Number(formData.stock) || 0 })
          .select("id")
          .single()
        if (error) throw error
        if (created?.id) {
          await supabase.rpc("inventory_set_price", {
            p_product_id: created.id, p_price: price,
            p_valid_until: validUntil, p_note: "Alta de producto", p_source: "manual",
          })
          if (Number(formData.stock) > 0) {
            await supabase.rpc("inventory_register_movement", {
              p_product_id: created.id, p_type: "in", p_quantity: Number(formData.stock),
              p_reason: "initial_load", p_note: "Stock inicial",
            })
          }
        }
        await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.product", entity_id: created?.id, entity_label: base.descripcion, metadata: { action: "created" } })
      }
      setFormOpen(false)
      await loadData()
    } catch (e) {
      console.error(e)
      alert("No se pudo guardar el producto. Revisa el código (no puede repetirse).")
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteItem) return
    setSaving(true)
    await supabase.from("inventory_products").delete().eq("id", deleteItem.id)
    await logActivity({ event_type: "document.deleted" as any, entity_type: "inventory.product", entity_id: deleteItem.id, entity_label: deleteItem.descripcion })
    setDeleteItem(null)
    setSaving(false)
    await loadData()
  }

  // ─── Price update ───
  function openPriceDialog(item: InventoryProduct) {
    setPriceItem(item)
    setPriceForm({ price: String(item.current_price), valid_until: item.price_valid_until ?? "", note: "" })
  }
  async function savePrice() {
    if (!priceItem) return
    setSaving(true)
    await supabase.rpc("inventory_set_price", {
      p_product_id: priceItem.id,
      p_price: Number(priceForm.price) || 0,
      p_valid_until: priceForm.valid_until || null,
      p_note: priceForm.note || "Actualización de precio",
    })
    await logActivity({ event_type: "billing.cotizacion_updated" as any, entity_type: "inventory.price", entity_id: priceItem.id, entity_label: priceItem.descripcion, metadata: { price: priceForm.price, valid_until: priceForm.valid_until } })
    setPriceItem(null)
    setSaving(false)
    await loadData()
  }

  async function openHistory(item: InventoryProduct) {
    setHistoryItem(item)
    setHistory([])
    const { data } = await supabase
      .from("inventory_price_history")
      .select("*")
      .eq("product_id", item.id)
      .order("valid_from", { ascending: false })
    setHistory((data ?? []) as PriceHistoryRow[])
  }

  async function dismissNotif(id: string) {
    await supabase.from("inventory_price_notifications").update({ status: "dismissed" }).eq("id", id)
    setNotifs((prev) => prev.filter((n) => n.id !== id))
  }

  function exportCsv() {
    const headers = ["codigo", "descripcion", "linea", "capacidad", "unidad_venta", "codigo_barras", "current_price", "price_valid_until", "stock", "stock_min", "ubicacion"]
    const rows = filtered.map((i) => headers.map((h) => {
      const v = (i as any)[h]
      const s = v == null ? "" : String(v)
      return `"${s.replace(/"/g, '""')}"`
    }).join(","))
    const csv = [headers.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `inventario_${new Date().toISOString().slice(0, 10)}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center">
                  <Package className="w-5 h-5 text-[#4da8e8]" />
                </div>
                Inventario
              </h1>
              <p className="text-sm text-slate-500 mt-1">Catálogo, precios y existencias de la empresa</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden">
                <span className="px-3 py-1.5 text-xs font-semibold bg-[#0174bd]/15 text-[#4da8e8]">Catálogo</span>
                <Link href="/admin/inventario/ordenes" className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5" /> Órdenes
                </Link>
              </div>
              <Button variant="outline" size="sm" onClick={exportCsv}
                className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
                <Download className="w-4 h-4 mr-1.5" /> Exportar
              </Button>
              <Button size="sm" className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white" onClick={openAddDialog}>
                <Plus className="w-4 h-4 mr-1.5" /> Nuevo artículo
              </Button>
            </div>
          </div>

          {/* Price-expiry notifications banner */}
          {notifs.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-center gap-2 mb-2">
                <CalendarClock className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">
                  {notifs.length} precio{notifs.length !== 1 ? "s" : ""} por caducar (≤ 7 días)
                </span>
              </div>
              <div className="space-y-1.5">
                {notifs.slice(0, 5).map((n) => {
                  const d = daysUntil(n.price_valid_until)
                  return (
                    <div key={n.id} className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-amber-200/90 truncate">
                        {n.producto} · caduca {formatDate(n.price_valid_until)}
                        {d !== null && <span className="ml-1 text-amber-400 font-semibold">({d < 0 ? "vencido" : `${d}d`})</span>}
                      </span>
                      <button onClick={() => dismissNotif(n.id)} className="text-amber-400/70 hover:text-amber-300 shrink-0" title="Descartar">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
                {notifs.length > 5 && <p className="text-[11px] text-amber-400/70">y {notifs.length - 5} más…</p>}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            {[
              { label: "Total artículos", value: totalItems, icon: Layers, color: "#4da8e8", bg: "rgba(1,116,189,0.12)" },
              { label: "Unidades en stock", value: totalStock.toLocaleString("es-MX"), icon: BoxIcon, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
              { label: "Valor inventario", value: formatCurrency(totalValue), icon: DollarSign, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
              { label: "Stock bajo", value: lowStockCount, icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", clickFilter: "low" },
              { label: "Agotados", value: outOfStockCount, icon: Package, color: "#ef4444", bg: "rgba(239,68,68,0.12)", clickFilter: "out" },
              { label: "Precio por caducar", value: priceSoonCount, icon: CalendarClock, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", clickFilter: "price_soon" },
            ].map((kpi) => {
              const Icon = kpi.icon
              const isActive = "clickFilter" in kpi && stockFilter === (kpi as any).clickFilter
              return (
                <div key={kpi.label}
                  className={`rounded-xl border p-4 transition-all duration-200 ${isActive ? "border-[#0174bd]/50 bg-[#0174bd]/10 ring-1 ring-[#0174bd]/20" : "border-slate-700/60 bg-slate-800/50 hover:border-slate-600"} ${"clickFilter" in kpi ? "cursor-pointer" : ""}`}
                  onClick={() => { if ("clickFilter" in kpi) { const cf = (kpi as any).clickFilter; setStockFilter(stockFilter === cf ? "all" : cf); setPage(1) } }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: kpi.bg }}>
                      <Icon className="w-[18px] h-[18px]" style={{ color: kpi.color }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-slate-500 truncate">{kpi.label}</p>
                      <p className="text-lg font-bold text-slate-100 truncate">{kpi.value}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Buscar por código, descripción o código de barras..."
                  className="pl-9 bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={lineaFilter} onChange={(e) => { setLineaFilter(e.target.value); setPage(1) }}
                  className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none">
                  <option value="all">Todas las líneas</option>
                  {LINEAS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                {(search || lineaFilter !== "all" || stockFilter !== "all") && (
                  <Button variant="ghost" size="sm" className="cursor-pointer text-xs text-slate-400 hover:text-white"
                    onClick={() => { setSearch(""); setLineaFilter("all"); setStockFilter("all"); setPage(1) }}>
                    Limpiar filtros
                  </Button>
                )}
              </div>
              <div className="ml-auto text-xs text-slate-500">{filtered.length} artículo{filtered.length !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none" onClick={() => toggleSort("codigo")}>
                      <span className="flex items-center">Código <SortIcon field="codigo" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none min-w-[260px]" onClick={() => toggleSort("descripcion")}>
                      <span className="flex items-center">Descripción <SortIcon field="descripcion" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right cursor-pointer select-none" onClick={() => toggleSort("current_price")}>
                      <span className="flex items-center justify-end">Precio <SortIcon field="current_price" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none" onClick={() => toggleSort("price_valid_until")}>
                      <span className="flex items-center">Caducidad precio <SortIcon field="price_valid_until" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right cursor-pointer select-none" onClick={() => toggleSort("stock")}>
                      <span className="flex items-center justify-end">Stock <SortIcon field="stock" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Estado</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-600" /> Cargando inventario…
                    </TableCell></TableRow>
                  ) : paginated.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500">
                      <Package className="w-10 h-10 mx-auto mb-2 text-slate-600" /><p>No se encontraron artículos</p>
                    </TableCell></TableRow>
                  ) : paginated.map((item) => {
                    const badge = getStockBadge(Number(item.stock), Number(item.stock_min))
                    const pb = getPriceExpiryBadge(item.price_valid_until)
                    return (
                      <TableRow key={item.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                        <TableCell className="font-mono text-xs text-[#4da8e8]">{item.codigo}</TableCell>
                        <TableCell>
                          <p className="text-sm font-medium text-slate-200 truncate max-w-[300px]">{item.descripcion}</p>
                          {item.linea && <Badge className="mt-1 text-[10px] border bg-slate-700/60 text-slate-300 border-slate-600">{item.linea}</Badge>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-medium text-slate-200">{formatCurrency(Number(item.current_price))}</TableCell>
                        <TableCell><Badge className={`text-[10px] border ${pb.cls}`}>{pb.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <span className={`text-sm font-bold ${item.stock <= 0 ? "text-red-400" : item.stock <= item.stock_min ? "text-amber-400" : "text-slate-200"}`}>{Number(item.stock)}</span>
                          <span className="text-xs text-slate-600 ml-1">{item.unidad_venta}</span>
                        </TableCell>
                        <TableCell><Badge className={`text-[10px] border ${badge.cls}`}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => openPriceDialog(item)} title="Actualizar precio"><DollarSign className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => setDetailItem(item)} title="Ver detalle"><Eye className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-[#4da8e8] hover:bg-[#0174bd]/10" onClick={() => openEditDialog(item)} title="Editar"><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10" onClick={() => setDeleteItem(item)} title="Eliminar"><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/60">
                <p className="text-xs text-slate-500">Mostrando {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} de {filtered.length}</p>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={safePage <= 1} className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30" onClick={() => setPage(safePage - 1)}><ChevronLeft className="w-4 h-4" /></Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, safePage - 3), safePage + 2).map((p) => (
                    <Button key={p} size="sm" variant="ghost" className={`cursor-pointer h-8 w-8 p-0 text-xs ${p === safePage ? "bg-[#0174bd]/20 text-[#4da8e8] font-bold" : "text-slate-400 hover:text-white hover:bg-slate-700"}`} onClick={() => setPage(p)}>{p}</Button>
                  ))}
                  <Button size="sm" variant="ghost" disabled={safePage >= totalPages} className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30" onClick={() => setPage(safePage + 1)}><ChevronRight className="w-4 h-4" /></Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Detail dialog */}
        <Dialog open={!!detailItem} onOpenChange={(v) => { if (!v) setDetailItem(null) }}>
          <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-slate-100 p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
              <DialogTitle className="text-slate-100 flex items-center gap-2"><Package className="w-5 h-5 text-[#4da8e8]" /> Detalle del artículo</DialogTitle>
            </DialogHeader>
            {detailItem && (
              <div className="px-6 pb-6 pt-4 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{detailItem.descripcion}</h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge className="text-[10px] border bg-[#0174bd]/15 text-[#4da8e8] border-[#0174bd]/30 font-mono">{detailItem.codigo}</Badge>
                    <Badge className={`text-[10px] border ${getStockBadge(Number(detailItem.stock), Number(detailItem.stock_min)).cls}`}>{getStockBadge(Number(detailItem.stock), Number(detailItem.stock_min)).label}</Badge>
                    <Badge className={`text-[10px] border ${getPriceExpiryBadge(detailItem.price_valid_until).cls}`}>Precio: {getPriceExpiryBadge(detailItem.price_valid_until).label}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Tag, label: "Línea", value: detailItem.linea ?? "—" },
                    { icon: Ruler, label: "Capacidad", value: detailItem.capacidad ?? "—" },
                    { icon: Weight, label: "Peso", value: detailItem.peso != null ? `${detailItem.peso} ${detailItem.um_peso}` : "—" },
                    { icon: Package, label: "Unidad de venta", value: detailItem.unidad_venta },
                    { icon: DollarSign, label: "Precio público", value: formatCurrency(Number(detailItem.current_price)) },
                    { icon: CalendarClock, label: "Caducidad precio", value: formatDate(detailItem.price_valid_until) },
                    { icon: Layers, label: "Stock actual", value: `${Number(detailItem.stock)} (mín: ${Number(detailItem.stock_min)})` },
                    { icon: Barcode, label: "Código de barras", value: detailItem.codigo_barras ?? "—" },
                    { icon: BoxIcon, label: "Ubicación", value: detailItem.ubicacion ?? "—" },
                  ].map((row) => {
                    const Icon = row.icon
                    return (
                      <div key={row.label} className="rounded-lg border border-slate-700/60 bg-slate-700/30 p-3">
                        <div className="flex items-center gap-2 mb-1"><Icon className="w-3.5 h-3.5 text-slate-500" /><span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{row.label}</span></div>
                        <p className="text-sm font-medium text-slate-200">{row.value}</p>
                      </div>
                    )
                  })}
                </div>
                <div className="rounded-lg border border-[#0174bd]/30 bg-[#0174bd]/10 p-4 flex items-center justify-between">
                  <span className="text-sm text-slate-300">Valor total en inventario</span>
                  <span className="text-lg font-bold text-[#4da8e8]">{formatCurrency(Number(detailItem.current_price) * Number(detailItem.stock))}</span>
                </div>
                <div className="flex justify-between gap-2 pt-2">
                  <Button variant="outline" className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => openHistory(detailItem)}>
                    <History className="w-4 h-4 mr-1.5" /> Historial de precio
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="outline" className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white" onClick={() => { setDetailItem(null); openEditDialog(detailItem) }}><Pencil className="w-4 h-4 mr-1.5" /> Editar</Button>
                    <Button className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white" onClick={() => setDetailItem(null)}>Cerrar</Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add/Edit dialog */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle className="text-slate-100">{editingItem ? "Editar artículo" : "Nuevo artículo"}</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2 max-h-[70vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Código *"><Input value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })} className={inputCls} placeholder="19A0..." /></Field>
                <Field label="Código de barras"><Input value={formData.codigo_barras} onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })} className={inputCls} placeholder="7500..." /></Field>
              </div>
              <Field label="Descripción *"><Input value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })} className={inputCls} placeholder="VINIMEX CLASICA..." /></Field>
              <div className="grid grid-cols-3 gap-3">
                <Field label="Línea"><Input value={formData.linea} onChange={(e) => setFormData({ ...formData, linea: e.target.value })} className={inputCls} placeholder="VINILICAS" /></Field>
                <Field label="Capacidad"><Input value={formData.capacidad} onChange={(e) => setFormData({ ...formData, capacidad: e.target.value })} className={inputCls} placeholder="19 L" /></Field>
                <Field label="Unidad venta">
                  <select value={formData.unidad_venta} onChange={(e) => setFormData({ ...formData, unidad_venta: e.target.value })} className={selectCls}>
                    <option value="pz">Pieza</option><option value="caja">Caja</option><option value="paquete">Paquete</option><option value="litro">Litro</option><option value="kg">Kilogramo</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <Field label="Peso"><Input value={formData.peso} onChange={(e) => setFormData({ ...formData, peso: e.target.value })} className={inputCls} placeholder="23.49" /></Field>
                <Field label="UM Peso">
                  <select value={formData.um_peso} onChange={(e) => setFormData({ ...formData, um_peso: e.target.value })} className={selectCls}><option value="kg">kg</option><option value="g">g</option><option value="lb">lb</option></select>
                </Field>
                <Field label="Múltiplo"><Input value={formData.multiplo_venta} onChange={(e) => setFormData({ ...formData, multiplo_venta: e.target.value })} className={inputCls} placeholder="1" /></Field>
                <Field label="Ubicación"><Input value={formData.ubicacion} onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })} className={inputCls} placeholder="A-01-01" /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Precio público *"><Input value={formData.current_price} onChange={(e) => setFormData({ ...formData, current_price: e.target.value })} className={inputCls} placeholder="2484.89" /></Field>
                <Field label="Caducidad del precio"><Input type="date" value={formData.price_valid_until} onChange={(e) => setFormData({ ...formData, price_valid_until: e.target.value })} className={inputCls} /></Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label={editingItem ? "Stock actual (usa órdenes/kardex)" : "Stock inicial"}>
                  <Input value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })} className={inputCls} placeholder="0" disabled={!!editingItem} />
                </Field>
                <Field label="Stock mínimo"><Input value={formData.stock_min} onChange={(e) => setFormData({ ...formData, stock_min: e.target.value })} className={inputCls} placeholder="0" /></Field>
              </div>
              {editingItem && <p className="text-[11px] text-slate-500">El stock se ajusta con órdenes de reabasto/salida o movimientos de kardex, no desde aquí.</p>}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                <Button variant="outline" onClick={() => setFormOpen(false)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
                <Button className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white" onClick={saveProduct} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}{editingItem ? "Guardar cambios" : "Crear artículo"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Price dialog */}
        <Dialog open={!!priceItem} onOpenChange={(v) => { if (!v) setPriceItem(null) }}>
          <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle className="text-slate-100 flex items-center gap-2"><DollarSign className="w-5 h-5 text-emerald-400" /> Actualizar precio</DialogTitle></DialogHeader>
            {priceItem && (
              <div className="space-y-4 mt-2">
                <p className="text-sm text-slate-300">{priceItem.descripcion} <span className="font-mono text-xs text-[#4da8e8]">({priceItem.codigo})</span></p>
                <p className="text-xs text-slate-500">Precio actual: {formatCurrency(Number(priceItem.current_price))} · caduca {formatDate(priceItem.price_valid_until)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Nuevo precio *"><Input value={priceForm.price} onChange={(e) => setPriceForm({ ...priceForm, price: e.target.value })} className={inputCls} placeholder="0.00" /></Field>
                  <Field label="Nueva caducidad"><Input type="date" value={priceForm.valid_until} onChange={(e) => setPriceForm({ ...priceForm, valid_until: e.target.value })} className={inputCls} /></Field>
                </div>
                <Field label="Nota (opcional)"><Input value={priceForm.note} onChange={(e) => setPriceForm({ ...priceForm, note: e.target.value })} className={inputCls} placeholder="Ajuste de lista de precios…" /></Field>
                <p className="text-[11px] text-slate-500">El precio anterior se conserva en el historial. La notificación de caducidad se genera automáticamente 1 semana antes.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setPriceItem(null)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
                  <Button className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white" onClick={savePrice} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Guardar precio</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* History dialog */}
        <Dialog open={!!historyItem} onOpenChange={(v) => { if (!v) setHistoryItem(null) }}>
          <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle className="text-slate-100 flex items-center gap-2"><History className="w-5 h-5 text-[#4da8e8]" /> Historial de precios</DialogTitle></DialogHeader>
            {historyItem && (
              <div className="space-y-3 mt-2">
                <p className="text-sm text-slate-300">{historyItem.descripcion}</p>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {history.length === 0 ? <p className="text-xs text-slate-500 py-4 text-center">Sin historial.</p> : history.map((h) => (
                    <div key={h.id} className={`rounded-lg border p-3 ${h.is_current ? "border-[#0174bd]/40 bg-[#0174bd]/10" : "border-slate-700/60 bg-slate-700/20"}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-200">{formatCurrency(Number(h.price))}</span>
                        {h.is_current && <Badge className="text-[10px] border bg-green-500/15 text-green-400 border-green-500/30">Vigente</Badge>}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-1">Desde {formatDate(h.valid_from)} · caduca {formatDate(h.valid_until)} · {h.source}</p>
                      {h.note && <p className="text-[11px] text-slate-400 mt-0.5">{h.note}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={!!deleteItem} onOpenChange={(v) => { if (!v) setDeleteItem(null) }}>
          <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle className="text-slate-100">Eliminar artículo</DialogTitle></DialogHeader>
            {deleteItem && (
              <div className="space-y-4 mt-2">
                <p className="text-sm text-slate-300">¿Estás seguro de eliminar <span className="font-semibold text-white">{deleteItem.descripcion}</span>?</p>
                <p className="text-xs text-slate-500">Se borrará también su historial de precios y kardex. Esta acción no se puede deshacer.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDeleteItem(null)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
                  <Button onClick={confirmDelete} disabled={saving} className="cursor-pointer bg-red-600 hover:bg-red-700 text-white">{saving && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}<Trash2 className="w-4 h-4 mr-1.5" /> Eliminar</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </RoleGuard>
  )
}

const inputCls = "bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
const selectCls = "h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none w-full"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {children}
    </div>
  )
}
