"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Building2, CalendarDays, CheckCircle2, ChevronDown,
  ChevronRight, Loader2, Plus, Search, Send, Trash2, Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { supabase } from "@/lib/supabaseClient"
import { useRealtimeRefresco, TABLAS_PROVEEDORES } from "@/lib/useRealtimeRefresco"
import { useAuth } from "@/lib/auth-context"
import { can } from "@/lib/permissions"

/* ── tipos ── */

type Envio = {
  id: string
  folio: string | null
  obra_id: string
  fecha: string
  notas: string | null
  enviado_at: string | null
  obras: { name: string; empresas: { name: string } | null } | null
}

type EnvioItem = {
  id: string
  cantidad: number
  costo_unitario: number
  importe: number
  proveedores_productos: {
    descripcion: string
    codigo: string | null
    unidad: string | null
  } | null
}

type Empresa = { id: string; name: string }
type Obra = { id: string; name: string; code: string | null; empresa_id: string | null }

type Disponible = {
  id: string
  descripcion: string
  codigo: string | null
  unidad: string | null
  stock: number
  last_price: number | null
}

/** Un renglón mientras se arma el envío, antes de mandarlo. */
type Renglon = { producto: Disponible; cantidad: number }

/* ── utilidades ── */

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

const cant = (n: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(s.length <= 10 ? `${s}T12:00:00` : s)
        .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : "—"

const fechaLarga = () =>
  new Date().toLocaleDateString("es-MX", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  })

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

/* ═══════════════════════════════════════════════════════════
   Pestaña
   ═══════════════════════════════════════════════════════════ */

export function ProveedorEnviosTab() {
  const [envios, setEnvios] = useState<Envio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState("")
  const [abierto, setAbierto] = useState<string | null>(null)
  const [nuevoOpen, setNuevoOpen] = useState(false)

  const { user } = useAuth()
  // El RLS ya lo impide; esto evita enseñar un botón que iba a tronar.
  const puedeBorrar = can(user?.role, "suppliers.shipments.delete")

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase
      .from("proveedores_envios")
      .select("id, folio, obra_id, fecha, notas, enviado_at, obras(name, empresas(name))")
      .eq("status", "enviado")
      .order("enviado_at", { ascending: false, nullsFirst: false })
    if (error) setError(`No se pudieron cargar los envíos: ${detalle(error)}`)
    setEnvios((data as unknown as Envio[]) ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /* Varias personas trabajan Proveedores a la vez. Esto vuelve a
     consultar en cuanto alguien más registra un pago, procesa una
     factura o manda material, sin esperar a que se recargue. */
  useRealtimeRefresco("proveedores-envios", TABLAS_PROVEEDORES.envios, cargar)

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return envios
    return envios.filter(e =>
      [e.folio, e.obras?.name, e.obras?.empresas?.name, e.notas]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(q)))
  }, [envios, busca])

  const esteMes = useMemo(() => {
    const h = new Date()
    return envios.filter(e => {
      if (!e.enviado_at) return false
      const d = new Date(e.enviado_at)
      return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth()
    }).length
  }, [envios])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Envíos a obra</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {envios.length} envío{envios.length === 1 ? "" : "s"}
            {esteMes > 0 && <> · {esteMes} este mes</>}
          </p>
        </div>
        <Button onClick={() => setNuevoOpen(true)} style={{ background: "#0174bd" }} className="text-white">
          <Plus className="w-4 h-4 mr-1.5" />Nuevo envío
        </Button>
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por folio, obra o empresa…"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2 text-sm
                     text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
        {cargando ? (
          <div className="py-14 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
        ) : visibles.length === 0 ? (
          <div className="py-14 text-center">
            <Truck className="w-7 h-7 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {envios.length === 0
                ? "Todavía no hay envíos. Crea uno para mandar material del almacén a una obra."
                : "Ningún envío coincide con la búsqueda."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {visibles.map(e => (
              <FilaEnvio key={e.id} e={e}
                abierto={abierto === e.id}
                onToggle={() => setAbierto(abierto === e.id ? null : e.id)}
                puedeBorrar={puedeBorrar}
                onBorrado={(msg) => { setError(msg); void cargar() }} />
            ))}
          </div>
        )}
      </div>

      <NuevoEnvio
        abierto={nuevoOpen}
        onCerrar={() => setNuevoOpen(false)}
        onEnviado={async () => { setNuevoOpen(false); await cargar() }}
      />
    </div>
  )
}

/* ── una fila, con sus renglones ── */

