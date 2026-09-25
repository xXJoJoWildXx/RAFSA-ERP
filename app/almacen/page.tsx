"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { AlmacenLayout } from "@/components/almacen-layout"
import { RoleGuard } from "@/lib/role-guard"
import { useAuth } from "@/lib/auth-context"
import { supabase } from "@/lib/supabaseClient"
import { Badge } from "@/components/ui/badge"
import {
  Package, ClipboardList, AlertTriangle, BoxIcon, CalendarClock, ArrowRight,
  PackagePlus, Truck, Loader2,
} from "lucide-react"
import {
  InventoryProduct, InventoryOrder,
  formatDate, daysUntil, orderTypeBadge, orderStatusBadge,
} from "@/lib/inventory"

type OrderRow = InventoryOrder & { obra_name?: string | null }

export default function AlmacenDashboard() {
  const { user } = useAuth()
  const [pendingOrders, setPendingOrders] = useState<OrderRow[]>([])
  const [lowStock, setLowStock] = useState<InventoryProduct[]>([])
  const [priceSoon, setPriceSoon] = useState<{ id: string; descripcion: string; codigo: string; price_valid_until: string }[]>([])
  const [counts, setCounts] = useState({ products: 0, units: 0, pending: 0 })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: orders }, { data: products }, { data: notifs }] = await Promise.all([
      supabase.from("inventory_orders").select("*, obras(name)").in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }),
      supabase.from("inventory_products").select("*").eq("is_active", true),
      supabase.from("inventory_price_notifications").select("id, price_valid_until, inventory_products(id, descripcion, codigo)").eq("status", "pending").order("price_valid_until"),
    ])
    const prods = (products ?? []) as InventoryProduct[]
    setPendingOrders((orders ?? []).map((o: any) => ({ ...o, obra_name: o.obras?.name ?? null })))
    setLowStock(prods.filter((p) => p.stock <= p.stock_min).sort((a, b) => Number(a.stock) - Number(b.stock)).slice(0, 8))
    setPriceSoon((notifs ?? []).map((n: any) => ({ id: n.id, price_valid_until: n.price_valid_until, descripcion: n.inventory_products?.descripcion ?? "", codigo: n.inventory_products?.codigo ?? "" })))
    setCounts({
      products: prods.length,
      units: prods.reduce((s, p) => s + Number(p.stock), 0),
      pending: (orders ?? []).length,
    })
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const firstName = (user?.display_name || user?.email || "").split(/[\s@.]/)[0]

  return (
    <RoleGuard allowed={["almacen", "admin"]}>
      <AlmacenLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Hola{firstName ? `, ${firstName}` : ""} 👋</h1>
            <p className="text-sm text-slate-500 mt-1">Resumen del almacén</p>
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Artículos", value: counts.products, icon: Package, color: "#4da8e8", bg: "rgba(1,116,189,0.12)", href: "/almacen/inventario" },
              { label: "Unidades en stock", value: counts.units.toLocaleString("es-MX"), icon: BoxIcon, color: "#10b981", bg: "rgba(16,185,129,0.12)", href: "/almacen/inventario" },
              { label: "Órdenes pendientes", value: counts.pending, icon: ClipboardList, color: "#f59e0b", bg: "rgba(245,158,11,0.12)", href: "/almacen/ordenes" },
              { label: "Precios por caducar", value: priceSoon.length, icon: CalendarClock, color: "#ef4444", bg: "rgba(239,68,68,0.12)", href: "/almacen/inventario" },
            ].map((kpi) => {
              const Icon = kpi.icon
              return (
                <Link key={kpi.label} href={kpi.href} className="rounded-xl border border-slate-700/60 bg-slate-800/50 hover:border-slate-600 p-4 transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: kpi.bg }}><Icon className="w-[18px] h-[18px]" style={{ color: kpi.color }} /></div>
                    <div className="min-w-0"><p className="text-[11px] font-medium text-slate-500 truncate">{kpi.label}</p><p className="text-lg font-bold text-slate-100">{kpi.value}</p></div>
                  </div>
                </Link>
              )
            })}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando…</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Pending orders */}
              <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-[#4da8e8]" /> Órdenes por atender</h2>
                  <Link href="/almacen/ordenes" className="text-xs text-[#4da8e8] hover:underline flex items-center gap-1">Ver todas <ArrowRight className="w-3 h-3" /></Link>
                </div>
                <div className="space-y-2">
                  {pendingOrders.length === 0 && <p className="text-xs text-slate-500 py-4 text-center">No hay órdenes pendientes 🎉</p>}
                  {pendingOrders.slice(0, 6).map((o) => {
                    const tb = orderTypeBadge(o.type), sb = orderStatusBadge(o.status)
                    return (
                      <Link key={o.id} href="/almacen/ordenes" className="flex items-center gap-3 rounded-lg border border-slate-700/60 bg-slate-700/20 hover:bg-slate-700/40 p-3 transition-colors">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: o.type === "restock" ? "rgba(16,185,129,0.12)" : "rgba(139,92,246,0.12)" }}>
                          {o.type === "restock" ? <PackagePlus className="w-4 h-4 text-emerald-400" /> : <Truck className="w-4 h-4 text-violet-400" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-200 font-mono">{o.folio}</p>
                          <p className="text-[10px] text-slate-500 truncate">{o.type === "dispatch" ? (o.obra_name ?? "—") : (o.supplier_name ?? "Reabasto")} · {formatDate(o.created_at)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <Badge className={`text-[9px] border ${tb.cls}`}>{tb.label}</Badge>
                          <Badge className={`text-[9px] border ${sb.cls}`}>{sb.label}</Badge>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>

              {/* Alerts: low stock + price expiry */}
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4"><AlertTriangle className="w-4 h-4 text-amber-400" /> Stock bajo / agotado</h2>
                  <div className="space-y-2">
                    {lowStock.length === 0 && <p className="text-xs text-slate-500 py-2 text-center">Todo el stock está por encima del mínimo.</p>}
                    {lowStock.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-slate-300 truncate">{p.descripcion}</span>
                        <span className={`font-bold shrink-0 ${p.stock <= 0 ? "text-red-400" : "text-amber-400"}`}>{Number(p.stock)} / mín {Number(p.stock_min)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-5">
                  <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-4"><CalendarClock className="w-4 h-4 text-red-400" /> Precios por caducar</h2>
                  <div className="space-y-2">
                    {priceSoon.length === 0 && <p className="text-xs text-slate-500 py-2 text-center">Sin precios próximos a caducar.</p>}
                    {priceSoon.slice(0, 6).map((p) => {
                      const d = daysUntil(p.price_valid_until)
                      return (
                        <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-slate-300 truncate">{p.descripcion} <span className="font-mono text-[10px] text-[#4da8e8]">{p.codigo}</span></span>
                          <span className="text-red-400 font-semibold shrink-0">{formatDate(p.price_valid_until)} {d !== null && `(${d < 0 ? "vencido" : d + "d"})`}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </AlmacenLayout>
    </RoleGuard>
  )
}
