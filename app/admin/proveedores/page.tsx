"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
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
  BookOpen,
  BarChart2,
  Layers,
  ExternalLink,
  DollarSign,
  Pencil,
  Trash2,
  Check,
  X,
  Save,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Categoria      = "plataformas" | "refacciones"
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
  { id: "s5", name: "Suministros Varios SA",              category: "refacciones", contact_phone: "81-5555-6666", contact_email: "info@suministrosvarios.com", conditions: "contado", status: "inactivo" },
]

const PLATFORMS: Platform[] = [
  { id: "p1", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "01", description: "Plataforma tijera 10m",     rent_start: "2025-01-15", rent_end: "2025-07-15", cost_month: 8500,  payment_term: 30, status: "activa",       obra: "Torre Ejecutiva Norte",   encargado: "Ing. García",  has_factura: true,  payment_status: "pagado"                },
  { id: "p2", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "02", description: "Plataforma articulada 14m", rent_start: "2025-02-01", rent_end: "2025-08-01", cost_month: 12000, payment_term: 30, status: "en_servicio",  obra: "Torre Ejecutiva Norte",   encargado: "Ing. García",  has_factura: true,  payment_status: "pendiente", lost_days: 1 },
  { id: "p3", supplier_id: "s1", empresa: "Plataformex SA de CV", number: "03", description: "Plataforma tijera 8m",      rent_start: "2025-03-01", rent_end: "2025-06-30", cost_month: 7200,  payment_term: 30, status: "activa",       obra: "Bodega Industrial Sur",   encargado: "Ing. Soto",    has_factura: false, payment_status: "pendiente", lost_days: 2 },
  { id: "p4", supplier_id: "s2", empresa: "Andamios Regio",       number: "01", description: "Andamio colgante 6m",       rent_start: "2025-03-10", rent_end: "2025-06-10", cost_month: 5500,  payment_term: 15, status: "fuera_de_uso", obra: "Bodega Industrial Sur",   encargado: "Ing. Soto",    has_factura: false, payment_status: "vencido",   lost_days: 5 },
  { id: "p5", supplier_id: "s2", empresa: "Andamios Regio",       number: "02", description: "Andamio modular 4m",        rent_start: "2025-04-01", rent_end: "2025-07-01", cost_month: 3800,  payment_term: 15, status: "en_servicio",  obra: "Residencial Las Cumbres", encargado: "Ing. Ramírez", has_factura: true,  payment_status: "pagado"                },
]

