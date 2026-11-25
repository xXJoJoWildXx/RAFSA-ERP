"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Banknote, Boxes, CheckCircle2, ChevronDown, ChevronRight, Clock,
  FileText, Loader2, Plus, RefreshCw, Trash2, Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import { useRealtimeRefresco, TABLAS_PROVEEDORES } from "@/lib/useRealtimeRefresco"
import { ProveedorFacturaUpload } from "@/components/proveedorFacturaUpload"
import { ProveedorPagosModal, type FacturaParaPago } from "@/components/proveedorPagosModal"
import { useAuth } from "@/lib/auth-context"
import { can } from "@/lib/permissions"

/* ── tipos ── */

type FacturaFila = {
  id: string
  folio_completo: string
  proveedor: string
  entidad_propia: string | null
  moneda: string
  total: number
  monto_pagado: number
  saldo: number
  estado_pago: "pendiente" | "parcial" | "pagada"
  estado_vencimiento: "pagada" | "sin_fecha" | "vencida" | "vence_hoy" | "por_vencer" | "en_tiempo"
  dias_restantes: number | null
  fecha_vencimiento: string | null
  status: "por_revisar" | "procesada" | "con_errores"
  num_pagos: number
}

type ItemFila = {
  id: string
  line_no: number
  descripcion: string
  cantidad: number
  valor_unitario: number
  importe: number
  kind: "product" | "rental" | "service" | "other"
  obra_id: string | null
  obra_sugerida_id: string | null
  procesado: boolean
}

type Obra = { id: string; name: string }

/* ── utilidades ── */

const money = (n: number, m = "MXN") =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: m }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(`${s}T12:00:00`).toLocaleDateString("es-MX",
      { day: "numeric", month: "short", year: "numeric" }) : "—"

/** Los campos de PostgrestError no son enumerables: console.error(e) imprime {}. */
const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const KIND_INFO: Record<ItemFila["kind"], { txt: string; cls: string; icono: any; necesitaObra: boolean }> = {
  product: { txt: "Producto", cls: "bg-cyan-500/15 text-cyan-400",     icono: Boxes,  necesitaObra: false },
  rental:  { txt: "Renta",    cls: "bg-orange-500/15 text-orange-400", icono: Wrench, necesitaObra: false },
  service: { txt: "Servicio", cls: "bg-purple-500/15 text-purple-400", icono: Wrench, necesitaObra: true  },
  other:   { txt: "Omitido",  cls: "bg-slate-600/40 text-slate-400",   icono: FileText, necesitaObra: false },
}

const VENC_INFO: Record<FacturaFila["estado_vencimiento"], { txt: string; cls: string }> = {
  pagada:     { txt: "Pagada",     cls: "bg-emerald-500/15 text-emerald-400" },
  vencida:    { txt: "Vencida",    cls: "bg-red-500/15 text-red-400" },
  vence_hoy:  { txt: "Vence hoy",  cls: "bg-amber-500/15 text-amber-400" },
  por_vencer: { txt: "Por vencer", cls: "bg-amber-500/15 text-amber-400" },
  en_tiempo:  { txt: "En tiempo",  cls: "bg-slate-600/40 text-slate-400" },
  sin_fecha:  { txt: "Sin fecha",  cls: "bg-slate-600/40 text-slate-400" },
}

type Filtro = "por_revisar" | "pendientes" | "vencidas" | "pagadas"

/* ── pantalla ── */

