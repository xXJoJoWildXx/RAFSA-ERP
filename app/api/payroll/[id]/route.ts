// app/api/payroll/[id]/route.ts
// GET    → detalle (run + lines)
// PATCH  → actualiza estado de la corrida (p.ej. "paid") o marca líneas pagadas
// DELETE → elimina la corrida (las líneas caen por ON DELETE CASCADE)

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

/* eslint-disable @typescript-eslint/no-explicit-any */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const { data: run, error: runErr } = await admin.from("payroll_runs").select("*").eq("id", id).single()
    if (runErr || !run)
      return NextResponse.json({ error: "Corrida no encontrada." }, { status: 404 })

    const { data: lines } = await admin
      .from("payroll_run_lines")
      .select("*")
      .eq("run_id", id)
      .order("departamento_raw", { ascending: true })

    return NextResponse.json({ run, lines: lines ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: "Error al cargar la corrida.", details: err?.message }, { status: 500 })
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({} as any))

    if (body?.status) {
      const allowed = ["draft", "reconciled", "paid"]
      if (!allowed.includes(body.status))
        return NextResponse.json({ error: "Estado no válido." }, { status: 400 })
      const { error } = await admin
        .from("payroll_runs")
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq("id", id)
      if (error)
        return NextResponse.json({ error: "No se pudo actualizar el estado.", details: error.message }, { status: 500 })
      // al marcar pagada, marca todas las líneas pagadas
      if (body.status === "paid") await admin.from("payroll_run_lines").update({ paid: true }).eq("run_id", id)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: "Error al actualizar.", details: err?.message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const { error } = await admin.from("payroll_runs").delete().eq("id", id)
    if (error)
      return NextResponse.json({ error: "No se pudo eliminar la corrida.", details: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: "Error al eliminar.", details: err?.message }, { status: 500 })
  }
}
