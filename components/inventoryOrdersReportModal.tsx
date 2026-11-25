"use client"

/**
 * Reporte de órdenes de inventario: elección del periodo y descarga.
 *
 * El rango se elige como un vuelo redondo: primer clic la fecha de salida,
 * segundo clic la de regreso. Un tercer clic empieza un rango nuevo, así que
 * nunca hace falta un botón de "limpiar" para corregirse.
 *
 * Antes de descargar nada se muestra la vista previa del periodo (órdenes,
 * obras, total): si el rango quedó mal, se ve aquí y no en el PDF.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { es } from "date-fns/locale"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { BotonesDescarga } from "@/components/botonesDescarga"
import { Calendar } from "@/components/ui/calendar"
import { CALENDAR_DARK_CLASS, CALENDAR_DARK_CLASSNAMES } from "@/lib/calendarTheme"
import { CalendarDays, ChevronDown, FileText, Loader2, PackageSearch } from "lucide-react"
import {
  construirReporte,
  money,
  cantidad,
  fechaLarga,
  type ReporteOrdenes,
  type ReportOrder,
  type ReportObra,
} from "@/lib/inventoryOrdersReport"
import { generateInventoryOrdersReportPdf } from "@/lib/inventoryOrdersReportPdf"
import { generateInventoryOrdersReportExcel } from "@/lib/inventoryOrdersReportExcel"

type Props = {
  open: boolean
  onClose: () => void
  /** Avisos de la pantalla (mismo estilo de toasts que el resto del tab) */
  notify?: (mensaje: string, variante?: "success" | "error" | "warning" | "info", titulo?: string) => void
}

/** Inicio del día en hora local. */
function inicioDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}
/** Fin del día en hora local: el rango incluye completo el último día. */
function finDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

const PAGE = 1000

/** Atajos de periodo; "custom" es el rango que se arma en el calendario. */
type PresetId = "mes" | "pasado" | "90dias" | "anio" | "todo" | "custom"

