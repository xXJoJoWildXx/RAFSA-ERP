"use client"

import { AlmacenLayout } from "@/components/almacen-layout"
import { RoleGuard } from "@/lib/role-guard"
import { InventoryOrders } from "@/components/inventory-orders"

export default function AlmacenOrdenesPage() {
  return (
    <RoleGuard allowed={["almacen", "admin"]}>
      <AlmacenLayout>
        <InventoryOrders role="almacen" />
      </AlmacenLayout>
    </RoleGuard>
  )
}