const PEDIDOS: Pedido[] = [
  { id: "r1", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-001", description: "Consumibles soldadura MIG x100",      amount: 15400, status: "entregado", obra: "Torre Ejecutiva Norte",   payment_status: "pagado",    date: "2025-02-10" },
  { id: "r2", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-002", description: 'Discos de corte 7" x50',              amount: 3200,  status: "en_camino", obra: "Bodega Industrial Sur",   payment_status: "pendiente", date: "2025-04-05" },
  { id: "r3", supplier_id: "s3", empresa: "Refacciones Industriales del Norte", pedido: "PED-003", description: "Guantes industriales x20 pares",      amount: 1800,  status: "pendiente", obra: "Residencial Las Cumbres", payment_status: "pendiente", date: "2025-04-15" },
  { id: "r4", supplier_id: "s4", empresa: "Ferretería El Constructor",          pedido: "PED-001", description: 'Varilla corrugada 3/8" (100 piezas)', amount: 22000, status: "entregado", obra: "Torre Ejecutiva Norte",   payment_status: "pagado",    date: "2025-01-20" },
  { id: "r5", supplier_id: "s4", empresa: "Ferretería El Constructor",          pedido: "PED-002", description: "Cemento Portland 50kg x200 sacos",    amount: 45000, status: "entregado", obra: "Residencial Las Cumbres", payment_status: "vencido",   date: "2025-03-01" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n)
}

function PlatformBadge({ status }: { status: PlatformStatus }) {
  if (status === "activa")      return <Badge className="bg-green-900/40 text-green-400 border border-green-600/30">Activa</Badge>
  if (status === "en_servicio") return <Badge className="bg-[#0174bd]/20 text-[#4da8e8] border border-[#0174bd]/30">En servicio</Badge>
  return                               <Badge className="bg-slate-700/60 text-slate-400 border border-slate-600/40">Fuera de uso</Badge>
}

function PaymentBadge({ status }: { status: PaymentStatus }) {
  if (status === "pagado")    return <Badge className="bg-green-900/40 text-green-400 border border-green-600/30">Pagado</Badge>
  if (status === "pendiente") return <Badge className="bg-amber-900/40 text-amber-400 border border-amber-600/30">Pendiente</Badge>
  return                             <Badge className="bg-red-900/40   text-red-400   border border-red-600/30"  >Vencido</Badge>
}

function PedidoBadge({ status }: { status: PedidoStatus }) {
  if (status === "entregado") return <Badge className="bg-green-900/40 text-green-400 border border-green-600/30">Entregado</Badge>
  if (status === "en_camino") return <Badge className="bg-[#0174bd]/20 text-[#4da8e8] border border-[#0174bd]/30">En camino</Badge>
  return                             <Badge className="bg-amber-900/40 text-amber-400 border border-amber-600/30">Pendiente</Badge>
}

function CategoriaBadge({ cat }: { cat: Categoria }) {
  if (cat === "plataformas") return <Badge className="bg-[#0174bd]/20  text-[#4da8e8]  border border-[#0174bd]/30">Plataformas</Badge>
  return                            <Badge className="bg-purple-900/40 text-purple-400 border border-purple-600/30">Refacciones</Badge>
}

/* ── Supplier Card ── */
type SupplierCardProps = {
  s:        Supplier
  editMode: boolean
  selected: boolean
  onToggle: (id: string) => void
}

function SupplierCard({ s, editMode, selected, onToggle }: SupplierCardProps) {
  const router       = useRouter()
  const isPlat       = s.category === "plataformas"
  const accentColor  = isPlat ? "rgba(1,116,189,0.15)"  : "rgba(168,85,247,0.12)"
  const accentBorder = isPlat ? "rgba(1,116,189,0.25)"  : "rgba(168,85,247,0.2)"
  const iconColor    = isPlat ? "text-[#4da8e8]"         : "text-purple-400"
  const Icon         = isPlat ? Layers                   : Wrench

  const selectedBorder = selected
    ? "rgba(1,116,189,0.7)"
    : editMode
      ? "rgba(148,163,184,0.18)"
      : "rgba(148,163,184,0.08)"

  const selectedShadow = selected
    ? "0 0 0 2px rgba(1,116,189,0.25), 0 2px 8px rgba(0,0,0,0.2)"
    : "0 2px 8px rgba(0,0,0,0.2)"

  return (
    <div
      className={`rounded-xl p-4 flex flex-col gap-3 transition-all duration-200 group relative cursor-pointer ${
        !editMode ? "hover:-translate-y-0.5" : ""
      } ${selected ? "scale-[0.99]" : ""}`}
      style={{
        background: selected
          ? "linear-gradient(135deg, #1a2f4a 0%, #132038 100%)"
          : "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
        border: `1px solid ${selectedBorder}`,
        boxShadow: selectedShadow,
      }}
      onClick={() => editMode ? onToggle(s.id) : router.push(`/admin/proveedores/${s.id}`)}
    >
      {/* Checkbox overlay in edit mode */}
      {editMode && (
        <div
          className={`absolute top-3 right-3 w-5 h-5 rounded-md flex items-center justify-center transition-all duration-150 ${
            selected
              ? "bg-[#0174bd] border border-[#0174bd]"
              : "bg-slate-800 border border-slate-600"
          }`}
        >
          {selected && <Check className="w-3 h-3 text-white" />}
        </div>
      )}

      {/* Header row */}
      <div className={`flex items-start gap-2 ${editMode ? "pr-7" : ""}`}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className="p-2 rounded-lg shrink-0"
            style={{ background: accentColor, border: `1px solid ${accentBorder}` }}
          >
            <Icon className={`w-4 h-4 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <p className={`font-semibold text-sm leading-tight transition-colors truncate ${
              selected ? "text-[#4da8e8]" : "text-slate-100 group-hover:text-white"
            }`}>
              {s.name}
            </p>
          </div>
        </div>
        {!editMode && (
          <Badge className={s.status === "activo"
            ? "bg-green-900/40 text-green-400 border border-green-600/30 shrink-0"
            : "bg-slate-700/60 text-slate-500 border border-slate-600/40 shrink-0"
          }>
            {s.status === "activo" ? "Activo" : "Inactivo"}
          </Badge>
        )}
      </div>

      {/* Contact */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-xs text-slate-400">
          <Phone className="w-3 h-3 text-slate-500 shrink-0" />
          {s.contact_phone}
        </span>
        <span className="flex items-center gap-2 text-xs text-slate-500">
          <Mail className="w-3 h-3 text-slate-600 shrink-0" />
          {s.contact_email}
        </span>
      </div>

      {/* Footer row */}
      <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid rgba(148,163,184,0.07)" }}>
        <Badge className={s.conditions === "credito"
          ? "bg-indigo-900/40 text-indigo-400 border border-indigo-600/30"
          : "bg-slate-700/60 text-slate-400 border border-slate-600/40"
        }>
          {s.conditions === "credito" ? "Crédito" : "Contado"}
        </Badge>
        {!editMode && (
          <span className="flex items-center gap-1 text-xs text-slate-500 group-hover:text-[#4da8e8] transition-colors duration-150 pointer-events-none">
            Ver detalle <ExternalLink className="w-3 h-3" />
          </span>
        )}
        {editMode && (
          <Badge className={s.status === "activo"
            ? "bg-green-900/40 text-green-400 border border-green-600/30"
            : "bg-slate-700/60 text-slate-500 border border-slate-600/40"
          }>
            {s.status === "activo" ? "Activo" : "Inactivo"}
          </Badge>
        )}
      </div>
    </div>
  )
}

/* ── Supplier Form (Add / Edit) ── */
type SupplierFormMode = "add" | "edit"
type SupplierFormData = {
  name:          string
  contact_phone: string
  contact_email: string
  conditions:    Condicion
  status:        "activo" | "inactivo"
}
type SupplierFormProps = {
  mode:     SupplierFormMode
  category: Categoria
  initial?: SupplierFormData
  onSave:   (data: SupplierFormData) => void
  onCancel: () => void
}

const emptyForm: SupplierFormData = {
  name: "", contact_phone: "", contact_email: "", conditions: "credito", status: "activo",
}

function SupplierForm({ mode, category, initial, onSave, onCancel }: SupplierFormProps) {
  const [form, setForm] = useState<SupplierFormData>(initial ?? emptyForm)
  const isPlat    = category === "plataformas"
  const accentHex = isPlat ? "#0174bd" : "#a855f7"

  const inputCls = "w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-[#0174bd]/70 focus:ring-1 focus:ring-[#0174bd]/30 transition-all duration-150"

  const set = (key: keyof FormData, val: string) =>
    setForm(f => ({ ...f, [key]: val }))

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-4"
      style={{
        background: "linear-gradient(135deg, #162032 0%, #101828 100%)",
        border: `1px solid ${isPlat ? "rgba(1,116,189,0.35)" : "rgba(168,85,247,0.3)"}`,
        boxShadow: `0 0 20px ${isPlat ? "rgba(1,116,189,0.08)" : "rgba(168,85,247,0.07)"}`,
      }}
    >
      {/* Form header */}
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: isPlat ? "rgba(1,116,189,0.15)" : "rgba(168,85,247,0.12)" }}
        >
          {mode === "add"
            ? <Plus className={`w-3.5 h-3.5 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
            : <Pencil className={`w-3.5 h-3.5 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
          }
        </div>
        <p className="text-sm font-semibold text-slate-200">
          {mode === "add" ? "Nuevo proveedor" : "Editar proveedor"}
        </p>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-3">
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Nombre *
          </label>
          <input
            className={inputCls}
            placeholder="Ej. Plataformex SA de CV"
            value={form.name}
            onChange={e => set("name", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Teléfono
            </label>
            <input
              className={inputCls}
              placeholder="81-0000-0000"
              value={form.contact_phone}
              onChange={e => set("contact_phone", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Email
            </label>
            <input
              className={inputCls}
              placeholder="contacto@empresa.com"
              value={form.contact_email}
              onChange={e => set("contact_email", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Condiciones */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Condiciones
            </label>
            <div className="flex gap-2">
              {(["credito", "contado"] as Condicion[]).map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("conditions", c)}
                  className={`cursor-pointer flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
                    form.conditions === c
                      ? "bg-indigo-900/50 text-indigo-300 border-indigo-600/60"
                      : "bg-slate-800/60 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400"
                  }`}
                >
                  {c === "credito" ? "Crédito" : "Contado"}
                </button>
              ))}
            </div>
          </div>

          {/* Estatus */}
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Estatus
            </label>
            <div className="flex gap-2">
              {(["activo", "inactivo"] as const).map(st => (
                <button
                  key={st}
                  type="button"
                  onClick={() => set("status", st)}
                  className={`cursor-pointer flex-1 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 ${
                    form.status === st
                      ? st === "activo"
                        ? "bg-green-900/50 text-green-300 border-green-600/60"
                        : "bg-slate-700/70 text-slate-400 border-slate-600/70"
                      : "bg-slate-800/60 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400"
                  }`}
                >
                  {st === "activo" ? "Activo" : "Inactivo"}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          className="cursor-pointer flex-1 text-white transition-all duration-200"
          style={{ background: accentHex }}
          onClick={() => form.name.trim() && onSave(form)}
          disabled={!form.name.trim()}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {mode === "add" ? "Agregar" : "Guardar cambios"}
        </Button>
        <Button
          size="sm"
          className="cursor-pointer bg-transparent border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 hover:bg-slate-800/40 transition-all duration-200"
          onClick={onCancel}
        >
          <X className="w-3.5 h-3.5 mr-1" />
          Cancelar
        </Button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const [activeTab, setActiveTab]                 = useState("directorio")
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set())
  const [expandedPedidos,   setExpandedPedidos]   = useState<Set<string>>(new Set())

  // ── Directorio edit state ──
  const [suppliers,    setSuppliers]    = useState<Supplier[]>(SUPPLIERS)
  const [editMode,     setEditMode]     = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [addFormCol,   setAddFormCol]   = useState<"plataformas" | "refacciones" | null>(null)
  const [editFormId,   setEditFormId]   = useState<string | null>(null)

  function toggleEditMode() {
    const turningOn = !editMode
    setEditMode(turningOn)
    setSelectedIds(new Set())
    setEditFormId(null)
    setAddFormCol(null)
    if (turningOn) setActiveTab("directorio")
  }

  function toggleSelectCard(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleDelete() {
    setSuppliers(prev => prev.filter(s => !selectedIds.has(s.id)))
    setSelectedIds(new Set())
  }

  function handleEditSelected() {
    if (selectedIds.size !== 1) return
    setEditFormId([...selectedIds][0])
    setAddFormCol(null)
  }

  function handleSaveEdit(id: string, data: SupplierFormData) {
    setSuppliers(prev => prev.map(s => s.id === id ? { ...s, ...data } : s))
    setEditFormId(null)
    setSelectedIds(new Set())
  }

  function handleAddSupplier(category: Categoria, data: SupplierFormData) {
    const newSupplier: Supplier = {
      id:            `s${Date.now()}`,
      category,
      name:          data.name,
      contact_phone: data.contact_phone,
      contact_email: data.contact_email,
      conditions:    data.conditions,
      status:        data.status,
    }
    setSuppliers(prev => [...prev, newSupplier])
    setAddFormCol(null)
  }

  function toggleSet(set: Set<string>, setFn: (s: Set<string>) => void, id: string) {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setFn(next)
  }

  // ── Stats (used in Finanzas tab) ──
  const activePlatforms = PLATFORMS.filter(p => p.status !== "fuera_de_uso").length
  const monthlyRent     = PLATFORMS.filter(p => p.status !== "fuera_de_uso").reduce((s, p) => s + p.cost_month, 0)

  // ── Directorio split ──
  const suppliersPlat  = suppliers.filter(s => s.category === "plataformas")
  const suppliersRefac = suppliers.filter(s => s.category === "refacciones")

  // ── Selection counts per column ──
  const selectedPlat  = suppliersPlat.filter(s => selectedIds.has(s.id))
  const selectedRefac = suppliersRefac.filter(s => selectedIds.has(s.id))
  const totalSelected = selectedIds.size

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
    "rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer",
    "text-slate-500 hover:text-slate-300",
    "data-[state=active]:bg-[#1e293b] data-[state=active]:shadow-md data-[state=active]:text-slate-100 data-[state=active]:border data-[state=active]:border-slate-600/50",
  ].join(" ")

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">

          {/* ── Header ── */}
          <div
            className="rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            style={{
              background: "linear-gradient(135deg, #0f2a4a 0%, #0a1929 50%, #0d1f35 100%)",
              border: "1px solid rgba(1,116,189,0.2)",
              boxShadow: "0 0 40px rgba(1,116,189,0.08)",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="p-3 rounded-xl"
                style={{ background: "rgba(1,116,189,0.15)", border: "1px solid rgba(1,116,189,0.25)" }}
              >
                <Truck className="w-6 h-6 text-[#4da8e8]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Proveedores</h1>
                <p className="text-slate-400 text-sm mt-0.5">Directorio y administración · Mari Carmen + Ingeniera</p>
              </div>
            </div>
            <Button
              onClick={toggleEditMode}
              className="cursor-pointer w-fit text-white border transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: editMode ? "rgba(239,68,68,0.12)" : "rgba(1,116,189,0.15)",
                borderColor: editMode ? "rgba(239,68,68,0.35)" : "rgba(1,116,189,0.35)",
              }}
            >
              {editMode
                ? <><X       className="w-4 h-4 mr-2" />Cancelar edición</>
                : <><Pencil  className="w-4 h-4 mr-2" />Editar proveedores</>
              }
            </Button>
          </div>

          {/* ── Main Tabs ── */}
          <Tabs value={activeTab} onValueChange={v => !editMode && setActiveTab(v)} className="space-y-6">
            <div className="relative">
              <TabsList
                className="p-1 rounded-xl gap-1 w-full transition-all duration-300"
                style={{
                  background: "rgba(15,23,42,0.8)",
                  border: "1px solid rgba(148,163,184,0.08)",
                  opacity: editMode ? 0.45 : 1,
                }}
              >
                <TabsTrigger value="directorio"  className={triggerCls}><BookOpen  className="w-3.5 h-3.5" />Directorio</TabsTrigger>
                <TabsTrigger value="plataformas" className={triggerCls}><Layers    className="w-3.5 h-3.5" />Plataformas</TabsTrigger>
                <TabsTrigger value="refacciones" className={triggerCls}><Wrench    className="w-3.5 h-3.5" />Refacciones</TabsTrigger>
                <TabsTrigger value="finanzas"    className={triggerCls}><BarChart2 className="w-3.5 h-3.5" />Finanzas</TabsTrigger>
              </TabsList>

              {/* Blocker overlay + tooltip */}
              {editMode && (
                <div
                  className="absolute inset-0 rounded-xl flex items-center justify-center cursor-not-allowed"
                  title="Sal del modo edición para cambiar de tab"
                />
              )}
            </div>

            {/* ════════════════════════════════════════════════════
                TAB 1 · DIRECTORIO
            ════════════════════════════════════════════════════ */}
            <TabsContent value="directorio" className="space-y-4">

              {/* Edit mode hint */}
              {editMode && (
                <div
                  className="rounded-xl px-4 py-2.5 flex items-center gap-2"
                  style={{ background: "rgba(1,116,189,0.08)", border: "1px solid rgba(1,116,189,0.2)" }}
                >
                  <Pencil className="w-3.5 h-3.5 text-[#4da8e8] shrink-0" />
                  <p className="text-xs text-slate-400">
                    Modo edición activo — <span className="text-[#4da8e8]">haz clic en una card</span> para seleccionarla.
                    Puedes seleccionar varias para eliminar.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* ── Columna izquierda: Plataformas ── */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="p-1.5 rounded-lg"
                        style={{ background: "rgba(1,116,189,0.15)", border: "1px solid rgba(1,116,189,0.25)" }}
                      >
                        <Layers className="w-4 h-4 text-[#4da8e8]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Plataformas</p>
                        <p className="text-[10px] text-slate-500">
                          {suppliersPlat.length} proveedor{suppliersPlat.length !== 1 ? "es" : ""}
                          {editMode && selectedPlat.length > 0 &&
                            <span className="ml-1.5 text-[#4da8e8]">· {selectedPlat.length} seleccionado{selectedPlat.length !== 1 ? "s" : ""}</span>
                          }
                        </p>
                      </div>
                    </div>
                    {!editMode && (
                      <Button
                        size="sm"
                        onClick={() => { setAddFormCol(addFormCol === "plataformas" ? null : "plataformas"); setEditFormId(null) }}
                        className="cursor-pointer text-slate-400 bg-transparent border border-slate-700 hover:border-[#0174bd]/50 hover:text-[#4da8e8] hover:bg-[#0174bd]/8 transition-all duration-200 h-7 text-xs"
                      >
                        {addFormCol === "plataformas"
                          ? <><X className="w-3.5 h-3.5 mr-1" />Cancelar</>
                          : <><Plus className="w-3.5 h-3.5 mr-1" />Agregar</>
                        }
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    {/* Add form — siempre arriba */}
                    {addFormCol === "plataformas" && (
                      <SupplierForm
                        mode="add"
                        category="plataformas"
                        onSave={data => handleAddSupplier("plataformas", data)}
                        onCancel={() => setAddFormCol(null)}
                      />
                    )}

                    {suppliersPlat.map(s =>
                      editFormId === s.id ? (
                        <SupplierForm
                          key={s.id}
                          mode="edit"
                          category="plataformas"
                          initial={{ name: s.name, contact_phone: s.contact_phone, contact_email: s.contact_email, conditions: s.conditions, status: s.status }}
                          onSave={data => handleSaveEdit(s.id, data)}
                          onCancel={() => { setEditFormId(null); setSelectedIds(new Set()) }}
                        />
                      ) : (
                        <SupplierCard
                          key={s.id}
                          s={s}
                          editMode={editMode}
                          selected={selectedIds.has(s.id)}
                          onToggle={toggleSelectCard}
                        />
                      )
                    )}

                    {suppliersPlat.length === 0 && addFormCol !== "plataformas" && (
                      <div className="rounded-xl py-10 flex flex-col items-center gap-2 border border-dashed border-slate-700">
                        <Layers className="w-6 h-6 text-slate-600" />
                        <p className="text-xs text-slate-600">Sin proveedores de plataformas</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Columna derecha: Refacciones ── */}
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="p-1.5 rounded-lg"
                        style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}
                      >
                        <Wrench className="w-4 h-4 text-purple-400" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">Refacciones</p>
                        <p className="text-[10px] text-slate-500">
                          {suppliersRefac.length} proveedor{suppliersRefac.length !== 1 ? "es" : ""}
                          {editMode && selectedRefac.length > 0 &&
                            <span className="ml-1.5 text-purple-400">· {selectedRefac.length} seleccionado{selectedRefac.length !== 1 ? "s" : ""}</span>
                          }
                        </p>
                      </div>
                    </div>
                    {!editMode && (
                      <Button
                        size="sm"
                        onClick={() => { setAddFormCol(addFormCol === "refacciones" ? null : "refacciones"); setEditFormId(null) }}
                        className="cursor-pointer text-slate-400 bg-transparent border border-slate-700 hover:border-purple-500/40 hover:text-purple-400 hover:bg-purple-900/10 transition-all duration-200 h-7 text-xs"
                      >
                        {addFormCol === "refacciones"
                          ? <><X className="w-3.5 h-3.5 mr-1" />Cancelar</>
                          : <><Plus className="w-3.5 h-3.5 mr-1" />Agregar</>
                        }
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-col gap-3">
                    {/* Add form — siempre arriba */}
                    {addFormCol === "refacciones" && (
                      <SupplierForm
                        mode="add"
                        category="refacciones"
                        onSave={data => handleAddSupplier("refacciones", data)}
                        onCancel={() => setAddFormCol(null)}
                      />
                    )}

                    {suppliersRefac.map(s =>
                      editFormId === s.id ? (
                        <SupplierForm
                          key={s.id}
                          mode="edit"
                          category="refacciones"
                          initial={{ name: s.name, contact_phone: s.contact_phone, contact_email: s.contact_email, conditions: s.conditions, status: s.status }}
                          onSave={data => handleSaveEdit(s.id, data)}
                          onCancel={() => { setEditFormId(null); setSelectedIds(new Set()) }}
                        />
                      ) : (
                        <SupplierCard
                          key={s.id}
                          s={s}
                          editMode={editMode}
                          selected={selectedIds.has(s.id)}
                          onToggle={toggleSelectCard}
                        />
                      )
                    )}

                    {suppliersRefac.length === 0 && addFormCol !== "refacciones" && (
                      <div className="rounded-xl py-10 flex flex-col items-center gap-2 border border-dashed border-slate-700">
                        <Wrench className="w-6 h-6 text-slate-600" />
                        <p className="text-xs text-slate-600">Sin proveedores de refacciones</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

              {/* ── Floating action bar ── */}
              {editMode && totalSelected > 0 && (
                <div
                  className="sticky bottom-4 rounded-2xl px-5 py-3 flex items-center justify-between gap-4 mt-2"
                  style={{
                    background: "linear-gradient(135deg, #1a2535 0%, #131e2e 100%)",
                    border: "1px solid rgba(1,116,189,0.3)",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(1,116,189,0.15)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ background: "#0174bd" }}
                    >
                      {totalSelected}
                    </div>
                    <p className="text-sm text-slate-300">
                      {totalSelected === 1 ? "proveedor seleccionado" : "proveedores seleccionados"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      disabled={totalSelected !== 1}
                      onClick={handleEditSelected}
                      className={`cursor-pointer border transition-all duration-200 ${
                        totalSelected === 1
                          ? "bg-[#0174bd]/15 border-[#0174bd]/40 text-[#4da8e8] hover:bg-[#0174bd]/25"
                          : "bg-transparent border-slate-700 text-slate-600 cursor-not-allowed"
                      }`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleDelete}
                      className="cursor-pointer bg-red-900/20 border border-red-600/40 text-red-400 hover:bg-red-900/35 hover:border-red-500/60 transition-all duration-200"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                      Eliminar {totalSelected > 1 ? `(${totalSelected})` : ""}
                    </Button>
                    <button
                      onClick={() => setSelectedIds(new Set())}
                      className="cursor-pointer p-1.5 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

            </TabsContent>

            {/* ════════════════════════════════════════════════════
                TAB 2 · PLATAFORMAS
            ════════════════════════════════════════════════════ */}
            <TabsContent value="plataformas" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">02. Administración — Plataformas</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Estatus operativo: Ingeniera · Pagos y facturas: Mari Carmen</p>
                </div>
                <Button
                  size="sm"
                  className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:border-[#0174bd]/60 hover:text-[#4da8e8] hover:bg-[#0174bd]/10 transition-all duration-200"
                >
                  <Plus className="w-4 h-4 mr-1" />Nueva empresa
                </Button>
              </div>

              {Object.entries(platformsByEmpresa).map(([empresa, platforms]) => {
                const supplier = SUPPLIERS.find(s => s.name === empresa)
                return (
                  <div
                    key={empresa}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                      border: "1px solid rgba(148,163,184,0.08)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                    }}
                  >
                    {/* Card header */}
                    <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ background: "rgba(1,116,189,0.15)", border: "1px solid rgba(1,116,189,0.2)" }}
                        >
                          <Building2 className="w-4 h-4 text-[#4da8e8]" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-100">{empresa}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {platforms.length} plataforma{platforms.length !== 1 ? "s" : ""} registrada{platforms.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {supplier && (
                          <Badge className={supplier.conditions === "credito"
                            ? "bg-indigo-900/40 text-indigo-400 border border-indigo-600/30"
                            : "bg-slate-700/60 text-slate-400 border border-slate-600/40"
                          }>
                            {supplier.conditions === "credito" ? "Crédito" : "Contado"}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          className="cursor-pointer text-xs text-slate-400 bg-transparent hover:text-[#4da8e8] hover:bg-[#0174bd]/10 h-7 transition-all duration-200"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />Agregar
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      {platforms.map(p => (
                        <div
                          key={p.id}
                          className="rounded-xl overflow-hidden"
                          style={{ border: "1px solid rgba(148,163,184,0.1)" }}
                        >
                          {/* ── Collapsible header ── */}
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer transition-colors duration-150"
                            style={{ background: "rgba(15,23,42,0.4)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(1,116,189,0.05)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(15,23,42,0.4)")}
                            onClick={() => toggleSet(expandedPlatforms, setExpandedPlatforms, p.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 text-white"
                                style={{ background: "linear-gradient(135deg, #003353, #0174bd)" }}
                              >
                                {p.number}
                              </div>
                              <div>
                                <p className="font-medium text-slate-200 text-sm">{p.description}</p>
                                <p className="text-xs text-slate-500">{p.rent_start} → {p.rent_end}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!!p.lost_days && p.lost_days > 0 && (
                                <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-red-400">
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""}
                                </span>
                              )}
                              <PlatformBadge  status={p.status} />
                              <PaymentBadge   status={p.payment_status} />
                              {expandedPlatforms.has(p.id)
                                ? <ChevronDown  className="w-4 h-4 text-slate-500" />
                                : <ChevronRight className="w-4 h-4 text-slate-500" />
                              }
                            </div>
                          </div>

                          {/* ── Expanded detail ── */}
                          {expandedPlatforms.has(p.id) && (
                            <div
                              className="p-4 space-y-4"
                              style={{ borderTop: "1px solid rgba(148,163,184,0.1)", background: "rgba(15,23,42,0.6)" }}
                            >
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4">

                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Renta</p>
                                  <p className="text-base font-bold text-slate-100">
                                    {fmt(p.cost_month)}
                                    <span className="text-xs font-normal text-slate-500"> /mes</span>
                                  </p>
                                  <p className="text-xs text-slate-500">Plazo de pago: {p.payment_term} días</p>
                                </div>

                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Asignación</p>
                                  <p className="text-sm font-medium text-slate-200">{p.obra}</p>
                                  <p className="text-xs text-slate-500">{p.encargado}</p>
                                </div>

                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Documentos</p>
                                  {p.has_factura
                                    ? <span className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircle2 className="w-4 h-4" />Factura recibida</span>
                                    : <span className="flex items-center gap-1.5 text-sm text-red-400">  <XCircle     className="w-4 h-4" />Sin factura</span>
                                  }
                                </div>

                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Estatus operativo</p>
                                  <PlatformBadge status={p.status} />
                                </div>

                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Estatus de pago</p>
                                  <PaymentBadge status={p.payment_status} />
                                </div>

                                {!!p.lost_days && p.lost_days > 0 && (
                                  <div>
                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Reporte de falla</p>
                                    <p className="text-sm font-bold text-red-400">
                                      {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""} — por reclamar
                                    </p>
                                  </div>
                                )}
                              </div>

                              <div
                                className="flex flex-wrap gap-2 pt-3"
                                style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }}
                              >
                                <Button size="sm" className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:border-slate-500 hover:text-slate-100 hover:bg-slate-700/40 transition-all duration-200">
                                  Editar
                                </Button>
                                <Button size="sm" className="cursor-pointer bg-transparent border border-orange-600/40 text-orange-400 hover:bg-orange-900/20 hover:border-orange-500/60 transition-all duration-200">
                                  <AlertTriangle className="w-3.5 h-3.5 mr-1" />Reportar falla
                                </Button>
                                <Button size="sm" className="cursor-pointer bg-transparent border border-[#0174bd]/40 text-[#4da8e8] hover:bg-[#0174bd]/15 hover:border-[#0174bd]/70 transition-all duration-200">
                                  Registrar pago
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        className="cursor-pointer w-full mt-1 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-[#0174bd]/50 hover:bg-[#0174bd]/5 transition-all text-xs font-medium text-slate-500 hover:text-[#4da8e8] flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />Agregar plataforma
                      </button>
                    </div>
                  </div>
                )
              })}
            </TabsContent>

            {/* ════════════════════════════════════════════════════
                TAB 3 · REFACCIONES
            ════════════════════════════════════════════════════ */}
            <TabsContent value="refacciones" className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-100">03. Administración — Refacciones</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Pedidos y consumibles por empresa proveedor</p>
                </div>
                <Button
                  size="sm"
                  className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:border-[#0174bd]/60 hover:text-[#4da8e8] hover:bg-[#0174bd]/10 transition-all duration-200"
                >
                  <Plus className="w-4 h-4 mr-1" />Nueva empresa
                </Button>
              </div>

              {Object.entries(pedidosByEmpresa).map(([empresa, pedidos]) => {
                const supplier = SUPPLIERS.find(s => s.name === empresa)
                return (
                  <div
                    key={empresa}
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                      border: "1px solid rgba(148,163,184,0.08)",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                    }}
                  >
                    <div className="flex flex-row items-center justify-between px-6 py-4 border-b border-slate-700/50">
                      <div className="flex items-center gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ background: "rgba(168,85,247,0.12)", border: "1px solid rgba(168,85,247,0.2)" }}
                        >
                          <Wrench className="w-4 h-4 text-purple-400" />
                        </div>
                        <div>
                          <h3 className="text-base font-semibold text-slate-100">{empresa}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {supplier && (
                          <Badge className={supplier.conditions === "credito"
                            ? "bg-indigo-900/40 text-indigo-400 border border-indigo-600/30"
                            : "bg-slate-700/60 text-slate-400 border border-slate-600/40"
                          }>
                            {supplier.conditions === "credito" ? "Crédito" : "Contado"}
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          className="cursor-pointer text-xs text-slate-400 bg-transparent hover:text-[#4da8e8] hover:bg-[#0174bd]/10 h-7 transition-all duration-200"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" />Nuevo pedido
                        </Button>
                      </div>
                    </div>

                    <div className="p-4 space-y-2">
                      {pedidos.map(p => (
                        <div
                          key={p.id}
                          className="rounded-xl overflow-hidden"
                          style={{ border: "1px solid rgba(148,163,184,0.1)" }}
                        >
                          <div
                            className="flex items-center justify-between p-4 cursor-pointer transition-colors duration-150"
                            style={{ background: "rgba(15,23,42,0.4)" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "rgba(1,116,189,0.05)")}
                            onMouseLeave={e => (e.currentTarget.style.background = "rgba(15,23,42,0.4)")}
                            onClick={() => toggleSet(expandedPedidos, setExpandedPedidos, p.id)}
                          >
                            <div className="flex items-center gap-3">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: "linear-gradient(135deg, #4a1d96, #7c3aed)" }}
                              >
                                <Package className="w-4 h-4 text-white" />
                              </div>
                              <div>
                                <p className="font-medium text-slate-200 text-sm">{p.pedido} — {p.description}</p>
                                <p className="text-xs text-slate-500">{p.date} · {p.obra}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-sm font-semibold text-slate-300">{fmt(p.amount)}</span>
                              <PedidoBadge  status={p.status} />
                              <PaymentBadge status={p.payment_status} />
                              {expandedPedidos.has(p.id)
                                ? <ChevronDown  className="w-4 h-4 text-slate-500" />
                                : <ChevronRight className="w-4 h-4 text-slate-500" />
                              }
                            </div>
                          </div>

                          {expandedPedidos.has(p.id) && (
                            <div
                              className="p-4 space-y-4"
                              style={{ borderTop: "1px solid rgba(148,163,184,0.1)", background: "rgba(15,23,42,0.6)" }}
                            >
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Monto</p>
                                  <p className="text-base font-bold text-slate-100">{fmt(p.amount)}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Obra</p>
                                  <p className="text-sm text-slate-300">{p.obra}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Estatus entrega</p>
                                  <PedidoBadge status={p.status} />
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Estatus pago</p>
                                  <PaymentBadge status={p.payment_status} />
                                </div>
                              </div>
                              <div
                                className="flex flex-wrap gap-2 pt-3"
                                style={{ borderTop: "1px solid rgba(148,163,184,0.1)" }}
                              >
                                <Button size="sm" className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:border-slate-500 hover:text-slate-100 hover:bg-slate-700/40 transition-all duration-200">
                                  Editar pedido
                                </Button>
                                <Button size="sm" className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:border-slate-500 hover:text-slate-100 hover:bg-slate-700/40 transition-all duration-200">
                                  Ver factura
                                </Button>
                                <Button size="sm" className="cursor-pointer bg-transparent border border-[#0174bd]/40 text-[#4da8e8] hover:bg-[#0174bd]/15 hover:border-[#0174bd]/70 transition-all duration-200">
                                  Registrar pago
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      <button
                        className="cursor-pointer w-full mt-1 py-2.5 rounded-xl border border-dashed border-slate-700 hover:border-[#0174bd]/50 hover:bg-[#0174bd]/5 transition-all text-xs font-medium text-slate-500 hover:text-[#4da8e8] flex items-center justify-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5" />Nuevo pedido
                      </button>
                    </div>
                  </div>
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
                  { label: "Vencidas",    value: [...PLATFORMS, ...PEDIDOS].filter(x => x.payment_status === "vencido").length,  color: "text-red-400",    sub: "requieren atención inmediata" },
                  { label: "Pagadas",     value: [...PLATFORMS, ...PEDIDOS].filter(x => x.payment_status === "pagado").length,   color: "text-green-400",  sub: "al corriente"                 },
                  { label: "Activas",     value: activePlatforms,                                                                  color: "text-[#4da8e8]",  sub: "plataformas en operación"     },
                  { label: "En servicio", value: PLATFORMS.filter(p => p.status === "en_servicio").length,                        color: "text-slate-200",  sub: "desplegadas en obra"          },
                ].map(({ label, value, color, sub }) => (
                  <div
                    key={label}
                    className="rounded-2xl p-4"
                    style={{
                      background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                      border: "1px solid rgba(148,163,184,0.08)",
                    }}
                  >
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
                    <p className={`text-3xl font-bold ${color} mt-1`}>{value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>

              {/* ── Plataformas por proveedor ── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                  border: "1px solid rgba(148,163,184,0.08)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                }}
              >
                <div className="px-6 py-4 border-b border-slate-700/50">
                  <h3 className="text-base font-semibold text-slate-100">Por Proveedor — Plataformas</h3>
                  <p className="text-xs text-slate-500 mt-1">Lo que ya pagué vs lo acumulado</p>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Plataforma</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Obra</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Inicio renta</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Vence</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider text-right">Monto / mes</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Estatus pago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PLATFORMS.map(p => (
                      <TableRow
                        key={p.id}
                        className={`border-slate-700/40 transition-colors ${
                          p.payment_status === "vencido"   ? "bg-red-900/10 hover:bg-red-900/20"     :
                          p.payment_status === "pendiente" ? "bg-amber-900/8 hover:bg-amber-900/15" :
                          "hover:bg-[#0174bd]/5"
                        }`}
                      >
                        <TableCell>
                          <p className="font-medium text-sm text-slate-200">{p.empresa}</p>
                          <p className="text-xs text-slate-500">Plataforma {p.number} — {p.description}</p>
                        </TableCell>
                        <TableCell className="text-sm text-slate-300">{p.obra}</TableCell>
                        <TableCell className="text-sm text-slate-400">{p.rent_start}</TableCell>
                        <TableCell className="text-sm text-slate-400">{p.rent_end}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-100">{fmt(p.cost_month)}</TableCell>
                        <TableCell><PaymentBadge status={p.payment_status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div
                  className="px-6 py-3 flex items-center justify-between rounded-b-2xl"
                  style={{ borderTop: "1px solid rgba(148,163,184,0.08)", background: "rgba(15,23,42,0.4)" }}
                >
                  <span className="text-sm font-semibold text-slate-400">$Suma total · plataformas activas</span>
                  <span className="text-xl font-bold text-slate-100">{fmt(monthlyRent)}</span>
                </div>
              </div>

              {/* ── Refacciones / Pedidos ── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                  border: "1px solid rgba(148,163,184,0.08)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                }}
              >
                <div className="px-6 py-4 border-b border-slate-700/50">
                  <h3 className="text-base font-semibold text-slate-100">Por Proveedor — Refacciones y Pedidos</h3>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-700/50 hover:bg-transparent">
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Pedido</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Obra</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Fecha</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider text-right">Monto</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Entrega</TableHead>
                      <TableHead className="text-slate-400 font-semibold text-xs uppercase tracking-wider">Pago</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {PEDIDOS.map(p => (
                      <TableRow
                        key={p.id}
                        className={`border-slate-700/40 transition-colors ${
                          p.payment_status === "vencido"   ? "bg-red-900/10 hover:bg-red-900/20"      :
                          p.payment_status === "pendiente" ? "bg-amber-900/8 hover:bg-amber-900/15"  :
                          "hover:bg-[#0174bd]/5"
                        }`}
                      >
                        <TableCell>
                          <p className="font-medium text-sm text-slate-200">{p.empresa}</p>
                          <p className="text-xs text-slate-500">{p.pedido} — {p.description}</p>
                        </TableCell>
                        <TableCell className="text-sm text-slate-300">{p.obra}</TableCell>
                        <TableCell className="text-sm text-slate-400">{p.date}</TableCell>
                        <TableCell className="text-right font-semibold text-slate-100">{fmt(p.amount)}</TableCell>
                        <TableCell><PedidoBadge  status={p.status} /></TableCell>
                        <TableCell><PaymentBadge status={p.payment_status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div
                  className="px-6 py-3 flex items-center justify-between rounded-b-2xl"
                  style={{ borderTop: "1px solid rgba(148,163,184,0.08)", background: "rgba(15,23,42,0.4)" }}
                >
                  <span className="text-sm font-semibold text-slate-400">$Suma total · todos los pedidos</span>
                  <span className="text-xl font-bold text-slate-100">{fmt(PEDIDOS.reduce((s, p) => s + p.amount, 0))}</span>
                </div>
              </div>

              {/* ── Reporte de Falla ── */}
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
                  border: "1px solid rgba(245,158,11,0.2)",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
                }}
              >
                <div className="px-6 py-4 border-b border-amber-700/20">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-2 rounded-lg"
                      style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-100">Reporte de Falla</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Días perdidos por falla de equipo · registrado por la Ingeniera
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 space-y-3">
                  {PLATFORMS.filter(p => p.lost_days && p.lost_days > 0).map(p => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between rounded-xl p-4 gap-4"
                      style={{ border: "1px solid rgba(245,158,11,0.15)", background: "rgba(245,158,11,0.05)" }}
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{p.empresa} — Plataforma {p.number}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{p.description} · {p.obra}</p>
                        <p className="text-xs text-slate-600 mt-0.5">Encargado: {p.encargado}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-red-400">
                          {p.lost_days} día{p.lost_days !== 1 ? "s" : ""} perdido{p.lost_days !== 1 ? "s" : ""}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">pendiente de reclamar</p>
                        <Button
                          size="sm"
                          className="cursor-pointer mt-2 text-xs bg-transparent border border-amber-600/40 text-amber-400 hover:bg-amber-900/20 hover:border-amber-500/60 transition-all duration-200"
                        >
                          Ver detalle
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* How it works */}
                  <div
                    className="rounded-xl p-4 mt-2"
                    style={{ border: "1px solid rgba(148,163,184,0.08)", background: "rgba(15,23,42,0.5)" }}
                  >
                    <p className="text-xs font-semibold text-slate-400 mb-1">¿Cómo funciona el reporte de falla?</p>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      La Ingeniera registra al cerrar el reporte diario: <strong className="text-slate-400">¿Hubo día perdido?</strong> Sí/No y la cantidad de días.
                      Ese registro aparece en la ficha de la plataforma y en el resumen del proveedor para reclamar ajuste de renta o servicio si aplica.
                      En comentarios queda: fecha, motivo y evidencia.
                    </p>
                  </div>
                </div>
              </div>

            </TabsContent>
          </Tabs>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
