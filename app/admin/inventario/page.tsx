"use client"

import { useState, useMemo } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Package,
  Search,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Download,
  Upload,
  Filter,
  BarChart3,
  Layers,
  DollarSign,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Barcode,
  Weight,
  Ruler,
  Tag,
  FileSpreadsheet,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  BoxIcon,
} from "lucide-react"

/* ─── Types ─── */

type InventoryItem = {
  id: string
  codigo: string
  descripcion: string
  unidad_venta: string
  multiplo_venta: number
  capacidad: string
  peso: number
  um_peso: string
  linea: string
  codigo_barras: string
  precio_publico: number
  stock: number
  stock_min: number
  ubicacion: string
}

/* ─── Mock Data ─── */

const MOCK_ITEMS: InventoryItem[] = [
  { id: "1", codigo: "19A0227703", descripcion: "VINIMEX ANTIBACTERIAL MATE V3", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 23.49, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500112902054", precio_publico: 2484.89, stock: 45, stock_min: 10, ubicacion: "A-01-03" },
  { id: "2", codigo: "19A0227712", descripcion: "VINIMEX CLASICA NF BLANCO MATE", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 26.837, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025196977", precio_publico: 2484.89, stock: 120, stock_min: 20, ubicacion: "A-01-04" },
  { id: "3", codigo: "19A0227713", descripcion: "VINIMEX CLASICA NF MATE V1", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 27.014, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025197004", precio_publico: 2484.89, stock: 78, stock_min: 15, ubicacion: "A-01-05" },
  { id: "4", codigo: "19A0227714", descripcion: "VINIMEX CLASICA NF MATE V2", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 23.719, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025197059", precio_publico: 2484.89, stock: 5, stock_min: 10, ubicacion: "A-02-01" },
  { id: "5", codigo: "19A0227715", descripcion: "VINIMEX CLASICA NF MATE V3", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 22.387, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025197103", precio_publico: 2484.89, stock: 0, stock_min: 10, ubicacion: "A-02-02" },
  { id: "6", codigo: "19A0275063", descripcion: "VINIMEX CLASICA NF BLANCO SATINADO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 24.842, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025195314", precio_publico: 2484.89, stock: 33, stock_min: 10, ubicacion: "A-02-03" },
  { id: "7", codigo: "19A0275064", descripcion: "VINIMEX CLASICA NF SAT V1", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 24.569, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025195352", precio_publico: 2484.89, stock: 62, stock_min: 10, ubicacion: "A-03-01" },
  { id: "8", codigo: "19A0275432", descripcion: "VINIMEX TOTAL ULTRALAVABLE SAT BCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 26.134, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025221174", precio_publico: 2814.02, stock: 18, stock_min: 10, ubicacion: "B-01-01" },
  { id: "9", codigo: "19A0275433", descripcion: "VINIMEX TOTAL ULTRALAVABLE SAT V1", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 25.885, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025221204", precio_publico: 2814.02, stock: 8, stock_min: 10, ubicacion: "B-01-02" },
  { id: "10", codigo: "19A0275436", descripcion: "VINIMEX TOTAL ULTRALAVABLE MATE BCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 26.628, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025221334", precio_publico: 2814.02, stock: 92, stock_min: 15, ubicacion: "B-01-03" },
  { id: "11", codigo: "19A0279401", descripcion: "VINIMEX 3 EN 1 SATINADO BLANCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 25.3, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025019856", precio_publico: 2738.33, stock: 41, stock_min: 10, ubicacion: "B-02-01" },
  { id: "12", codigo: "19A0279405", descripcion: "VINIMEX 3 EN 1 MATE BLANCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 25.792, um_peso: "kg", linea: "VINILICAS", codigo_barras: "7500025131053", precio_publico: 2738.33, stock: 3, stock_min: 10, ubicacion: "B-02-02" },
  { id: "13", codigo: "20A0150001", descripcion: "IMPERMEABILIZANTE ACRILICO 5 AÑOS ROJO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 28.5, um_peso: "kg", linea: "IMPERMEABILIZANTES", codigo_barras: "7500025300001", precio_publico: 3150.00, stock: 25, stock_min: 8, ubicacion: "C-01-01" },
  { id: "14", codigo: "20A0150002", descripcion: "IMPERMEABILIZANTE ACRILICO 5 AÑOS BLANCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 27.8, um_peso: "kg", linea: "IMPERMEABILIZANTES", codigo_barras: "7500025300002", precio_publico: 3150.00, stock: 0, stock_min: 8, ubicacion: "C-01-02" },
  { id: "15", codigo: "21A0180001", descripcion: "ESMALTE SECADO RAPIDO BLANCO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "4 L", peso: 5.2, um_peso: "kg", linea: "ESMALTES", codigo_barras: "7500025400001", precio_publico: 890.50, stock: 56, stock_min: 12, ubicacion: "D-01-01" },
  { id: "16", codigo: "21A0180002", descripcion: "ESMALTE SECADO RAPIDO NEGRO", unidad_venta: "pz", multiplo_venta: 1, capacidad: "4 L", peso: 5.1, um_peso: "kg", linea: "ESMALTES", codigo_barras: "7500025400002", precio_publico: 890.50, stock: 44, stock_min: 12, ubicacion: "D-01-02" },
  { id: "17", codigo: "22A0200001", descripcion: "SELLADOR ACRILICO VINIMEX", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 22.1, um_peso: "kg", linea: "SELLADORES", codigo_barras: "7500025500001", precio_publico: 1650.00, stock: 15, stock_min: 10, ubicacion: "E-01-01" },
  { id: "18", codigo: "22A0200002", descripcion: "SELLADOR 5X1 MULTIUSOS", unidad_venta: "pz", multiplo_venta: 1, capacidad: "19 L", peso: 23.4, um_peso: "kg", linea: "SELLADORES", codigo_barras: "7500025500002", precio_publico: 1890.00, stock: 7, stock_min: 10, ubicacion: "E-01-02" },
]

const LINEAS = [...new Set(MOCK_ITEMS.map((i) => i.linea))].sort()

type SortField = "codigo" | "descripcion" | "linea" | "precio_publico" | "stock"
type SortDir = "asc" | "desc"

/* ─── Helpers ─── */

function formatCurrency(val: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(val)
}

function getStockBadge(stock: number, min: number) {
  if (stock === 0) return { label: "Agotado", cls: "bg-red-500/15 text-red-400 border-red-500/30" }
  if (stock <= min) return { label: "Bajo", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" }
  return { label: "OK", cls: "bg-green-500/15 text-green-400 border-green-500/30" }
}

/* ─── Page ─── */

export default function InventarioPage() {
  // Filters
  const [search, setSearch] = useState("")
  const [lineaFilter, setLineaFilter] = useState<string>("all")
  const [stockFilter, setStockFilter] = useState<string>("all") // all | low | out
  const [showFilters, setShowFilters] = useState(false)

  // Sort
  const [sortField, setSortField] = useState<SortField>("descripcion")
  const [sortDir, setSortDir] = useState<SortDir>("asc")

  // Pagination
  const [page, setPage] = useState(1)
  const perPage = 10

  // Detail dialog
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null)

  // Add/Edit dialog
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [formData, setFormData] = useState({
    codigo: "", descripcion: "", unidad_venta: "pz", multiplo_venta: "1",
    capacidad: "", peso: "", um_peso: "kg", linea: "", codigo_barras: "",
    precio_publico: "", stock: "", stock_min: "", ubicacion: "",
  })

  // Delete confirm
  const [deleteItem, setDeleteItem] = useState<InventoryItem | null>(null)

  // ─── Computed ───

  const filtered = useMemo(() => {
    let items = [...MOCK_ITEMS]

    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (i) =>
          i.codigo.toLowerCase().includes(q) ||
          i.descripcion.toLowerCase().includes(q) ||
          i.codigo_barras.includes(q) ||
          i.linea.toLowerCase().includes(q)
      )
    }

    if (lineaFilter !== "all") items = items.filter((i) => i.linea === lineaFilter)

    if (stockFilter === "low") items = items.filter((i) => i.stock > 0 && i.stock <= i.stock_min)
    if (stockFilter === "out") items = items.filter((i) => i.stock === 0)

    items.sort((a, b) => {
      const aVal = a[sortField]
      const bVal = b[sortField]
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === "asc" ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
    })

    return items
  }, [search, lineaFilter, stockFilter, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage))
  const safePage = Math.min(page, totalPages)
  const paginated = filtered.slice((safePage - 1) * perPage, safePage * perPage)

  // KPIs
  const totalItems = MOCK_ITEMS.length
  const totalStock = MOCK_ITEMS.reduce((s, i) => s + i.stock, 0)
  const totalValue = MOCK_ITEMS.reduce((s, i) => s + i.precio_publico * i.stock, 0)
  const lowStockCount = MOCK_ITEMS.filter((i) => i.stock > 0 && i.stock <= i.stock_min).length
  const outOfStockCount = MOCK_ITEMS.filter((i) => i.stock === 0).length

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
    setFormData({ codigo: "", descripcion: "", unidad_venta: "pz", multiplo_venta: "1", capacidad: "", peso: "", um_peso: "kg", linea: "", codigo_barras: "", precio_publico: "", stock: "", stock_min: "", ubicacion: "" })
    setFormOpen(true)
  }

  function openEditDialog(item: InventoryItem) {
    setEditingItem(item)
    setFormData({
      codigo: item.codigo, descripcion: item.descripcion, unidad_venta: item.unidad_venta,
      multiplo_venta: String(item.multiplo_venta), capacidad: item.capacidad, peso: String(item.peso),
      um_peso: item.um_peso, linea: item.linea, codigo_barras: item.codigo_barras,
      precio_publico: String(item.precio_publico), stock: String(item.stock),
      stock_min: String(item.stock_min), ubicacion: item.ubicacion,
    })
    setFormOpen(true)
  }

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">
          {/* ─── Header ─── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center">
                  <Package className="w-5 h-5 text-[#4da8e8]" />
                </div>
                Inventario
              </h1>
              <p className="text-sm text-slate-500 mt-1">Gestión de artículos y materiales de la empresa</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <Upload className="w-4 h-4 mr-1.5" />
                Importar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                <Download className="w-4 h-4 mr-1.5" />
                Exportar
              </Button>
              <Button
                size="sm"
                className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white"
                onClick={openAddDialog}
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Nuevo artículo
              </Button>
            </div>
          </div>

          {/* ─── KPI Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: "Total artículos", value: totalItems, icon: Layers, color: "#4da8e8", bg: "rgba(1,116,189,0.12)" },
              { label: "Unidades en stock", value: totalStock.toLocaleString(), icon: BoxIcon, color: "#10b981", bg: "rgba(16,185,129,0.12)" },
              { label: "Valor del inventario", value: formatCurrency(totalValue), icon: DollarSign, color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
              { label: "Stock bajo", value: lowStockCount, icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", clickFilter: "low" },
              { label: "Agotados", value: outOfStockCount, icon: Package, color: "#ef4444", bg: "rgba(239,68,68,0.12)", clickFilter: "out" },
            ].map((kpi) => {
              const Icon = kpi.icon
              const isActive = "clickFilter" in kpi && stockFilter === kpi.clickFilter
              return (
                <div
                  key={kpi.label}
                  className={`rounded-xl border p-4 transition-all duration-200 ${
                    isActive
                      ? "border-[#0174bd]/50 bg-[#0174bd]/10 ring-1 ring-[#0174bd]/20"
                      : "border-slate-700/60 bg-slate-800/50 hover:border-slate-600"
                  } ${"clickFilter" in kpi ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if ("clickFilter" in kpi) {
                      const cf = (kpi as { clickFilter: string }).clickFilter
                      setStockFilter(stockFilter === cf ? "all" : cf)
                      setPage(1)
                    }
                  }}
                >
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

          {/* ─── Filters Bar ─── */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 w-full sm:max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                  placeholder="Buscar por código, descripción o código de barras..."
                  className="pl-9 bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Line filter */}
                <select
                  value={lineaFilter}
                  onChange={(e) => { setLineaFilter(e.target.value); setPage(1) }}
                  className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none"
                >
                  <option value="all">Todas las líneas</option>
                  {LINEAS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>

                {/* Stock filter chips */}
                {stockFilter !== "all" && (
                  <Badge
                    className="cursor-pointer text-xs border bg-[#0174bd]/15 text-[#4da8e8] border-[#0174bd]/30 hover:bg-[#0174bd]/25"
                    onClick={() => { setStockFilter("all"); setPage(1) }}
                  >
                    {stockFilter === "low" ? "Stock bajo" : "Agotados"}
                    <X className="w-3 h-3 ml-1" />
                  </Badge>
                )}

                {/* Clear all */}
                {(search || lineaFilter !== "all" || stockFilter !== "all") && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="cursor-pointer text-xs text-slate-400 hover:text-white"
                    onClick={() => { setSearch(""); setLineaFilter("all"); setStockFilter("all"); setPage(1) }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>

              <div className="ml-auto text-xs text-slate-500">
                {filtered.length} artículo{filtered.length !== 1 ? "s" : ""}
              </div>
            </div>
          </div>

          {/* ─── Table ─── */}
          <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700/60 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none" onClick={() => toggleSort("codigo")}>
                      <span className="flex items-center">Código <SortIcon field="codigo" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none min-w-[280px]" onClick={() => toggleSort("descripcion")}>
                      <span className="flex items-center">Descripción <SortIcon field="descripcion" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs cursor-pointer select-none" onClick={() => toggleSort("linea")}>
                      <span className="flex items-center">Línea <SortIcon field="linea" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Capacidad</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right cursor-pointer select-none" onClick={() => toggleSort("precio_publico")}>
                      <span className="flex items-center justify-end">Precio <SortIcon field="precio_publico" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right cursor-pointer select-none" onClick={() => toggleSort("stock")}>
                      <span className="flex items-center justify-end">Stock <SortIcon field="stock" /></span>
                    </TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs">Estado</TableHead>
                    <TableHead className="text-slate-400 font-semibold text-xs text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-12 text-slate-500">
                        <Package className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                        <p>No se encontraron artículos</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((item) => {
                      const badge = getStockBadge(item.stock, item.stock_min)
                      return (
                        <TableRow key={item.id} className="border-slate-700/40 hover:bg-slate-700/20 transition-colors">
                          <TableCell className="font-mono text-xs text-[#4da8e8]">{item.codigo}</TableCell>
                          <TableCell>
                            <p className="text-sm font-medium text-slate-200 truncate max-w-[320px]">{item.descripcion}</p>
                          </TableCell>
                          <TableCell>
                            <Badge className="text-[10px] border bg-slate-700/60 text-slate-300 border-slate-600">{item.linea}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-400">{item.capacidad}</TableCell>
                          <TableCell className="text-right text-sm font-medium text-slate-200">{formatCurrency(item.precio_publico)}</TableCell>
                          <TableCell className="text-right">
                            <span className={`text-sm font-bold ${item.stock === 0 ? "text-red-400" : item.stock <= item.stock_min ? "text-amber-400" : "text-slate-200"}`}>
                              {item.stock}
                            </span>
                            <span className="text-xs text-slate-600 ml-1">{item.unidad_venta}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-[10px] border ${badge.cls}`}>{badge.label}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm" variant="ghost"
                                className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700"
                                onClick={() => setDetailItem(item)}
                                title="Ver detalle"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-[#4da8e8] hover:bg-[#0174bd]/10"
                                onClick={() => openEditDialog(item)}
                                title="Editar"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                                onClick={() => setDeleteItem(item)}
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/60">
                <p className="text-xs text-slate-500">
                  Mostrando {(safePage - 1) * perPage + 1}–{Math.min(safePage * perPage, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm" variant="ghost" disabled={safePage <= 1}
                    className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
                    onClick={() => setPage(safePage - 1)}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <Button
                      key={p} size="sm" variant="ghost"
                      className={`cursor-pointer h-8 w-8 p-0 text-xs ${
                        p === safePage ? "bg-[#0174bd]/20 text-[#4da8e8] font-bold" : "text-slate-400 hover:text-white hover:bg-slate-700"
                      }`}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  ))}
                  <Button
                    size="sm" variant="ghost" disabled={safePage >= totalPages}
                    className="cursor-pointer h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30"
                    onClick={() => setPage(safePage + 1)}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ─── Detail Dialog ─── */}
        <Dialog open={!!detailItem} onOpenChange={(v) => { if (!v) setDetailItem(null) }}>
          <DialogContent className="max-w-lg bg-slate-800 border-slate-700 text-slate-100 p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
              <DialogTitle className="text-slate-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-[#4da8e8]" />
                Detalle del artículo
              </DialogTitle>
            </DialogHeader>
            {detailItem && (
              <div className="px-6 pb-6 pt-4 space-y-4">
                {/* Title + badge */}
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{detailItem.descripcion}</h3>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge className="text-[10px] border bg-[#0174bd]/15 text-[#4da8e8] border-[#0174bd]/30 font-mono">{detailItem.codigo}</Badge>
                    <Badge className={`text-[10px] border ${getStockBadge(detailItem.stock, detailItem.stock_min).cls}`}>
                      {getStockBadge(detailItem.stock, detailItem.stock_min).label}
                    </Badge>
                  </div>
                </div>

                {/* Info grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: Tag, label: "Línea", value: detailItem.linea },
                    { icon: Ruler, label: "Capacidad", value: detailItem.capacidad },
                    { icon: Weight, label: "Peso", value: `${detailItem.peso} ${detailItem.um_peso}` },
                    { icon: Package, label: "Unidad de venta", value: detailItem.unidad_venta },
                    { icon: DollarSign, label: "Precio público", value: formatCurrency(detailItem.precio_publico) },
                    { icon: Layers, label: "Stock actual", value: `${detailItem.stock} (mín: ${detailItem.stock_min})` },
                    { icon: Barcode, label: "Código de barras", value: detailItem.codigo_barras },
                    { icon: BoxIcon, label: "Ubicación", value: detailItem.ubicacion },
                  ].map((row) => {
                    const Icon = row.icon
                    return (
                      <div key={row.label} className="rounded-lg border border-slate-700/60 bg-slate-700/30 p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{row.label}</span>
                        </div>
                        <p className="text-sm font-medium text-slate-200">{row.value}</p>
                      </div>
                    )
                  })}
                </div>

                {/* Value */}
                <div className="rounded-lg border border-[#0174bd]/30 bg-[#0174bd]/10 p-4 flex items-center justify-between">
                  <span className="text-sm text-slate-300">Valor total en inventario</span>
                  <span className="text-lg font-bold text-[#4da8e8]">{formatCurrency(detailItem.precio_publico * detailItem.stock)}</span>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white"
                    onClick={() => { setDetailItem(null); openEditDialog(detailItem) }}
                  >
                    <Pencil className="w-4 h-4 mr-1.5" />
                    Editar
                  </Button>
                  <Button
                    className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white"
                    onClick={() => setDetailItem(null)}
                  >
                    Cerrar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ─── Add/Edit Dialog ─── */}
        <Dialog open={formOpen} onOpenChange={setFormOpen}>
          <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-100">
                {editingItem ? "Editar artículo" : "Nuevo artículo"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Código *</label>
                  <Input value={formData.codigo} onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="19A0..." />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Código de barras</label>
                  <Input value={formData.codigo_barras} onChange={(e) => setFormData({ ...formData, codigo_barras: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="7500..." />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-slate-400">Descripción *</label>
                <Input value={formData.descripcion} onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                  className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="VINIMEX CLASICA..." />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Línea *</label>
                  <Input value={formData.linea} onChange={(e) => setFormData({ ...formData, linea: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="VINILICAS" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Capacidad</label>
                  <Input value={formData.capacidad} onChange={(e) => setFormData({ ...formData, capacidad: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="19 L" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Unidad venta</label>
                  <select value={formData.unidad_venta} onChange={(e) => setFormData({ ...formData, unidad_venta: e.target.value })}
                    className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none">
                    <option value="pz">Pieza</option>
                    <option value="caja">Caja</option>
                    <option value="paquete">Paquete</option>
                    <option value="litro">Litro</option>
                    <option value="kg">Kilogramo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Peso</label>
                  <Input value={formData.peso} onChange={(e) => setFormData({ ...formData, peso: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="23.49" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">UM Peso</label>
                  <select value={formData.um_peso} onChange={(e) => setFormData({ ...formData, um_peso: e.target.value })}
                    className="h-10 rounded-md border border-slate-600 bg-slate-700/60 px-3 text-sm text-slate-100 focus:border-[#0174bd] outline-none">
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Precio público *</label>
                  <Input value={formData.precio_publico} onChange={(e) => setFormData({ ...formData, precio_publico: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="2484.89" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Ubicación</label>
                  <Input value={formData.ubicacion} onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="A-01-01" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Stock actual *</label>
                  <Input value={formData.stock} onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="0" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-slate-400">Stock mínimo *</label>
                  <Input value={formData.stock_min} onChange={(e) => setFormData({ ...formData, stock_min: e.target.value })}
                    className="bg-slate-700/60 border-slate-600 text-slate-100 placeholder:text-slate-500 focus:border-[#0174bd]" placeholder="10" />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-700">
                <Button variant="outline" onClick={() => setFormOpen(false)}
                  className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
                  Cancelar
                </Button>
                <Button className="cursor-pointer bg-[#0174bd] hover:bg-[#0163a3] text-white"
                  onClick={() => setFormOpen(false)}>
                  {editingItem ? "Guardar cambios" : "Crear artículo"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── Delete Confirm Dialog ─── */}
        <Dialog open={!!deleteItem} onOpenChange={(v) => { if (!v) setDeleteItem(null) }}>
          <DialogContent className="max-w-sm bg-slate-800 border-slate-700 text-slate-100">
            <DialogHeader>
              <DialogTitle className="text-slate-100">Eliminar artículo</DialogTitle>
            </DialogHeader>
            {deleteItem && (
              <div className="space-y-4 mt-2">
                <p className="text-sm text-slate-300">
                  ¿Estás seguro de eliminar <span className="font-semibold text-white">{deleteItem.descripcion}</span>?
                </p>
                <p className="text-xs text-slate-500">Esta acción no se puede deshacer.</p>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setDeleteItem(null)}
                    className="cursor-pointer bg-transparent border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-white">
                    Cancelar
                  </Button>
                  <Button onClick={() => setDeleteItem(null)}
                    className="cursor-pointer bg-red-600 hover:bg-red-700 text-white">
                    <Trash2 className="w-4 h-4 mr-1.5" />
                    Eliminar
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminLayout>
    </RoleGuard>
  )
}
