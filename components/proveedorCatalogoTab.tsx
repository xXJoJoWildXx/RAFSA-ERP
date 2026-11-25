"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertTriangle, Boxes, Loader2, PackageX, Search, TrendingDown, TrendingUp,
} from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { useRealtimeRefresco, TABLAS_PROVEEDORES } from "@/lib/useRealtimeRefresco"

type Producto = {
  id: string
  proveedor_id: string
  codigo: string | null
  descripcion: string
  kind: "product" | "rental" | "service"
  unidad: string | null
  stock: number
  ubicacion: string | null
  last_price: number | null
  avg_price: number | null
  last_purchase_at: string | null
  is_active: boolean
  proveedores: { razon_social: string; nombre_comercial: string | null } | null
}

const money = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)

const cantidad = (n: number) =>
  new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 }).format(n ?? 0)

const fecha = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "2-digit" }) : "—"

const detalle = (e: any) =>
  [e?.message, e?.details, e?.hint, e?.code].filter(Boolean).join(" · ") || String(e)

type Filtro = "todos" | "con_stock" | "sin_stock"

export function ProveedorCatalogoTab() {
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busca, setBusca] = useState("")
  const [filtro, setFiltro] = useState<Filtro>("todos")

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error } = await supabase
      .from("proveedores_productos")
      .select("id, proveedor_id, codigo, descripcion, kind, unidad, stock, ubicacion, last_price, avg_price, last_purchase_at, is_active, proveedores(razon_social, nombre_comercial)")
      .eq("kind", "product")
      .order("descripcion")
    if (error) setError(`No se pudo cargar el catálogo: ${detalle(error)}`)
    setProductos((data as unknown as Producto[]) ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { void cargar() }, [cargar])

  /* Varias personas trabajan Proveedores a la vez. Esto vuelve a
     consultar en cuanto alguien más registra un pago, procesa una
     factura o manda material, sin esperar a que se recargue. */
  useRealtimeRefresco("proveedores-catalogo", TABLAS_PROVEEDORES.catalogo, cargar)

  const conteos = useMemo(() => ({
    todos:     productos.length,
    con_stock: productos.filter(p => Number(p.stock) > 0).length,
    sin_stock: productos.filter(p => Number(p.stock) <= 0).length,
  }), [productos])

  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return productos.filter(p => {
      if (filtro === "con_stock" && !(Number(p.stock) > 0)) return false
      if (filtro === "sin_stock" && !(Number(p.stock) <= 0)) return false
      if (!q) return true
      return [p.descripcion, p.codigo, p.proveedores?.razon_social]
        .filter(Boolean).some(v => (v as string).toLowerCase().includes(q))
    })
  }, [productos, busca, filtro])

  const valorInventario = useMemo(
    () => productos.reduce((s, p) => s + Number(p.stock ?? 0) * Number(p.avg_price ?? p.last_price ?? 0), 0),
    [productos])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Catálogo y existencias</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Se arma solo al procesar facturas. Valor del inventario:{" "}
          <span className="text-slate-300 font-medium tabular-nums">{money(valorInventario)}</span>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Tarjeta activa={filtro === "todos"} onClick={() => setFiltro("todos")}
          etiqueta="Productos" valor={conteos.todos} color="#0174bd" />
        <Tarjeta activa={filtro === "con_stock"} onClick={() => setFiltro("con_stock")}
          etiqueta="Con existencia" valor={conteos.con_stock} color="#10b981" />
        <Tarjeta activa={filtro === "sin_stock"} onClick={() => setFiltro("sin_stock")}
          etiqueta="Sin existencia" valor={conteos.sin_stock} color="#ef4444" />
      </div>

      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por descripción, código o proveedor…"
          className="w-full rounded-lg bg-slate-800 border border-slate-700 pl-9 pr-3 py-2 text-sm
                     text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0174bd]/50" />
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-200">{error}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800 overflow-hidden">
        {cargando ? (
          <div className="py-14 text-center"><Loader2 className="w-5 h-5 animate-spin text-slate-500 mx-auto" /></div>
        ) : visibles.length === 0 ? (
          <div className="py-14 text-center">
            <PackageX className="w-7 h-7 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {productos.length === 0
                ? "El catálogo está vacío. Procesa una factura y los productos aparecen solos."
                : "Ningún producto coincide con el filtro."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-900/60 border-b border-slate-700 text-left">
                  <Th>Producto</Th>
                  <Th>Proveedor</Th>
                  <Th className="text-right">Existencia</Th>
                  <Th className="text-right">Último precio</Th>
                  <Th className="text-right">Promedio</Th>
                  <Th className="text-right">Última compra</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/60">
                {visibles.map(p => {
                  const stock = Number(p.stock ?? 0)
                  const sin = stock <= 0
                  const sube = p.last_price != null && p.avg_price != null
                    && Number(p.last_price) > Number(p.avg_price) * 1.02
                  const baja = p.last_price != null && p.avg_price != null
                    && Number(p.last_price) < Number(p.avg_price) * 0.98

                  return (
                    <tr key={p.id} className="hover:bg-slate-700/20 transition-colors">
                      <Td>
                        <p className="text-slate-200 leading-snug">{p.descripcion}</p>
                        <p className="text-[10px] text-slate-500">
                          {p.codigo ?? "sin código"}{p.unidad && <> · {p.unidad}</>}
                          {p.ubicacion && <> · {p.ubicacion}</>}
                        </p>
                      </Td>
                      <Td className="text-xs text-slate-400">
                        {p.proveedores?.nombre_comercial || p.proveedores?.razon_social || "—"}
                      </Td>
                      <Td className="text-right">
                        <span className={`tabular-nums font-medium ${sin ? "text-red-400" : "text-slate-200"}`}>
                          {cantidad(stock)}
                        </span>
                      </Td>
                      <Td className="text-right">
                        <span className="tabular-nums text-slate-300 inline-flex items-center gap-1">
                          {sube && <TrendingUp className="w-3 h-3 text-red-400" />}
                          {baja && <TrendingDown className="w-3 h-3 text-emerald-400" />}
                          {money(p.last_price)}
                        </span>
                      </Td>
                      <Td className="text-right tabular-nums text-slate-400">{money(p.avg_price)}</Td>
                      <Td className="text-right text-xs text-slate-500">{fecha(p.last_purchase_at)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
        <Boxes className="w-3 h-3" />
        El promedio está ponderado por cantidad: comprar 300 piezas a $165 pesa más que comprar 1 a $500.
        La flecha compara el último precio contra ese promedio.
      </p>
    </div>
  )
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-2 text-[10px] uppercase tracking-wide text-slate-500 font-medium ${className}`}>{children}</th>
}
function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>
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
