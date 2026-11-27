"use client"

/**
 * Finanzas: el resultado de la empresa en un periodo.
 *
 * La pantalla responde una sola pregunta —cómo nos fue— y la responde en el
 * primer golpe de vista: ingresos, egresos y resultado, con el periodo
 * anterior al lado. Lo demás es el desglose de esos tres números.
 *
 * Donde falta captura se dice en la propia pantalla (ver los avisos de
 * cobertura en lib/finanzasData.ts). Un resultado se lee como verdad, y si le
 * falta el costo de nómina o las compras del mes, quien lo lea va a tomar
 * decisiones con una cifra inflada.
 */

import type { AppRole as UserRoleScreen } from "@/lib/permissions"
import { useBasePath } from "@/lib/appScope"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { BotonesDescarga } from "@/components/botonesDescarga"
import {
  cargarFinanzas,
  mesesDisponibles,
  periodosSugeridos,
  money,
  moneyExacto,
  variacion,
  type Periodo,
  type ResumenFinanzas,
} from "@/lib/finanzasData"
import { cargarReporteFinanzas } from "@/lib/finanzasReporte"
import { generateFinanzasReportePdf } from "@/lib/finanzasReportePdf"
import { generateFinanzasReporteExcel } from "@/lib/finanzasReporteExcel"
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Building2, ChevronDown,
  ClipboardList, HandCoins, Loader2, Minus, RefreshCw,
  TrendingUp, Users, Wallet,
} from "lucide-react"

const VERDE = "#34d399"
const AMBAR = "#fbbf24"
const MARCA = "#4da8e8"

