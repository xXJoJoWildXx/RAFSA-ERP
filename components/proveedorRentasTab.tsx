"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, CalendarClock, CheckCircle2, Loader2, MapPin, Search, Undo2, Wrench,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import { useRealtimeRefresco, TABLAS_PROVEEDORES } from "@/lib/useRealtimeRefresco"
import {
  ProveedorAsignarRentaModal, type RentaParaAsignar,
} from "@/components/proveedorAsignarRentaModal"

type Renta = {
  id: string
  proveedor_id: string
  obra_id: string | null
  descripcion: string
  modelo: string | null
  num_serie: string | null
  num_interno: string | null
  contrato: string | null
  periodo_inicio: string | null
  periodo_fin: string | null
  en_obra_desde: string | null
  en_obra_hasta: string | null
  obra_notas: string | null
  dias: number | null
  importe: number
  status: "activa" | "devuelta" | "vencida" | "cancelada"
  notas: string | null
  proveedores: { razon_social: string; nombre_comercial: string | null } | null
  obras: { name: string } | null
}

const money = (n: number) =>
  new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(`${s}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" }) : "—"

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const hoy = () => new Date(new Date().toDateString())

/** Días que faltan para que salga de la obra. Negativo = ya se pasó. */
function diasRestantes(fin: string | null): number | null {
  if (!fin) return null
  const f = new Date(`${fin}T12:00:00`)
  return Math.round((f.getTime() - hoy().getTime()) / 86_400_000)
}

type Filtro = "en_piso" | "por_vencer" | "devueltas" | "todas"

export function ProveedorRentasTab() {
  const [rentas, setRentas] = useState<Renta[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("en_piso")
  const [marcando, setMarcando] = useState<string | null>(null)
  const [asignando, setAsignando] = useState<RentaParaAsignar | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase
      .from("proveedores_rentas")
      .select("*, proveedores(razon_social, nombre_comercial), obras(name)")
      .order("periodo_fin", { ascending: false, nullsFirst: false })
    if (error) setError(`No se pudieron cargar las rentas: ${detalle(error)}`)
    setRentas((data as Renta[]) ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /* Varias personas trabajan Proveedores a la vez: una renta devuelta o
     una factura recién procesada aparece aquí al momento. */
  useRealtimeRefresco("proveedores-rentas", TABLAS_PROVEEDORES.rentas, cargar)

  // "En piso" = la máquina sigue con nosotros: no se ha devuelto ni cancelado,
  // sin importar si el periodo ya venció.
  const enPiso = (r: Renta) => r.status === "activa" || r.status === "vencida"

  const conteos = useMemo(() => ({
    en_piso:    rentas.filter(enPiso).length,
    por_vencer: rentas.filter(r => {
      if (!enPiso(r)) return false
      const d = diasRestantes(r.en_obra_hasta)
      return d != null && d <= 7
    }).length,
    devueltas:  rentas.filter(r => r.status === "devuelta").length,
    todas:      rentas.length,
  }), [rentas])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return rentas.filter(r => {
      if (filtro === "en_piso" && !enPiso(r)) return false
      if (filtro === "devueltas" && r.status !== "devuelta") return false
      if (filtro === "por_vencer") {
        if (!enPiso(r)) return false
        const d = diasRestantes(r.en_obra_hasta)
        if (!(d != null && d <= 7)) return false
      }
      if (!q) return true
      return [r.descripcion, r.modelo, r.num_interno, r.num_serie, r.contrato,
              r.obra_notas, r.proveedores?.razon_social, r.obras?.name]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(q))
    })
  }, [rentas, busca, filtro])

  const costoEnPiso = useMemo(
    () => rentas.filter(enPiso).reduce((s, r) => s + Number(r.importe ?? 0), 0), [rentas])

  const marcarDevuelta = useCallback(async (r: Renta) => {
    setMarcando(r.id); setError(null)
    const { error } = await supabase.from("proveedores_rentas")
      .update({ status: "devuelta", updated_at: new Date().toISOString() }).eq("id", r.id)
    if (error) setError(`No se pudo marcar como devuelta: ${detalle(error)}`)
    else await cargar()
    setMarcando(null)
  }, [cargar])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Rentas de servicios</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Se abren solas al procesar una factura de renta o servicio. En piso:{" "}
          <span className="text-slate-300 font-medium tabular-nums">{money(costoEnPiso)}</span> facturados
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tarjeta activa={filtro === "en_piso"} onClick={() => setFiltro("en_piso")}
          etiqueta="En piso" valor={conteos.en_piso} color="#0174bd" />
        <Tarjeta activa={filtro === "por_vencer"} onClick={() => setFiltro("por_vencer")}
          etiqueta="Vencen en 7 días" valor={conteos.por_vencer} color="#f59e0b" />
        <Tarjeta activa={filtro === "devueltas"} onClick={() => setFiltro("devueltas")}
          etiqueta="Devueltas" valor={conteos.devueltas} color="#10b981" />
        <Tarjeta activa={filtro === "todas"} onClick={() => setFiltro("todas")}
          etiqueta="Todas" valor={conteos.todas} color="#64748b" />
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por máquina, número interno, serie, obra o proveedor…"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2 text-sm
                     text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      {cargando ? (
        <div className="py-14 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl border border-slate-700 bg-slate-800 py-14 text-center">
          <Wrench className="w-7 h-7 text-slate-700 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            {rentas.length === 0
              ? "No hay rentas. Procesa una factura de renta y aparecen aquí."
              : "Ninguna renta coincide con el filtro."}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {visibles.map(r => {
            const d = diasRestantes(r.en_obra_hasta)
            const vencida = enPiso(r) && d != null && d < 0
            const pronto = enPiso(r) && d != null && d >= 0 && d <= 7

            return (
              <div key={r.id} className="rounded-2xl border border-slate-700 bg-slate-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{r.descripcion}</p>
                    <p className="text-[11px] text-slate-500 truncate">
                      {r.proveedores?.nombre_comercial || r.proveedores?.razon_social}
                      {r.num_interno && <> · <span className="text-slate-400">{r.num_interno}</span></>}
                    </p>
                  </div>
                  <span className="text-sm text-slate-200 tabular-nums shrink-0">{money(r.importe)}</span>
                </div>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {r.status === "devuelta" ? (
                    <Chip cls="bg-emerald-500/15 text-emerald-400">Devuelta</Chip>
                  ) : r.status === "cancelada" ? (
                    <Chip cls="bg-slate-600/40 text-slate-400">Cancelada</Chip>
                  ) : vencida ? (
                    <Chip cls="bg-red-500/15 text-red-400">Venció hace {Math.abs(d!)} d</Chip>
                  ) : pronto ? (
                    <Chip cls="bg-amber-500/15 text-amber-400">
                      {d === 0 ? "Termina hoy" : `Faltan ${d} d`}
                    </Chip>
                  ) : (
                    <Chip cls="bg-[#0174bd]/15 text-[#4da8e8]">En piso</Chip>
                  )}
                  {r.obras?.name
                    ? <Chip cls="bg-slate-700/60 text-slate-300">{r.obras.name}</Chip>
                    : <Chip cls="bg-amber-500/15 text-amber-400">Sin asignar</Chip>}
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-3 pt-2.5 border-t border-slate-700/60">
                  <Dato k="Modelo" v={r.modelo ?? "—"} />
                  <Dato k="Serie" v={r.num_serie ?? "—"} />
                  <Dato k="Facturado" v={`${fecha(r.periodo_inicio)} → ${fecha(r.periodo_fin)}`} />
                  <Dato k="En obra" v={r.en_obra_desde || r.en_obra_hasta
                    ? `${fecha(r.en_obra_desde)} → ${fecha(r.en_obra_hasta)}`
                    : "sin asignar"} />
                  {r.contrato && <Dato k="Contrato" v={r.contrato} />}
                  {r.obra_notas && <Dato k="Nota" v={r.obra_notas} />}
                </div>

                {enPiso(r) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-600 flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />
                      {r.en_obra_hasta ? "Se devuelve sola al pasar la fecha" : "Sin fechas asignadas"}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        onClick={() => setAsignando({
                          id: r.id, descripcion: r.descripcion, modelo: r.modelo,
                          num_interno: r.num_interno, obra_id: r.obra_id,
                          en_obra_desde: r.en_obra_desde, en_obra_hasta: r.en_obra_hasta,
                          obra_notas: r.obra_notas,
                        })}
                        variant="ghost"
                        className="h-7 text-xs text-slate-400 hover:text-[#4da8e8] hover:bg-slate-700/60"
                      >
                        <MapPin className="w-3.5 h-3.5 mr-1.5" />
                        {r.obra_id ? "Cambiar obra" : "Asignar a obra"}
                      </Button>
                      <Button
                        onClick={() => void marcarDevuelta(r)}
                        disabled={marcando === r.id}
                        variant="ghost"
                        className="h-7 text-xs text-slate-400 hover:text-emerald-400 hover:bg-slate-700/60"
                      >
                        {marcando === r.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <><Undo2 className="w-3.5 h-3.5 mr-1.5" />Devuelta</>}
                      </Button>
                    </div>
                  </div>
                )}
                {r.status === "devuelta" && (
                  <div className="mt-3 pt-2.5 border-t border-slate-700/60 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-[11px] text-slate-500">Ya se regresó al proveedor.</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ProveedorAsignarRentaModal
        renta={asignando}
        open={!!asignando}
        onOpenChange={(v) => { if (!v) setAsignando(null) }}
        onAsignada={cargar}
      />
    </div>
  )
}

function Chip({ cls, children }: { cls: string; children: React.ReactNode }) {
  return <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{children}</span>
}
function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wide text-slate-600">{k}</p>
      <p className="text-[11px] text-slate-300 truncate" title={v}>{v}</p>
    </div>
  )
}
function Tarjeta({ etiqueta, valor, color, activa, onClick }: {
  etiqueta: string; valor: number; color: string; activa: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={["rounded-2xl border p-4 text-left transition-all",
        activa ? "bg-slate-800 border-slate-600 shadow-md" : "bg-slate-800/50 border-slate-700 hover:border-slate-600",
      ].join(" ")}
      style={activa ? { boxShadow: `inset 3px 0 0 ${color}` } : undefined}>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums" style={{ color: activa ? color : "#cbd5e1" }}>{valor}</p>
    </button>
  )
}
