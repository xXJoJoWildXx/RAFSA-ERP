import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  mexicoTodayISO,
  currentOrNextOccurrence,
  upcomingOccurrences,
} from "@/lib/foraneo/bajada"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Sync de foráneos: recurrencia bimestral de la fecha de bajada.
//  - Recalcula employees.next_bajada_date / next_reingreso_date desde el rango
//    ancla (ocurrencia vigente o próxima), para que la notificación de la obra
//    siga funcionando igual.
//  - NO reparte tickets. Desde el cambio de modelo, la bajada recurrente no
//    necesita ni consume ticket: el ticket sólo se gana al DESCARTAR una
//    notificación (el trabajador no tomó esa bajada) y sólo se gasta al usar
//    una bajada extemporánea ("Utilizar").
//  Idempotente.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type EmpRow = {
  id: string
  full_name: string
  is_foraneo: boolean
  bajada_anchor_start: string | null
  bajada_anchor_end: string | null
  next_bajada_date: string | null
  next_reingreso_date: string | null
}

async function syncEmployee(emp: EmpRow, today: string) {
  const anchorStart = emp.bajada_anchor_start
  const anchorEnd = emp.bajada_anchor_end ?? emp.bajada_anchor_start

  // Sin ancla → no hay recurrencia ni tickets automáticos.
  if (!emp.is_foraneo || !anchorStart || !anchorEnd) {
    const { count } = await supabase
      .from("bajada_tickets")
      .select("id", { count: "exact", head: true })
      .eq("employee_id", emp.id)
      .eq("status", "available")
    const currentObra = await getCurrentObra(emp.id)
    return {
      employee_id: emp.id,
      next_bajada_date: emp.next_bajada_date,
      next_reingreso_date: emp.next_reingreso_date,
      balance: count ?? 0,
      current_obra: currentObra,
      upcoming: [] as { index: number; start: string; end: string }[],
    }
  }

  // 1) Ocurrencia vigente/próxima → mantener next_* fresco
  const cur = currentOrNextOccurrence(anchorStart, anchorEnd, today)
  if (emp.next_bajada_date !== cur.start || emp.next_reingreso_date !== cur.end) {
    await supabase
      .from("employees")
      .update({ next_bajada_date: cur.start, next_reingreso_date: cur.end })
      .eq("id", emp.id)
  }

  // El saldo es sólo informativo: se gana al descartar, se gasta al utilizar.
  const { count } = await supabase
    .from("bajada_tickets")
    .select("id", { count: "exact", head: true })
    .eq("employee_id", emp.id)
    .eq("status", "available")

  const currentObra = await getCurrentObra(emp.id)

  return {
    employee_id: emp.id,
    next_bajada_date: cur.start,
    next_reingreso_date: cur.end,
    balance: count ?? 0,
    current_obra: currentObra,
    upcoming: upcomingOccurrences(anchorStart, anchorEnd, today, 3),
  }
}

async function getCurrentObra(employeeId: string): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("obra_assignments")
    .select("obra_id, created_at, obras(name)")
    .eq("employee_id", employeeId)
    .is("assigned_to", null)
    .order("created_at", { ascending: false })
    .limit(1)
  const row = (data ?? [])[0] as any
  if (!row) return null
  const obra = Array.isArray(row.obras) ? row.obras[0] : row.obras
  return { id: row.obra_id, name: obra?.name ?? "Obra" }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const employeeId = body?.employeeId as string | undefined
    const obraId = body?.obraId as string | undefined
    if (!employeeId && !obraId) {
      return NextResponse.json({ error: "Falta employeeId u obraId." }, { status: 400 })
    }

    const today = mexicoTodayISO()
    const selectCols =
      "id, full_name, is_foraneo, bajada_anchor_start, bajada_anchor_end, next_bajada_date, next_reingreso_date"

    let employees: EmpRow[] = []
    if (employeeId) {
      const { data } = await supabase.from("employees").select(selectCols).eq("id", employeeId).limit(1)
      employees = (data ?? []) as EmpRow[]
    } else {
      // Foráneos con asignación activa en la obra
      const { data: asg } = await supabase
        .from("obra_assignments")
        .select("employee_id")
        .eq("obra_id", obraId as string)
        .is("assigned_to", null)
      const ids = [...new Set((asg ?? []).map((a: any) => a.employee_id))]
      if (ids.length > 0) {
        const { data } = await supabase.from("employees").select(selectCols).in("id", ids).eq("is_foraneo", true)
        employees = (data ?? []) as EmpRow[]
      }
    }

    const results = []
    for (const emp of employees) results.push(await syncEmployee(emp, today))

    return NextResponse.json({ ok: true, today, results })
  } catch (err: any) {
    console.error("POST /api/foraneo/sync error:", err)
    return NextResponse.json({ error: "Error en sync de foráneo.", message: err?.message }, { status: 500 })
  }
}