export function FinanzasScreen({ allowed }: { allowed: UserRoleScreen[] }) {
  const basePath = useBasePath()
  const router = useRouter()
  const { user } = useAuth()

  const sugeridos = useMemo(() => periodosSugeridos(), [])
  const meses = useMemo(() => mesesDisponibles(24), [])
  const [periodo, setPeriodo] = useState<Periodo>(sugeridos[0])
  const [datos, setDatos] = useState<ResumenFinanzas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      setDatos(await cargarFinanzas(periodo))
    } catch (e: any) {
      // PostgrestError trae los campos no enumerables: hay que leerlos a mano.
      setError(e?.message || e?.details || "No se pudieron cargar las finanzas.")
      setDatos(null)
    } finally {
      setCargando(false)
    }
  }, [periodo])

  useEffect(() => {
    cargar()
  }, [cargar])

  /**
   * El reporte baja su propio detalle: la pantalla sólo tiene los totales y
   * el documento necesita renglón por renglón. Se pide al descargar y no al
   * cambiar de periodo, que sería pagar esas consultas sin que nadie las use.
   */
  const descargar = async (formato: "pdf" | "xlsx") => {
    if (!datos) return
    setError(null)
    const detalle = await cargarReporteFinanzas(datos, user?.display_name || user?.email || "Sistema")
    if (formato === "pdf") await generateFinanzasReportePdf(detalle)
    else await generateFinanzasReporteExcel(detalle)
  }

  const esquemaMes = periodo.tipo === "mes"

  return (
    <RoleGuard allowed={allowed}>
      <AdminLayout>
        <div className="space-y-6">
          {/* ── Encabezado ── */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#0174bd]/15 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-[#4da8e8]" />
                </div>
                Finanzas
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Resultado de la empresa en el periodo: cobranza de obras contra nómina, material y proveedores.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              {/* Mismo botón desdoblable del resto de la app. Actualizar queda
                  pegado a la derecha, que es donde ya lo busca la gente. */}
              <BotonesDescarga
                size="sm"
                etiqueta="Descargar Reporte"
                disabled={!datos || cargando}
                onDescargar={descargar}
                onError={setError}
                tituloPdf="Descargar el reporte completo en PDF"
                tituloExcel="Descargar el periodo completo en Excel"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={cargar}
                disabled={cargando}
                className="cursor-pointer border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                {cargando ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
                Actualizar
              </Button>
            </div>
          </div>

          {/* ── Selector de periodo ── */}
          <div className="flex items-center gap-2 flex-wrap">
            {sugeridos.map((p) => {
              const activo = p.clave === periodo.clave
              return (
                <button
                  key={`${p.clave}-${activo}`}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  className={
                    "rounded-lg border px-3 py-1.5 text-xs font-medium cursor-pointer transition-all duration-200 " +
                    (activo
                      ? "border-[#0174bd] bg-[#0174bd] text-white shadow-[0_0_0_3px_rgba(1,116,189,0.2)] animate-[rafsa-pop_260ms_ease-out]"
                      : "border-slate-600 bg-slate-700/50 text-slate-300 hover:border-[#0174bd]/60 hover:bg-slate-700 hover:text-white")
                  }
                >
                  {p.clave === sugeridos[0].clave ? "Este mes" : p.clave === sugeridos[1].clave ? "Mes pasado" : p.etiqueta}
                </button>
              )
            })}

            <div className="group relative">
              <select
                value={esquemaMes ? periodo.clave : ""}
                onChange={(e) => {
                  const elegido = meses.find((m) => m.clave === e.target.value)
                  if (elegido) setPeriodo(elegido)
                }}
                className="h-[34px] appearance-none rounded-lg border border-slate-600 bg-slate-700/50 pl-3 pr-8 text-xs text-slate-300 outline-none cursor-pointer transition-colors hover:border-[#0174bd]/60 hover:text-white focus:border-[#0174bd]/70 [&>option]:bg-slate-800 [&>option]:text-slate-100"
              >
                <option value="">Elegir mes…</option>
                {meses.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            </div>

            <span className="text-xs text-slate-500 ml-auto">
              {periodo.etiqueta}
              {datos ? ` · se compara contra ${datos.comparado.etiqueta}` : ""}
            </span>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
          )}

          {/* ── Resultado ── */}
          {cargando && !datos ? (
            <div className="h-40 rounded-2xl border border-slate-700/60 bg-slate-800/40 animate-pulse" />
          ) : datos ? (
            <>
              <section className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-800/80 to-slate-800/40 p-5 sm:p-6">
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto_1.2fr] gap-5 md:gap-4 items-center">
                  <BloqueCifra
                    etiqueta="Ingresos cobrados"
                    valor={datos.ingresos.cobrado}
                    pie={`${datos.ingresos.cobros} ${datos.ingresos.cobros === 1 ? "cobro" : "cobros"}`}
                    color={VERDE}
                    delta={variacion(datos.ingresos.cobrado, datos.anterior.cobrado)}
                  />
                  <Operador signo="−" />
                  <BloqueCifra
                    etiqueta="Egresos del periodo"
                    valor={datos.egresos.total}
                    pie="Nómina, material y proveedores"
                    color={AMBAR}
                    delta={variacion(datos.egresos.total, datos.anterior.egresos)}
                    deltaInversa
                  />
                  <Operador signo="=" />
                  <div>
                    <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">Resultado del periodo</p>
                    <p
                      className="text-3xl sm:text-4xl font-bold font-mono mt-1"
                      style={{ color: datos.resultado >= 0 ? VERDE : "#f87171" }}
                    >
                      {moneyExacto(datos.resultado)}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                      {datos.margen != null && (
                        <span className="text-xs text-slate-400">
                          Margen <span className="font-semibold text-slate-200">{datos.margen}%</span> de lo cobrado
                        </span>
                      )}
                      <Delta valor={variacion(datos.resultado, datos.anterior.resultado)} />
                    </div>
                  </div>
                </div>
              </section>

              {/* ── Avisos de cobertura ── */}
              {datos.avisos.length > 0 && (
                <section className="space-y-2">
                  {datos.avisos.map((a, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-xl border px-4 py-3"
                      style={{
                        borderColor: a.nivel === "alto" ? "rgba(248,113,113,0.35)" : "rgba(251,191,36,0.3)",
                        background: a.nivel === "alto" ? "rgba(248,113,113,0.08)" : "rgba(251,191,36,0.07)",
                      }}
                    >
                      <AlertTriangle
                        className="w-4 h-4 mt-0.5 shrink-0"
                        style={{ color: a.nivel === "alto" ? "#f87171" : AMBAR }}
                      />
                      <p className="text-[13px] text-slate-300">{a.texto}</p>
                    </div>
                  ))}
                </section>
              )}

              {/* ── Ingresos y egresos ── */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="bg-slate-800/60 border-slate-700/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-slate-100 text-base font-semibold flex items-center gap-2">
                      <HandCoins className="w-4 h-4" style={{ color: VERDE }} /> Ingresos
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Cobrado es dinero que entró; facturado es trabajo entregado que puede estar por cobrarse.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <Renglon
                      etiqueta="Cobrado"
                      detalle={`${datos.ingresos.cobros} ${datos.ingresos.cobros === 1 ? "movimiento" : "movimientos"}`}
                      monto={datos.ingresos.cobrado}
                      color={VERDE}
                      fuerte
                    />
                    <Renglon
                      etiqueta="Facturado al cliente"
                      detalle={`${datos.ingresos.facturas} ${datos.ingresos.facturas === 1 ? "factura" : "facturas"}`}
                      monto={datos.ingresos.facturado}
                      color={MARCA}
                    />
                    <Renglon
                      etiqueta="Estimaciones con corte en el periodo"
                      detalle={`${datos.ingresos.estimaciones} ${datos.ingresos.estimaciones === 1 ? "estimación" : "estimaciones"}`}
                      monto={datos.ingresos.estimado}
                      color="#94a3b8"
                    />
                    {/* Trabajo ya medido que todavía no se le pasa al cliente. */}
                    <Renglon
                      etiqueta="Estimado sin facturar"
                      detalle={`${datos.ingresos.estimacionesSinFacturar} de ${datos.ingresos.estimaciones}`}
                      monto={datos.ingresos.estimadoSinFacturar}
                      color={datos.ingresos.estimadoSinFacturar > 0 ? "#b45309" : "#94a3b8"}
                    />
                  </CardContent>
                </Card>

                <Card className="bg-slate-800/60 border-slate-700/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-slate-100 text-base font-semibold flex items-center gap-2">
                      <Banknote className="w-4 h-4" style={{ color: AMBAR }} /> Egresos
                    </CardTitle>
                    <p className="text-xs text-slate-500 mt-0.5">
                      El material cuenta cuando sale del almacén; cada salida lleva su factura, así que no se duplica con compras.
                    </p>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-3">
                    <BarraEgreso
                      icono={Users}
                      etiqueta="Nómina de obra"
                      detalle={`${datos.egresos.nominaSemanas} ${datos.egresos.nominaSemanas === 1 ? "semana" : "semanas"} · sueldos ${money(datos.egresos.nominaSalarios)}, viáticos ${money(datos.egresos.nominaViaticos)}`}
                      monto={datos.egresos.nomina}
                      total={datos.egresos.total}
                      color="#a78bfa"
                    />
                    <BarraEgreso
                      icono={ClipboardList}
                      etiqueta="Material de almacén"
                      detalle={`${datos.egresos.materialOrdenes} ${datos.egresos.materialOrdenes === 1 ? "orden entregada" : "órdenes entregadas"}`}
                      monto={datos.egresos.material}
                      total={datos.egresos.total}
                      color={MARCA}
                    />
                    <BarraEgreso
                      icono={Wallet}
                      etiqueta="Proveedores"
                      detalle={`${datos.egresos.proveedoresFacturas} ${datos.egresos.proveedoresFacturas === 1 ? "factura" : "facturas"} en el periodo`}
                      monto={datos.egresos.proveedores}
                      total={datos.egresos.total}
                      color={AMBAR}
                    />
                    <div className="flex items-center justify-between pt-2 border-t border-slate-700/60">
                      <span className="text-sm font-semibold text-slate-200">Total de egresos</span>
                      <span className="text-base font-bold font-mono text-slate-100">{moneyExacto(datos.egresos.total)}</span>
                    </div>
                  </CardContent>
                </Card>
              </section>

              {/* ── Serie de 12 meses ── */}
              <Card className="bg-slate-800/60 border-slate-700/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-slate-100 text-base font-semibold">Últimos 12 meses</CardTitle>
                  <div className="flex items-center gap-4 mt-1">
                    <Leyenda color={VERDE} texto="Cobrado" />
                    <Leyenda color={AMBAR} texto="Egresos (nómina y material)" />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <Grafica serie={datos.serie} actual={datos.periodo} />
                </CardContent>
              </Card>

              {/* ── Rendimiento por obra ── */}
              <Card className="bg-slate-800/60 border-slate-700/60">
                <CardHeader className="pb-3">
                  <CardTitle className="text-slate-100 text-base font-semibold flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#4da8e8]" /> Rendimiento por obra
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Lo cobrado de cada obra contra lo que costó en el periodo. Los gastos sin obra asignada no aparecen aquí.
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  {datos.obras.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-600">Sin movimientos de obra en el periodo</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700 text-left">
                            <th className="py-2 pr-4 font-semibold text-slate-400 text-xs uppercase tracking-wide">Obra</th>
                            <th className="py-2 px-2 font-semibold text-slate-400 text-xs uppercase tracking-wide text-right">Cobrado</th>
                            <th className="py-2 px-2 font-semibold text-slate-400 text-xs uppercase tracking-wide text-right">Facturado</th>
                            <th className="py-2 px-2 font-semibold text-slate-400 text-xs uppercase tracking-wide text-right">Nómina</th>
                            <th className="py-2 px-2 font-semibold text-slate-400 text-xs uppercase tracking-wide text-right">Material</th>
                            <th className="py-2 pl-2 font-semibold text-slate-400 text-xs uppercase tracking-wide text-right">Margen</th>
                          </tr>
                        </thead>
                        <tbody>
                          {datos.obras.map((o) => (
                            <tr
                              key={o.id}
                              onClick={() => router.push(`${basePath}/projects`)}
                              className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors cursor-pointer"
                            >
                              <td className="py-2.5 pr-4">
                                <p className="font-medium text-slate-200">{o.nombre}</p>
                                {o.empresa && <p className="text-[11px] text-slate-500">{o.empresa}</p>}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-200">{money(o.cobrado)}</td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-400">{money(o.facturado)}</td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-400">{money(o.nomina)}</td>
                              <td className="py-2.5 px-2 text-right font-mono text-slate-400">{money(o.material)}</td>
                              <td className="py-2.5 pl-2 text-right">
                                <span
                                  className="font-mono font-bold"
                                  style={{ color: o.margen >= 0 ? VERDE : "#f87171" }}
                                >
                                  {money(o.margen)}
                                </span>
                                {o.pct != null && <span className="text-[11px] text-slate-500 ml-1.5">{o.pct}%</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : null}
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}

/* ─── Piezas ─── */

function Operador({ signo }: { signo: string }) {
  return <span className="hidden md:block text-2xl text-slate-600 font-light text-center">{signo}</span>
}

function BloqueCifra({
  etiqueta, valor, pie, color, delta, deltaInversa,
}: {
  etiqueta: string
  valor: number
  pie: string
  color: string
  delta: number | null
  /** En egresos, subir es malo: invierte el color de la variación */
  deltaInversa?: boolean
}) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{etiqueta}</p>
      <p className="text-2xl sm:text-3xl font-bold font-mono mt-1" style={{ color }}>
        {money(valor)}
      </p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        <span className="text-[11px] text-slate-500">{pie}</span>
        <Delta valor={delta} inversa={deltaInversa} />
      </div>
    </div>
  )
}

function Delta({ valor, inversa }: { valor: number | null; inversa?: boolean }) {
  if (valor === null) return null
  const sube = valor > 0
  const bueno = inversa ? !sube : sube
  const Icono = valor === 0 ? Minus : sube ? ArrowUpRight : ArrowDownRight
  const color = valor === 0 ? "#64748b" : bueno ? VERDE : "#f87171"
  // Un "+9526%" sale cuando el periodo anterior casi no tenía capturado: el
  // número es correcto y no dice nada. Arriba de 999% se corta.
  const abs = Math.abs(valor)
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
      style={{ color }}
      title={abs > 999 ? `${valor}% contra el periodo anterior` : undefined}
    >
      <Icono className="w-3 h-3" />
      {abs > 999 ? ">999" : abs}%
    </span>
  )
}

function Renglon({
  etiqueta, detalle, monto, color, fuerte,
}: {
  etiqueta: string
  detalle: string
  monto: number
  color: string
  fuerte?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className={`text-[13px] ${fuerte ? "font-semibold text-slate-100" : "text-slate-300"}`}>{etiqueta}</p>
        <p className="text-[11px] text-slate-500">{detalle}</p>
      </div>
      <span className={`font-mono shrink-0 ${fuerte ? "text-lg font-bold" : "text-sm font-semibold"}`} style={{ color }}>
        {money(monto)}
      </span>
    </div>
  )
}

function BarraEgreso({
  icono: Icono, etiqueta, detalle, monto, total, color,
}: {
  icono: React.ComponentType<React.SVGProps<SVGSVGElement>>
  etiqueta: string
  detalle: string
  monto: number
  total: number
  color: string
}) {
  const pct = total > 0 ? Math.round((monto / total) * 100) : 0
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icono className="w-4 h-4 shrink-0" style={{ color }} />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-slate-200">{etiqueta}</p>
            <p className="text-[11px] text-slate-500 truncate">{detalle}</p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold font-mono text-slate-100">{money(monto)}</p>
          <p className="text-[10px] text-slate-500">{pct}% del total</p>
        </div>
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-slate-700/70 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      {texto}
    </span>
  )
}

function Grafica({ serie, actual }: { serie: { clave: string; etiqueta: string; ingresos: number; egresos: number }[]; actual: Periodo }) {
  const max = Math.max(1, ...serie.map((p) => Math.max(p.ingresos, p.egresos)))
  // El mes elegido se resalta para no perderlo entre los doce
  const claveActual = actual.tipo === "mes" ? actual.clave.replace("mes-", "") : null

  // Qué barra tiene el cursor encima: el mes y cuál de las dos series.
  // El globo muestra siempre las dos cifras y resalta la señalada, porque la
  // pregunta que sigue a "¿cuánto cobramos?" es "¿y cuánto gastamos?".
  const [encima, setEncima] = useState<{ i: number; serie: "ingresos" | "egresos" } | null>(null)
  const punto = encima ? serie[encima.i] : null

  return (
    // El espacio de arriba es para el globo: sin él taparía las barras altas.
    <div className="relative pt-24" onMouseLeave={() => setEncima(null)}>
      {punto && encima && (
        <div
          className="absolute top-0 z-10 pointer-events-none"
          style={{
            left: `${((encima.i + 0.5) / serie.length) * 100}%`,
            // Cerca de los bordes el globo se recarga hacia adentro para no salirse
            transform: `translateX(${encima.i <= 1 ? "-8%" : encima.i >= serie.length - 2 ? "-92%" : "-50%"})`,
          }}
        >
          <div className="rounded-lg border border-slate-600 bg-slate-900/95 px-3 py-2 shadow-xl whitespace-nowrap">
            <p className="text-[11px] font-semibold text-slate-200 mb-1.5 capitalize">{punto.etiqueta}</p>
            <LineaGlobo
              color={VERDE}
              etiqueta="Cobrado"
              valor={punto.ingresos}
              resaltada={encima.serie === "ingresos"}
            />
            <LineaGlobo
              color={AMBAR}
              etiqueta="Egresos"
              valor={punto.egresos}
              resaltada={encima.serie === "egresos"}
            />
            <div className="mt-1.5 pt-1.5 border-t border-slate-700 flex items-center justify-between gap-6">
              <span className="text-[10px] text-slate-500">Resultado</span>
              <span
                className="text-[11px] font-bold font-mono"
                style={{ color: punto.ingresos - punto.egresos >= 0 ? VERDE : "#f87171" }}
              >
                {moneyExacto(punto.ingresos - punto.egresos)}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-end gap-1.5 sm:gap-2 h-44">
        {serie.map((p, i) => {
          const esActual = p.clave === claveActual
          const señalado = encima?.i === i
          return (
            <div key={p.clave} className="flex-1 flex flex-col items-center gap-1 h-full">
              <div className="w-full flex-1 flex items-end justify-center gap-[2px]">
                {(["ingresos", "egresos"] as const).map((s) => {
                  const valor = p[s]
                  const activa = señalado && encima?.serie === s
                  return (
                    <div
                      key={s}
                      onMouseEnter={() => setEncima({ i, serie: s })}
                      // En pantalla táctil no hay cursor: el toque hace lo mismo
                      onClick={() => setEncima({ i, serie: s })}
                      className="w-1/2 h-full flex items-end cursor-default"
                    >
                      <div
                        className="w-full rounded-t transition-all duration-200"
                        style={{
                          height: `${Math.max(valor > 0 ? 2 : 0, (valor / max) * 100)}%`,
                          background: s === "ingresos" ? VERDE : AMBAR,
                          opacity: activa ? 1 : señalado || esActual ? 0.85 : 0.55,
                          boxShadow: activa ? `0 0 0 1px ${s === "ingresos" ? VERDE : AMBAR}` : undefined,
                        }}
                      />
                    </div>
                  )
                })}
              </div>
              <span
                className={`text-[9px] transition-colors ${
                  señalado || esActual ? "text-slate-200 font-semibold" : "text-slate-500"
                }`}
              >
                {p.etiqueta}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LineaGlobo({
  color, etiqueta, valor, resaltada,
}: {
  color: string
  etiqueta: string
  valor: number
  resaltada: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="inline-flex items-center gap-1.5">
        <span
          className="w-2 h-2 rounded-sm shrink-0"
          style={{ background: color, opacity: resaltada ? 1 : 0.5 }}
        />
        <span className={`text-[11px] ${resaltada ? "text-slate-100 font-semibold" : "text-slate-400"}`}>
          {etiqueta}
        </span>
      </span>
      <span
        className={`text-[11px] font-mono ${resaltada ? "font-bold" : ""}`}
        style={{ color: resaltada ? color : "#cbd5e1" }}
      >
        {moneyExacto(valor)}
      </span>
    </div>
  )
}
