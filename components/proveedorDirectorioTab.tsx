"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  AlertTriangle, Building2, Loader2, Mail, Pencil, Phone, Plus, Search,
  Sparkles, Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"
import { useBasePath } from "@/lib/appScope"

type Proveedor = {
  id: string
  rfc: string
  razon_social: string
  nombre_comercial: string | null
  categoria: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  condiciones_pago: string | null
  dias_credito: number | null
  notas: string | null
  is_active: boolean
  autocreado: boolean
}

type Resumen = { facturas: number; comprado: number; saldo: number }

const CATEGORIAS = [
  ["materiales", "Materiales"],
  ["herramienta", "Herramienta"],
  ["refacciones", "Refacciones"],
  ["plataformas", "Plataformas"],
  ["servicios", "Servicios"],
  ["otro", "Otro"],
] as const

const CAT_CLS: Record<string, string> = {
  materiales:  "bg-cyan-500/15 text-cyan-400",
  herramienta: "bg-blue-500/15 text-blue-400",
  refacciones: "bg-purple-500/15 text-purple-400",
  plataformas: "bg-orange-500/15 text-orange-400",
  servicios:   "bg-emerald-500/15 text-emerald-400",
  otro:        "bg-slate-600/40 text-slate-400",
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n ?? 0)

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const vacio = {
  rfc: "", razon_social: "", nombre_comercial: "", categoria: "materiales",
  contacto_nombre: "", contacto_telefono: "", contacto_email: "",
  condiciones_pago: "", dias_credito: "", notas: "", is_active: true,
}
type Form = typeof vacio