function FilaEnvio({ e, abierto, onToggle, puedeBorrar, onBorrado }: {
  e: Envio
  abierto: boolean
  onToggle: () => void
  puedeBorrar: boolean
  /** Con mensaje si la base se negó; con null si sí se borró. */
  onBorrado: (mensaje: string | null) => void
}) {
  const [items, setItems] = useState<EnvioItem[]>([])
  const [cargando, setCargando] = useState(false)
  const [borrando, setBorrando] = useState(false)

  const borrar = useCallback(async () => {
    if (!confirm(
      `¿Eliminar el envío ${e.folio ?? ""} a ${e.obras?.name ?? "la obra"}?\n\n` +
      `El material regresa al almacén y el gasto deja de contar para la obra.`
    )) return
    setBorrando(true)
    const { error } = await supabase.from("proveedores_envios").delete().eq("id", e.id)
    setBorrando(false)
    onBorrado(error ? detalle(error) : null)
  }, [e.id, e.folio, e.obras, onBorrado])

  useEffect(() => {
    if (!abierto) return
    let vivo = true
    setCargando(true)
    void (async () => {
      const { data } = await supabase
        .from("proveedores_envios_items")
        .select("id, cantidad, costo_unitario, importe, proveedores_productos(descripcion, codigo, unidad)")
        .eq("envio_id", e.id)
        .order("created_at")
      if (!vivo) return
      setItems((data as unknown as EnvioItem[]) ?? [])
      setCargando(false)
    })()
    return () => { vivo = false }
  }, [abierto, e.id])

  const total = useMemo(() => items.reduce((s, i) => s + Number(i.importe ?? 0), 0), [items])

  return (
    <div>
      <div className="flex items-stretch">
      <button onClick={onToggle}
        className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors text-left">
        {abierto ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                 : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{e.folio ?? "sin folio"}</span>
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/15 text-emerald-400">
              Enviado
            </span>
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1.5">
            <Building2 className="w-3 h-3 text-slate-600 shrink-0" />
            {e.obras?.empresas?.name && <span className="text-slate-400">{e.obras.empresas.name} ·</span>}
            {e.obras?.name ?? "sin obra"}
            {e.notas && <> · {e.notas}</>}
          </p>
        </div>

        <span className="text-[11px] text-slate-500 shrink-0">{fecha(e.enviado_at ?? e.fecha)}</span>
      </button>

      {puedeBorrar && (
        <button onClick={() => void borrar()} disabled={borrando}
          aria-label={`Eliminar envío ${e.folio ?? ""}`}
          title="Eliminar envío y regresar el material al almacén"
          className="px-3 flex items-center border-l border-slate-700/60 text-slate-600
                     hover:text-red-400 hover:bg-slate-700/30 transition-colors shrink-0
                     disabled:opacity-40">
          {borrando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        </button>
      )}
      </div>

      {abierto && (
        <div className="px-4 pb-4 pt-1 bg-slate-900/30 border-t border-slate-700/60">
          {cargando ? (
            <div className="py-6 text-center"><Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" /></div>
          ) : (
            <div className="rounded-xl border border-slate-700 overflow-hidden mt-3">
              {items.map(i => {
                const p = i.proveedores_productos
                return (
                  <div key={i.id}
                    className="px-3 py-2.5 flex items-start gap-3 border-b border-slate-700/60 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-200 leading-snug">{p?.descripcion ?? "—"}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {p?.codigo ?? "sin código"} · {cant(Number(i.cantidad))} {p?.unidad ?? ""}
                        {" × "}{money(Number(i.costo_unitario))}
                      </p>
                    </div>
                    <span className="text-xs text-slate-300 tabular-nums shrink-0">
                      {money(Number(i.importe))}
                    </span>
                  </div>
                )
              })}
              <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-700 flex justify-between">
                <span className="text-[11px] text-slate-500">Costo congelado al enviar</span>
                <span className="text-xs font-semibold text-slate-200 tabular-nums">{money(total)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════
   Popup: empresa → obra → productos → enviar
   ═══════════════════════════════════════════════════════════ */

function NuevoEnvio({ abierto, onCerrar, onEnviado }: {
  abierto: boolean
  onCerrar: () => void
  onEnviado: () => Promise<void> | void
}) {
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [disponibles, setDisponibles] = useState<Disponible[]>([])
  const [cargando, setCargando] = useState(true)

  const [empresaId, setEmpresaId] = useState("")
  const [obraId, setObraId] = useState("")
  const [renglones, setRenglones] = useState<Renglon[]>([])
  const [notas, setNotas] = useState("")

  const [prodSel, setProdSel] = useState("")
  const [cantSel, setCantSel] = useState("")

  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exito, setExito] = useState<string | null>(null)

  useEffect(() => {
    if (!abierto) return
    setEmpresaId(""); setObraId(""); setRenglones([]); setNotas("")
    setProdSel(""); setCantSel(""); setError(null); setExito(null)
    setCargando(true)
    void (async () => {
      const [emRes, obRes, prRes] = await Promise.all([
        supabase.from("empresas").select("id, name").order("name"),
        supabase.from("obras").select("id, name, code, empresa_id").order("name"),
        supabase.from("proveedores_productos")
          .select("id, descripcion, codigo, unidad, stock, last_price")
          .eq("kind", "product").eq("is_active", true).gt("stock", 0)
          .order("descripcion"),
      ])
      if (emRes.error || obRes.error || prRes.error) {
        setError(`No se pudo cargar el catálogo: ${detalle(emRes.error ?? obRes.error ?? prRes.error)}`)
      }
      setEmpresas((emRes.data as Empresa[]) ?? [])
      setObras((obRes.data as Obra[]) ?? [])
      setDisponibles((prRes.data as Disponible[]) ?? [])
      setCargando(false)
    })()
  }, [abierto])

  const obrasDeEmpresa = useMemo(
    () => obras.filter(o => o.empresa_id === empresaId), [obras, empresaId])

  // Al cambiar de empresa, la obra elegida deja de tener sentido.
  const cambiarEmpresa = useCallback((id: string) => {
    setEmpresaId(id); setObraId(""); setError(null)
  }, [])

  const yaPuesto = useMemo(
    () => new Set(renglones.map(r => r.producto.id)), [renglones])
  const paraAgregar = useMemo(
    () => disponibles.filter(p => !yaPuesto.has(p.id)), [disponibles, yaPuesto])

  const prodElegido = paraAgregar.find(p => p.id === prodSel) ?? null

  const agregar = useCallback(() => {
    if (!prodElegido) return
    const n = Number(cantSel)
    if (!Number.isFinite(n) || n <= 0) { setError("La cantidad debe ser mayor a cero."); return }
    if (n > Number(prodElegido.stock)) {
      setError(`Solo hay ${cant(Number(prodElegido.stock))} de "${prodElegido.descripcion}" en almacén.`)
      return
    }
    setRenglones(prev => [...prev, { producto: prodElegido, cantidad: n }])
    setProdSel(""); setCantSel(""); setError(null)
  }, [prodElegido, cantSel])

  const quitar = useCallback((id: string) => {
    setRenglones(prev => prev.filter(r => r.producto.id !== id))
  }, [])

  const total = useMemo(
    () => renglones.reduce((s, r) => s + (Number(r.producto.last_price) || 0) * r.cantidad, 0),
    [renglones])

  const enviar = useCallback(async () => {
    if (!obraId) { setError("Elige la obra a la que va el material."); return }
    if (renglones.length === 0) { setError("Agrega al menos un producto."); return }
    setEnviando(true); setError(null)

    const { data, error } = await supabase.rpc("proveedores_crear_y_enviar", {
      p_obra_id: obraId,
      p_items: renglones.map(r => ({ producto_id: r.producto.id, cantidad: r.cantidad })),
      p_notas: notas.trim() || null,
    })

    if (error) {
      setError(detalle(error))
      setEnviando(false)
      return
    }
    setEnviando(false)
    setExito(typeof data === "string" ? data : null)
    await onEnviado()
  }, [obraId, renglones, notas, onEnviado])

  const puedeEnviar = !!obraId && renglones.length > 0 && !enviando

  return (
    <Dialog open={abierto} onOpenChange={(v) => { if (!v && !enviando) onCerrar() }}>
      <DialogContent className="max-w-2xl bg-slate-800 border-slate-700 text-slate-200 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-slate-700 bg-slate-900/60">
          <DialogTitle className="text-slate-100">Nuevo envío a obra</DialogTitle>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
            <CalendarDays className="w-3 h-3" />
            <span className="capitalize">{fechaLarga()}</span>
          </p>
        </DialogHeader>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {cargando ? (
            <div className="py-10 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
          ) : (
            <>
              {/* ── destino ── */}
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400">
                    Empresa <span className="text-red-400">*</span>
                  </label>
                  <select value={empresaId} onChange={(e) => cambiarEmpresa(e.target.value)}
                    disabled={enviando}
                    className="w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                    <option value="">— Elige la empresa —</option>
                    {empresas.map(em => <option key={em.id} value={em.id}>{em.name}</option>)}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-400">
                    Obra <span className="text-red-400">*</span>
                  </label>
                  <select value={obraId} onChange={(e) => setObraId(e.target.value)}
                    disabled={enviando || !empresaId}
                    className="w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                               text-slate-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                    <option value="">
                      {!empresaId ? "— Elige primero la empresa —"
                        : obrasDeEmpresa.length === 0 ? "— Esta empresa no tiene obras —"
                        : "— Elige la obra —"}
                    </option>
                    {obrasDeEmpresa.map(o => (
                      <option key={o.id} value={o.id}>
                        {o.code ? `${o.code} · ${o.name}` : o.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── material ── */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                <p className="text-[11px] font-semibold text-slate-400 mb-2">
                  Material <span className="text-red-400">*</span>
                </p>

                {paraAgregar.length === 0 && renglones.length === 0 ? (
                  <p className="text-[11px] text-slate-500 py-2">
                    No hay productos con existencia en el almacén. Procesa una factura primero.
                  </p>
                ) : (
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <select value={prodSel} onChange={(e) => { setProdSel(e.target.value); setError(null) }}
                        disabled={enviando}
                        className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-xs
                                   text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50">
                        <option value="">
                          {paraAgregar.length === 0 ? "— Ya agregaste todo lo disponible —" : "— Elige un producto —"}
                        </option>
                        {paraAgregar.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.descripcion} · hay {cant(Number(p.stock))} {p.unidad ?? ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-28">
                      <input type="number" min="0" step="0.001" value={cantSel}
                        onChange={(e) => setCantSel(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); agregar() } }}
                        disabled={enviando || !prodSel}
                        placeholder={prodElegido ? `máx ${cant(Number(prodElegido.stock))}` : "cantidad"}
                        className="w-full rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-xs
                                   text-slate-200 tabular-nums placeholder:text-slate-600
                                   focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
                    </div>
                    <Button onClick={agregar} disabled={enviando || !prodSel || !cantSel} variant="ghost"
                      className="h-8 text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-700/60 disabled:opacity-40">
                      Agregar
                    </Button>
                  </div>
                )}

                {renglones.length > 0 && (
                  <div className="rounded-lg border border-slate-700 overflow-hidden mt-3">
                    {renglones.map(r => (
                      <div key={r.producto.id}
                        className="px-3 py-2 flex items-center gap-3 border-b border-slate-700/60 last:border-0 bg-slate-800/60">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-200 leading-snug truncate">{r.producto.descripcion}</p>
                          <p className="text-[10px] text-slate-500">
                            {cant(r.cantidad)} {r.producto.unidad ?? ""} × {money(r.producto.last_price)}
                          </p>
                        </div>
                        <span className="text-xs text-slate-300 tabular-nums shrink-0">
                          {money((Number(r.producto.last_price) || 0) * r.cantidad)}
                        </span>
                        <button onClick={() => quitar(r.producto.id)} disabled={enviando}
                          aria-label={`Quitar ${r.producto.descripcion}`}
                          className="shrink-0 rounded-lg p-1 text-slate-500 hover:text-red-400 hover:bg-slate-700/60 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="px-3 py-2 bg-slate-900/60 border-t border-slate-700 flex justify-between">
                      <span className="text-[10px] text-slate-500">
                        Estimado con el último precio de compra
                      </span>
                      <span className="text-xs font-semibold text-slate-200 tabular-nums">{money(total)}</span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400">Notas</label>
                <input value={notas} onChange={(e) => setNotas(e.target.value)} disabled={enviando}
                  placeholder="Quién lo lleva, para qué frente…"
                  className="w-full mt-1 rounded-lg bg-slate-800 border border-slate-600 px-3 py-1.5 text-sm
                             text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}

              {exito && (
                <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-200">
                    Envío <span className="font-semibold">{exito}</span> registrado. El material ya salió del almacén.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-slate-700 bg-slate-900/60 flex items-center justify-between gap-2">
          <span className="text-[10px] text-slate-600">
            Al enviar sale del almacén. No se puede deshacer.
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onCerrar} disabled={enviando}
              className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60">
              {exito ? "Cerrar" : "Cancelar"}
            </Button>
            {!exito && (
              <Button onClick={() => void enviar()} disabled={!puedeEnviar}
                style={{ background: puedeEnviar ? "#0174bd" : undefined }}
                className="text-white disabled:opacity-40">
                {enviando
                  ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando…</>)
                  : (<><Send className="w-4 h-4 mr-2" />Enviar a obra</>)}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