export function ProveedorFacturasTab() {
  const [facturas, setFacturas] = useState<FacturaFila[]>([])
  const [obras, setObras] = useState<Obra[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subirOpen, setSubirOpen] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>("por_revisar")
  const [abierta, setAbierta] = useState<string | null>(null)
  const [pagosDe, setPagosDe] = useState<FacturaParaPago | null>(null)

  const { user } = useAuth()
  // El RLS ya lo impide; esto es para no enseñar un botón que va a tronar.
  const puedeBorrar = can(user?.role, "suppliers.invoices.delete")

  const cargar = useCallback(async () => {
    setError(null)
    const [fRes, oRes] = await Promise.all([
      supabase.from("proveedores_facturas_pago_v")
        .select("*").order("fecha_vencimiento", { ascending: true, nullsFirst: false }),
      supabase.from("obras").select("id, name").order("name"),
    ])
    if (fRes.error) setError(`No se pudieron cargar las facturas: ${detalle(fRes.error)}`)
    if (oRes.error) console.error("[proveedores] obras:", detalle(oRes.error))
    setFacturas((fRes.data as FacturaFila[]) ?? [])
    setObras((oRes.data as Obra[]) ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /* Varias personas trabajan Proveedores a la vez. Esto vuelve a
     consultar en cuanto alguien más registra un pago, procesa una
     factura o manda material, sin esperar a que se recargue. */
  useRealtimeRefresco("proveedores-facturas", TABLAS_PROVEEDORES.facturas, cargar)

  const conteos = useMemo(() => ({
    por_revisar: facturas.filter(f => f.status === "por_revisar").length,
    pendientes:  facturas.filter(f => f.estado_pago !== "pagada" && f.estado_vencimiento !== "vencida").length,
    vencidas:    facturas.filter(f => f.estado_vencimiento === "vencida").length,
    pagadas:     facturas.filter(f => f.estado_pago === "pagada").length,
  }), [facturas])

  const visibles = useMemo(() => facturas.filter(f => {
    if (filtro === "por_revisar") return f.status === "por_revisar"
    if (filtro === "vencidas")    return f.estado_vencimiento === "vencida"
    if (filtro === "pagadas")     return f.estado_pago === "pagada"
    return f.estado_pago !== "pagada" && f.estado_vencimiento !== "vencida"
  }), [facturas, filtro])

  const porPagar = useMemo(
    () => facturas.filter(f => f.estado_pago !== "pagada").reduce((s, f) => s + Number(f.saldo ?? 0), 0),
    [facturas])

  return (
    <div className="space-y-4">
      {/* ── encabezado ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Facturas de proveedor</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Por pagar: <span className="text-slate-300 font-medium tabular-nums">{money(porPagar)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => void cargar()}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60" aria-label="Refrescar">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => setSubirOpen(true)} style={{ background: "#0174bd" }} className="text-white">
            <Plus className="w-4 h-4 mr-1.5" />Subir factura
          </Button>
        </div>
      </div>

      {/* ── cards que filtran ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta activa={filtro === "por_revisar"} onClick={() => setFiltro("por_revisar")}
          etiqueta="Por revisar" valor={conteos.por_revisar} color="#0174bd" />
        <Tarjeta activa={filtro === "pendientes"} onClick={() => setFiltro("pendientes")}
          etiqueta="Pendientes de pago" valor={conteos.pendientes} color="#f59e0b" />
        <Tarjeta activa={filtro === "vencidas"} onClick={() => setFiltro("vencidas")}
          etiqueta="Vencidas" valor={conteos.vencidas} color="#ef4444" />
        <Tarjeta activa={filtro === "pagadas"} onClick={() => setFiltro("pagadas")}
          etiqueta="Pagadas" valor={conteos.pagadas} color="#10b981" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* ── lista ── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
        {cargando ? (
          <div className="py-14 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" />
          </div>
        ) : visibles.length === 0 ? (
          <div className="py-14 text-center">
            <FileText className="w-7 h-7 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No hay facturas en este grupo.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-700/60">
            {visibles.map(f => (
              <FilaFactura
                key={f.id}
                f={f}
                obras={obras}
                abierta={abierta === f.id}
                onToggle={() => setAbierta(abierta === f.id ? null : f.id)}
                onCambio={cargar}
                onAbrirPagos={() => setPagosDe(f)}
                puedeBorrar={puedeBorrar}
                onBorrado={(msg) => { setError(msg); void cargar() }}
              />
            ))}
          </div>
        )}
      </div>

      <ProveedorFacturaUpload
        open={subirOpen}
        onOpenChange={setSubirOpen}
        onRegistrada={(id) => { setFiltro("por_revisar"); setAbierta(id); void cargar() }}
      />

      <ProveedorPagosModal
        factura={pagosDe}
        open={!!pagosDe}
        onOpenChange={(v) => { if (!v) setPagosDe(null) }}
        onCambio={cargar}
      />
    </div>
  )
}

/* ── una factura, con su revisión desplegable ── */

function FilaFactura({
  f, obras, abierta, onToggle, onCambio, onAbrirPagos, puedeBorrar, onBorrado,
}: {
  f: FacturaFila
  obras: Obra[]
  abierta: boolean
  onToggle: () => void
  onCambio: () => Promise<void> | void
  onAbrirPagos: () => void
  puedeBorrar: boolean
  /** Con mensaje cuando la base se negó; con null cuando sí se borró. */
  onBorrado: (mensaje: string | null) => void
}) {
  const [borrando, setBorrando] = useState(false)
  const [items, setItems] = useState<ItemFila[]>([])
  const [cargandoItems, setCargandoItems] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [errorProc, setErrorProc] = useState<string | null>(null)

  const venc = VENC_INFO[f.estado_vencimiento]

  useEffect(() => {
    if (!abierta) return
    let vivo = true
    setCargandoItems(true)
    void (async () => {
      const { data, error } = await supabase
        .from("proveedores_facturas_items")
        .select("id, line_no, descripcion, cantidad, valor_unitario, importe, kind, obra_id, obra_sugerida_id, procesado")
        .eq("factura_id", f.id)
        .order("line_no")
      if (!vivo) return
      if (error) setErrorProc(`No se pudieron cargar los conceptos: ${detalle(error)}`)
      setItems((data as ItemFila[]) ?? [])
      setCargandoItems(false)
    })()
    return () => { vivo = false }
  }, [abierta, f.id])

  const asignarObra = useCallback(async (itemId: string, obraId: string | null) => {
    setItems(prev => prev.map(i => (i.id === itemId ? { ...i, obra_id: obraId } : i)))
    const { error } = await supabase.from("proveedores_facturas_items")
      .update({ obra_id: obraId }).eq("id", itemId)
    if (error) setErrorProc(`No se pudo asignar la obra: ${detalle(error)}`)
  }, [])

  const procesar = useCallback(async () => {
    setProcesando(true); setErrorProc(null)
    const { error } = await supabase.rpc("proveedores_procesar_factura", { p_factura_id: f.id })
    if (error) setErrorProc(detalle(error))
    else await onCambio()
    setProcesando(false)
  }, [f.id, onCambio])

  const borrar = useCallback(async () => {
    if (!confirm(
      `¿Eliminar la factura ${f.folio_completo} de ${f.proveedor}?\n\n` +
      `Se revierte el inventario que entró por ella y se borran sus recordatorios. ` +
      `No se puede deshacer.`
    )) return

    setBorrando(true)
    // Los archivos se leen ANTES: después del borrado ya no hay de dónde.
    const { data: arch } = await supabase
      .from("proveedores_facturas")
      .select("xml_object_path, pdf_object_path")
      .eq("id", f.id)
      .maybeSingle()

    const { error } = await supabase.from("proveedores_facturas").delete().eq("id", f.id)
    if (error) {
      setBorrando(false)
      onBorrado(detalle(error))
      return
    }

    // El XML y el PDF ya no le sirven a nadie. Si falla, no es motivo para
    // decirle al usuario que el borrado no funcionó: la factura ya no está.
    const rutas = [arch?.xml_object_path, arch?.pdf_object_path].filter(Boolean) as string[]
    if (rutas.length) {
      await supabase.storage.from("proveedores-docs").remove(rutas).catch(() => {})
    }

    setBorrando(false)
    onBorrado(null)
  }, [f.id, f.folio_completo, f.proveedor, onBorrado])

  // Solo rentas y servicios se cargan a una obra; lo que se compra entra al
  // almacén y se asigna después, al enviarlo.
  const faltanObras = items.filter(
    i => !i.procesado && KIND_INFO[i.kind].necesitaObra && !i.obra_id && !i.obra_sugerida_id)

  return (
    <div>
      <div className="flex items-stretch">
      <button onClick={onToggle}
        className="flex-1 min-w-0 px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors text-left">
        {abierta ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                 : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{f.folio_completo}</span>
            {f.status === "por_revisar" && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-[#0174bd]/15 text-[#4da8e8]">
                Por revisar
              </span>
            )}
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${venc.cls}`}>{venc.txt}</span>
            {f.estado_pago === "parcial" && (
              <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/15 text-amber-400">
                Pago parcial
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5">
            {f.proveedor}
            {f.entidad_propia && <> · para {f.entidad_propia}</>}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm text-slate-200 tabular-nums">{money(f.total, f.moneda)}</p>
          <p className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
            <Clock className="w-3 h-3" />
            {fecha(f.fecha_vencimiento)}
          </p>
        </div>
      </button>

      {/* Primero se revisa y se procesa; hasta entonces se puede pagar. */}
      {f.status !== "por_revisar" && (
        <button
          onClick={onAbrirPagos}
          title={f.estado_pago === "pagada" ? "Ver pagos" : "Registrar o ver pagos"}
          className="px-4 flex items-center gap-1.5 border-l border-slate-700/60
                     text-slate-500 hover:text-[#4da8e8] hover:bg-slate-700/30 transition-colors shrink-0"
        >
          <Banknote className="w-4 h-4" />
          <span className="text-[11px] font-medium hidden sm:inline">
            {f.estado_pago === "pagada"
              ? "Pagada"
              : f.num_pagos > 0
                ? `Resta ${money(f.saldo, f.moneda)}`
                : "Pagar"}
          </span>
        </button>
      )}

      {puedeBorrar && (
        <button
          onClick={() => void borrar()}
          disabled={borrando}
          aria-label={`Eliminar factura ${f.folio_completo}`}
          title="Eliminar factura"
          className="px-3 flex items-center border-l border-slate-700/60 text-slate-600
                     hover:text-red-400 hover:bg-slate-700/30 transition-colors shrink-0
                     disabled:opacity-40"
        >
          {borrando
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Trash2 className="w-4 h-4" />}
        </button>
      )}
      </div>

      {abierta && (
        <div className="px-4 pb-4 pt-1 bg-slate-900/30 border-t border-slate-700/60">
          {cargandoItems ? (
            <div className="py-6 text-center">
              <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto" />
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-slate-700 overflow-hidden mt-3">
                {items.map(i => {
                  const k = KIND_INFO[i.kind]
                  const Icono = k.icono
                  return (
                    <div key={i.id}
                      className="px-3 py-2.5 flex items-start gap-3 border-b border-slate-700/60 last:border-0">
                      <div className={`w-6 h-6 rounded-md ${k.cls} flex items-center justify-center shrink-0 mt-0.5`}>
                        <Icono className="w-3 h-3" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 leading-snug">{i.descripcion}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {k.txt} · {i.cantidad} × {money(i.valor_unitario, f.moneda)} = {money(i.importe, f.moneda)}
                        </p>

                        {k.necesitaObra && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <select
                              value={i.obra_id ?? i.obra_sugerida_id ?? ""}
                              disabled={i.procesado}
                              onChange={(e) => void asignarObra(i.id, e.target.value || null)}
                              className="rounded-md bg-slate-800 border border-slate-600 px-2 py-1 text-[11px]
                                         text-slate-300 disabled:opacity-50 focus:outline-none
                                         focus:ring-2 focus:ring-[#0174bd]/50"
                            >
                              <option value="">— Sin obra —</option>
                              {obras.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            {!i.obra_id && i.obra_sugerida_id && (
                              <span className="text-[10px] text-amber-400">sugerida, confirma</span>
                            )}
                          </div>
                        )}
                        {i.kind === "product" && (
                          <p className="text-[10px] text-slate-600 mt-1">Entra al almacén; la obra se asigna al enviarlo.</p>
                        )}
                        {i.kind === "rental" && (
                          <p className="text-[10px] text-slate-600 mt-1">
                            La obra y las fechas se asignan después, desde la pestaña Rentas.
                          </p>
                        )}
                        {i.kind === "other" && (
                          <p className="text-[10px] text-slate-600 mt-1">Comisión, flete o ajuste: no entra a inventario.</p>
                        )}
                      </div>

                      {i.procesado && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-1" />}
                    </div>
                  )
                })}
              </div>

              {errorProc && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 mt-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{errorProc}</p>
                </div>
              )}

              {f.status === "por_revisar" && (
                <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                  <p className="text-[11px] text-slate-500">
                    {faltanObras.length > 0
                      ? `${faltanObras.length} servicio${faltanObras.length === 1 ? "" : "s"} sin obra: se procesarán sin cargarse a ninguna.`
                      : "Al procesar se crean el catálogo, los precios, el stock y las rentas."}
                  </p>
                  <Button onClick={() => void procesar()} disabled={procesando}
                    style={{ background: procesando ? undefined : "#0174bd" }}
                    className="text-white disabled:opacity-40">
                    {procesando
                      ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Procesando…</>)
                      : "Procesar factura"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/* ── tarjeta-filtro ── */

function Tarjeta({
  etiqueta, valor, color, activa, onClick,
}: {
  etiqueta: string; valor: number; color: string; activa: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={[
        "rounded-2xl border p-4 text-left transition-all",
        activa ? "bg-slate-800 border-slate-600 shadow-md" : "bg-slate-800/50 border-slate-700 hover:border-slate-600",
      ].join(" ")}
      style={activa ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}
    >
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: activa ? color : "#cbd5e1" }}>
        {valor}
      </p>
    </button>
  )
}
