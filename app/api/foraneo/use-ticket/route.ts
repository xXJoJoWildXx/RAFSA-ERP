import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { datesInRange } from "@/lib/foraneo/bajada"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Usar un ticket de bajada (viaje extraordinario, fecha distinta a la bimestral).
//  - Consume 1 ticket disponible del empleado.
//  - Crea una bajada_notifications kind='ticket' status='confirmed' en la obra actual.
//  - Marca obra_attendance status='bajada' + bajada_kind='ticket' en todo el rango.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const employeeId = body?.employeeId as string | undefined
    const obraId = body?.obraId as string | undefined
    const start = body?.start as string | undefined
    const end = (body?.end as string | undefined) || (start as string | undefined)
    const userId = (body?.userId as string | undefined) ?? null

    if (!employeeId || !obraId || !start || !end) {
      return NextResponse.json({ error: "Faltan datos (empleado, obra o fechas)." }, { status: 400 })
    }
    if (end < start) {
      return NextResponse.json({ error: "El reingreso no puede ser anterior a la salida." }, { status: 400 })
    }

    // 1) Asignación activa del empleado en la obra (bajada_notifications requiere assignment_id)
    const { data: asg } = await supabase
      .from("obra_assignments")
      .select("id")
      .eq("obra_id", obraId)
      .eq("employee_id", employeeId)
      .is("assigned_to", null)
      .order("created_at", { ascending: false })
      .limit(1)
    const assignment = (asg ?? [])[0] as { id: string } | undefined
    if (!assignment) {
      return NextResponse.json(
        { error: "El empleado no tiene una asignación activa en esa obra." },
        { status: 400 },
      )
    }

    // 2) Ticket disponible
    const { data: tickets } = await supabase
      .from("bajada_tickets")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("status", "available")
      .order("earned_at", { ascending: true })
      .limit(1)
    const ticket = (tickets ?? [])[0] as { id: string } | undefined
    if (!ticket) {
      return NextResponse.json({ error: "El empleado no tiene tickets disponibles." }, { status: 400 })
    }

    // 3) Notificación de bajada por ticket (ya confirmada)
    const nowIso = new Date().toISOString()
    const { data: notif, error: notifErr } = await supabase
      .from("bajada_notifications")
      .insert({
        obra_id: obraId,
        assignment_id: assignment.id,
        employee_id: employeeId,
        bajada_date: start,
        reingreso_date: end,
        kind: "ticket",
        status: "confirmed",
        resolved_at: nowIso,
        resolved_by: userId,
      })
      .select("id")
      .single()
    if (notifErr || !notif) {
      console.error("use-ticket notif error:", notifErr)
      return NextResponse.json({ error: "No se pudo registrar la bajada de ticket." }, { status: 500 })
    }

    // 4) Marcar asistencia 'bajada' (bajada_kind='ticket') en el rango
    const dates = datesInRange(start, end)
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
          .update({ status: "bajada", bajada_kind: "ticket" })
          .eq("id", existing[0].id)
      } else {
        await supabase.from("obra_attendance").insert({
          obra_id: obraId,
          employee_id: employeeId,
          date: dateStr,
          status: "bajada",
          bajada_kind: "ticket",
          recorded_by: userId,
        })
      }
    }

    // 5) Consumir el ticket
    await supabase
      .from("bajada_tickets")
      .update({
        status: "used",
        used_at: nowIso,
        used_by: userId,
        used_start: start,
        used_end: end,
        used_obra_id: obraId,
        used_notification_id: notif.id,
      })
      .eq("id", ticket.id)

    const { count } = await supabase
      .from("bajada_tickets")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "available")

    return NextResponse.json({ ok: true, balance: count ?? 0, notification_id: notif.id })
  } catch (err: any) {
    console.error("POST /api/foraneo/use-ticket error:", err)
    return NextResponse.json({ error: "Error al usar el ticket.", message: err?.message }, { status: 500 })
  }
}
