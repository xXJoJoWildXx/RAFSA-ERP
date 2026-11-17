import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteObrasCascade } from "@/lib/serverObraDeletion"
import { exigirRol } from "@/lib/apiAuth"

// DELETE /api/empresas — body: { empresaIds: string[] } | { id: string }
// Elimina las empresas indicadas y TODAS sus obras (con su cascada completa).

export const runtime = "nodejs"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(req: Request) {
  try {
    // Borra la empresa y TODAS sus obras en cascada. Con service role el
    // RLS no aplica: esta verificación es la única barrera.
    const auth = await exigirRol(["admin"])
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({} as any))
    const empresaIds: string[] = Array.isArray(body?.empresaIds)
      ? body.empresaIds.filter(Boolean)
      : body?.id
      ? [body.id]
      : []

    if (empresaIds.length === 0) {
      return NextResponse.json({ error: "No se indicaron empresas a eliminar." }, { status: 400 })
    }

    // Obras de esas empresas → cascada completa
    const { data: obras, error: obrasErr } = await admin
      .from("obras")
      .select("id")
      .in("empresa_id", empresaIds)
    if (obrasErr) {
      return NextResponse.json({ error: "No se pudieron consultar las obras.", details: obrasErr.message }, { status: 500 })
    }
    const obraIds = (obras || []).map((o: any) => o.id).filter(Boolean)

    if (obraIds.length > 0) {
      await deleteObrasCascade(admin, obraIds)
    }

    const { error: empErr } = await admin.from("empresas").delete().in("id", empresaIds)
    if (empErr) {
      return NextResponse.json({ error: "No se pudieron eliminar las empresas.", details: empErr.message }, { status: 500 })
    }

    await admin.from("activity_log").insert(
      empresaIds.map((id) => ({
        actor_user_id: auth.sesion.userId,
        actor_email: auth.sesion.email,
        event_type: "empresa.deleted",
        entity_type: "empresa",
        entity_id: id,
        entity_label: null,
        metadata: { via: "api", obras_arrastradas: obraIds.length },
      })),
    )

    return NextResponse.json({ ok: true, deletedEmpresas: empresaIds.length, deletedObras: obraIds.length })
  } catch (err: any) {
    console.error("DELETE /api/empresas error:", err)
    return NextResponse.json(
      { error: "No se pudieron eliminar las empresas.", details: err?.message },
      { status: 500 },
    )
  }
}
