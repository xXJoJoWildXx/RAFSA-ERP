"use client"

import { useState } from "react"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Truck,
  Building2,
  Wrench,
  Phone,
  Mail,
  ChevronDown,
  ChevronRight,
  Plus,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Package,
  DollarSign,
  AlertCircle,
  BookOpen,
  BarChart2,
  Layers,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Categoria      = "plataformas" | "refacciones" | "otros"
type Condicion      = "credito"     | "contado"
type PlatformStatus = "activa"      | "en_servicio" | "fuera_de_uso"
type PaymentStatus  = "pagado"      | "pendiente"   | "vencido"
type PedidoStatus   = "entregado"   | "en_camino"   | "pendiente"

type Supplier = {
  id:            string
  name:          string
  category:      Categoria
  contact_phone: string
  contact_email: string
  conditions:    Condicion
  status:        "activo" | "inactivo"
}

type Platform = {
  id:             string
  supplier_id:    string
  empresa:        string
  number:         string
  description:    string
  rent_start:     string
  rent_end:       string
  cost_month:     number
  payment_term:   number
  status:         PlatformStatus
  obra:           string
  encargado:      string
  has_factura:    boolean
  payment_status: PaymentStatus
  lost_days?:     number
}

type Pedido = {
  id:             string
  supplier_id:    string
  empresa:        string
  pedido:         string
  description:    string
  amount:         number
  status:         PedidoStatus
  obra:           string
  payment_status: PaymentStatus
  date:           string
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SUPPLIERS: Supplier[] = [
  { id: "s1", name: "Plataformex SA de CV",               category: "plataformas", contact_phone: "81-2345-6789", contact_email: "contacto@plataformex.com",  conditions: "credito", status: "activo"   },
  { id: "s2", name: "Andamios Regio",                     category: "plataformas", contact_phone: "81-9876-5432", contact_email: "ventas@andamiosregio.com",   conditions: "contado", status: "activo"   },
  { id: "s3", name: "Refacciones Industriales del Norte", category: "refacciones", contact_phone: "81-1111-2222", contact_email: "pedidos@rinnorte.com",       conditions: "credito", status: "activo"   },
  { id: "s4", name: "Ferretería El Constructor",          category: "refacciones", contact_phone: "81-3333-4444", contact_email: "ventas@elconstructor.com",   conditions: "contado", status: "activo"   },
  { id: "s5", name: "Suministros Varios SA",              category: "otros",       contact_phone: "81-5555-6666", contact_email: "info@suministrosvarios.com", conditions: "contado", status: "inactivo" },
]

const PLATFORMS: Platform[] = [
  { id: "p1", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "01", description: "Plataforma tijera 10m",     rent_start: "2025-01-15", rent_end: "2025-07-15", cost_month: 8500,  payment_term: 30, status: "activa",       obra: "Torre Ejecutiva Norte",   encargado: "Ing. García",  has_factura: true,  payment_status: "pagado"                },
  { id: "p2", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "02", description: "Plataforma articulada 14m", rent_start: "2025-02-01", rent_end: "2025-08-01", cost_month: 12000, payment_term: 30, status: "en_servicio",  obra: "Torre Ejecutiva Norte",   encargado: "Ing. García",  has_factura: true,  payment_status: "pendiente", lost_days: 1 },
  { id: "p3", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "03", description: "Plataforma tijera 8m",      rent_start: "2025-03-01", rent_end: "2025-06-30", cost_month: 7200,  payment_term: 30, status: "activa",       obra: "Bodega Industrial Sur",   encargado: "Ing. Soto",    has_factura: false, payment_status: "pendiente", lost_days: 2 },
  { id: "p4", supplier_id: "s2", empresa: "Andamios Regio",       number: "01", description: "Andamio colgante 6m",       rent_start: "2025-03-10", rent_end: "2025-06-10", cost_month: 5500,  payment_term: 15, status: "fuera_de_uso", obra: "Bodega Industrial Sur",   encargado: "Ing. Soto",    has_factura: false, payment_status: "vencido",   lost_days: 5 },
  { id: "p5", supplier_id: "s2", empresa: "Andamios Regio",       number: "02", description: "Andamio modular 4m",        rent_start: "2025-04-01", rent_end: "2025-07-01", cost_month: 3800,  payment_term: 15, status: "en_servicio",  obra: "Residencial Las Cumbres", encargado: "Ing. Ramírez", has_factura: true,  payment_status: "pagado"                },
]

const PEDIDOS: Pedido[] = [
  { id: "r1", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-001", description: "Consumibles soldadura MIG x100",      amount: 15400, status: "entregado", obra: "Torre Ejecutiva Norte",   payment_status: "pagado",   date: "2025-02-10" },
  { id: "r2", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-002", description: 'Discos de corte 7" x50',              amount: 3200,  status: "en_camino", obra: "Bodega Industrial Sur",   payment_status: "pendiente", date: "2025-04-05" },
  { id: "r3", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-003", description: "Guantes industriales x20 pares",      amount: 1800,  status: "pendiente", obra: "Residencial Las Cumbres", payment_status: "pendiente", date: "2025-04-15" },
  { id: "r4", supplier_id: "s4", empresa: "Ferretería El Constructor",          pedido: "PED-001", description: 'Varilla corrugada 3/8" (100 piezas)', amount: 22000, status: "entregado", obra: "Torre Ejecutiva Norte",   payment_status: "pagado",   date: "2025-01-20" },
  { id: "r5", supplier_id: "s4", empresa: "Ferretería El Constructor",          pedido: "PED-002", description: "Cemento Portland 50kg x200 sacos",    amount: 45000, status: "entregado", obra: "Residencial Las Cumbres", payment_status: "vencido",  date: "2025-03-01" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n)
}

function PlatformBadge({ status }: { status: PlatformStatus }) {
  if (status === "activa")      return <Badge className="bg-green-100 text-green-700 border-green-200">Activa</Badge>
  if (status === "en_servicio") return <Badge className="bg-blue-100  text-blue-700  border-blue-200" >En servicio</Badge>
  return                               <Badge className="bg-slate-100 text-slate-600 border-slate-200">Fuera de uso</Badge>
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "pagado")    return <Badge className="bg-green-100 text-green-700">Pagado</Badge>
  if (status === "pendiente") return <Badge className="bg-amber-100 text-amber-700">Pendiente</Badge>
  return                             <Badge className="bg-red-100   text-red-700"  >Vencido</Badge>
}

function PedidoBadge({ status }: { status: PedidoStatus }) {
  if (status === "entregado") return <Badge className="bg-green-100 text-green-700">Entregado</Badge>
  if (status === "en_camino") return <Badge className="bg-blue-100  text-blue-700" >En camino</Badge>
  return                             <Badge className="bg-amber-100 text-amber-700">Pendiente</Badge>
}

function CategoriaBadge({ cat }: { cat: Categoria }) {
  if (cat === "plataformas") return <Badge className="bg-blue-100   text-blue-700"  >Plataformas</Badge>
  if (cat === "refacciones") return <Badge className="bg-purple-100 text-purple-700">Refacciones</Badge>
  return                            <Badge className="bg-slate-100  text-slate-600" >Otros</Badge>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const [activeTab, setActiveTab]             = useState("directorio")
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set())
  const [expandedPedidos,   setExpandedPedidos]   = useState<Set<string>>(new Set())

  function toggleSet(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setFn(next)
  }

  // ── Stats ──
  const activeSuppliers = SUPPLIERS.filter(s => s.status === "activo").length
  const activePlatforms = PLATFORMS.filter(p => p.status !== "fuera_de_uso").length
  const pendingCount    = [...PLATFORMS, ...PEDIDOS].filter(x => x.payment_status === "pendiente" || x.payment_status === "vencido").length
  const monthlyRent     = PLATFORMS.filter(p => p.status !== "fuera_de_uso").reduce((s, p) => s + p.cost_month, 0)

  // ── Group by empresa ──
  const platformsByEmpresa = PLATFORMS.reduce<Record<string, Platform[]>>((acc, p) => {
    ;(acc[p.empresa] ??= []).push(p)
    return acc
  }, {})

  const pedidosByEmpresa = PEDIDOS.reduce<Record<string, Pedido[]>>((acc, p) => {
    ;(acc[p.empresa] ??= []).push(p)
    return acc
  }, {})

  const triggerCls = [
    "rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-1.5",
    "text-slate-500 hover:text-slate-700",
    "data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900",
  ].join(" ")

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-xl">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Proveedores</h1>
                <p className="text-slate-400 text-sm mt-0.5">Directorio y administración · Mari Carmen + Ingeniera</p>
              </div>
            </div>
            <Button className="bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-all w-fit">
              <Plus className="w-4 h-4 mr-2" />
              Nuevo proveedor
            </Button>
          </div>

          {/* ── Stats bar ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Proveedores activos", value: String(activeSuppliers),    sub: "en directorio",          icon: <Building2   className="w-5 h-5 text-blue-600"   />, bg: "bg-blue-50"   },
              { label: "Plataformas activas", value: String(activePlatforms),    sub: `de ${PLATFORMS.length} totales`, icon: <Layers  className="w-5 h-5 text-green-600"  />, bg: "bg-green-50"  },
              { label: "Pagos por resolver",  value: String(pendingCount),       sub: "pendientes o vencidos",  icon: <AlertCircle className="w-5 h-5 text-amber-600"  />, bg: "bg-amber-50"  },
              { label: "Renta mensual",       value: fmt(monthlyRent),           sub: "plataformas en renta",   icon: <DollarSign  className="w-5 h-5 text-purple-600" />, bg: "bg-purple-50" },
            ].map(({ label, value, sub, icon, bg }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                  </div>
                  <div className={`p-2.5 ${bg} rounded-xl`}>{icon}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Main Tabs ── */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-slate-100 p-1 rounded-xl gap-1">
              <TabsTrigger value="directorio"  className={triggerCls}><BookOpen  className="w-3.5 h-3.5" />Directorio</TabsTrigger>
              <TabsTrigger value="plataformas" className={triggerCls}><Layers    className="w-3.5 h-3.5" />Plataformas</TabsTrigger>
              <TabsTrigger value="refacciones" className={triggerCls}><Wrench    className="w-3.5 h-3.5" />Refacciones</TabsTrigger>
              <TabsTrigger value="finanzas"    className={triggerCls}><BarChart2 className="w-3.5 h-3.5" />Finanzas</TabsTrigger>
            </TabsList>

            {/* ════════════════════════════════════════════════════
                TAB 1 · DIRECTORIO
            ════════════════════════════════════════════════════ */}
            <TabsContent value="directorio" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>01. Listado de Proveedores</CardTitle>
                    <p className="text-xs text-slate-400 mt-1">Directorio completo · gestionado por Mari Carmen</p>
                  </div>
                  <Button size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-1" />Agregar
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre proveedor</TableHead>
                        <TableHead>Categoría</TableHead>
                        <TableHead>Contacto</TableHead>
                        <TableHead>Condiciones</TableHead>
                        <TableHead>Estatus</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {SUPPLIERS.map(s => (
                        <TableRow key={s.id} className="hover:bg-slate-50 cursor-pointer group">
                          <TableCell>
                            <span className="font-medium text-slate-900 group-hover:text-blue-600 transition-colors">
                              {s.name}
                            </span>
                          </TableCell>
                          <TableCell><CategoriaBadge cat={s.category} /></TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1 text-xs text-slate-600"><Phone className="w-3 h-3" />{s.contact_phone}</span>
                              <span className="flex items-center gap-1 text-xs text-slate-400"><Mail  className="w-3 h-3" />{s.contact_email}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={s.conditions === "credito" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}>
                              {s.conditions === "credito" ? "Crédito" : "Contado"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={s.status === "activo" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
                              {s.status === "activo" ? "Activo" : "Inactivo"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ════════════════════════════════════════════════════
                TAB 2 · PLATAFORMAS
            ════════════════════════════════════════════════════ */}
            <TabsContent value="plataformas" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">02. Administración — Plataformas</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Estatus operativo: Ingeniera · Pagos y facturas: Mari Carmen</p>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-1" />Nueva empresa
                </Button>
              </div>

              {Object.entries(platformsByEmpresa).map(([empresa, platforms]) => {
                const supplier = SUPPLIERS.find(s => s.name === empresa)
                return (
                  <Card key={empresa}>
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <Building2 className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{empresa}</CardTitle>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {platforms.length} plataforma{platforms.length !== 1 ? "s" : ""} registrada{platforms.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {supplier && (
                          <Badge className={supplier.conditions === "credito" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}>
                            {supplier.conditions === "credito" ? "Crédito" : "Contado"}
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" className="text-xs text-slate-500 h-7">
                          <Plus className="w-3.5 h-3.5 mr-1" />Agregar
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0 space-y-2">
                      {platforms.map(p => (
                        <div key={p.id} className="rounded-xl border border-slate-100 overflow-hidden">

                          {/* ── Collapsible header ── */}
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => toggleSet(expandedPlatforms, setExpandedPlatforms, p.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center text-xs font-bold shrink-0">
                                {p.number}
                              </div>
                              <div>
                                <p className="font-medium text-slate-900 text-sm">{p.description}</p>
                                <p className="text-xs text-slate-400">{p.rent_start} → {p.rent_end}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!!p.lost_days && p.lost_days > 0 && (
                                <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-red-600">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""}
                                </span>
                              )}
                              <PlatformBadge  status={p.status} />
                              <PaymentBadge   status={p.payment_status} />
                              {expandedPlatforms.has(p.id)
                                ? <ChevronDown  className="w-4 h-4 text-slate-400" />
                                : <ChevronRight className="w-4 h-4 text-slate-400" />
                              }
                            </div>
                          </div>

                          {/* ── Expanded detail ── */}
                          {expandedPlatforms.has(p.id) && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">

                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Renta</p>
                                  <p className="text-base font-bold text-slate-900">
                                    {fmt(p.cost_month)}
                                    <span className="text-xs font-normal text-slate-500"> /mes</span>
                                  </p>
                                  <p className="text-xs text-slate-500">Plazo de pago: {p.payment_term} días</p>
                                </div>

                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Asignación</p>
                                  <p className="text-sm font-medium text-slate-900">{p.obra}</p>
                                  <p className="text-xs text-slate-500">{p.encargado}</p>
                                </div>

                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Documentos</p>
                                  {p.has_factura
                                    ? <span className="flex items-center gap-1.5 text-sm text-green-700"><CheckCircle2 className="w-4 h-4" />Factura recibida</span>
                                    : <span className="flex items-center gap-1.5 text-sm text-red-600">  <XCircle     className="w-4 h-4" />Sin factura</span>
                                  }
                                </div>

                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Estatus operativo</p>
                                  <PlatformBadge status={p.status} />
                                </div>

                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Estatus de pago</p>
                                  <PaymentBadge status={p.payment_status} />
                                </div>

                                {!!p.lost_days && p.lost_days > 0 && (
                                  <div>
                                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Reporte de falla</p>
                                    <p className="text-sm font-bold text-red-600">
                                      {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""} — por reclamar
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
                                <Button size="sm" variant="outline">Editar</Button>
                                <Button size="sm" variant="outline" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200">
                                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />Reportar falla
                                </Button>
                                <Button size="sm" variant="outline" className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200">
                                  Registrar pago
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <button className="w-full mt-1 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-medium text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />Agregar plataforma
                      </button>
                    </CardContent>
                  </Card>
                )
              })}
            </TabsContent>

            {/* ════════════════════════════════════════════════════
                TAB 3 · REFACCIONES
            ════════════════════════════════════════════════════ */}
            <TabsContent value="refacciones" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">02. Administración — Refacciones</h2>
                  <p className="text-xs text-slate-400 mt-0.5">Pedidos y consumibles por empresa proveedor</p>
                </div>
                <Button size="sm" variant="outline">
                  <Plus className="w-4 h-4 mr-1" />Nueva empresa
                </Button>
              </div>

              {Object.entries(pedidosByEmpresa).map(([empresa, pedidos]) => {
                const supplier = SUPPLIERS.find(s => s.name === empresa)
                return (
                  <Card key={empresa}>
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-50 rounded-lg">
                          <Wrench className="w-4 h-4 text-purple-600" />
                        </div>
                        <div>
                          <CardTitle className="text-base">{empresa}</CardTitle>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {supplier && (
                          <Badge className={supplier.conditions === "credito" ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600"}>
                            {supplier.conditions === "credito" ? "Crédito" : "Contado"}
                          </Badge>
                        )}
                        <Button size="sm" variant="ghost" className="text-xs text-slate-500 h-7">
                          <Plus className="w-3.5 h-3.5 mr-1" />Nuevo pedido
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0 space-y-2">
                      {pedidos.map(p => (
                        <div key={p.id} className="rounded-xl border border-slate-100 overflow-hidden">
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 transition-colors"
                            onClick={() => toggleSet(expandedPedidos, setExpandedPedidos, p.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-purple-700 text-white rounded-lg flex items-center justify-center shrink-0">
                                <Package className="w-4 h-4" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-900 text-sm">{p.pedido} — {p.description}</p>
                                <p className="text-xs text-slate-400">{p.date} · {p.obra}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-semibold text-slate-700">{fmt(p.amount)}</span>
                              <PedidoBadge  status={p.status} />
                              <PaymentBadge status={p.payment_status} />
                              {expandedPedidos.has(p.id)
                                ? <ChevronDown  className="w-4 h-4 text-slate-400" />
                                : <ChevronRight className="w-4 h-4 text-slate-400" />
                              }
                            </div>
                          </div>

                          {expandedPedidos.has(p.id) && (
                            <div className="border-t border-slate-100 bg-slate-50 p-4 space-y-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Monto</p>
                                  <p className="text-base font-bold text-slate-900">{fmt(p.amount)}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Obra</p>
                                  <p className="text-sm text-slate-700">{p.obra}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Estatus entrega</p>
                                  <PedidoBadge status={p.status} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Estatus pago</p>
                                  <PaymentBadge status={p.payment_status} />
                                </div>
                              </div>
                              <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-200">
                                <Button size="sm" variant="outline">Editar pedido</Button>
                                <Button size="sm" variant="outline">Ver factura</Button>
                                <Button size="sm" variant="outline" className="text-blue-600 hover:bg-blue-50 border-blue-200">
                                  Registrar pago
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <button className="w-full mt-1 py-2.5 rounded-xl border border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-all text-xs font-medium text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1.5">
                        <Plus className="w-3.5 h-3.5" />Nuevo pedido
                      </button>
                    </CardContent>
                  </Card>
                )
              })}
            </TabsContent>

            {/* ════════════════════════════════════════════════════
                TAB 4 · FINANZAS
            ════════════════════════════════════════════════════ */}
            <TabsContent value="finanzas" className="space-y-6">

              {/* ── Global counters ── */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Vencidas",        value: [...PLATFORMS, ...PEDIDOS].filter(x => x.payment_status === "vencido").length,   color: "text-red-600",   sub: "requieren atención inmediata" },
                  { label: "Pagadas",         value: [...PLATFORMS, ...PEDIDOS].filter(x => x.payment_status === "pagado").length,    color: "text-green-600", sub: "al corriente"                 },
                  { label: "Activas",         value: activePlatforms,                                                                  color: "text-blue-600",  sub: "plataformas en operación"     },
                  { label: "En servicio",     value: PLATFORMS.filter(p => p.status === "en_servicio").length,                        color: "text-slate-900", sub: "desplegadas en obra"          },
                ].map(({ label, value, color, sub }) => (
                  <Card key={label} className="border-slate-100">
                    <CardContent className="p-4">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
                      <p className={`text-3xl font-bold ${color} mt-1`}>{value}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* ── Plataformas por proveedor ── */}
              <Card>
                <CardHeader>
                  <CardTitle>Por Proveedor — Plataformas</CardTitle>
                  <p className="text-xs text-slate-400 mt-1">Lo que ya pagué vs lo acumulado</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Plataforma</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Inicio renta</TableHead>
                        <TableHead>Vence</TableHead>
                        <TableHead className="text-right">Monto / mes</TableHead>
                        <TableHead>Estatus pago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {PLATFORMS.map(p => (
                        <TableRow
                          key={p.id}
                          className={
                            p.payment_status === "vencido"   ? "bg-red-50"      :
                            p.payment_status === "pendiente" ? "bg-amber-50/40" : ""
                          }
                        >
                          <TableCell>
                            <p className="font-medium text-sm text-slate-900">{p.empresa}</p>
                            <p className="text-xs text-slate-500">Plataforma {p.number} — {p.description}</p>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{p.obra}</TableCell>
                          <TableCell className="text-sm text-slate-600">{p.rent_start}</TableCell>
                          <TableCell className="text-sm text-slate-600">{p.rent_end}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900">{fmt(p.cost_month)}</TableCell>
                          <TableCell><PaymentBadge status={p.payment_status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between rounded-b-xl">
                    <span className="text-sm font-semibold text-slate-600">$Suma total · plataformas activas</span>
                    <span className="text-xl font-bold text-slate-900">{fmt(monthlyRent)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* ── Refacciones / Pedidos ── */}
              <Card>
                <CardHeader>
                  <CardTitle>Por Proveedor — Refacciones y Pedidos</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pedido</TableHead>
                        <TableHead>Obra</TableHead>
                        <TableHead>Fecha</TableHead>
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead>Entrega</TableHead>
                        <TableHead>Pago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {PEDIDOS.map(p => (
                        <TableRow
                          key={p.id}
                          className={
                            p.payment_status === "vencido"   ? "bg-red-50"      :
                            p.payment_status === "pendiente" ? "bg-amber-50/40" : ""
                          }
                        >
                          <TableCell>
                            <p className="font-medium text-sm text-slate-900">{p.empresa}</p>
                            <p className="text-xs text-slate-500">{p.pedido} — {p.description}</p>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700">{p.obra}</TableCell>
                          <TableCell className="text-sm text-slate-600">{p.date}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-900">{fmt(p.amount)}</TableCell>
                          <TableCell><PedidoBadge  status={p.status} /></TableCell>
                          <TableCell><PaymentBadge status={p.payment_status} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 py-3 border-t bg-slate-50 flex items-center justify-between rounded-b-xl">
                    <span className="text-sm font-semibold text-slate-600">$Suma total · todos los pedidos</span>
                    <span className="text-xl font-bold text-slate-900">{fmt(PEDIDOS.reduce((s, p) => s + p.amount, 0))}</span>
                  </div>
                </CardContent>
              </Card>

              {/* ── Reporte de Falla ── */}
              <Card className="border-orange-200">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-50 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                      <CardTitle>Reporte de Falla</CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Días perdidos por falla de equipo · registrado por la Ingeniera
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {PLATFORMS.filter(p => p.lost_days && p.lost_days > 0).map(p => (
                    <div key={p.id} className="flex items-center justify-between rounded-xl border border-orange-100 bg-orange-50 p-4 gap-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{p.empresa} — Plataforma {p.number}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.description} · {p.obra}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Encargado: {p.encargado}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-red-600">
                          {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">pendiente de reclamar</p>
                        <Button size="sm" variant="outline" className="mt-2 text-xs text-orange-700 border-orange-300 hover:bg-orange-100">
                          Ver detalle
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* How it works */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 mt-2">
                    <p className="text-xs font-semibold text-slate-600 mb-1">¿Cómo funciona el reporte de falla?</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      La Ingeniera registra al cerrar el reporte diario: <strong>¿Hubo día perdido?</strong> Sí/No y la cantidad de días.
                      Ese registro aparece en la ficha de la plataforma y en el resumen del proveedor para reclamar ajuste de renta o servicio si aplica.
                      En comentarios queda: fecha, motivo y evidencia.
                    </p>
                  </div>
                </CardContent>
              </Card>

            </TabsContent>
          </Tabs>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