export function InventoryOrdersReportModal({ open, onClose, notify }: Props) {
  const { user } = useAuth()
  const hoy = useMemo(() => new Date(), [])

  // Arranca en el mes corriente: es el reporte que se pide nueve de cada diez veces.
  const [rango, setRango] = useState<DateRange | undefined>(() => ({
    from: new Date(hoy.getFullYear(), hoy.getMonth(), 1),
    to: hoy,
  }))
  const [cargando, setCargando] = useState(false)
  const [reporte, setReporte] = useState<ReporteOrdenes | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Qué atajo está puesto, y si el calendario está desplegado. El calendario
  // sólo aparece cuando se pide: ocupa media pantalla y, abierto de entrada,
  // estorba al 90% de los reportes, que salen con un atajo.
  const [preset, setPreset] = useState<PresetId>("mes")
  const [calAbierto, setCalAbierto] = useState(false)

  // Para "Todo": la fecha de la primera orden capturada, así el periodo del
  // reporte dice algo real y no un 1900 inventado.
  const [primeraOrden, setPrimeraOrden] = useState<Date | null>(null)

  const completo = !!(rango?.from && rango?.to)

  /**
   * Un clic a la vez, como un vuelo redondo: el primero fija la salida, el
   * segundo el regreso y el tercero empieza de nuevo. Si el segundo clic cae
   * antes del primero se invierten, en lugar de rechazar la fecha.
   */
  const alElegirDia = useCallback((dia: Date) => {
    setRango((actual) => {
      if (!actual?.from || (actual.from && actual.to)) return { from: dia, to: undefined }
      return dia < actual.from ? { from: dia, to: actual.from } : { from: actual.from, to: dia }
    })
  }, [])

  const atajos: { id: PresetId; etiqueta: string; rango: () => DateRange }[] = [
    {
      id: "mes",
      etiqueta: "Este mes",
      rango: () => ({ from: new Date(hoy.getFullYear(), hoy.getMonth(), 1), to: hoy }),
    },
    {
      id: "pasado",
      etiqueta: "Mes pasado",
      rango: () => ({
        from: new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1),
        to: new Date(hoy.getFullYear(), hoy.getMonth(), 0),
      }),
    },
    {
      id: "90dias",
      etiqueta: "Últimos 90 días",
      rango: () => ({ from: new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 89), to: hoy }),
    },
    {
      id: "anio",
      etiqueta: "Este año",
      rango: () => ({ from: new Date(hoy.getFullYear(), 0, 1), to: hoy }),
    },
    {
      id: "todo",
      etiqueta: "Todo",
      // Sin primera orden todavía (o sin órdenes), se abre hasta cinco años
      // atrás: cubre de sobra la historia capturada.
      rango: () => ({ from: primeraOrden ?? new Date(hoy.getFullYear() - 5, 0, 1), to: hoy }),
    },
  ]

  /** Elegir un atajo cierra el calendario: ya no hay nada que escoger ahí. */
  const aplicarAtajo = (id: PresetId) => {
    const atajo = atajos.find((a) => a.id === id)
    if (!atajo) return
    setPreset(id)
    setCalAbierto(false)
    setRango(atajo.rango())
  }

  /** El botón de rango personalizado abre el calendario y, si ya está abierto, lo cierra. */
  const alternarCalendario = () => {
    if (preset === "custom") setCalAbierto((v) => !v)
    else {
      setPreset("custom")
      setCalAbierto(true)
    }
  }

  // La primera orden se consulta una sola vez, al abrir.
  useEffect(() => {
    if (!open || primeraOrden) return
    let vigente = true
    supabase
      .from("inventory_orders")
      .select("created_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .then(({ data }: { data: { created_at: string }[] | null }) => {
        if (vigente && data?.[0]?.created_at) setPrimeraOrden(new Date(data[0].created_at))
      })
    return () => {
      vigente = false
    }
  }, [open, primeraOrden])

  // Si "Todo" ya estaba puesto cuando llegó la fecha de la primera orden, se
  // reajusta el rango para que el encabezado del reporte diga la fecha real.
  useEffect(() => {
    if (preset !== "todo" || !primeraOrden) return
    setRango((actual) =>
      actual?.from && actual.from <= primeraOrden ? actual : { from: primeraOrden, to: hoy },
    )
  }, [preset, primeraOrden, hoy])

  // ── Vista previa ──────────────────────────────────────────────────────────
  const cargar = useCallback(
    async (desde: Date, hasta: Date) => {
      setCargando(true)
      setError(null)
      try {
        const desdeISO = inicioDia(desde).toISOString()
        const hastaISO = finDia(hasta).toISOString()

        // Supabase corta en 1000 filas: se pide por bloques para que un
        // reporte anual no se quede sin las órdenes que caen fuera del corte.
        const ordenes: ReportOrder[] = []
        for (let offset = 0; ; offset += PAGE) {
          const { data, error: errOrd } = await supabase
            .from("inventory_orders")
            .select(
              "id, folio, type, status, obra_id, supplier_name, notes, created_at, inventory_order_items(codigo, descripcion, quantity, unit_price)",
            )
            .gte("created_at", desdeISO)
            .lte("created_at", hastaISO)
            .order("created_at", { ascending: false })
            .range(offset, offset + PAGE - 1)

          if (errOrd) throw errOrd
          const bloque = data ?? []
          ordenes.push(
            ...bloque.map((o: any) => ({
              id: o.id,
              folio: o.folio,
              type: o.type,
              status: o.status,
              obra_id: o.obra_id,
              supplier_name: o.supplier_name,
              notes: o.notes,
              created_at: o.created_at,
              items: o.inventory_order_items ?? [],
            })),
          )
          if (bloque.length < PAGE) break
        }

        const [{ data: obrasData, error: errObras }, { data: empresasData }] = await Promise.all([
          supabase.from("obras").select("id, name, code, empresa_id"),
          supabase.from("empresas").select("id, name"),
        ])
        if (errObras) throw errObras

        const nombreEmpresa = new Map<string, string>()
        for (const e of empresasData ?? []) nombreEmpresa.set(e.id, e.name)
        const obras: ReportObra[] = (obrasData ?? []).map((o: any) => ({
          id: o.id,
          name: o.name,
          code: o.code ?? null,
          empresa: o.empresa_id ? (nombreEmpresa.get(o.empresa_id) ?? null) : null,
        }))

        setReporte(
          construirReporte(
            ordenes,
            obras,
            { desde: inicioDia(desde), hasta: finDia(hasta) },
            user?.display_name || user?.email || "Sistema",
          ),
        )
      } catch (e: any) {
        // PostgrestError trae los campos no enumerables: hay que leerlos a mano.
        setError(e?.message || e?.details || "No se pudieron leer las órdenes del periodo.")
        setReporte(null)
      } finally {
        setCargando(false)
      }
    },
    [user?.display_name, user?.email],
  )

  useEffect(() => {
    if (!open || !rango?.from || !rango?.to) {
      if (!rango?.to) setReporte(null)
      return
    }
    cargar(rango.from, rango.to)
  }, [open, rango?.from, rango?.to, cargar])

  // ── Descargas ─────────────────────────────────────────────────────────────
  const descargar = async (formato: "pdf" | "xlsx") => {
    if (!reporte) return
    try {
      if (formato === "pdf") await generateInventoryOrdersReportPdf(reporte)
      else await generateInventoryOrdersReportExcel(reporte)
      notify?.(
        `Reporte ${formato === "pdf" ? "PDF" : "Excel"} descargado · ${reporte.totales.ordenes} orden${reporte.totales.ordenes !== 1 ? "es" : ""}`,
        "success",
      )
    } catch (e: any) {
      notify?.(e?.message || "No se pudo generar el archivo.", "error", "Reporte")
    }
  }

  const vacio = !!reporte && reporte.totales.ordenes === 0

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      {/* El DialogContent trae sm:max-w-lg por debajo y tailwind-merge no lo
          quita: hay que ganarle en el mismo breakpoint o el calendario de dos
          meses se corta. */}
      <DialogContent className="w-[96vw] sm:max-w-5xl bg-slate-800 border-slate-700 text-slate-100 p-0 max-h-[92vh] overflow-y-auto">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-slate-700">
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#4da8e8]" /> Reporte de órdenes
          </DialogTitle>
          <p className="text-xs text-slate-500 mt-1">
            Órdenes divididas por obra, gasto por obra, gran total y los artículos del más utilizado al menos utilizado.
          </p>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Atajos de periodo. El botón activo se marca y da un brinco corto:
              la key cambia al activarse, así el elemento se remonta y la
              animación vuelve a correr cada vez que se elige. */}
          <div className="flex items-center gap-2 flex-wrap">
            {atajos.map((a) => {
              const activo = preset === a.id
              return (
                <button
                  key={`${a.id}-${activo}`}
                  type="button"
                  onClick={() => aplicarAtajo(a.id)}
                  aria-pressed={activo}
                  className={
                    "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-200 " +
                    (activo
                      ? "border-[#0174bd] bg-[#0174bd] text-white shadow-[0_0_0_3px_rgba(1,116,189,0.2)] animate-[rafsa-pop_260ms_ease-out]"
                      : "border-slate-600 bg-slate-700/50 text-slate-300 hover:border-[#0174bd]/60 hover:bg-slate-700 hover:text-white")
                  }
                >
                  {a.etiqueta}
                </button>
              )
            })}

            <button
              key={`custom-${preset === "custom"}`}
              type="button"
              onClick={alternarCalendario}
              aria-pressed={preset === "custom"}
              aria-expanded={calAbierto}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-200 " +
                (preset === "custom"
                  ? "border-[#0174bd] bg-[#0174bd] text-white shadow-[0_0_0_3px_rgba(1,116,189,0.2)] animate-[rafsa-pop_260ms_ease-out]"
                  : "border-slate-600 bg-slate-700/50 text-slate-300 hover:border-[#0174bd]/60 hover:bg-slate-700 hover:text-white")
              }
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Rango personalizado
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${calAbierto ? "rotate-180" : ""}`}
              />
            </button>
          </div>

          {/* Calendario de rango: sólo cuando se pide */}
          {calAbierto && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 animate-in fade-in-0 slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              1° clic inicio del periodo · 2° clic fin del periodo · 3° clic vuelve a empezar
            </div>
            <Calendar
              mode="range"
              locale={es}
              numberOfMonths={2}
              // Sin días de relleno: con dos meses a la vista, el mismo día
              // salía pintado dos veces y confundía los extremos del rango.
              showOutsideDays={false}
              defaultMonth={rango?.from ?? hoy}
              selected={rango}
              onSelect={() => {}}
              onDayClick={alElegirDia}
              disabled={{ after: hoy }}
              className={`mx-auto [--cell-size:2.25rem] ${CALENDAR_DARK_CLASS}`}
              classNames={CALENDAR_DARK_CLASSNAMES}
            />
          </div>
          )}

          {/* Periodo elegido */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 py-3">
            <p className="text-[11px] text-slate-500 mb-1">
              PERIODO DEL REPORTE
              <span className="ml-2 text-[#4da8e8] normal-case">
                {atajos.find((a) => a.id === preset)?.etiqueta ?? "Rango personalizado"}
              </span>
            </p>
            {completo ? (
              <p className="text-sm font-semibold text-slate-100">
                {fechaLarga(rango!.from!)} <span className="text-slate-500 font-normal">—</span>{" "}
                {fechaLarga(rango!.to!)}
              </p>
            ) : (
              <p className="text-sm text-amber-300/90">
                {rango?.from
                  ? `Inicio ${fechaLarga(rango.from)} · falta elegir el fin del periodo`
                  : "Elige el inicio del periodo en el calendario"}
              </p>
            )}
          </div>

          {/* Vista previa */}
          {completo && (
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              {cargando ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" /> Leyendo las órdenes del periodo…
                </div>
              ) : error ? (
                <p className="text-sm text-red-300">{error}</p>
              ) : vacio ? (
                <div className="flex items-center gap-3 py-2 text-sm text-slate-400">
                  <PackageSearch className="w-5 h-5 text-slate-500 shrink-0" />
                  No hay órdenes en este periodo
                  {reporte!.totales.canceladas > 0
                    ? `, sólo ${reporte!.totales.canceladas} cancelada${reporte!.totales.canceladas !== 1 ? "s" : ""}, que no suman.`
                    : "."}
                </div>
              ) : reporte ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { label: "Órdenes", valor: String(reporte.totales.ordenes), color: "#94a3b8" },
                      { label: "Obras", valor: String(reporte.totales.obras), color: "#94a3b8" },
                      { label: "Artículos", valor: String(reporte.articulos.length), color: "#94a3b8" },
                      { label: "Piezas", valor: cantidad(reporte.totales.piezas), color: "#94a3b8" },
                    ].map((k) => (
                      <div key={k.label} className="rounded-lg bg-slate-800/60 border border-slate-700/60 px-3 py-2">
                        <p className="text-[10px] uppercase tracking-wide text-slate-500">{k.label}</p>
                        <p className="text-base font-bold text-slate-100">{k.valor}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/25 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-emerald-400/80">Ejercido</p>
                      <p className="text-base font-bold text-emerald-300">{money(reporte.totales.ejercido)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-500/10 border border-amber-500/25 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-amber-400/80">Comprometido</p>
                      <p className="text-base font-bold text-amber-300">{money(reporte.totales.comprometido)}</p>
                    </div>
                    <div className="rounded-lg bg-[#0174bd]/15 border border-[#0174bd]/40 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-[#4da8e8]">Total del reporte</p>
                      <p className="text-base font-bold text-slate-100">{money(reporte.totales.total)}</p>
                    </div>
                  </div>

                  {/* Las tres obras que más pesan: confirma de un golpe que el
                      periodo es el correcto antes de descargar. */}
                  {reporte.grupos.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-slate-500">MAYOR GASTO EN EL PERIODO</p>
                      {reporte.grupos.slice(0, 3).map((g) => (
                        <div key={g.key} className="flex items-center justify-between gap-3 text-xs">
                          <span className="text-slate-300 truncate">
                            {g.obra}
                            {g.esAlmacen && <span className="text-slate-500"> · entradas al almacén</span>}
                          </span>
                          <span className="text-slate-100 font-semibold shrink-0 font-mono">{money(g.total)}</span>
                        </div>
                      ))}
                      {reporte.grupos.length > 3 && (
                        <p className="text-[11px] text-slate-500">
                          y {reporte.grupos.length - 3} más en el reporte completo
                        </p>
                      )}
                    </div>
                  )}

                  {reporte.totales.canceladas > 0 && (
                    <p className="text-[11px] text-slate-500">
                      {reporte.totales.canceladas} orden{reporte.totales.canceladas !== 1 ? "es" : ""} cancelada
                      {reporte.totales.canceladas !== 1 ? "s" : ""} en el periodo; no suman en ningún total.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-400 hover:text-slate-200 cursor-pointer"
          >
            Cancelar
          </button>
          <BotonesDescarga
            size="sm"
            tono="azul"
            etiqueta="Descargar"
            disabled={!reporte || vacio || cargando}
            onDescargar={descargar}
            tituloPdf="Descargar el reporte en PDF"
            tituloExcel="Descargar el reporte en Excel"
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}
