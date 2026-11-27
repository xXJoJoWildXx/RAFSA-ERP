"use client"

/**
 * Tablero.
 *
 * Es la primera pantalla del día, así que responde dos preguntas en ese
 * orden: qué está esperando una acción mía, y cómo va el negocio hoy.
 *
 * Todo lo que se ve sale de la base (lib/dashboardData.ts). La versión
 * anterior mezclaba datos reales con cifras escritas a mano —"43 documentos
 * pendientes", "+12% vs mes anterior"— y eso vuelve sospechosa la pantalla
 * completa: si un número está inventado, ninguno se puede usar para decidir.
 */

import type { AppRole as UserRoleScreen } from "@/lib/permissions"
import { useBasePath } from "@/lib/appScope"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { useActivityStream } from "@/components/activityToastProvider"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { formatEventType, entityBadgeClass, timeAgo } from "@/lib/activityLog"
import {
  cargarResumen,
  money,
  moneyExacto,
  type ResumenDashboard,
  type Pendiente,
  type Urgencia,
  type IconoPendiente,
} from "@/lib/dashboardData"
import {
  AlertTriangle, ArrowRight, Banknote, Building2, CalendarClock, CheckCircle2, ChevronDown,
  ClipboardList, FileSearch, FileText, HandCoins, Loader2, PackageCheck,
  RefreshCw, Truck, UserCog, Users, Wallet,
} from "lucide-react"

const ICONOS: Record<IconoPendiente, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  factura: FileSearch,
  pago: Banknote,
  orden: ClipboardList,
  entrega: PackageCheck,
  renta: Truck,
  estimacion: FileText,
  cobranza: HandCoins,
  expediente: UserCog,
  nomina: Wallet,
  bajada: CalendarClock,
}

const TONO: Record<Urgencia, { color: string; fondo: string; borde: string; etiqueta: string }> = {
  alta: { color: "#f87171", fondo: "rgba(248,113,113,0.12)", borde: "rgba(248,113,113,0.35)", etiqueta: "Urgente" },
  media: { color: "#fbbf24", fondo: "rgba(251,191,36,0.12)", borde: "rgba(251,191,36,0.3)", etiqueta: "Pendiente" },
  baja: { color: "#4da8e8", fondo: "rgba(1,116,189,0.14)", borde: "rgba(1,116,189,0.35)", etiqueta: "Cuando se pueda" },
}

function fechaLarga(d: Date): string {
  return d.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

function fechaCorta(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  })
}

