"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Boxes, ChevronDown, ChevronRight, Clock, Loader2,
  Package, Truck, Warehouse, Wrench,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"

/* ── tipos ── */

type OrdenItem = {
  codigo: string | null
  descripcion: string | null
  quantity: number
  unit_price: number | null
}

type Orden = {
  id: string
  folio: string | null
  status: "pending" | "in_progress" | "delivered" | "completed" | "cancelled"
  supplier_name: string | null
  notes: string | null
  created_at: string
  delivered_at: string | null
  completed_at: string | null
  inventory_order_items: OrdenItem[] | null
}

type EgresoProveedor = {
  concepto_tipo: "material" | "renta" | "servicio"
  proveedor: string
  fecha: string | null
  referencia: string | null
  descripcion: string
  cantidad: number
  costo_unitario: number
  importe: number
}

/* ── utilidades ── */

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0)

const moneyCorto = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(n ?? 0)

const cant = (n: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(s.length <= 10 ? `${s}T12:00:00` : s)
        .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : "—"

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const importeOrden = (o: Orden) =>
  (o.inventory_order_items ?? []).reduce(
    (s, i) => s + Number(i.quantity ?? 0) * Number(i.unit_price ?? 0), 0)

/** Ya salió del almacén, contra lo que apenas está pedido. */
const yaSalio = (s: Orden["status"]) => s === "delivered" || s === "completed"

const ESTADO: Record<Orden["status"], { txt: string; cls: string }> = {
  pending:     { txt: "Pendiente",  cls: "bg-amber-500/15 text-amber-400" },
  in_progress: { txt: "En proceso", cls: "bg-amber-500/15 text-amber-400" },
  delivered:   { txt: "Entregada",  cls: "bg-emerald-500/15 text-emerald-400" },
  completed:   { txt: "Completada", cls: "bg-emerald-500/15 text-emerald-400" },
  cancelled:   { txt: "Cancelada",  cls: "bg-slate-600/40 text-slate-400" },
}

const TIPO_PROV = {
  material: { txt: "Material", cls: "bg-cyan-500/15 text-cyan-400",     icono: Package },
  renta:    { txt: "Renta",    cls: "bg-orange-500/15 text-orange-400", icono: Wrench },
  servicio: { txt: "Servicio", cls: "bg-purple-500/15 text-purple-400", icono: Truck },
} as const

/* ═══════════════════════════════════════════════════════════ */

export function ObraEgresosTab({ obraId }: { obraId: string }) {
  const [ordenes, setOrdenes] = useState<Orden[]>([])
  const [proveedores, setProveedores] = useState<EgresoProveedor[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ordenAbierta, setOrdenAbierta] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!obraId) return
    setCargando(true); setError(null)

    const [oRes, pRes] = await Promise.all([
      // Sólo salidas a obra. Las de "restock" son compras al almacén, no
      // gasto de ninguna obra, y las canceladas nunca ocurrieron.
      supabase
        .from("inventory_orders")
        .select("id, folio, status, supplier_name, notes, created_at, delivered_at, completed_at, inventory_order_items(codigo, descripcion, quantity, unit_price)")
        .eq("obra_id", obraId)
        .eq("type", "dispatch")
        .neq("status", "cancelled")
        .order("created_at", { ascending: false }),
      supabase
        .from("proveedores_egresos_por_obra")
        .select("concepto_tipo, proveedor, fecha, referencia, descripcion, cantidad, costo_unitario, importe")
        .eq("obra_id", obraId),
    ])

    if (oRes.error) setError(`No se pudieron cargar las órdenes: ${detalle(oRes.error)}`)
    else if (pRes.error) setError(`No se pudo cargar el gasto de proveedores: ${detalle(pRes.error)}`)

    setOrdenes((oRes.data as unknown as Orden[]) ?? [])
    setProveedores((pRes.data as EgresoProveedor[]) ?? [])
    setCargando(false)
  }, [obraId])

  useEffect(() => { void cargar() }, [cargar])

  /* ── totales ── */
  const inv = useMemo(() => {
    let ejercido = 0, comprometido = 0
    for (const o of ordenes) {
      const imp = importeOrden(o)
      if (yaSalio(o.status)) ejercido += imp
      else comprometido += imp
    }
    return { ejercido, comprometido, ordenes: ordenes.length }
  }, [ordenes])

  const prov = useMemo(() => {
    const por = { material: 0, renta: 0, servicio: 0 }
    for (const e of proveedores) por[e.concepto_tipo] += Number(e.importe ?? 0)
    return { ...por, total: por.material + por.renta + por.servicio }
  }, [proveedores])

  const total = inv.ejercido + prov.total

  const porTipoProveedor = useMemo(() => {
    const acc: Record<string, EgresoProveedor[]> = {}
    for (const e of proveedores) (acc[e.concepto_tipo] ??= []).push(e)
    for (const k of Object.keys(acc)) {
      acc[k].sort((a, b) => Number(b.importe) - Number(a.importe))
    }
    return acc
  }, [proveedores])

  if (cargando) {
    return <div className="py-20 text-center"><Loader2 className="w-6 h-6 animate-spin text-slate-500 mx-auto" /></div>
  }

  const sinNada = ordenes.length === 0 && proveedores.length === 0

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {/* ── resumen ── */}
      <div className="rounded-2xl border border-slate-700 bg-slate-800 p-6">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Egreso total de la obra</p>
        <p className="text-3xl font-bold text-slate-100 tabular-nums mt-1">{money(total)}</p>
        {inv.comprometido > 0 && (
          <p className="text-[11px] text-amber-400 mt-1">
            Más {money(inv.comprometido)} comprometidos en órdenes que aún no salen del almacén.
          </p>
        )}

        {total > 0 && (
          <>
            <div className="mt-4 h-2.5 rounded-full bg-slate-900/60 overflow-hidden flex">
              {inv.ejercido > 0 && (
                <div style={{ width: `${(inv.ejercido / total) * 100}%`, background: "#0174bd" }} />
              )}
              {prov.material > 0 && (
                <div style={{ width: `${(prov.material / total) * 100}%`, background: "#06b6d4" }} />
              )}
              {prov.renta > 0 && (
                <div style={{ width: `${(prov.renta / total) * 100}%`, background: "#f97316" }} />
              )}
              {prov.servicio > 0 && (
                <div style={{ width: `${(prov.servicio / total) * 100}%`, background: "#a855f7" }} />
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
              {inv.ejercido > 0 && <Leyenda color="#0174bd" txt="Inventario" valor={moneyCorto(inv.ejercido)} />}
              {prov.material > 0 && <Leyenda color="#06b6d4" txt="Material proveedor" valor={moneyCorto(prov.material)} />}
              {prov.renta > 0    && <Leyenda color="#f97316" txt="Rentas" valor={moneyCorto(prov.renta)} />}
              {prov.servicio > 0 && <Leyenda color="#a855f7" txt="Servicios" valor={moneyCorto(prov.servicio)} />}
            </div>
          </>
        )}
      </div>

      {/* ── dos fuentes ── */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Tarjeta
          icono={<Warehouse className="w-4 h-4" />}
          titulo="Inventario"
          valor={money(inv.ejercido)}
          color="#0174bd"
          detalle={`${inv.ordenes} orden${inv.ordenes === 1 ? "" : "es"} de salida`}
        />
        <Tarjeta
          icono={<Boxes className="w-4 h-4" />}
          titulo="Proveedores"
          valor={money(prov.total)}
          color="#f97316"
          detalle={`${proveedores.length} concepto${proveedores.length === 1 ? "" : "s"}`}
        />
      </div>

      {sinNada && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 py-16 text-center">
          <Package className="w-8 h-8 text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            Esta obra todavía no tiene egresos registrados.
          </p>
          <p className="text-xs text-slate-600 mt-1">
            Aparecen al surtir una orden desde Inventario o al enviarle material,
            rentas o servicios desde Proveedores.
          </p>
        </div>
      )}

      {/* ── inventario ── */}
      {ordenes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-[#4da8e8]" />
            <h3 className="text-base font-semibold text-slate-100">Órdenes de Inventario</h3>
          </div>

          <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden divide-y divide-slate-700/60">
            {ordenes.map(o => {
              const imp = importeOrden(o)
              const est = ESTADO[o.status]
              const items = o.inventory_order_items ?? []
              const abierta = ordenAbierta === o.id

              return (
                <div key={o.id}>
                  <button
                    onClick={() => setOrdenAbierta(abierta ? null : o.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-slate-700/30 transition-colors text-left"
                  >
                    {abierta ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                             : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-200">{o.folio ?? "sin folio"}</span>
                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${est.cls}`}>
                          {est.txt}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {items.length} artículo{items.length === 1 ? "" : "s"}
                        {" · "}{fecha(o.delivered_at ?? o.completed_at ?? o.created_at)}
                        {o.notes && <> · {o.notes}</>}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className={`text-sm tabular-nums ${yaSalio(o.status) ? "text-slate-200" : "text-amber-400"}`}>
                        {money(imp)}
                      </p>
                      {!yaSalio(o.status) && (
                        <p className="text-[10px] text-slate-600 flex items-center gap-1 justify-end">
                          <Clock className="w-2.5 h-2.5" />no ha salido
                        </p>
                      )}
                    </div>
                  </button>

                  {abierta && (
                    <div className="bg-slate-900/30 border-t border-slate-700/60 divide-y divide-slate-700/40">
                      {items.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-500">Esta orden no tiene renglones.</p>
                      ) : items.map((i, n) => (
                        <div key={n} className="px-4 py-2.5 flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-200 leading-snug">{i.descripcion ?? "—"}</p>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              {i.codigo ?? "sin código"} · {cant(Number(i.quantity))} × {money(Number(i.unit_price ?? 0))}
                            </p>
                          </div>
                          <span className="text-xs text-slate-300 tabular-nums shrink-0">
                            {money(Number(i.quantity ?? 0) * Number(i.unit_price ?? 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── proveedores ── */}
      {proveedores.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Boxes className="w-4 h-4 text-orange-400" />
            <h3 className="text-base font-semibold text-slate-100">Desde Proveedores</h3>
          </div>

          {(["material", "renta", "servicio"] as const).map(tipo => {
            const filas = porTipoProveedor[tipo]
            if (!filas || filas.length === 0) return null
            const t = TIPO_PROV[tipo]
            const Icono = t.icono
            const sub = filas.reduce((s, f) => s + Number(f.importe ?? 0), 0)

            return (
              <div key={tipo} className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-md ${t.cls} flex items-center justify-center`}>
                      <Icono className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-semibold text-slate-300">{t.txt}</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-200 tabular-nums">{money(sub)}</span>
                </div>

                <div className="divide-y divide-slate-700/60">
                  {filas.map((f, n) => (
                    <div key={n} className="px-4 py-2.5 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-200 leading-snug">{f.descripcion}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {f.proveedor}
                          {f.referencia && <> · {f.referencia}</>}
                          {" · "}{fecha(f.fecha)}
                          {Number(f.cantidad) !== 1 && <> · {cant(Number(f.cantidad))} × {money(Number(f.costo_unitario))}</>}
                        </p>
                      </div>
                      <span className="text-xs text-slate-300 tabular-nums shrink-0">
                        {money(Number(f.importe))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </section>
      )}

      <p className="text-[11px] text-slate-600 leading-relaxed">
        El egreso total cuenta lo que ya salió del almacén y lo enviado o cargado desde
        Proveedores. Las órdenes pendientes se muestran aparte porque todavía no se
        surten, y las canceladas no aparecen.
      </p>
    </div>
  )
}

/* ── piezas ── */

function Tarjeta({ icono, titulo, valor, detalle, color }: {
  icono: React.ReactNode; titulo: string; valor: string; detalle: string; color: string
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 p-4"
      style={{ boxShadow: `inset 3px 0 0 ${color}` }}>
      <div className="flex items-center gap-2">
        <span style={{ color }}>{icono}</span>
        <p className="text-xs font-semibold text-slate-300">{titulo}</p>
      </div>
      <p className="text-xl font-semibold text-slate-100 tabular-nums mt-1.5">{valor}</p>
      <p className="text-[10px] text-slate-600 mt-0.5">{detalle}</p>
    </div>
  )
}

function Leyenda({ color, txt, valor }: { color: string; txt: string; valor: string }) {
  return (
    <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
      <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
      {txt} <span className="text-slate-400">{valor}</span>
    </span>
  )
}
