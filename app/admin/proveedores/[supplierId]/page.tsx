"use client"

import { useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowLeft,
  Layers,
  Wrench,
  Phone,
  Mail,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Package,
  DollarSign,
  FileText,
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────

type Categoria = "plataformas" | "refacciones"
type Condicion = "credito" | "contado"

type Supplier = {
  id:            string
  name:          string
  category:      Categoria
  contact_phone: string
  contact_email: string
  conditions:    Condicion
  status:        "activo" | "inactivo"
}

type Product = {
  id:          string
  supplier_id: string
  name:        string
  description: string
  cost:        number
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const SUPPLIERS: Supplier[] = [
  { id: "s1", name: "Plataformex SA de CV",               category: "plataformas", contact_phone: "81-2345-6789", contact_email: "contacto@plataformex.com",  conditions: "credito", status: "activo"   },
  { id: "s2", name: "Andamios Regio",                     category: "plataformas", contact_phone: "81-9876-5432", contact_email: "ventas@andamiosregio.com",   conditions: "contado", status: "activo"   },
  { id: "s3", name: "Refacciones Industriales del Norte", category: "refacciones", contact_phone: "81-1111-2222", contact_email: "pedidos@rinnorte.com",       conditions: "credito", status: "activo"   },
  { id: "s4", name: "Ferretería El Constructor",          category: "refacciones", contact_phone: "81-3333-4444", contact_email: "ventas@elconstructor.com",   conditions: "contado", status: "activo"   },
  { id: "s5", name: "Suministros Varios SA",              category: "refacciones", contact_phone: "81-5555-6666", contact_email: "info@suministrosvarios.com", conditions: "contado", status: "inactivo" },
]

const INITIAL_PRODUCTS: Product[] = [
  { id: "pr1",  supplier_id: "s1", name: "Plataforma tijera 8m",      description: "Capacidad 300 kg, altura de trabajo 8 m, eléctrica",                 cost: 7200  },
  { id: "pr2",  supplier_id: "s1", name: "Plataforma tijera 10m",     description: "Capacidad 350 kg, altura de trabajo 10 m, eléctrica",                cost: 8500  },
  { id: "pr3",  supplier_id: "s1", name: "Plataforma articulada 14m", description: "Pluma articulada 360°, diesel, altura 14 m",                         cost: 12000 },
  { id: "pr4",  supplier_id: "s2", name: "Andamio colgante 6m",       description: "Acero galvanizado, carga máx. 250 kg, incluye arnés",                 cost: 5500  },
  { id: "pr5",  supplier_id: "s2", name: "Andamio modular 4m",        description: "Sistema modular, rápido ensamble, capacidad 200 kg",                  cost: 3800  },
  { id: "pr6",  supplier_id: "s2", name: "Andamio tubular",           description: "Tubería galvanizada, altura configurable hasta 6 m",                  cost: 2900  },
  { id: "pr7",  supplier_id: "s3", name: "Consumibles soldadura MIG", description: "Alambre ER70S-6 0.9 mm, carrete 15 kg",                              cost: 1540  },
  { id: "pr8",  supplier_id: "s3", name: 'Disco de corte 7"',         description: 'Disco abrasivo 7"x1/8"x7/8", metal, pack x25',                       cost: 640   },
  { id: "pr9",  supplier_id: "s3", name: "Guantes industriales",      description: "Guante de carnaza, talla L, resistente a cortes, par",                cost: 90    },
  { id: "pr10", supplier_id: "s3", name: "Careta de soldar",          description: "Careta fotosensible automática DIN 9-13, protección UV",              cost: 850   },
  { id: "pr11", supplier_id: "s4", name: 'Varilla corrugada 3/8"',    description: 'Varilla de acero al carbono 3/8" (9.5 mm), 12 m',                    cost: 220   },
  { id: "pr12", supplier_id: "s4", name: "Cemento Portland 50 kg",    description: "Cemento gris tipo I, costal 50 kg, resistencia 33 MPa",               cost: 225   },
  { id: "pr13", supplier_id: "s4", name: "Tabla de madera 2x4",       description: 'Tabla pino 2"x4"x8\', cepillada, para cimbra',                       cost: 85    },
  { id: "pr14", supplier_id: "s5", name: "Cinta de aislar",           description: "Cinta aislante eléctrica PVC, 19 mm x 20 m, negra",                  cost: 18    },
  { id: "pr15", supplier_id: "s5", name: "Silicón estructural",       description: "Silicón neutro transparente, tubo 300 ml, uso exterior",              cost: 95    },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n)
}

// ─── Product Form ─────────────────────────────────────────────────────────────

type ProductFormData = { name: string; description: string; cost: string }
const emptyProductForm: ProductFormData = { name: "", description: "", cost: "" }

type ProductFormProps = {
  mode:     "add" | "edit"
  initial?: ProductFormData
  isPlat:   boolean
  onSave:   (d: ProductFormData) => void
  onCancel: () => void
}

function ProductForm({ mode, initial, isPlat, onSave, onCancel }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>(initial ?? emptyProductForm)
  const accent = isPlat ? "#0174bd" : "#a855f7"

  const inputCls =
    "w-full bg-slate-900/70 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 " +
    "placeholder:text-slate-600 outline-none focus:border-[#0174bd]/70 focus:ring-1 focus:ring-[#0174bd]/30 transition-all duration-150"

  const set = (k: keyof ProductFormData, v: string) => setForm(f => ({ ...f, [k]: v }))

  const canSave = form.name.trim() !== "" && form.cost.trim() !== "" && !isNaN(Number(form.cost))

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "linear-gradient(135deg, #162032 0%, #101828 100%)",
        border: `1px solid ${isPlat ? "rgba(1,116,189,0.35)" : "rgba(168,85,247,0.3)"}`,
        boxShadow: `0 0 20px ${isPlat ? "rgba(1,116,189,0.07)" : "rgba(168,85,247,0.07)"}`,
      }}
    >
      {/* Form header */}
      <div className="flex items-center gap-2">
        <div
          className="p-1.5 rounded-lg"
          style={{ background: isPlat ? "rgba(1,116,189,0.15)" : "rgba(168,85,247,0.12)" }}
        >
          {mode === "add"
            ? <Plus   className={`w-3.5 h-3.5 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
            : <Pencil className={`w-3.5 h-3.5 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
          }
        </div>
        <p className="text-sm font-semibold text-slate-200">
          {mode === "add" ? "Nuevo producto" : "Editar producto"}
        </p>
      </div>

      {/* Fields */}
      <div className="grid grid-cols-1 gap-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Nombre *
            </label>
            <input
              className={inputCls}
              placeholder="Ej. Plataforma tijera 10m"
              value={form.name}
              onChange={e => set("name", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Costo (MXN) *
            </label>
            <input
              className={inputCls}
              placeholder="0"
              type="number"
              min="0"
              value={form.cost}
              onChange={e => set("cost", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
            Descripción
          </label>
          <textarea
            className={`${inputCls} resize-none`}
            rows={2}
            placeholder="Descripción del producto, especificaciones..."
            value={form.description}
            onChange={e => set("description", e.target.value)}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!canSave}
          className="cursor-pointer text-white transition-all duration-200 disabled:opacity-40"
          style={{ background: canSave ? accent : undefined }}
          onClick={() => canSave && onSave(form)}
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {mode === "add" ? "Agregar" : "Guardar"}
        </Button>
        <Button
          size="sm"
          className="cursor-pointer bg-transparent border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600 hover:bg-slate-800/40 transition-all duration-200"
          onClick={onCancel}
        >
          <X className="w-3.5 h-3.5 mr-1" />Cancelar
        </Button>
      </div>
    </div>
  )
}

// ─── Product Row ──────────────────────────────────────────────────────────────

type ProductRowProps = {
  p:        Product
  isPlat:   boolean
  onEdit:   (p: Product) => void
  onDelete: (id: string) => void
}

function ProductRow({ p, isPlat, onEdit, onDelete }: ProductRowProps) {
  return (
    <div
      className="group flex items-start gap-4 px-4 py-3.5 rounded-xl transition-all duration-150"
      style={{ background: "rgba(15,23,42,0.4)" }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(1,116,189,0.04)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(15,23,42,0.4)")}
    >
      {/* Icon */}
      <div
        className="p-2 rounded-lg shrink-0 mt-0.5"
        style={{
          background: isPlat ? "rgba(1,116,189,0.12)" : "rgba(168,85,247,0.1)",
          border:     isPlat ? "1px solid rgba(1,116,189,0.18)" : "1px solid rgba(168,85,247,0.18)",
        }}
      >
        <Package className={`w-3.5 h-3.5 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-slate-200 leading-tight">{p.name}</p>
        {p.description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{p.description}</p>
        )}
      </div>

      {/* Cost */}
      <div className="shrink-0 text-right">
        <p className="text-base font-bold text-slate-100">{fmt(p.cost)}</p>
        <p className="text-[10px] text-slate-600 mt-0.5">por unidad</p>
      </div>

      {/* Actions */}
      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={() => onEdit(p)}
          className="cursor-pointer p-1.5 rounded-lg text-slate-500 hover:text-[#4da8e8] hover:bg-[#0174bd]/10 transition-all duration-150"
          title="Editar"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(p.id)}
          className="cursor-pointer p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150"
          title="Eliminar"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierDetailPage() {
  const params   = useParams()
  const router   = useRouter()
  const supplierId = params.supplierId as string

  const supplier = SUPPLIERS.find(s => s.id === supplierId)

  const [products,   setProducts]   = useState<Product[]>(INITIAL_PRODUCTS)
  const [showAdd,    setShowAdd]    = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)

  if (!supplier) {
    return (
      <RoleGuard allowed={["admin"]}>
        <AdminLayout>
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
            <p className="text-slate-400">Proveedor no encontrado.</p>
            <Button onClick={() => router.push("/admin/proveedores")} className="cursor-pointer">
              <ArrowLeft className="w-4 h-4 mr-2" />Volver
            </Button>
          </div>
        </AdminLayout>
      </RoleGuard>
    )
  }

  const isPlat          = supplier.category === "plataformas"
  const supplierProducts = products.filter(p => p.supplier_id === supplierId)
  const totalCatalog     = supplierProducts.length
  const avgCost          = totalCatalog > 0
    ? supplierProducts.reduce((s, p) => s + p.cost, 0) / totalCatalog
    : 0

  function handleAdd(data: ProductFormData) {
    const newP: Product = {
      id:          `pr${Date.now()}`,
      supplier_id: supplierId,
      name:        data.name,
      description: data.description,
      cost:        Number(data.cost),
    }
    setProducts(prev => [newP, ...prev])
    setShowAdd(false)
  }

  function handleSaveEdit(id: string, data: ProductFormData) {
    setProducts(prev =>
      prev.map(p => p.id === id
        ? { ...p, name: data.name, description: data.description, cost: Number(data.cost) }
        : p
      )
    )
    setEditingId(null)
  }

  function handleDelete(id: string) {
    setProducts(prev => prev.filter(p => p.id !== id))
  }

  function startEdit(p: Product) {
    setEditingId(p.id)
    setShowAdd(false)
  }

  const Icon = isPlat ? Layers : Wrench

  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <div className="space-y-6">

          {/* ── Back ── */}
          <button
            onClick={() => router.push("/admin/proveedores")}
            className="cursor-pointer flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors duration-150"
          >
            <ArrowLeft className="w-4 h-4" />
            Proveedores
          </button>

          {/* ── Supplier header ── */}
          <div
            className="rounded-2xl p-6"
            style={{
              background: isPlat
                ? "linear-gradient(135deg, #0f2a4a 0%, #0a1929 50%, #0d1f35 100%)"
                : "linear-gradient(135deg, #1e1030 0%, #120a22 50%, #180f2e 100%)",
              border:    isPlat ? "1px solid rgba(1,116,189,0.2)" : "1px solid rgba(168,85,247,0.2)",
              boxShadow: isPlat ? "0 0 40px rgba(1,116,189,0.07)" : "0 0 40px rgba(168,85,247,0.06)",
            }}
          >
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
              {/* Left: identity */}
              <div className="flex items-start gap-4">
                <div
                  className="p-3 rounded-xl shrink-0"
                  style={{
                    background: isPlat ? "rgba(1,116,189,0.15)"  : "rgba(168,85,247,0.12)",
                    border:     isPlat ? "1px solid rgba(1,116,189,0.25)" : "1px solid rgba(168,85,247,0.2)",
                  }}
                >
                  <Icon className={`w-6 h-6 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-xl font-bold text-white">{supplier.name}</h1>
                    <Badge className={supplier.status === "activo"
                      ? "bg-green-900/40 text-green-400 border border-green-600/30"
                      : "bg-slate-700/60 text-slate-500 border border-slate-600/40"
                    }>
                      {supplier.status === "activo" ? "Activo" : "Inactivo"}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 mt-2">
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Phone className="w-3 h-3 text-slate-500" />
                      {supplier.contact_phone}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Mail className="w-3 h-3 text-slate-500" />
                      {supplier.contact_email}
                    </span>
                    <Badge className={supplier.conditions === "credito"
                      ? "bg-indigo-900/40 text-indigo-400 border border-indigo-600/30"
                      : "bg-slate-700/60 text-slate-400 border border-slate-600/40"
                    }>
                      {supplier.conditions === "credito" ? "Crédito" : "Contado"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Right: quick stats */}
              <div className="flex gap-4 shrink-0">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-100">{totalCatalog}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Productos</p>
                </div>
                <div
                  className="w-px"
                  style={{ background: "rgba(148,163,184,0.12)" }}
                />
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-100">{fmt(avgCost)}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Costo promedio</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Products section ── */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1e293b 0%, #172030 100%)",
              border: "1px solid rgba(148,163,184,0.08)",
              boxShadow: "0 2px 12px rgba(0,0,0,0.25)",
            }}
          >
            {/* Section header */}
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid rgba(148,163,184,0.08)" }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="p-1.5 rounded-lg"
                  style={{
                    background: isPlat ? "rgba(1,116,189,0.15)"  : "rgba(168,85,247,0.12)",
                    border:     isPlat ? "1px solid rgba(1,116,189,0.2)" : "1px solid rgba(168,85,247,0.18)",
                  }}
                >
                  <FileText className={`w-4 h-4 ${isPlat ? "text-[#4da8e8]" : "text-purple-400"}`} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-200">Catálogo de productos</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {totalCatalog} producto{totalCatalog !== 1 ? "s" : ""} registrado{totalCatalog !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() => { setShowAdd(v => !v); setEditingId(null) }}
                className="cursor-pointer text-slate-300 bg-transparent border border-slate-600 hover:text-slate-100 hover:border-slate-500 hover:bg-slate-700/40 transition-all duration-200"
              >
                {showAdd
                  ? <><X    className="w-3.5 h-3.5 mr-1.5" />Cancelar</>
                  : <><Plus className="w-3.5 h-3.5 mr-1.5" />Agregar producto</>
                }
              </Button>
            </div>

            {/* Products list */}
            <div className="p-4 flex flex-col gap-2">

              {/* Add form — always at top */}
              {showAdd && (
                <ProductForm
                  mode="add"
                  isPlat={isPlat}
                  onSave={handleAdd}
                  onCancel={() => setShowAdd(false)}
                />
              )}

              {/* Product rows */}
              {supplierProducts.length === 0 && !showAdd && (
                <div className="py-16 flex flex-col items-center gap-3">
                  <div
                    className="p-4 rounded-full"
                    style={{ background: "rgba(148,163,184,0.06)" }}
                  >
                    <Package className="w-8 h-8 text-slate-600" />
                  </div>
                  <p className="text-sm text-slate-500">Sin productos registrados</p>
                  <button
                    onClick={() => setShowAdd(true)}
                    className="cursor-pointer text-xs text-[#4da8e8] hover:text-[#4da8e8]/80 transition-colors"
                  >
                    + Agregar el primer producto
                  </button>
                </div>
              )}

              {supplierProducts.map(p =>
                editingId === p.id ? (
                  <ProductForm
                    key={p.id}
                    mode="edit"
                    isPlat={isPlat}
                    initial={{ name: p.name, description: p.description, cost: String(p.cost) }}
                    onSave={data => handleSaveEdit(p.id, data)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <ProductRow
                    key={p.id}
                    p={p}
                    isPlat={isPlat}
                    onEdit={startEdit}
                    onDelete={handleDelete}
                  />
                )
              )}

              {/* Summary footer */}
              {supplierProducts.length > 0 && (
                <div
                  className="flex items-center justify-between px-4 py-3 mt-1 rounded-xl"
                  style={{ background: "rgba(15,23,42,0.5)", border: "1px solid rgba(148,163,184,0.06)" }}
                >
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <DollarSign className="w-3.5 h-3.5" />
                    Suma del catálogo
                  </div>
                  <p className="text-base font-bold text-slate-200">
                    {fmt(supplierProducts.reduce((s, p) => s + p.cost, 0))}
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
