// Borrado definitivo de una orden de inventario.
//
// "Cancelar orden" ya no deja un estado 'cancelled' colgando: elimina la orden
// y todo lo que cuelga de ella. Va por API con service role porque hay que
// borrar también los archivos de facturas del bucket privado, lo que el
// cliente con llave anónima no puede hacer.

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ orderId: string }> },
) {
  try {
    const { orderId } = await ctx.params
    if (!orderId) {
      return NextResponse.json({ error: "Falta el id de la orden." }, { status: 400 })
    }

    // ── Quién pide el borrado ──
    // Un borrado definitivo no se deja abierto: sólo admin, o el almacenista
    // que creó la orden.
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "")
    if (!token) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 })
    }
    const { data: userData, error: userErr } = await admin.auth.getUser(token)
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Sesión inválida." }, { status: 401 })
    }
    const callerId = userData.user.id

    const { data: appUser } = await admin
      .from("app_users")
      .select("role, is_active")
      .eq("id", callerId)
      .single()
    if (!appUser || appUser.is_active === false) {
      return NextResponse.json({ error: "Cuenta sin acceso." }, { status: 403 })
    }

    const { data: order, error: orderErr } = await admin
      .from("inventory_orders")
      .select("id, folio, created_by")
      .eq("id", orderId)
      .single()
    if (orderErr || !order) {
      return NextResponse.json({ error: "La orden no existe." }, { status: 404 })
    }

    const esAdmin = String(appUser.role || "").toLowerCase() === "admin"
    if (!esAdmin && order.created_by !== callerId) {
      return NextResponse.json(
        { error: "Sólo un admin o quien creó la orden puede eliminarla." },
        { status: 403 },
      )
    }

    // ── 1) Archivos de las facturas en Storage ──
    const { data: invoices } = await admin
      .from("inventory_order_invoices")
      .select("id, bucket, object_path")
      .eq("order_id", orderId)

    const porBucket = new Map<string, string[]>()
    for (const inv of (invoices || []) as any[]) {
      if (!inv.bucket || !inv.object_path) continue
      const arr = porBucket.get(inv.bucket) || []
      arr.push(inv.object_path)
      porBucket.set(inv.bucket, arr)
    }
    for (const [bucket, paths] of porBucket) {
      const { error: rmErr } = await admin.storage.from(bucket).remove(paths)
      // Un archivo que ya no está no debe frenar el borrado de la orden
      if (rmErr) console.error("[inventory-orders DELETE] storage:", bucket, rmErr.message)
    }

    // ── 2) Hijos y después la orden (explícito, sin depender del ON DELETE) ──
    const { error: invErr } = await admin
      .from("inventory_order_invoices")
      .delete()
      .eq("order_id", orderId)
    if (invErr) throw new Error(`facturas: ${invErr.message}`)

    const { error: itemsErr } = await admin
      .from("inventory_order_items")
      .delete()
      .eq("order_id", orderId)
    if (itemsErr) throw new Error(`partidas: ${itemsErr.message}`)

    const { error: delErr } = await admin
      .from("inventory_orders")
      .delete()
      .eq("id", orderId)
    if (delErr) throw new Error(`orden: ${delErr.message}`)

    return NextResponse.json({ ok: true, folio: order.folio })
  } catch (err: any) {
    console.error("DELETE /api/inventory-orders/[orderId] error:", err)
    return NextResponse.json(
      { error: "No se pudo eliminar la orden.", details: err?.message },
      { status: 500 },
    )
  }
}
