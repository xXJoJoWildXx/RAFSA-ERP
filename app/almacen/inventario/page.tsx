"use client"

import { useState, useMemo, useEffect, useCallback } from "react"
import { AlmacenLayout } from "@/components/almacen-layout"
import { RoleGuard } from "@/lib/role-guard"
import { supabase } from "@/lib/supabaseClient"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  Package, Search, Eye, Layers, Tag, Loader2, CalendarClock,
  Barcode, Ruler, Weight, DollarSign, BoxIcon,
} from "lucide-react"
import {
  InventoryProduct,
  formatCurrency, formatDate, getPriceExpiryBadge,
} from "@/lib/inventory"

export default function AlmacenInventarioPage() {
  const [items, setItems] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [lineaFilter, setLineaFilter] = useState("all")

  const [detail, setDetail] = useState<InventoryProduct | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from("inventory_products").select("*").eq("is_active", true).order("descripcion")
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
    return arr
  }, [items, search, lineaFilter])

  const totalItems = items.length
  const lineasCount = LINEAS.length

  return (
    <RoleGuard allowed={["almacen", "admin"]}>
      <AlmacenLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center"><Package className="w-5 h-5 text-[#4da8e8]" /></div>
              Catálogo de productos
            </h1>
            <p className="text-sm text-slate-500 mt-1">Consulta de productos y precios (solo lectura)</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Artículos", value: totalItems, icon: Layers, color: "#4da8e8", bg: "rgba(1,116,189,0.12)" },
              { label: "Líneas", value: lineasCount, icon: Tag, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
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
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className="pl-9 bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" />
            </div>
            <select value={lineaFilter} onChange={(e) => setLineaFilter(e.target.value)} className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none cursor-pointer">
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
                    <TableHead className="text-slate-400 font-semibold text-xs">Unidad</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Ubicación</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Precio</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Caducidad precio</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-600" /> Cargando…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-12 text-slate-500"><Package className="w-10 h-10 mx-auto mb-2 text-slate-600" /><p>Sin artículos</p></TableCell></TableRow>
                  ) : filtered.map((item) => {
                    const pb = getPriceExpiryBadge(item.price_valid_until)
                    return (
                      <TableRow key={item.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => setDetail(item)}>
                        <TableCell className="font-mono text-xs text-[#4da8e8]">{item.codigo}</TableCell>
                        <TableCell><p className="text-sm font-medium text-slate-200 truncate max-w-[280px]">{item.descripcion}</p>{item.linea && <Badge className="mt-1 text-[10px] border bg-slate-700/60 text-slate-300 border-slate-600">{item.linea}</Badge>}</TableCell>
                        <TableCell className="text-sm text-slate-400">{item.unidad_venta}</TableCell>
                        <TableCell className="text-sm text-slate-400">{item.ubicacion ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm font-medium text-slate-200">{formatCurrency(Number(item.current_price))}</TableCell>
                        <TableCell><Badge className={`text-[10px] border ${pb.cls}`}>{pb.label}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700" onClick={(e) => { e.stopPropagation(); setDetail(item) }} title="Ver detalle"><Eye className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Detail (read-only) */}
        <Dialog open={!!detail} onOpenChange={(v) => { if (!v) setDetail(null) }}>
          <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-slate-100 p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700"><DialogTitle className="text-slate-100 flex items-center gap-2"><Package className="w-5 h-5 text-[#4da8e8]" /> Detalle del artículo</DialogTitle></DialogHeader>
            {detail && (
              <div className="px-6 pb-6 pt-4 space-y-4 max-h-[74vh] overflow-y-auto">
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{detail.descripcion}</h3>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge className="text-[10px] border bg-[#0174bd]/15 text-[#4da8e8] border-[#0174bd]/30 font-mono">{detail.codigo}</Badge>
                    <Badge className={`text-[10px] border ${getPriceExpiryBadge(detail.price_valid_until).cls}`}>Precio: {getPriceExpiryBadge(detail.price_valid_until).label}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Tag, label: "Línea", value: detail.linea ?? "—" },
                    { icon: Ruler, label: "Capacidad", value: detail.capacidad ?? "—" },
                    { icon: Weight, label: "Peso", value: detail.peso != null ? `${detail.peso} ${detail.um_peso}` : "—" },
                    { icon: Package, label: "Unidad de venta", value: detail.unidad_venta },
                    { icon: DollarSign, label: "Precio público", value: formatCurrency(Number(detail.current_price)) },
                    { icon: CalendarClock, label: "Caducidad precio", value: formatDate(detail.price_valid_until) },
                    { icon: Barcode, label: "Código de barras", value: detail.codigo_barras ?? "—" },
                    { icon: BoxIcon, label: "Ubicación", value: detail.ubicacion ?? "—" },
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
                <div className="flex justify-end pt-2">
                  <Button className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white" onClick={() => setDetail(null)}>Cerrar</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AlmacenLayout>
    </RoleGuard>
  )
}
