"use client"

import { useCallback, useMemo, useState } from "react"
import {
  AlertTriangle, Calculator, CheckCircle2, ChevronDown, ChevronRight,
  Loader2, Save, TriangleAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { BotonesDescarga } from "@/components/botonesDescarga"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/lib/auth-context"
import { can } from "@/lib/permissions"
import type { CorridaAguinaldo } from "@/lib/aguinaldoReporte"
import { generateAguinaldoReportePdf } from "@/lib/aguinaldoReportePdf"
import { generateAguinaldoReporteExcel } from "@/lib/aguinaldoReporteExcel"

type Fila = {
  employee_id: string
  full_name: string
  payroll_code: string | null
  hire_date: string | null
  inicio_conteo: string | null
  dias_en_el_anio: number | null
  salario_semanal: number
  salario_diario: number
  aguinaldo_calculado: number
  aguinaldo_capturado: number
  diferencia: number
  revisar: string | null
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(`${s}T12:00:00`).toLocaleDateString("es-MX",
      { day: "numeric", month: "short", year: "2-digit" }) : "—"

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

export function AguinaldoCalculoPanel() {
  const { user } = useAuth()
  const puedeAplicar = can(user?.role, "nomina.aguinaldo.apply")

  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [corte, setCorte] = useState(`${anioActual}-12-31`)

  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)


  const calcular = useCallback(async () => {
    setCalculando(true); setError(null); setAviso(null)
    const { data, error } = await supabase.rpc("aguinaldo_calcular", {
      p_anio: anio,
      p_corte: corte || null,
    })
    setCalculando(false)
    if (error) {
      setError(
        error.code === "PGRST202"
          ? "Falta correr sql/2026-11-17_aguinaldo_calculado.sql en la base."
          : detalle(error),
      )
      return
    }
    setFilas((data as Fila[]) ?? [])
    setAbierto(true)
  }, [anio, corte])

  const aplicar = useCallback(async () => {
    if (!confirm(
      `¿Escribir el aguinaldo calculado de ${anio} en el expediente de cada empleado?\n\n` +
      `Sustituye el monto que tengan capturado hoy. Los marcados para revisar no se tocan.`
    )) return
    setAplicando(true); setError(null); setAviso(null)
    const { data, error } = await supabase.rpc("aguinaldo_aplicar", {
      p_anio: anio,
      p_corte: corte || null,
    })
    setAplicando(false)
    if (error) { setError(detalle(error)); return }
    const r = (data ?? {}) as { actualizados?: number; omitidos?: number }
    setAviso(
      `Listo: ${r.actualizados ?? 0} empleado(s) actualizado(s)` +
      (r.omitidos ? `, ${r.omitidos} omitido(s) por revisar.` : "."),
    )
    await calcular()
  }, [anio, corte, calcular])

  const resumen = useMemo(() => {
    if (!filas) return null
    const limpias = filas.filter(f => !f.revisar)
    return {
      total:        limpias.reduce((s, f) => s + Number(f.aguinaldo_calculado ?? 0), 0),
      empleados:    filas.length,
      completo:     limpias.filter(f => (f.dias_en_el_anio ?? 0) >= 365).length,
      proporcional: limpias.filter(f => (f.dias_en_el_anio ?? 0) < 365).length,
      revisar:      filas.filter(f => f.revisar).length,
      porAplicar:   limpias.filter(f => Math.abs(Number(f.diferencia ?? 0)) > 0.005).length,
    }
  }, [filas])

  const descargar = useCallback(async (formato: "pdf" | "xlsx") => {
    if (!filas || !resumen) return
    setError(null)
    const corrida: CorridaAguinaldo = {
      anio,
      corte: corte || `${anio}-12-31`,
      filas,
      resumen,
      generadoPor: user?.display_name || user?.email || "Sistema",
    }
    if (formato === "pdf") generateAguinaldoReportePdf(corrida)
    else await generateAguinaldoReporteExcel(corrida)
  }, [filas, resumen, anio, corte, user])


  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-800 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/60 bg-slate-900/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <Calculator className="w-4 h-4 text-[#4da8e8]" />
              Calcular aguinaldo
            </h3>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              (días trabajados en el año ÷ 365) × 15 × salario diario.
              El día sale del sueldo semanal entre 7, igual que un descuento por falta.
            </p>
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Año</label>
              <select
                value={anio}
                onChange={(e) => {
                  const a = Number(e.target.value)
                  setAnio(a); setCorte(`${a}-12-31`); setFilas(null)
                }}
                className="block mt-1 rounded-lg bg-slate-900/60 border border-slate-700 px-2.5 py-1.5 text-sm
                           text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50"
              >
                {[anioActual, anioActual - 1, anioActual - 2].map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wide text-slate-500">Corte</label>
              <input
                type="date" value={corte} onChange={(e) => { setCorte(e.target.value); setFilas(null) }}
                className="block mt-1 rounded-lg bg-slate-900/60 border border-slate-700 px-2.5 py-1.5 text-sm
                           text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50"
              />
            </div>
            <Button onClick={() => void calcular()} disabled={calculando}
              style={{ background: calculando ? undefined : "#0174bd" }}
              className="text-white disabled:opacity-40">
              {calculando
                ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Calculando…</>)
                : "Calcular"}
            </Button>
          </div>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-200">{error}</p>
          </div>
        )}
        {aviso && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 flex items-start gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-200">{aviso}</p>
          </div>
        )}

        {!filas && !calculando && (
          <p className="text-xs text-slate-500">
            Corre el cálculo para ver cuánto le toca a cada quien antes de escribir nada.
          </p>
        )}

        {resumen && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Metrica etiqueta="Bolsa total" valor={money(resumen.total)} color="#0174bd"
                sub={`${resumen.empleados} activos`} />
              <Metrica etiqueta="Año completo" valor={String(resumen.completo)}
                sub="15 días íntegros" />
              <Metrica etiqueta="Proporcional" valor={String(resumen.proporcional)}
                sub="entraron durante el año" />
              <Metrica etiqueta="Por revisar" valor={String(resumen.revisar)}
                color={resumen.revisar > 0 ? "#f59e0b" : undefined}
                sub={resumen.revisar > 0 ? "no se les aplica" : "ninguno"} />
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-slate-500">
                {!puedeAplicar
                  ? "Tu rol no permite escribir estos montos en los expedientes."
                  : resumen.porAplicar === 0
                    ? "El expediente de todos ya coincide con el cálculo."
                    : `${resumen.porAplicar} empleado(s) cambiarían de monto al aplicar.`}
              </p>

              <div className="flex items-center gap-2">
                {/* Descargar la corrida. Un solo botón que se desdobla en los
                    dos formatos al pulsarlo, para no tener tres botones
                    compitiendo con la acción principal. */}
                <BotonesDescarga
                  onDescargar={descargar}
                  etiqueta="Descargar corrida"
                  tituloPdf="Descargar la corrida en PDF"
                  tituloExcel="Descargar la corrida en Excel"
                  onError={setError}
                />

                {puedeAplicar && (
                  <Button onClick={() => void aplicar()}
                    disabled={aplicando || resumen.porAplicar === 0}
                    style={{ background: aplicando || resumen.porAplicar === 0 ? undefined : "#0174bd" }}
                    className="text-white disabled:opacity-40">
                    {aplicando
                      ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Aplicando…</>)
                      : (<><Save className="w-4 h-4 mr-2" />Aplicar al expediente</>)}
                  </Button>
                )}
              </div>
            </div>

            <button
              onClick={() => setAbierto(!abierto)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              {abierto ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {abierto ? "Ocultar" : "Ver"} el desglose por empleado
            </button>

            {abierto && filas && (
              <div className="rounded-xl border border-slate-700 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-900/60 border-b border-slate-700 text-left">
                      <Th>Empleado</Th>
                      <Th>Ingreso</Th>
                      <Th className="text-right">Días</Th>
                      <Th className="text-right">Día</Th>
                      <Th className="text-right">Calculado</Th>
                      <Th className="text-right">En expediente</Th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {filas.map(f => {
                      const cambia = Math.abs(Number(f.diferencia ?? 0)) > 0.005
                      return (
                        <tr key={f.employee_id}
                          className={f.revisar ? "bg-amber-500/5" : "hover:bg-slate-700/20 transition-colors"}>
                          <Td>
                            <p className="text-slate-200 leading-snug">{f.full_name}</p>
                            <p className="text-[10px] text-slate-500">{f.payroll_code ?? "sin código"}</p>
                            {f.revisar && (
                              <p className="text-[10px] text-amber-400 mt-0.5 flex items-start gap-1">
                                <TriangleAlert className="w-3 h-3 shrink-0 mt-px" />
                                {f.revisar}
                              </p>
                            )}
                          </Td>
                          <Td className="text-xs text-slate-400">{fecha(f.hire_date ?? f.inicio_conteo)}</Td>
                          <Td className="text-right tabular-nums text-slate-300">
                            {f.dias_en_el_anio ?? "—"}
                          </Td>
                          <Td className="text-right tabular-nums text-slate-400">{money(f.salario_diario)}</Td>
                          <Td className="text-right tabular-nums font-medium text-slate-100">
                            {money(f.aguinaldo_calculado)}
                          </Td>
                          <Td className="text-right tabular-nums">
                            <span className={cambia ? "text-amber-400" : "text-slate-500"}>
                              {money(f.aguinaldo_capturado)}
                            </span>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium ${className}`}>{children}</th>
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2.5 align-top ${className}`}>{children}</td>
}
function Metrica({ etiqueta, valor, sub, color }: {
  etiqueta: string; valor: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: color ?? "#e2e8f0" }}>{valor}</p>
      {sub && <p className="text-[10px] text-slate-600">{sub}</p>}
    </div>
  )
}
