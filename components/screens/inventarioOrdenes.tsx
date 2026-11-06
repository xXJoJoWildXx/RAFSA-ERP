"use client"

import type { AppRole as UserRoleScreen } from "@/lib/permissions"
import { useBasePath } from "@/lib/appScope"

import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { InventoryOrders } from "@/components/inventory-orders"
import { useAuth } from "@/lib/auth-context"
import { Package, ClipboardList } from "lucide-react"

export function InventarioOrdenesScreen({ allowed }: { allowed: UserRoleScreen[] }) {
  const basePath = useBasePath()
  const { user } = useAuth()
  // El rol real importa: queda guardado en created_by_role de cada orden y
  // decide quién puede cancelarla.
  const rolDeOrdenes = user?.role === "almacen" ? "almacen" : user?.role === "user" ? "user" : "admin"
  return (
    <RoleGuard allowed={allowed}>
      <AdminLayout>
        <InventoryOrders
          role={rolDeOrdenes}
          headerRight={
            <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden">
              <Link href={`${basePath}/inventario`} className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5" /> Catálogo
              </Link>
              <span className="px-3 py-1.5 text-xs font-semibold bg-[#0174bd]/15 text-[#4da8e8] flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5" /> Órdenes
              </span>
            </div>
          }
        />
      </AdminLayout>
    </RoleGuard>
  )
}
