"use client"

/**
 * Añadir vacaciones a la nómina de la semana conciliada.
 *
 * Se busca al trabajador por nombre, se ve el cálculo antes de aceptar y al
 * confirmar el pago se suma a su renglón de la corrida.
 *
 * La antigüedad sale de la ÚLTIMA fecha de contratación (employees.hire_date).
 * A un recontratado NO se le suma el tiempo de etapas anteriores, por
 * decisión de la empresa: por eso aquí no se usa tenure_accumulated_days,
 * que sí acumula y es lo que muestra el perfil del empleado.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarCheck, Loader2, Search, TriangleAlert, X } from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { supabase } from "@/lib/supabaseClient"
import {
  calcularVacaciones, resumenAntiguedad, proximoPeriodo, PRIMA_PORCENTAJE,
} from "@/lib/payroll/vacaciones"
import type { VacacionesEnNomina } from "@/lib/payroll/types"

type EmpleadoLista = {
  id: string
  full_name: string
  payroll_code: string | null
  hire_date: string | null
  real_salary: number | null
  status: string | null
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(`${String(s).split("T")[0]}T12:00:00`).toLocaleDateString("es-MX",
      { day: "2-digit", month: "short", year: "numeric" }) : "—"

/** Sin acentos y en mayúsculas, para que "Perez" encuentre a "Pérez". */
function normalizar(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim()
}

