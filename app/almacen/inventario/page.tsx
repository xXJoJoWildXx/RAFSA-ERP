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
  Barcode, Ruler, Weight, DollarSign, BoxIcon, ChevronDown, Check,
} from "lucide-react"
import {
  InventoryProduct,
  formatCurrency, formatDate, getPriceExpiryBadge, withIva,
} from "@/lib/inventory"

export default function AlmacenInventarioPage() {
  const [items, setItems] = useState<InventoryProduct[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState("")
  const [lineaFilter, setLineaFilter] = useState("all")
  const [lineaMenuOpen, setLineaMenuOpen] = useState(false)

  const [detail, setDetail] = useState<InventoryProduct | null>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    // PostgREST devuelve máx. 1000 filas por consulta → paginamos para traer TODO.
    const PAGE = 1000
    let all: InventoryProduct[] = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("inventory_products")
        .select("*")
        .eq("is_active", true)
        .order("descripcion")
        .range(from, from + PAGE - 1)
      if (error || !data) break
      all = all.concat(data as InventoryProduct[])
      if (data.length < PAGE) break
    }
    setItems(all)
    setLoading(false)
  }, [])
  useEffect(() => { loadData() }, [loadData])

  const LINEAS = useMemo(() => [...new Set(items.map((i) => i.linea).filter(Boolean) as string[])].sort(), [items])
  const lineaCounts = useMemo(() => {
    const m: Record<string, number> = {}
    for (const i of items) if (i.linea) m[i.linea] = (m[i.linea] ?? 0) + 1
    return m
  }, [items])

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
            {/* Filtro de líneas — selector con estética de marca */}
            <div className="relative">
              <button type="button" onClick={() => setLineaMenuOpen((v) => !v)}
                className={`group h-10 inline-flex items-center gap-2 rounded-lg border px-3 text-sm transition-colors cursor-pointer outline-none ${lineaFilter !== "all" ? "border-[#0174bd]/50 bg-[#0174bd]/10 text-[#4da8e8]" : "border-slate-600 bg-slate-700/60 text-slate-200 hover:border-slate-500"}`}>
                <Layers className={`w-4 h-4 ${lineaFilter !== "all" ? "text-[#4da8e8]" : "text-slate-400 group-hover:text-slate-300"}`} />
                <span className="max-w-[180px] truncate font-medium">{lineaFilter === "all" ? "Todas las líneas" : lineaFilter}</span>
                <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-200 ${lineaMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {lineaMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setLineaMenuOpen(false)} />
                  <div className="absolute z-50 mt-2 w-72 rounded-xl border border-slate-700 bg-slate-800 shadow-2xl shadow-black/40 overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-700/70 flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-[#4da8e8]" />
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Filtrar por línea</span>
                      <span className="ml-auto text-[11px] text-slate-500">{LINEAS.length}</span>
                    </div>
                    <div className="max-h-72 overflow-y-auto py-1">
                      <button type="button" onClick={() => { setLineaFilter("all"); setLineaMenuOpen(false) }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${lineaFilter === "all" ? "bg-[#0174bd]/15 text-[#4da8e8]" : "text-slate-200 hover:bg-slate-700/60"}`}>
                        <Layers className="w-4 h-4 shrink-0 text-slate-400" />
                        <span className="flex-1 font-medium">Todas las líneas</span>
                        <span className="text-[11px] text-slate-500">{items.length}</span>
                        {lineaFilter === "all" && <Check className="w-4 h-4 text-[#4da8e8]" />}
                      </button>
                      {LINEAS.map((l) => (
                        <button key={l} type="button" onClick={() => { setLineaFilter(l); setLineaMenuOpen(false) }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors cursor-pointer ${lineaFilter === l ? "bg-[#0174bd]/15 text-[#4da8e8]" : "text-slate-200 hover:bg-slate-700/60"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${lineaFilter === l ? "bg-[#4da8e8]" : "bg-slate-600"}`} />
                          <span className="flex-1 truncate">{l}</span>
                          <span className="text-[11px] text-slate-500 tabular-nums">{lineaCounts[l] ?? 0}</span>
                          {lineaFilter === l && <Check className="w-4 h-4 shrink-0 text-[#4da8e8]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
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
                    <TableHead className="text-slate-400 font-semibold text-xs">Capacidad</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Unidad</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-center">Múltiplo</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Precio s/IVA</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Precio c/IVA</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin text-slate-600" /> Cargando…</TableCell></TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-12 text-slate-500"><Package className="w-10 h-10 mx-auto mb-2 text-slate-600" /><p>Sin artículos</p></TableCell></TableRow>
                  ) : filtered.map((item) => {
                    const iva = Number(item.price_with_iva) || withIva(item.current_price)
                    return (
                      <TableRow key={item.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors cursor-pointer" onClick={() => setDetail(item)}>
                        <TableCell className="font-mono text-xs text-[#4da8e8]">{item.codigo}</TableCell>
                        <TableCell><p className="text-sm font-medium text-slate-200 truncate max-w-[280px]">{item.descripcion}</p>{item.linea && <Badge className="mt-1 text-[10px] border bg-slate-700/60 text-slate-300 border-slate-600">{item.linea}</Badge>}</TableCell>
                        <TableCell className="text-sm text-slate-300 whitespace-nowrap">{item.capacidad ?? "—"}</TableCell>
                        <TableCell className="text-sm text-slate-400">{item.unidad_venta}</TableCell>
                        <TableCell className="text-center text-sm text-slate-400 whitespace-nowrap">{item.multiplo_venta}</TableCell>
                        <TableCell className="text-right text-sm text-slate-400 whitespace-nowrap">{formatCurrency(Number(item.current_price))}</TableCell>
                        <TableCell className="text-right text-sm font-semibold text-slate-100 whitespace-nowrap">{formatCurrency(iva)}</TableCell>
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
                    { icon: DollarSign, label: "Precio s/IVA", value: formatCurrency(Number(detail.current_price)) },
                    { icon: DollarSign, label: "Precio c/IVA", value: formatCurrency(Number(detail.price_with_iva) || withIva(detail.current_price)) },
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