export function DashboardScreen({ allowed }: { allowed: UserRoleScreen[] }) {
  const basePath = useBasePath()
  const { user } = useAuth()
  const router = useRouter()
  const { lastEventAt } = useActivityStream()

  const [datos, setDatos] = useState<ResumenDashboard | null>(null)
  /** Pendiente desplegado; sólo uno a la vez para que la lista no se desarme. */
  const [desplegado, setDesplegado] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!user?.role) return
    setCargando(true)
    setError(null)
    try {
      setDatos(await cargarResumen(user.role))
    } catch (e: any) {
      // PostgrestError trae los campos no enumerables: hay que leerlos a mano.
      setError(e?.message || e?.details || "No se pudo cargar el tablero.")
    } finally {
      setCargando(false)
    }
  }, [user?.role])

  useEffect(() => {
    cargar()
  }, [cargar])

  // Cuando entra actividad nueva al sistema, el tablero se pone al día solo:
  // es una pantalla que se deja abierta todo el día. Con un freno de 30
  // segundos, porque una ráfaga de eventos dispararía una recarga completa
  // por cada uno y son casi veinte consultas.
  const ultimaCarga = useRef(0)
  useEffect(() => {
    if (!lastEventAt || !user?.role) return
    const ahora = Date.now()
    if (ahora - ultimaCarga.current < 30000) return
    ultimaCarga.current = ahora
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEventAt])

  const ir = (ruta: string) => router.push(`${basePath}${ruta}`)

  return (
    <RoleGuard allowed={allowed}>
      <AdminLayout>
        <div className="space-y-6">
          {/* ── Encabezado ── */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-100">
                Buen día, {user?.display_name}
              </h1>
              <p className="text-slate-500 mt-1 text-sm first-letter:uppercase">{fechaLarga(new Date())}</p>
            </div>
            <div className="flex items-center gap-3">
              {datos && (
                <span className="text-[11px] text-slate-600">Actualizado {timeAgo(datos.generado.toISOString())}</span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={cargar}
                disabled={cargando}
                className="cursor-pointer border-slate-600 bg-slate-800/60 text-slate-300 hover:bg-slate-700 hover:text-white"
              >
                {cargando ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-1.5" />
                )}
                Actualizar
              </Button>
            </div>
          </div>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ── Requiere atención ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Requiere atención</h2>
              {datos && datos.pendientes.length > 0 && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#0174bd]/20 text-[#4da8e8]">
                  {datos.pendientes.length}
                </span>
              )}
            </div>

            {cargando && !datos ? (
              <div className="grid gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[68px] rounded-xl border border-slate-700/60 bg-slate-800/40 animate-pulse" />
                ))}
              </div>
            ) : datos && datos.pendientes.length === 0 ? (
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-5 py-6 flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <p className="text-slate-100 font-semibold">Todo al día</p>
                  <p className="text-sm text-slate-400 mt-0.5">
                    No hay facturas, órdenes ni expedientes esperando una acción.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                {datos?.pendientes.map((p) => (
                  <FilaPendiente
                    key={p.key}
                    p={p}
                    abierto={desplegado === p.key}
                    onToggle={() => setDesplegado((actual) => (actual === p.key ? null : p.key))}
                    onIr={ir}
                  />
                ))}
              </div>
            )}
          </section>

          {/* ── Cifras ── */}
          <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Cifra
              titulo="Por cobrar a clientes"
              valor={datos?.cifras.porCobrar}
              pie={
                datos
                  ? `${datos.cifras.facturasPorCobrar} ${datos.cifras.facturasPorCobrar === 1 ? "factura abierta" : "facturas abiertas"}`
                  : ""
              }
              icono={HandCoins}
              color="#34d399"
              onClick={() => ir("/projects")}
              cargando={cargando && !datos}
            />
            <Cifra
              titulo="Por pagar a proveedores"
              valor={datos?.cifras.porPagar}
              pie={
                datos
                  ? `${datos.cifras.facturasPorPagar} ${datos.cifras.facturasPorPagar === 1 ? "factura con saldo" : "facturas con saldo"}`
                  : ""
              }
              icono={Banknote}
              color="#fbbf24"
              onClick={() => ir("/proveedores")}
              cargando={cargando && !datos}
            />
            <Cifra
              titulo="Salidas de almacén del mes"
              valor={datos?.cifras.egresosMes}
              pie={
                datos
                  ? `${datos.cifras.ordenesMes} ${datos.cifras.ordenesMes === 1 ? "orden" : "órdenes"} en el mes`
                  : ""
              }
              icono={ClipboardList}
              color="#a78bfa"
              onClick={() => ir("/inventario/ordenes")}
              cargando={cargando && !datos}
            />
            <div className="grid grid-cols-2 gap-4">
              <Mini
                titulo="Obras"
                valor={datos?.cifras.obrasActivas}
                pie={datos ? `${datos.cifras.obrasPlaneadas} por iniciar` : ""}
                icono={Building2}
                color="#4da8e8"
                onClick={() => ir("/projects")}
                cargando={cargando && !datos}
              />
              <Mini
                titulo="Personal"
                valor={datos?.cifras.empleadosActivos}
                pie={datos ? `${datos.cifras.foraneos} foráneos` : ""}
                icono={Users}
                color="#34d399"
                onClick={() => ir("/employees")}
                cargando={cargando && !datos}
              />
            </div>
          </section>

          {/* ── Bajadas y actividad ── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Bajadas: primero lo que nadie resolvió, luego lo que viene */}
            <Card className="bg-slate-800/60 border-slate-700/60">
              <CardHeader className="flex flex-row items-start justify-between pb-3 gap-3">
                <div>
                  <CardTitle className="text-slate-100 text-base font-semibold flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#4da8e8]" /> Bajadas de foráneos
                  </CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Viajes sin resolver y los que vienen</p>
                </div>
                {datos && datos.bajadasSinResolver.length > 0 && (
                  <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 border border-red-500/25">
                    {datos.bajadasSinResolver.length} sin resolver
                  </span>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                {!datos ? (
                  <div className="space-y-2">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-slate-700/30 animate-pulse" />
                    ))}
                  </div>
                ) : datos.bajadasSinResolver.length === 0 && datos.bajadas.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">
                    Sin bajadas pendientes ni próximas
                  </p>
                ) : (
                  <>
                    {datos.bajadasSinResolver.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                          Notificaciones sin resolver
                        </p>
                        <div className="space-y-1.5">
                          {datos.bajadasSinResolver.slice(0, 6).map((b) => {
                            const grave = b.dias > 7
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() =>
                                  ir(b.empresaId && b.obraId ? `/projects/${b.empresaId}/${b.obraId}` : "/projects")
                                }
                                title="Abrir la obra para confirmar o descartar el viaje"
                                className="group w-full text-left rounded-lg border border-slate-700/70 bg-slate-900/40 px-3 py-2 cursor-pointer transition-colors hover:border-[#0174bd]/50 hover:bg-slate-900/70"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-medium text-slate-200 truncate">{b.empleado}</p>
                                    <p className="text-[11px] text-slate-500 truncate">
                                      {b.obra ?? "Sin obra"} · bajada {fechaCorta(b.fecha)}
                                      {b.reingreso ? ` · regresa ${fechaCorta(b.reingreso)}` : ""}
                                    </p>
                                  </div>
                                  <span
                                    className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                    style={{
                                      background: grave ? "rgba(248,113,113,0.15)" : "rgba(251,191,36,0.15)",
                                      color: grave ? "#f87171" : "#fbbf24",
                                    }}
                                  >
                                    {b.dias <= 0 ? "hoy" : `${b.dias} d`}
                                  </span>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                        {datos.bajadasSinResolver.length > 6 && (
                          <p className="text-[11px] text-slate-500 mt-2">
                            y {datos.bajadasSinResolver.length - 6} más sin resolver
                          </p>
                        )}
                      </div>
                    )}

                    {datos.bajadas.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-2">
                          Próximos 14 días
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {datos.bajadas.map((b) => (
                            <div key={b.id} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2">
                              <p className="text-xs font-medium text-slate-200">{b.nombre}</p>
                              <p className="text-[11px] text-slate-500">
                                Baja {fechaCorta(b.fecha)}
                                {b.reingreso ? ` · regresa ${fechaCorta(b.reingreso)}` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700/60">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-slate-100 text-base font-semibold">Actividad reciente</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Últimas acciones en el sistema</p>
                </div>
                <Link href={`${basePath}/activities`}>
                  <Button size="sm" variant="outline" className="text-xs border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 bg-transparent cursor-pointer">
                    Ver todas
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {!datos || datos.actividad.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">Sin actividad registrada aún</p>
                ) : (
                  <div className="space-y-0">
                    {datos.actividad.map((act, idx) => (
                      <div
                        key={act.id}
                        className={`flex items-start gap-3 py-2.5 ${idx < datos.actividad.length - 1 ? "border-b border-slate-700/50" : ""}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-[#0174bd]/20 border border-[#0174bd]/20 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#4da8e8]">
                            {(act.actor_email ?? "S")[0].toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-[13px] text-slate-300 leading-snug">
                              <span className="font-semibold text-slate-100">{formatEventType(act.event_type)}</span>
                              {act.entity_label && <span className="text-slate-400"> — {act.entity_label}</span>}
                            </p>
                            <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${entityBadgeClass(act.entity_type)}`}>
                              {act.entity_type}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {act.actor_email ?? "Sistema"} · {timeAgo(act.created_at)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          {/* ── Cobranza ── */}
          <section>
            <Card className="bg-slate-800/60 border-slate-700/60">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-slate-100 text-base font-semibold">Cobranza por obra</CardTitle>
                  <p className="text-xs text-slate-500 mt-0.5">Obras abiertas con mayor saldo por cobrar</p>
                </div>
                <Link href={`${basePath}/projects`}>
                  <Button size="sm" variant="outline" className="text-xs border-slate-600 text-slate-400 hover:text-slate-200 hover:bg-slate-700 bg-transparent cursor-pointer">
                    Ver obras
                  </Button>
                </Link>
              </CardHeader>
              <CardContent className="pt-0">
                {cargando && !datos ? (
                  <div className="space-y-3">
                    {[0, 1, 2, 3].map((i) => (
                      <div key={i} className="h-12 rounded-lg bg-slate-700/30 animate-pulse" />
                    ))}
                  </div>
                ) : !datos || datos.cobranza.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-600">Sin obras con contrato capturado</p>
                ) : (
                  <div className="space-y-3.5">
                    {datos.cobranza.map((o) => (
                      <div key={o.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-200 truncate">{o.nombre}</p>
                            {o.empresa && <p className="text-[11px] text-slate-500 truncate">{o.empresa}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-slate-100 font-mono">{money(o.saldo)}</p>
                            <p className="text-[10px] text-slate-500">
                              {o.avance}% cobrado de {money(o.contratado)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-700/70 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${o.avance}%`,
                              background: o.avance >= 80 ? "#34d399" : o.avance >= 40 ? "#4da8e8" : "#fbbf24",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

          </section>

        </div>

      </AdminLayout>
    </RoleGuard>
  )
}

/* ─── Piezas ─── */

function FilaPendiente({
  p, abierto, onToggle, onIr,
}: {
  p: Pendiente
  abierto: boolean
  onToggle: () => void
  onIr: (ruta: string) => void
}) {
  const Icon = ICONOS[p.icono]
  const tono = TONO[p.urgencia]
  // Con detalle, el clic despliega en vez de navegar: la lista dice cuáles
  // son y cada una lleva a su obra, que es más útil que caer en el listado.
  const desplegable = !!p.detalles && p.detalles.length > 0

  return (
    <div
      className="rounded-xl border bg-slate-800/50 transition-colors duration-150"
      style={{ borderColor: tono.borde }}
    >
    <button
      type="button"
      onClick={() => (desplegable ? onToggle() : onIr(p.ruta))}
      aria-expanded={desplegable ? abierto : undefined}
      className="group w-full text-left px-4 py-3 cursor-pointer transition-all duration-150 hover:bg-slate-800/80 rounded-xl"
    >
      <div className="flex items-center gap-4">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: tono.fondo }}
        >
          <Icon className="w-5 h-5" style={{ color: tono.color }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[14px] font-semibold text-slate-100">{p.titulo}</p>
            {p.urgencia === "alta" && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full inline-flex items-center gap-1"
                style={{ background: tono.fondo, color: tono.color }}
              >
                <AlertTriangle className="w-2.5 h-2.5" /> {tono.etiqueta}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{p.detalle}</p>
        </div>

        {p.monto != null && (
          <p className="hidden sm:block text-sm font-bold font-mono shrink-0" style={{ color: tono.color }}>
            {moneyExacto(p.monto)}
          </p>
        )}
        {desplegable ? (
          <ChevronDown
            className={`w-4 h-4 text-slate-500 shrink-0 transition-transform duration-200 group-hover:text-slate-300 ${abierto ? "rotate-180" : ""}`}
          />
        ) : (
          <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-slate-300" />
        )}
      </div>
    </button>

    {desplegable && abierto && (
      <div
        className="border-t px-3 py-2 space-y-1 animate-in fade-in-0 slide-in-from-top-1 duration-150"
        style={{ borderColor: tono.borde }}
      >
        {p.detalles!.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => onIr(d.ruta)}
            title="Abrir la obra"
            className="group/d w-full text-left rounded-lg px-3 py-2 cursor-pointer transition-colors hover:bg-slate-900/60"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-slate-200 truncate">{d.titulo}</p>
                <p className="text-[11px] text-slate-500 truncate">{d.subtitulo}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {d.monto != null && (
                  <span className="text-[13px] font-bold font-mono" style={{ color: tono.color }}>
                    {moneyExacto(d.monto)}
                  </span>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-slate-600 transition-transform duration-150 group-hover/d:translate-x-0.5 group-hover/d:text-slate-300" />
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
    </div>
  )
}

function Cifra({
  titulo, valor, pie, icono: Icon, color, onClick, cargando,
}: {
  titulo: string
  valor: number | null | undefined
  pie: string
  icono: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: string
  onClick: () => void
  cargando: boolean
}) {
  // valor null = el rol no ve esa información; se oculta en vez de mostrar cero,
  // que se leería como "no hay nada" en lugar de "no te toca".
  if (valor === null) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-800"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{titulo}</p>
          {cargando ? (
            <div className="h-8 w-28 mt-2 rounded bg-slate-700/50 animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-slate-100 mt-1.5 font-mono">{money(valor ?? 0)}</p>
          )}
          <p className="text-[11px] text-slate-500 mt-1">{pie}</p>
        </div>
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20` }}>
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
      </div>
    </button>
  )
}

function Mini({
  titulo, valor, pie, icono: Icon, color, onClick, cargando,
}: {
  titulo: string
  valor: number | null | undefined
  pie: string
  icono: React.ComponentType<React.SVGProps<SVGSVGElement>>
  color: string
  onClick: () => void
  cargando: boolean
}) {
  if (valor === null) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-xl border border-slate-700/60 bg-slate-800/50 p-4 cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:border-slate-600 hover:bg-slate-800"
    >
      <Icon className="w-[18px] h-[18px] mb-2" style={{ color }} />
      <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">{titulo}</p>
      {cargando ? (
        <div className="h-7 w-10 mt-1.5 rounded bg-slate-700/50 animate-pulse" />
      ) : (
        <p className="text-2xl font-bold text-slate-100 mt-0.5">{valor ?? 0}</p>
      )}
      <p className="text-[10px] text-slate-500 mt-0.5">{pie}</p>
    </button>
  )
}
