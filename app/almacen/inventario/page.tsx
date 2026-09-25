"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { AlmacenLayout } from "@/components/almacen-layout"
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
  Package, Search, Eye, Layers, BoxIcon, AlertTriangle, Loader2,
  ArrowLeftRight, History, CalendarClock,
} from "lucide-react"
import {
  InventoryProduct, StockMovement,
  formatCurrency, formatDate, getStockBadge, getPriceExpiryBadge,
} from "@/lib/inventory"

const REASON_LABEL: Record<string, string> = {
  order_restock: "Reabasto (orden)", order_dispatch: "Salida a obra (orden)",
  manual_adjustment: "Ajuste manual", initial_load: "Carga inicial", import: "Importación",
}

export default function AlmacenInventarioPage() {
  const [items, setItems] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [search, setSearch] = useState("")
  const [lineaFilter, setLineaFilter] = useState("all")
  const [stockFilter, setStockFilter] = useState("all")

  const [detail, setDetail] = useState<InventoryProduct | null>(null)
  const [movements, setMovements] = useState<StockMovement[]>([])

  const [moveItem, setMoveItem] = useState<InventoryProduct | null>(null)
  const [moveForm, setMoveForm] = useState({ type: "in", quantity: "", note: "" })

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from("inventory_products").select("*").order("descripcion")
    setItems((data ?? []) as InventoryProduct[])
    setLoading(false)
  }, [])
  useEffect(() => { loadData() }, [loadData])

  const LINEAS = useMemo(() => [...new Set(items.map((i) => i.linea).filter(Boolean) as string[])].sort(), [items])

  const filtered = useMemo(() => {
    let arr = [...items]
    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter((i) => i.codigo.toLowerCase().includes(q) || i.descripcion.toLowerCase().includes(q) || (i.codigo_barras ?? "").includes(q))
    }
    if (lineaFilter !== "all") arr = arr.filter((i) => i.linea === lineaFilter)
    if (stockFilter === "low") arr = arr.filter((i) => i.stock > 0 && i.stock <= i.stock_min)
    if (stockFilter === "out") arr = arr.filter((i) => i.stock <= 0)
    return arr
  }, [items, search, lineaFilter, stockFilter])

  const totalItems = items.length
  const totalStock = items.reduce((s, i) => s + Number(i.stock), 0)
  const lowStockCount = items.filter((i) => i.stock > 0 && i.stock <= i.stock_min).length
  const outCount = items.filter((i) => i.stock <= 0).length

  async function openDetail(item: InventoryProduct) {
    setDetail(item); setMovements([])
    const { data } = await supabase.from("inventory_stock_movements").select("*").eq("product_id", item.id).order("created_at", { ascending: false }).limit(50)
    setMovements((data ?? []) as StockMovement[])
  }

  function openMove(item: InventoryProduct) {
    setMoveItem(item); setMoveForm({ type: "in", quantity: "", note: "" })
  }
  async function saveMove() {
    if (!moveItem || !(Number(moveForm.quantity) > 0 && moveForm.type !== "adjustment") && !(moveForm.type === "adjustment" && Number(moveForm.quantity) !== 0)) {
      alert("Ingresa una cantidad válida."); return
    }
    setBusy(true)
    try {
      const { error } = await supabase.rpc("inventory_register_movement", {
        p_product_id: moveItem.id, p_type: moveForm.type,
        p_quantity: Number(moveForm.quantity),
        p_reason: "manual_adjustment", p_note: moveForm.note || null,
      })
      if (error) throw error
      await logActivity({ event_type: "document.uploaded" as any, entity_type: "inventory.movement", entity_id: moveItem.id, entity_label: moveItem.descripcion, metadata: { type: moveForm.type, qty: moveForm.quantity } })
      setMoveItem(null)
      await loadData()
    } catch (e: any) {
      console.error(e); alert(e?.message || "No se pudo registrar el movimiento (¿stock insuficiente?).")
    } finally { setBusy(false) }
  }

  return (
    <RoleGuard allowed={["almacen", "admin"]}>
      <AlmacenLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center"><Package className="w-5 h-5 text-[#4da8e8]" /></div>
              Inventario
            </h1>
            <p className="text-sm text-slate-500 mt-1">Existencias y movimientos del almacén</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Artículos", value: totalItems, icon: Layers, color: "#4da8e8", bg: "rgba(1,116,189,0.12)" },
              { label: "Unidades en stock", value: totalStock.toLocaleString("es-MX"), icon: BoxIcon, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
              { label: "Stock bajo", value: lowStockCount, icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", cf: "low" },
              { label: "Agotados", value: outCount, icon: Package, color: "#ef4444", bg: "rgba(239,68,68,0.12)", cf: "out" },
            ].map((kpi) => {
              const Icon = kpi.icon
              const active = "cf" in kpi && stockFilter === (kpi as any).cf
              return (
                <div key={kpi.label} className={`rounded-xl border p-4 transition-all ${active ? "border-[#0174bd]/50 bg-[#0174bd]/10" : "border-slate-700/60 bg-slate-800/50"} ${"cf" in kpi ? "cursor-pointer" : ""}`}
                  onClick={() => { if ("cf" in kpi) setStockFilter(stockFilter === (kpi as any).cf ? "all" : (kpi as any).cf) }}>
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: kpi.bg }}><Icon className="w-[18px] h-[18px]" style={{ color: kpi.color }} /></div>
                    <div className="min-w-0"><p className="text-[11px] font-medium text-slate-500 truncate">{kpi.label}</p><p className="text-lg font-bold text-slate-100">{kpi.value}</p></div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Filters */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className="pl-9 bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" />
            </div>
            <select value={lineaFilter} onChange={(e) => setLineaFilter(e.target.value)} className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none">
              <option value="all">Todas las líneas</option>
              {LINEAS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <span className="ml-auto text-xs text-slate-500">{filtered.length} artículo{filtered.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Table */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-semibold text-xs">Código</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs min-w-[240px]">Descripción</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Ubicación</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Stock</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Estado</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-500"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-600" /> Cargando…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-12 text-slate-500"><Package className="w-10 h-10 mx-auto mb-2 text-slate-600" /><p>Sin artículos</p></TableCell></TableRow>
                  ) : filtered.map((item) => {
                    const badge = getStockBadge(Number(item.stock), Number(item.stock_min))
                    return (
                      <TableRow key={item.id} className="border-slate-700/40 hover:bg-slate-700/20">
                        <TableCell className="font-mono text-xs text-[#4da8e8]">{item.codigo}</TableCell>
                        <TableCell><p className="text-sm font-medium text-slate-200 truncate max-w-[280px]">{item.descripcion}</p>{item.linea && <Badge className="mt-1 text-[10px] border bg-slate-700/60 text-slate-300 border-slate-600">{item.linea}</Badge>}</TableCell>
                        <TableCell className="text-sm text-slate-400">{item.ubicacion ?? "—"}</TableCell>
                        <TableCell className="text-right"><span className={`text-sm font-bold ${item.stock <= 0 ? "text-red-400" : item.stock <= item.stock_min ? "text-amber-400" : "text-slate-200"}`}>{Number(item.stock)}</span><span className="text-xs text-slate-600 ml-1">{item.unidad_venta}</span></TableCell>
                        <TableCell><Badge className={`text-[10px] border ${badge.cls}`}>{badge.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => openMove(item)} title="Movimiento de stock"><ArrowLeftRight className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={() => openDetail(item)} title="Ver detalle / kardex"><Eye className="w-4 h-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Detail + kardex */}
        <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null) }}>
          <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100 p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700"><DialogTitle className="text-slate-100 flex items-center gap-2"><Package className="w-5 h-5 text-[#4da8e8]" /> {detail?.descripcion}</DialogTitle></DialogHeader>
            {detail && (
              <div className="px-6 pb-6 pt-4 space-y-4 max-h-[74vh] overflow-y-auto">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border border-slate-700/60 bg-slate-700/30 p-3"><p className="text-[10px] text-slate-500 uppercase">Stock</p><p className="text-lg font-bold text-slate-100">{Number(detail.stock)}</p></div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-700/30 p-3"><p className="text-[10px] text-slate-500 uppercase">Mínimo</p><p className="text-lg font-bold text-slate-100">{Number(detail.stock_min)}</p></div>
                  <div className="rounded-lg border border-slate-700/60 bg-slate-700/30 p-3"><p className="text-[10px] text-slate-500 uppercase">Precio</p><p className="text-sm font-bold text-slate-100">{formatCurrency(Number(detail.current_price))}</p></div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400"><CalendarClock className="w-3.5 h-3.5" /> Caducidad precio: <Badge className={`text-[10px] border ${getPriceExpiryBadge(detail.price_valid_until).cls}`}>{getPriceExpiryBadge(detail.price_valid_until).label}</Badge></div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5"><History className="w-3.5 h-3.5" /> Kardex (últimos movimientos)</p>
                  <div className="space-y-1.5">
                    {movements.length === 0 && <p className="text-xs text-slate-500 py-2">Sin movimientos.</p>}
                    {movements.map((m) => (
                      <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-700/60 bg-slate-700/20 p-2.5">
                        <div className="min-w-0">
                          <p className="text-xs text-slate-300">{REASON_LABEL[m.reason] ?? m.reason}</p>
                          <p className="text-[10px] text-slate-500">{formatDate(m.created_at)} · {Number(m.stock_before)} → {Number(m.stock_after)}</p>
                        </div>
                        <span className={`text-sm font-bold shrink-0 ${m.movement_type === "in" ? "text-green-400" : m.movement_type === "out" ? "text-red-400" : "text-amber-400"}`}>
                          {m.movement_type === "in" ? "+" : m.movement_type === "out" ? "−" : "±"}{Number(m.quantity)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Movement dialog */}
        <Dialog open={!!moveItem} onOpenChange={(v) => { if (!v) setMoveItem(null) }}>
          <DialogContent className="max-w-md bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader><DialogTitle className="text-slate-100 flex items-center gap-2"><ArrowLeftRight className="w-5 h-5 text-emerald-400" /> Movimiento de stock</DialogTitle></DialogHeader>
            {moveItem && (
              <div className="space-y-4 mt-2">
                <p className="text-sm text-slate-300">{moveItem.descripcion} <span className="font-mono text-xs text-[#4da8e8]">({moveItem.codigo})</span></p>
                <p className="text-xs text-slate-500">Stock actual: <span className="font-semibold text-slate-300">{Number(moveItem.stock)} {moveItem.unidad_venta}</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Tipo</label>
                    <select value={moveForm.type} onChange={(e) => setMoveForm({ ...moveForm, type: e.target.value })} className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none">
                      <option value="in">Entrada (+)</option><option value="out">Salida (−)</option><option value="adjustment">Ajuste (±)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Cantidad</label>
                    <Input value={moveForm.quantity} onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]" placeholder={moveForm.type === "adjustment" ? "+/− delta" : "0"} />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Nota</label>
                  <Input value={moveForm.note} onChange={(e) => setMoveForm({ ...moveForm, note: e.target.value })} className="bg-slate-700/60 border-slate-600 text-slate-100 focus:border-[#0174bd]" placeholder="Motivo del movimiento…" />
                </div>
                <p className="text-[11px] text-slate-500">Para reabastos con factura de proveedor usa una orden de reabasto. Este movimiento es para ajustes directos de almacén.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setMoveItem(null)} className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">Cancelar</Button>
                  <Button onClick={saveMove} disabled={busy} className="cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white">{busy && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />}Registrar</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AlmacenLayout>
    </RoleGuard>
  )
}
