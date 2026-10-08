"use client"

import Link from "next/link"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { InventoryOrders } from "@/components/inventory-orders"
import { Package, ClipboardList } from "lucide-react"

export default function AdminInventarioOrdenesPage() {
  return (
    <RoleGuard allowed={["admin"]}>
      <AdminLayout>
        <InventoryOrders
          role="admin"
          headerRight={
            <div className="flex items-center rounded-lg border border-slate-700 overflow-hidden">
              <Link href="/admin/inventario" className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-700 flex items-center gap-1.5">
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