export function ProveedorDirectorioTab() {
  const router = useRouter()
  const basePath = useBasePath()

  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [resumen, setResumen] = useState<Record<string, Resumen>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState("")
  const [categoria, setCategoria] = useState<string>("todas")

  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const [pRes, fRes] = await Promise.all([
      supabase.from("proveedores").select("*").order("razon_social"),
      supabase.from("proveedores_facturas_pago_v").select("proveedor_id, total, saldo, estado_pago"),
    ])
    if (pRes.error) setError(`No se pudieron cargar los proveedores: ${detalle(pRes.error)}`)
    setProveedores((pRes.data as Proveedor[]) ?? [])

    const acc: Record<string, Resumen> = {}
    for (const f of (fRes.data as any[]) ?? []) {
      const r = (acc[f.proveedor_id] ??= { facturas: 0, comprado: 0, saldo: 0 })
      r.facturas += 1
      r.comprado += Number(f.total ?? 0)
      if (f.estado_pago !== "pagada") r.saldo += Number(f.saldo ?? 0)
    }
    setResumen(acc)
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return proveedores.filter(p => {
      if (categoria !== "todas" && p.categoria !== categoria) return false
      if (!q) return true
      return [p.razon_social, p.nombre_comercial, p.rfc, p.contacto_nombre]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(q))
    })
  }, [proveedores, busca, categoria])

  const porCompletar = useMemo(
    () => proveedores.filter(p => p.autocreado && !p.contacto_telefono && !p.contacto_email).length,
    [proveedores])

  const borrar = useCallback(async (p: Proveedor) => {
    if (!confirm(`¿Eliminar a ${p.razon_social}? Solo se puede si no tiene facturas cargadas.`)) return
    const { error } = await supabase.from("proveedores").delete().eq("id", p.id)
    if (error) {
      // La FK es on delete restrict: el mensaje crudo de Postgres no le dice
      // nada a quien lo lee, así que lo traducimos.
      setError(error.code === "23503"
        ? `No se puede eliminar a ${p.razon_social} porque tiene facturas o productos ligados. Desactívalo en lugar de borrarlo.`
        : `No se pudo eliminar: ${detalle(error)}`)
    } else {
      await cargar()
    }
  }, [cargar])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Directorio</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {proveedores.length} proveedor{proveedores.length === 1 ? "" : "es"}
            {porCompletar > 0 && (
              <> · <span className="text-amber-400">{porCompletar} sin datos de contacto</span></>
            )}
          </p>
        </div>
        <Button onClick={() => setCreando(true)} style={{ background: "#0174bd" }} className="text-white">
          <Plus className="w-4 h-4 mr-1.5" />Nuevo proveedor
        </Button>
      </div>

      {/* filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nombre, RFC o contacto…"
            className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2 text-sm
                       text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50"
          />
        </div>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}
          className="rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-300
                     focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
          <option value="todas">Todas las categorías</option>
          {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* lista */}
      {cargando ? (
        <div className="py-14 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 py-14 text-center">
          <Building2 className="w-7 h-7 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {proveedores.length === 0
              ? "Todavía no hay proveedores. Se crean solos al subir una factura."
              : "Ningún proveedor coincide con el filtro."}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibles.map(p => {
            const r = resumen[p.id]
            return (
              <div key={p.id}
                className="rounded-2xl border border-slate-700 bg-slate-800 p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => router.push(`${basePath}/proveedores/${p.id}`)}
                    className="min-w-0 text-left group"
                  >
                    <p className="text-sm font-semibold text-slate-100 truncate group-hover:text-[#4da8e8] transition-colors">
                      {p.nombre_comercial || p.razon_social}
                    </p>
                    <p className="text-[11px] text-slate-500 truncate">{p.rfc}</p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditando(p)} aria-label="Editar"
                      className="rounded-lg p-1.5 text-slate-500 hover:text-slate-200 hover:bg-slate-700/60 transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => void borrar(p)} aria-label="Eliminar"
                      className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700/60 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${CAT_CLS[p.categoria] ?? CAT_CLS.otro}`}>
                    {CATEGORIAS.find(c => c[0] === p.categoria)?.[1] ?? p.categoria}
                  </span>
                  {!p.is_active && (
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-slate-600/40 text-slate-400">
                      Inactivo
                    </span>
                  )}
                  {p.autocreado && !p.contacto_telefono && !p.contacto_email && (
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400
                                     inline-flex items-center gap-1"
                      title="Se creó solo al cargar una factura; le faltan datos de contacto">
                      <Sparkles className="w-2.5 h-2.5" />Por completar
                    </span>
                  )}
                  {p.dias_credito != null && (
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-slate-700/60 text-slate-400">
                      {p.dias_credito} días
                    </span>
                  )}
                </div>

                {(p.contacto_telefono || p.contacto_email) && (
                  <div className="mt-2.5 space-y-0.5">
                    {p.contacto_telefono && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-600" />{p.contacto_telefono}
                      </p>
                    )}
                    {p.contacto_email && (
                      <p className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 text-slate-600 shrink-0" />{p.contacto_email}
                      </p>
                    )}
                  </div>
                )}

                {r && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">
                      {r.facturas} factura{r.facturas === 1 ? "" : "s"} · {money(r.comprado)}
                    </span>
                    {r.saldo > 0 && (
                      <span className="text-[10px] font-medium text-amber-400">Debe {money(r.saldo)}</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <FormularioProveedor
        abierto={creando || !!editando}
        proveedor={editando}
        onCerrar={() => { setCreando(false); setEditando(null) }}
        onGuardado={async () => { setCreando(false); setEditando(null); await cargar() }}
      />
    </div>
  )
}

/* ── alta y edición ── */

function FormularioProveedor({
  abierto, proveedor, onCerrar, onGuardado,
}: {
  abierto: boolean
  proveedor: Proveedor | null
  onCerrar: () => void
  onGuardado: () => Promise<void> | void
}) {
  const [f, setF] = useState<Form>(vacio)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setError(null)
    setF(proveedor ? {
      rfc: proveedor.rfc,
      razon_social: proveedor.razon_social,
      nombre_comercial: proveedor.nombre_comercial ?? "",
      categoria: proveedor.categoria,
      contacto_nombre: proveedor.contacto_nombre ?? "",
      contacto_telefono: proveedor.contacto_telefono ?? "",
      contacto_email: proveedor.contacto_email ?? "",
      condiciones_pago: proveedor.condiciones_pago ?? "",
      dias_credito: proveedor.dias_credito != null ? String(proveedor.dias_credito) : "",
      notas: proveedor.notas ?? "",
      is_active: proveedor.is_active,
    } : vacio)
  }, [abierto, proveedor])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF(prev => ({ ...prev, [k]: v }))

  const guardar = useCallback(async () => {
    if (!f.rfc.trim() || !f.razon_social.trim()) {
      setError("El RFC y la razón social son obligatorios."); return
    }
    setGuardando(true); setError(null)

    const payload = {
      rfc: f.rfc.trim().toUpperCase(),
      razon_social: f.razon_social.trim(),
      nombre_comercial: f.nombre_comercial.trim() || null,
      categoria: f.categoria,
      contacto_nombre: f.contacto_nombre.trim() || null,
      contacto_telefono: f.contacto_telefono.trim() || null,
      contacto_email: f.contacto_email.trim() || null,
      condiciones_pago: f.condiciones_pago.trim() || null,
      dias_credito: f.dias_credito.trim() ? Number(f.dias_credito) : null,
      notas: f.notas.trim() || null,
      is_active: f.is_active,
      // Si alguien lo editó a mano, deja de ser un registro automático:
      // así la próxima factura ya no le pisa la razón social.
      autocreado: false,
      updated_at: new Date().toISOString(),
    }

    const { error } = proveedor
      ? await supabase.from("proveedores").update(payload).eq("id", proveedor.id)
      : await supabase.from("proveedores").insert(payload)

    if (error) {
      setError(error.code === "23505"
        ? `Ya existe un proveedor con el RFC ${payload.rfc}.`
        : `No se pudo guardar: ${detalle(error)}`)
      setGuardando(false)
      return
    }
    setGuardando(false)
    await onGuardado()
  }, [f, proveedor, onGuardado])

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && !guardando) onCerrar() }}>
      <DialogContent className="max-w-xl bg-slate-800 border-slate-700 text-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-700 bg-slate-900/60">
          <DialogTitle className="text-slate-100">
            {proveedor ? "Editar proveedor" : "Nuevo proveedor"}
          </DialogTitle>
        </DialogHeader>

        <div className="p-5 space-y-3 max-h-[65vh] overflow-y-auto">
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo etiqueta="RFC" requerido>
              <Entrada value={f.rfc} onChange={(v) => set("rfc", v.toUpperCase())} disabled={guardando} />
            </Campo>
            <Campo etiqueta="Categoría">
              <select value={f.categoria} onChange={(e) => set("categoria", e.target.value)} disabled={guardando}
                className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-slate-200
                           focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                {CATEGORIAS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </Campo>
          </div>

          <Campo etiqueta="Razón social" requerido>
            <Entrada value={f.razon_social} onChange={(v) => set("razon_social", v)} disabled={guardando} />
          </Campo>
          <Campo etiqueta="Nombre comercial">
            <Entrada value={f.nombre_comercial} onChange={(v) => set("nombre_comercial", v)}
              disabled={guardando} placeholder="Cómo le dicen en la obra" />
          </Campo>

          <div className="grid sm:grid-cols-2 gap-3">
            <Campo etiqueta="Contacto"><Entrada value={f.contacto_nombre} onChange={(v) => set("contacto_nombre", v)} disabled={guardando} /></Campo>
            <Campo etiqueta="Teléfono"><Entrada value={f.contacto_telefono} onChange={(v) => set("contacto_telefono", v)} disabled={guardando} /></Campo>
            <Campo etiqueta="Correo"><Entrada value={f.contacto_email} onChange={(v) => set("contacto_email", v)} disabled={guardando} /></Campo>
            <Campo etiqueta="Días de crédito">
              <Entrada value={f.dias_credito} onChange={(v) => set("dias_credito", v.replace(/\D/g, ""))}
                disabled={guardando} placeholder="30" />
            </Campo>
          </div>

          <Campo etiqueta="Condiciones de pago">
            <Entrada value={f.condiciones_pago} onChange={(v) => set("condiciones_pago", v)} disabled={guardando} />
          </Campo>
          <Campo etiqueta="Notas">
            <Entrada value={f.notas} onChange={(v) => set("notas", v)} disabled={guardando} />
          </Campo>

          <label className="flex items-center gap-2 pt-1 cursor-pointer">
            <input type="checkbox" checked={f.is_active} disabled={guardando}
              onChange={(e) => set("is_active", e.target.checked)}
              className="rounded border-slate-600 bg-slate-800" />
            <span className="text-xs text-slate-300">Proveedor activo</span>
          </label>

          {error && (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-200">{error}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-700 bg-slate-900/60 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCerrar} disabled={guardando}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">Cancelar</Button>
          <Button onClick={() => void guardar()} disabled={guardando}
            style={{ background: guardando ? undefined : "#0174bd" }} className="text-white disabled:opacity-40">
            {guardando ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando…</>) : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Campo({ etiqueta, requerido, children }: {
  etiqueta: string; requerido?: boolean; children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold text-slate-400">
        {etiqueta}{requerido && <span className="text-red-400"> *</span>}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  )
}

function Entrada({ value, onChange, disabled, placeholder }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; placeholder?: string
}) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)}
      disabled={disabled} placeholder={placeholder}
      className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm text-slate-200
                 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50"
    />
  )
}
