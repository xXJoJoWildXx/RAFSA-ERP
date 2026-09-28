import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteObrasCascade } from "@/lib/serverObraDeletion"

// DELETE /api/empresas — body: { empresaIds: string[] } | { id: string }
// Elimina las empresas indicadas y TODAS sus obras (con su cascada completa).

export const runtime = "nodejs"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(req: Request) {
  try {
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

    return NextResponse.json({ ok: true, deletedEmpresas: empresaIds.length, deletedObras: obraIds.length })
  } catch (err: any) {
    console.error("DELETE /api/empresas error:", err)
    return NextResponse.json(
      { error: "No se pudieron eliminar las empresas.", details: err?.message },
      { status: 500 },
    )
  }
}
