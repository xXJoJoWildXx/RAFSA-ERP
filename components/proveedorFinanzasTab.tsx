"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, BarChart2, Building2, Loader2, Package, Truck, Wrench,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useRealtimeRefresco, TABLAS_PROVEEDORES } from "@/lib/useRealtimeRefresco"

type Egreso = {
  obra_id: string
  obra: string
  concepto_tipo: "material" | "renta" | "servicio"
  proveedor: string
  fecha: string | null
  referencia: string | null
  descripcion: string
  cantidad: number
  costo_unitario: number
  importe: number
}

type Cuenta = {
  proveedor: string
  total: number
  saldo: number
  estado_pago: string
  estado_vencimiento: string
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n ?? 0)

const moneyExacto = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0)

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const TIPO = {
  material: { txt: "Material", cls: "bg-cyan-500/15 text-cyan-400",     icono: Package },
  renta:    { txt: "Renta",    cls: "bg-orange-500/15 text-orange-400", icono: Wrench },
  servicio: { txt: "Servicio", cls: "bg-purple-500/15 text-purple-400", icono: Truck },
} as const

export function ProveedorFinanzasTab() {
  const [egresos, setEgresos] = useState<Egreso[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [obraAbierta, setObraAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    const [eRes, cRes] = await Promise.all([
      supabase.from("proveedores_egresos_por_obra").select("*"),
      supabase.from("proveedores_facturas_pago_v")
        .select("proveedor, total, saldo, estado_pago, estado_vencimiento"),
    ])
    if (eRes.error) setError(`No se pudieron cargar los egresos: ${detalle(eRes.error)}`)
    if (cRes.error) setError(`No se pudieron cargar las cuentas por pagar: ${detalle(cRes.error)}`)
    setEgresos((eRes.data as Egreso[]) ?? [])
    setCuentas((cRes.data as Cuenta[]) ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /* Varias personas trabajan Proveedores a la vez. Esto vuelve a
     consultar en cuanto alguien más registra un pago, procesa una
     factura o manda material, sin esperar a que se recargue. */
  useRealtimeRefresco("proveedores-finanzas", TABLAS_PROVEEDORES.finanzas, cargar)

  /* ── cuentas por pagar ── */
  const porPagar = useMemo(() => {
    const abiertas = cuentas.filter(c => c.estado_pago !== "pagada")
    return {
      total:    abiertas.reduce((s, c) => s + Number(c.saldo ?? 0), 0),
      vencido:  abiertas.filter(c => c.estado_vencimiento === "vencida")
                        .reduce((s, c) => s + Number(c.saldo ?? 0), 0),
      proximo:  abiertas.filter(c => c.estado_vencimiento === "por_vencer" || c.estado_vencimiento === "vence_hoy")
                        .reduce((s, c) => s + Number(c.saldo ?? 0), 0),
      facturas: abiertas.length,
    }
  }, [cuentas])

  const porProveedor = useMemo(() => {
    const acc: Record<string, number> = {}
    for (const c of cuentas) {
      if (c.estado_pago === "pagada") continue
      acc[c.proveedor] = (acc[c.proveedor] ?? 0) + Number(c.saldo ?? 0)
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [cuentas])

  /* ── egresos por obra ── */
  const obras = useMemo(() => {
    const acc: Record<string, { obra: string; total: number; material: number; renta: number; servicio: number; filas: Egreso[] }> = {}
    for (const e of egresos) {
      const o = (acc[e.obra_id] ??= { obra: e.obra, total: 0, material: 0, renta: 0, servicio: 0, filas: [] })
      const imp = Number(e.importe ?? 0)
      o.total += imp
      o[e.concepto_tipo] += imp
      o.filas.push(e)
    }
    return Object.entries(acc).sort((a, b) => b[1].total - a[1].total)
  }, [egresos])

  const totalEgresos = useMemo(() => obras.reduce((s, [, o]) => s + o.total, 0), [obras])
  const maxObra = obras[0]?.[1].total ?? 1

  if (cargando) {
    return <div className="py-14 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* ── cuentas por pagar ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Cuentas por pagar</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Metrica etiqueta="Saldo total" valor={money(porPagar.total)} sub={`${porPagar.facturas} facturas abiertas`} />
          <Metrica etiqueta="Vencido" valor={money(porPagar.vencido)} color="#ef4444"
            sub={porPagar.vencido > 0 ? "Urge pagarlo" : "Nada vencido"} />
          <Metrica etiqueta="Vence pronto" valor={money(porPagar.proximo)} color="#f59e0b" sub="En los próximos 5 días" />
          <Metrica etiqueta="Gasto en obra" valor={money(totalEgresos)} color="#0174bd"
            sub={`${obras.length} obra${obras.length === 1 ? "" : "s"}`} />
        </div>

        {porProveedor.length > 0 && (
          <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
            <p className="text-xs font-semibold text-slate-300 mb-3">A quién le debemos más</p>
            <div className="space-y-2">
              {porProveedor.map(([nombre, saldo]) => (
                <div key={nombre} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-48 truncate shrink-0" title={nombre}>{nombre}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-900/60 overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${Math.max(2, (saldo / porProveedor[0][1]) * 100)}%`, background: "#f59e0b" }} />
                  </div>
                  <span className="text-xs text-slate-300 tabular-nums w-24 text-right shrink-0">{moneyExacto(saldo)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ── egresos por obra ── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-100">Gasto por obra</h2>
        <p className="text-xs text-slate-500 -mt-2">
          Materiales entregados en obra, más rentas y servicios de facturas ya procesadas.
        </p>

        {obras.length === 0 ? (
          <div className="rounded-2xl border border-slate-700 bg-slate-800 py-14 text-center">
            <BarChart2 className="w-7 h-7 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              Todavía no hay gasto atribuido a ninguna obra. Aparece al enviar material
              o al procesar facturas de renta y servicio con obra asignada.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {obras.map(([obraId, o]) => (
              <div key={obraId} className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
                <button
                  onClick={() => setObraAbierta(obraAbierta === obraId ? null : obraId)}
                  className="w-full p-4 text-left hover:bg-slate-700/20 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-sm font-medium text-slate-200 truncate">{o.obra}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-100 tabular-nums shrink-0">
                      {moneyExacto(o.total)}
                    </span>
                  </div>

                  {/* Barra apilada: de un vistazo, en qué se va el dinero de la obra */}
                  <div className="mt-2.5 h-2 rounded-full bg-slate-900/60 overflow-hidden flex"
                    style={{ width: `${Math.max(8, (o.total / maxObra) * 100)}%` }}>
                    {o.material > 0 && <div style={{ width: `${(o.material / o.total) * 100}%`, background: "#06b6d4" }} />}
                    {o.renta > 0    && <div style={{ width: `${(o.renta / o.total) * 100}%`,    background: "#f97316" }} />}
                    {o.servicio > 0 && <div style={{ width: `${(o.servicio / o.total) * 100}%`, background: "#a855f7" }} />}
                  </div>

                  <div className="flex gap-4 mt-2">
                    {o.material > 0 && <Leyenda color="#06b6d4" txt="Material" valor={money(o.material)} />}
                    {o.renta > 0    && <Leyenda color="#f97316" txt="Renta"    valor={money(o.renta)} />}
                    {o.servicio > 0 && <Leyenda color="#a855f7" txt="Servicio" valor={money(o.servicio)} />}
                  </div>
                </button>

                {obraAbierta === obraId && (
                  <div className="border-t border-slate-700/60 bg-slate-900/30 divide-y divide-slate-700/40">
                    {o.filas
                      .slice()
                      .sort((a, b) => Number(b.importe) - Number(a.importe))
                      .map((e, i) => {
                        const t = TIPO[e.concepto_tipo]
                        const Icono = t.icono
                        return (
                          <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                            <div className={`w-6 h-6 rounded-md ${t.cls} flex items-center justify-center shrink-0 mt-0.5`}>
                              <Icono className="w-3 h-3" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-200 leading-snug">{e.descripcion}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {e.proveedor}
                                {e.referencia && <> · {e.referencia}</>}
                                {" · "}{Number(e.cantidad)} × {moneyExacto(Number(e.costo_unitario))}
                              </p>
                            </div>
                            <span className="text-xs text-slate-300 tabular-nums shrink-0">
                              {moneyExacto(Number(e.importe))}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Metrica({ etiqueta, valor, sub, color }: {
  etiqueta: string; valor: string; sub?: string; color?: string
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="text-xl font-semibold mt-1 tabular-nums" style={{ color: color ?? "#e2e8f0" }}>{valor}</p>
      {sub && <p className="text-[10px] text-slate-600 mt-0.5">{sub}</p>}
    </div>
  )
}

function Leyenda({ color, txt, valor }: { color: string; txt: string; valor: string }) {
  return (
    <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
      {txt} {valor}
    </span>
  )
}
