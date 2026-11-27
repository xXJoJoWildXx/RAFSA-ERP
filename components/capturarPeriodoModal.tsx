"use client"

/**
 * Captura rápida del periodo de una estimación.
 *
 * Una estimación sin fecha de corte no entra en ningún periodo de Finanzas:
 * su monto queda invisible. Este popup permite ponerle el periodo desde el
 * dashboard, sin entrar a la obra, que es el único dato que le falta.
 *
 * El calendario es de rango: un clic marca el inicio y el segundo el corte.
 * Antes de guardar se muestra lo elegido y cuántos días abarca, porque la
 * fecha de corte es la que decide en qué mes cae el dinero y equivocarse
 * mueve el monto de periodo.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { es } from "date-fns/locale"
import { CalendarDays, CalendarRange, Check, Loader2, TriangleAlert } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { supabase } from "@/lib/supabaseClient"
import { CALENDAR_DARK_CLASS, CALENDAR_DARK_CLASSNAMES } from "@/lib/calendarTheme"

const money = (n: number | null) =>
  n == null ? "" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

function aISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${dia}`
}

const fmt = (d: Date) =>
  d.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" })

export function CapturarPeriodoModal({
  open,
  onOpenChange,
  estimacionId,
  obra,
  descripcion,
  monto,
  onGuardado,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  estimacionId: string | null
  obra: string
  descripcion: string
  monto: number | null
  onGuardado: () => void
}) {
  const hoy = useMemo(() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  }, [])

  const [rango, setRango] = useState<DateRange | undefined>(undefined)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setRango(undefined)
      setError(null)
    }
  }, [open])

  /**
   * Mismo comportamiento que el calendario del reporte de órdenes: el primer
   * clic fija el inicio, el segundo el corte y el tercero vuelve a empezar.
   * Si el segundo cae antes del primero se invierten, en vez de rechazarlo.
   */
  const alElegirDia = useCallback((dia: Date) => {
    setRango((actual) => {
      if (!actual?.from || (actual.from && actual.to)) return { from: dia, to: undefined }
      return dia < actual.from ? { from: dia, to: actual.from } : { from: actual.from, to: dia }
    })
    setError(null)
  }, [])

  const dias = useMemo(() => {
    if (!rango?.from || !rango?.to) return null
    return Math.round((rango.to.getTime() - rango.from.getTime()) / 86_400_000) + 1
  }, [rango])

  const completo = !!rango?.from && !!rango?.to
  // El mes del CORTE es el que decide en qué periodo cae el dinero.
  const mesDestino = rango?.to
    ? rango.to.toLocaleDateString("es-MX", { month: "long", year: "numeric" })
    : null

  const guardar = async () => {
    if (!estimacionId || !rango?.from || !rango?.to) return
    setGuardando(true)
    setError(null)
    const { error: err } = await supabase
      .from("obra_estimaciones")
      .update({
        date_start: aISO(rango.from),
        date_end: aISO(rango.to),
        updated_at: new Date().toISOString(),
      })
      .eq("id", estimacionId)

    setGuardando(false)
    if (err) {
      console.error(err)
      setError(err.message || "No se pudo guardar el periodo.")
      return
    }
    onGuardado()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => !guardando && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md bg-slate-800 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarRange className="w-4 h-4 text-[#4da8e8]" />
            Capturar periodo
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {obra}
            {descripcion ? ` · ${descripcion}` : ""}
            {monto != null ? ` · ${money(monto)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" />
              1° clic inicio del periodo · 2° clic fecha de corte · 3° clic vuelve a empezar
            </div>
            <Calendar
              mode="range"
              locale={es}
              numberOfMonths={1}
              // Sin días de relleno, igual que el calendario del reporte de
              // órdenes: evita que el mismo día se vea pintado dos veces.
              showOutsideDays={false}
              defaultMonth={rango?.from ?? hoy}
              selected={rango}
              onSelect={() => {}}
              onDayClick={alElegirDia}
              className={`mx-auto [--cell-size:2.25rem] ${CALENDAR_DARK_CLASS}`}
              classNames={CALENDAR_DARK_CLASSNAMES}
            />
          </div>

          {/* Revisión antes de guardar: la fecha de corte decide el mes en
              que el monto entra a Finanzas, así que se muestra explícito. */}
          <div
            className={`rounded-lg border p-3 text-sm ${
              completo
                ? "border-[#0174bd]/40 bg-[#0174bd]/10"
                : "border-slate-700/60 bg-slate-900/40"
            }`}
          >
            {completo ? (
              <>
                <p className="text-slate-200">
                  Del <b>{fmt(rango!.from!)}</b> al <b>{fmt(rango!.to!)}</b>
                </p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {dias} {dias === 1 ? "día" : "días"} · entra en el periodo de{" "}
                  <b className="text-[#4da8e8] capitalize">{mesDestino}</b>, por la fecha de corte.
                </p>
              </>
            ) : (
              <p className="text-slate-500 text-[13px]">
                {rango?.from
                  ? "Ahora elige la fecha de corte."
                  : "Elige el inicio del periodo en el calendario."}
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={guardando}
            className="cursor-pointer border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={() => void guardar()}
            disabled={!completo || guardando}
            className="cursor-pointer bg-[#0174bd] hover:bg-[#015d97] text-white disabled:opacity-40"
          >
            {guardando ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Guardando…
              </>
            ) : (
              <>
                <Check className="w-4 h-4 mr-2" />
                Confirmar periodo
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
