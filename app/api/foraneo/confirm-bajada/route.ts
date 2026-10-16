import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { datesInRange } from "@/lib/foraneo/bajada"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Confirmar la bajada RECURRENTE (bimestral). Consume un ticket de bajada.
//  - Si el empleado NO tiene tickets disponibles (p. ej. ya usó una bajada
//    extemporánea de ese cupo) → 409 { error: "no_tickets" } y NO confirma.
//  - Si hay ticket: lo consume, confirma la notificación y marca asistencia
//    'bajada' (bajada_kind='recurrente') en todo el rango.
//  Así, por cada cupo, se puede confirmar la recurrente O usar la extemporánea,
//  nunca las dos.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const notificationId = body?.notificationId as string | undefined
    const obraId = body?.obraId as string | undefined
    const employeeId = body?.employeeId as string | undefined
    const start = body?.start as string | undefined
    const end = (body?.end as string | undefined) || start
    const userId = (body?.userId as string | undefined) ?? null

    if (!notificationId || !obraId || !employeeId || !start) {
      return NextResponse.json({ error: "Faltan datos para confirmar la bajada." }, { status: 400 })
    }

    // 1) Ticket disponible (si ya se gastó en una extemporánea, no hay)
    const { data: tickets } = await supabase
      .from("bajada_tickets")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("status", "available")
      .order("earned_at", { ascending: true })
      .limit(1)
    const ticket = (tickets ?? [])[0] as { id: string } | undefined
    if (!ticket) {
      return NextResponse.json({ error: "no_tickets" }, { status: 409 })
    }

    // 2) Consumir el ticket (atado a esta confirmación recurrente)
    await supabase
      .from("bajada_tickets")
      .update({
        status: "used",
        used_at: new Date().toISOString(),
        used_by: userId,
        used_start: start,
        used_end: end,
        used_obra_id: obraId,
        used_notification_id: notificationId,
        note: "recurrente",
      })
      .eq("id", ticket.id)

    // 3) Confirmar la notificación
    await supabase
      .from("bajada_notifications")
      .update({ status: "confirmed", resolved_at: new Date().toISOString(), resolved_by: userId })
      .eq("id", notificationId)

    // 4) Marcar asistencia 'bajada' (recurrente) en todo el rango
    const dates = datesInRange(start, end as string)
    for (const dateStr of dates) {
      const { data: existing } = await supabase
        .from("obra_attendance")
        .select("id")
        .eq("obra_id", obraId)
        .eq("employee_id", employeeId)
        .eq("date", dateStr)
        .limit(1)
      if (existing && existing.length > 0) {
        await supabase
          .from("obra_attendance")
          .update({ status: "bajada", bajada_kind: "recurrente" })
          .eq("id", existing[0].id)
      } else {
        await supabase.from("obra_attendance").insert({
          obra_id: obraId,
          employee_id: employeeId,
          date: dateStr,
          status: "bajada",
          bajada_kind: "recurrente",
          recorded_by: userId,
        })
      }
    }

    const { count } = await supabase
      .from("bajada_tickets")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "available")

    return NextResponse.json({ ok: true, balance: count ?? 0 })
  } catch (err: any) {
    console.error("POST /api/foraneo/confirm-bajada error:", err)
    return NextResponse.json({ error: "Error al confirmar la bajada.", message: err?.message }, { status: 500 })
  }
}
