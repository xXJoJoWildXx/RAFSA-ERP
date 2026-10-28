import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Descartar la bajada RECURRENTE: el trabajador no la va a tomar.
//
//  Ese viaje no se pierde, se guarda: descartar OTORGA un ticket de bajada
//  que el trabajador puede usar después en una fecha extemporánea
//  ("Utilizar", ver /api/foraneo/use-ticket).
//
//  La siguiente ocurrencia llega sola dos meses después por la recurrencia
//  del rango ancla. Si se confirma, no gasta nada y el ticket sigue guardado;
//  si se vuelve a descartar, se acumula otro.
//
//  Idempotente: el índice único (employee_id, cycle_start) impide otorgar dos
//  tickets por la misma fecha de bajada.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const notificationId = body?.notificationId as string | undefined
    const employeeId = body?.employeeId as string | undefined
    const start = body?.start as string | undefined
    const userId = (body?.userId as string | undefined) ?? null

    if (!notificationId || !employeeId || !start) {
      return NextResponse.json(
        { error: "Faltan datos para descartar la bajada." },
        { status: 400 },
      )
    }

    // 1) Marcar la notificación como descartada
    const { error: notifErr } = await supabase
      .from("bajada_notifications")
      .update({
        status: "dismissed",
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
      })
      .eq("id", notificationId)

    if (notifErr) {
      console.error("dismiss-bajada notif error:", notifErr)
      return NextResponse.json({ error: "No se pudo descartar la bajada." }, { status: 500 })
    }

    // 2) Otorgar el ticket de esa bajada no tomada, si no existe ya
    const { data: existing } = await supabase
      .from("bajada_tickets")
      .select("id")
      .eq("employee_id", employeeId)
      .eq("cycle_start", start)
      .limit(1)

    let granted = false
    if (!existing || existing.length === 0) {
      const { error: ticketErr } = await supabase.from("bajada_tickets").insert({
        employee_id: employeeId,
        source: "dismissed",
        cycle_start: start,
        status: "available",
        note: "Bajada descartada: el trabajador no la tomó",
      })
      // Una violación de unicidad aquí significa que otro clic simultáneo ya
      // otorgó el ticket: no es un error que deba ver el usuario.
      if (ticketErr && ticketErr.code !== "23505") {
        console.error("dismiss-bajada ticket error:", ticketErr)
      } else if (!ticketErr) {
        granted = true
      }
    }

    const { count } = await supabase
      .from("bajada_tickets")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", employeeId)
      .eq("status", "available")

    return NextResponse.json({ ok: true, granted, balance: count ?? 0 })
  } catch (err: any) {
    console.error("POST /api/foraneo/dismiss-bajada error:", err)
    return NextResponse.json(
      { error: "Error al descartar la bajada.", message: err?.message },
      { status: 500 },
    )
  }
}
