import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteObrasCascade } from "@/lib/serverObraDeletion"
import { exigirRol } from "@/lib/apiAuth"

// DELETE /api/obras  — body: { obraIds: string[] } | { id: string }
// Elimina por completo una o varias obras (datos, archivos, nóminas, asistencias, etc.)

export const runtime = "nodejs"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(req: Request) {
  try {
    // Esta ruta corre con service role, así que el RLS no protege nada:
    // la única barrera es ésta.
    const auth = await exigirRol(["admin"])
    if (auth.error) return auth.error

    const body = await req.json().catch(() => ({} as any))
    const obraIds: string[] = Array.isArray(body?.obraIds)
      ? body.obraIds.filter(Boolean)
      : body?.id
      ? [body.id]
      : []

    if (obraIds.length === 0) {
      return NextResponse.json({ error: "No se indicaron obras a eliminar." }, { status: 400 })
    }

    await deleteObrasCascade(admin, obraIds)

    await admin.from("activity_log").insert(
      obraIds.map((id) => ({
        actor_user_id: auth.sesion.userId,
        actor_email: auth.sesion.email,
        event_type: "obra.deleted",
        entity_type: "obra",
        entity_id: id,
        entity_label: null,
        metadata: { via: "api", en_lote: obraIds.length },
      })),
    )

    return NextResponse.json({ ok: true, deleted: obraIds.length })
  } catch (err: any) {
    console.error("DELETE /api/obras error:", err)
    return NextResponse.json(
      { error: "No se pudieron eliminar las obras.", details: err?.message },
      { status: 500 },
    )
  }
}
