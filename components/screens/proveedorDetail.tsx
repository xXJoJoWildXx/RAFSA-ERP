"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  AlertTriangle, ArrowLeft, Banknote, Boxes, Building2, FileText, Loader2,
  Mail, Phone, Wrench,
} from "lucide-react"
import type { AppRole as UserRoleScreen } from "@/lib/permissions"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Button } from "@/components/ui/button"
import { supabase } from "@/lib/supabaseClient"
import { useBasePath } from "@/lib/appScope"

type Proveedor = {
  id: string
  rfc: string
  razon_social: string
  nombre_comercial: string | null
  categoria: string
  contacto_nombre: string | null
  contacto_telefono: string | null
  contacto_email: string | null
  condiciones_pago: string | null
  dias_credito: number | null
  notas: string | null
  is_active: boolean
}

type Factura = {
  id: string
  folio_completo: string
  fecha: string | null
  fecha_vencimiento: string | null
  total: number
  saldo: number
  estado_pago: string
  estado_vencimiento: string
  status: string
}

type Producto = {
  id: string
  codigo: string | null
  descripcion: string
  kind: string
  unidad: string | null
  stock: number
  last_price: number | null
  avg_price: number | null
}

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

const fecha = (s: string | null) =>
  s ? new Date(s.length <= 10 ? `${s}T12:00:00` : s)
        .toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
    : "—"

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

const VENC_CLS: Record<string, string> = {
  pagada:     "bg-emerald-500/15 text-emerald-400",
  vencida:    "bg-red-500/15 text-red-400",
  vence_hoy:  "bg-amber-500/15 text-amber-400",
  por_vencer: "bg-amber-500/15 text-amber-400",
  en_tiempo:  "bg-slate-600/40 text-slate-400",
  sin_fecha:  "bg-slate-600/40 text-slate-400",
}
const VENC_TXT: Record<string, string> = {
  pagada: "Pagada", vencida: "Vencida", vence_hoy: "Vence hoy",
  por_vencer: "Por vencer", en_tiempo: "En tiempo", sin_fecha: "Sin fecha",
}

