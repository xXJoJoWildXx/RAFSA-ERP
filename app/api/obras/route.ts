import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { deleteObrasCascade } from "@/lib/serverObraDeletion"

// DELETE /api/obras  — body: { obraIds: string[] } | { id: string }
// Elimina por completo una o varias obras (datos, archivos, nóminas, asistencias, etc.)

export const runtime = "nodejs"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(req: Request) {
  try {
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
    return NextResponse.json({ ok: true, deleted: obraIds.length })
  } catch (err: any) {
    console.error("DELETE /api/obras error:", err)
    return NextResponse.json(
      { error: "No se pudieron eliminar las obras.", details: err?.message },
      { status: 500 },
    )
  }
}