export function PayrollVacacionesModal({
  open,
  onOpenChange,
  /** Fin de la semana conciliada: la antigüedad se mide a esa fecha. */
  corte,
  /** employee_id de quienes ya traen vacaciones en esta corrida. */
  yaConVacaciones,
  /** Sólo se pueden agregar a quien está en la corrida. */
  empleadosEnCorrida,
  onAgregar,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  corte: string
  yaConVacaciones: Set<string>
  empleadosEnCorrida: Set<string>
  onAgregar: (employeeId: string, v: VacacionesEnNomina) => void
}) {
  const [empleados, setEmpleados] = useState<EmpleadoLista[] | null>(null)
  /** aniversarios ya pagados, por empleado: "<employee_id>|<YYYY-MM-DD>". */
  const [pagados, setPagados] = useState<Map<string, string>>(new Map())
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState("")
  const [elegido, setElegido] = useState<EmpleadoLista | null>(null)
  const [diasManual, setDiasManual] = useState<string>("")

  const fechaCorte = useMemo(() => {
    const p = String(corte || "").split("-").map(Number)
    if (p.length !== 3 || !p[0]) return new Date()
    return new Date(p[0], p[1] - 1, p[2], 12, 0, 0, 0)
  }, [corte])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, payroll_code, hire_date, real_salary, status")
      .order("full_name", { ascending: true })

    if (error) {
      setCargando(false)
      console.error(error)
      setError(error.message || "No se pudo cargar la lista de empleados.")
      return
    }
    setEmpleados((data as EmpleadoLista[]) ?? [])

    /* Vacaciones ya cobradas. La tabla puede no existir todavía si no se ha
       corrido la migración: en ese caso no se bloquea a nadie, pero se avisa. */
    const { data: pag, error: pagErr } = await supabase
      .from("employee_vacaciones_pagadas")
      .select("employee_id, aniversario, dias, created_at")

    setCargando(false)
    if (pagErr) {
      console.warn("employee_vacaciones_pagadas:", pagErr.message)
      setError(
        "No se pudo leer el historial de vacaciones pagadas. Falta correr sql/2026-11-25_nomina_vacaciones.sql.",
      )
      return
    }
    const mapa = new Map<string, string>()
    for (const r of (pag ?? []) as { employee_id: string; aniversario: string; created_at: string }[]) {
      mapa.set(`${r.employee_id}|${String(r.aniversario).split("T")[0]}`, r.created_at)
    }
    setPagados(mapa)
  }, [])

  useEffect(() => {
    if (open) {
      void cargar()
      setBusqueda("")
      setElegido(null)
      setDiasManual("")
      setError(null)
    }
  }, [open, cargar])

  /* Sólo quien está en la corrida: pagarle vacaciones a alguien que no
     aparece en la nómina de la semana crearía un renglón huérfano. */
  const resultados = useMemo(() => {
    if (!empleados) return []
    const q = normalizar(busqueda)
    const base = empleados.filter((e) => empleadosEnCorrida.has(e.id))
    if (!q) return base.slice(0, 40)
    return base
      .filter(
        (e) =>
          normalizar(e.full_name).includes(q) ||
          normalizar(e.payroll_code || "").includes(q),
      )
      .slice(0, 40)
  }, [empleados, busqueda, empleadosEnCorrida])

  /** Si ya cobró el periodo vigente, con cuándo vuelve a tener derecho. */
  const yaPagado = useCallback(
    (e: EmpleadoLista, aniversario: string | null, anios: number) => {
      if (!aniversario) return null
      if (!pagados.has(`${e.id}|${aniversario}`)) return null
      const prox = proximoPeriodo(e.hire_date, anios)
      return {
        cuando: pagados.get(`${e.id}|${aniversario}`) || null,
        proximaFecha: prox.fecha,
        proximosDias: prox.dias,
      }
    },
    [pagados],
  )

  const calculo = useMemo(() => {
    if (!elegido) return null
    const override = diasManual.trim() === "" ? null : Number(diasManual)
    return calcularVacaciones({
      hireDate: elegido.hire_date,
      salarioSemanal: elegido.real_salary,
      corte: fechaCorte,
      diasOverride: Number.isFinite(override as number) ? override : null,
    })
  }, [elegido, diasManual, fechaCorte])

  const cobradoElegido = useMemo(
    () => (elegido && calculo ? yaPagado(elegido, calculo.aniversario, calculo.anios) : null),
    [elegido, calculo, yaPagado],
  )

  const puedeAgregar =
    !!elegido &&
    !!calculo &&
    !calculo.impedimento &&
    !cobradoElegido &&
    calculo.dias > 0 &&
    calculo.total > 0

  const confirmar = () => {
    if (!elegido || !calculo || !puedeAgregar) return
    onAgregar(elegido.id, {
      anios: calculo.anios,
      aniversario: calculo.aniversario,
      dias: calculo.dias,
      salario_diario: calculo.salarioDiario,
      importe: calculo.importeVacaciones,
      prima: calculo.prima,
      total: calculo.total,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-slate-800 border-slate-700 text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-[#4da8e8]" />
            Añadir vacaciones a la corrida
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            El pago se suma al efectivo del trabajador en la nómina de esta
            semana. La antigüedad se cuenta desde su última contratación y al
            corte del {fecha(corte)}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Buscador */}
          <div className="space-y-2">
            <Label htmlFor="buscar-vac" className="text-slate-300">
              Buscar empleado
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                id="buscar-vac"
                autoFocus
                value={busqueda}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setBusqueda(e.target.value)
                  setElegido(null)
                }}
                placeholder="Nombre o código de nómina"
                className="pl-9 bg-slate-900/60 border-slate-700 text-slate-100"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
              <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Lista */}
          {!elegido && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 max-h-64 overflow-y-auto">
              {cargando ? (
                <p className="p-4 text-sm text-slate-400 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando empleados…
                </p>
              ) : resultados.length === 0 ? (
                <p className="p-4 text-sm text-slate-500">
                  {busqueda
                    ? "Ningún empleado de esta corrida coincide con la búsqueda."
                    : "No hay empleados en la corrida."}
                </p>
              ) : (
                <ul className="divide-y divide-slate-700/50">
                  {resultados.map((e) => {
                    const yaTiene = yaConVacaciones.has(e.id)
                    const c = calcularVacaciones({
                      hireDate: e.hire_date,
                      salarioSemanal: e.real_salary,
                      corte: fechaCorte,
                    })
                    const cobrado = yaPagado(e, c.aniversario, c.anios)
                    return (
                      <li key={e.id}>
                        <button
                          type="button"
                          disabled={yaTiene || !!cobrado}
                          onClick={() => setElegido(e)}
                          className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3
                                     hover:bg-slate-700/40 disabled:opacity-45 disabled:hover:bg-transparent
                                     disabled:cursor-not-allowed cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-sm text-slate-200 truncate">{e.full_name}</p>
                            <p className="text-[11px] text-slate-500">
                              {e.payroll_code ? `${e.payroll_code} · ` : ""}
                              Alta {fecha(e.hire_date)}
                            </p>
                          </div>
                          <span className="text-[11px] whitespace-nowrap">
                            {yaTiene ? (
                              <span className="text-emerald-400">Ya agregadas</span>
                            ) : cobrado ? (
                              <span className="text-slate-500">
                                Ya cobradas · vuelve el {fecha(cobrado.proximaFecha)}
                              </span>
                            ) : c.impedimento ? (
                              <span className="text-amber-400">{c.anios < 1 ? "Menos de 1 año" : "Sin datos"}</span>
                            ) : (
                              <span className="text-slate-400">
                                {c.dias} días · {money(c.importeVacaciones + c.prima)}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Detalle del elegido */}
          {elegido && calculo && (
            <div className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-100">{elegido.full_name}</p>
                  <p className="text-[11px] text-slate-500">
                    Última contratación: {fecha(elegido.hire_date)} · {resumenAntiguedad(calculo)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => { setElegido(null); setDiasManual("") }}
                  className="cursor-pointer bg-transparent text-slate-400 hover:bg-slate-700/70 hover:text-slate-100"
                >
                  <X className="w-4 h-4 mr-1" /> Cambiar
                </Button>
              </div>

              {calculo.impedimento ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{calculo.impedimento}</span>
                </div>
              ) : cobradoElegido ? (
                <div className="flex items-start gap-2 rounded-lg border border-slate-600/60 bg-slate-800/60 p-3 text-sm text-slate-300">
                  <TriangleAlert className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-500" />
                  <span>
                    Ya cobró las vacaciones de este periodo
                    {cobradoElegido.cuando
                      ? ` el ${fecha(String(cobradoElegido.cuando).split("T")[0])}`
                      : ""}
                    . Vuelve a tener derecho el{" "}
                    <b className="text-slate-100">{fecha(cobradoElegido.proximaFecha)}</b>, con{" "}
                    <b className="text-slate-100">{cobradoElegido.proximosDias} días</b>.
                  </span>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="dias-vac" className="text-slate-300 text-xs">
                        Días a pagar
                      </Label>
                      <Input
                        id="dias-vac"
                        type="number"
                        min={1}
                        step={1}
                        value={diasManual}
                        placeholder={String(calculo.dias)}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDiasManual(e.target.value)}
                        className="bg-slate-900/60 border-slate-700 text-slate-100"
                      />
                      <p className="text-[10px] text-slate-500">
                        Por ley le tocan {calculo.dias} días. Cámbialo sólo si va un pago parcial.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-slate-300 text-xs">Salario diario</Label>
                      <div className="h-9 flex items-center px-3 rounded-md border border-slate-700 bg-slate-900/40 text-sm text-slate-300 tabular-nums">
                        {money(calculo.salarioDiario)}
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Sueldo semanal entre 7.
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-700/60 bg-slate-800/60 divide-y divide-slate-700/50 text-sm">
                    <Renglon
                      etiqueta={`Vacaciones (${calculo.dias} días × ${money(calculo.salarioDiario)})`}
                      valor={money(calculo.importeVacaciones)}
                    />
                    <Renglon
                      etiqueta={`Prima vacacional (${Math.round(PRIMA_PORCENTAJE * 100)}%)`}
                      valor={money(calculo.prima)}
                    />
                    <div className="flex items-center justify-between px-3 py-2.5">
                      <span className="font-semibold text-slate-100">Se suma a la corrida</span>
                      <span className="font-semibold text-emerald-400 tabular-nums">
                        {money(calculo.total)}
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer border-slate-600 bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={confirmar}
            disabled={!puedeAgregar}
            className="cursor-pointer bg-[#0174bd] hover:bg-[#015d97] text-white disabled:opacity-40"
          >
            Añadir a la corrida
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Renglon({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-slate-400">{etiqueta}</span>
      <span className="text-slate-200 tabular-nums">{valor}</span>
    </div>
  )
}