export function ProveedorDetailScreen({ allowed }: { allowed: UserRoleScreen[] }) {
  const params = useParams()
  const router = useRouter()
  const basePath = useBasePath()
  const id = String(params?.supplierId ?? "")

  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    if (!id) return
    setError(null)
    const [pRes, fRes, prRes] = await Promise.all([
      supabase.from("proveedores").select("*").eq("id", id).maybeSingle(),
      supabase.from("proveedores_facturas_pago_v").select("*")
        .eq("proveedor_id", id).order("fecha", { ascending: false }),
      supabase.from("proveedores_productos")
        .select("id, codigo, descripcion, kind, unidad, stock, last_price, avg_price")
        .eq("proveedor_id", id).order("descripcion"),
    ])
    if (pRes.error) setError(`No se pudo cargar el proveedor: ${detalle(pRes.error)}`)
    setProveedor((pRes.data as Proveedor) ?? null)
    setFacturas((fRes.data as Factura[]) ?? [])
    setProductos((prRes.data as Producto[]) ?? [])
    setCargando(false)
  }, [id])

  useEffect(() => { void cargar() }, [cargar])

  const totales = useMemo(() => ({
    comprado: facturas.reduce((s, f) => s + Number(f.total ?? 0), 0),
    saldo: facturas.filter(f => f.estado_pago !== "pagada")
                   .reduce((s, f) => s + Number(f.saldo ?? 0), 0),
    vencidas: facturas.filter(f => f.estado_vencimiento === "vencida").length,
  }), [facturas])

  const rentas = productos.filter(p => p.kind === "rental")
  const articulos = productos.filter(p => p.kind !== "rental")

  return (
    <RoleGuard allowed={allowed}>
      <AdminLayout>
        <div className="space-y-5">
          <Button variant="ghost" onClick={() => router.push(`${basePath}/proveedores`)}
            className="text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 -ml-2">
            <ArrowLeft className="w-4 h-4 mr-1.5" />Proveedores
          </Button>

          {cargando ? (
            <div className="py-20 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
          ) : !proveedor ? (
            <div className="rounded-2xl border border-slate-700 bg-slate-800 py-16 text-center">
              <Building2 className="w-7 h-7 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Este proveedor no existe o fue eliminado.</p>
            </div>
          ) : (
            <>
              {/* ── ficha ── */}
              <div className="rounded-2xl p-6"
                style={{
                  background: "linear-gradient(135deg, #0f2a4a 0%, #0a1929 50%, #0d1f35 100%)",
                  border: "1px solid rgba(1,116,189,0.2)",
                }}>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold text-white">
                      {proveedor.nombre_comercial || proveedor.razon_social}
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">{proveedor.razon_social}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{proveedor.rfc}</p>

                    <div className="flex items-center gap-4 mt-3 flex-wrap">
                      {proveedor.contacto_nombre && (
                        <span className="text-xs text-slate-400">{proveedor.contacto_nombre}</span>
                      )}
                      {proveedor.contacto_telefono && (
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-600" />{proveedor.contacto_telefono}
                        </span>
                      )}
                      {proveedor.contacto_email && (
                        <span className="text-xs text-slate-400 flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-600" />{proveedor.contacto_email}
                        </span>
                      )}
                      {proveedor.dias_credito != null && (
                        <span className="text-xs text-slate-400">{proveedor.dias_credito} días de crédito</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-700/40">
                  <Metrica etiqueta="Comprado" valor={money(totales.comprado)} />
                  <Metrica etiqueta="Saldo" valor={money(totales.saldo)}
                    color={totales.saldo > 0 ? "#f59e0b" : "#10b981"} />
                  <Metrica etiqueta="Facturas" valor={String(facturas.length)} />
                  <Metrica etiqueta="Vencidas" valor={String(totales.vencidas)}
                    color={totales.vencidas > 0 ? "#ef4444" : undefined} />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-200">{error}</p>
                </div>
              )}

              {/* ── facturas ── */}
              <Seccion titulo="Facturas" icono={FileText} vacio="Este proveedor no tiene facturas cargadas."
                hayAlgo={facturas.length > 0}>
                <div className="divide-y divide-slate-700/60">
                  {facturas.map(f => (
                    <div key={f.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-slate-200">{f.folio_completo}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium ${VENC_CLS[f.estado_vencimiento] ?? VENC_CLS.sin_fecha}`}>
                            {VENC_TXT[f.estado_vencimiento] ?? f.estado_vencimiento}
                          </span>
                          {f.status === "por_revisar" && (
                            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium bg-[#0174bd]/15 text-[#4da8e8]">
                              Por revisar
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {fecha(f.fecha)}
                          {f.fecha_vencimiento && <> · vence {fecha(f.fecha_vencimiento)}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm text-slate-200 tabular-nums">{money(f.total)}</p>
                        {Number(f.saldo) > 0 && (
                          <p className="text-[10px] text-amber-400 tabular-nums">Resta {money(f.saldo)}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>

              {/* ── lo que surte ── */}
              <Seccion titulo="Productos que surte" icono={Boxes}
                vacio="Todavía no se le ha procesado ninguna factura con productos."
                hayAlgo={articulos.length > 0}>
                <div className="divide-y divide-slate-700/60">
                  {articulos.map(p => (
                    <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 leading-snug">{p.descripcion}</p>
                        <p className="text-[10px] text-slate-500">
                          {p.codigo ?? "sin código"}{p.unidad && <> · {p.unidad}</>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-300 tabular-nums">{money(p.last_price)}</p>
                        <p className="text-[10px] text-slate-500 tabular-nums">
                          {Number(p.stock)} en almacén
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </Seccion>

              {rentas.length > 0 && (
                <Seccion titulo="Máquinas que renta" icono={Wrench} vacio="" hayAlgo>
                  <div className="divide-y divide-slate-700/60">
                    {rentas.map(p => (
                      <div key={p.id} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 leading-snug">{p.descripcion}</p>
                          <p className="text-[10px] text-slate-500">{p.codigo ?? "sin número interno"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-slate-300 tabular-nums">{money(p.last_price)}</p>
                          <p className="text-[10px] text-slate-500">por periodo</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Seccion>
              )}
            </>
          )}
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}

function Metrica({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{etiqueta}</p>
      <p className="text-lg font-semibold mt-0.5 tabular-nums" style={{ color: color ?? "#e2e8f0" }}>{valor}</p>
    </div>
  )
}

function Seccion({ titulo, icono: Icono, vacio, hayAlgo, children }: {
  titulo: string
  icono: typeof Banknote
  vacio: string
  hayAlgo: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
      <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-700 flex items-center gap-2">
        <Icono className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-xs font-semibold text-slate-300">{titulo}</p>
      </div>
      {hayAlgo ? children : <p className="py-10 text-center text-xs text-slate-500">{vacio}</p>}
    </div>
  )
}
