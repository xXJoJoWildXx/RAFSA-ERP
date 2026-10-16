import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import {
  mexicoTodayISO,
  currentOrNextOccurrence,
  occurrencesUpTo,
  upcomingOccurrences,
} from "@/lib/foraneo/bajada"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Sync de foráneos: recurrencia bimestral de bajada + tickets.
//  - Recalcula employees.next_bajada_date / next_reingreso_date desde el rango
//    ancla (ocurrencia vigente o próxima), para que la notificación de la obra
//    siga funcionando igual.
//  - Siembra el ticket de "alta" (1er ticket al marcar foráneo con ancla).
//  - Acumula un ticket por cada ciclo bimestral (índice ≥ 1) ya pasado que NO
//    se confirmó como bajada recurrente (modelo "separado": confirmar la bajada
//    bimestral NO consume ticket; sólo "Utilizar" lo consume).
//  Idempotente: el ledger bajada_tickets tiene índice único (employee_id, cycle_start).
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

async function ensureTicket(employeeId: string, source: "alta" | "cycle", cycleStart: string) {
  const { data: existing } = await supabase
    .from("bajada_tickets")
    .select("id")
    .eq("employee_id", employeeId)
    .eq("cycle_start", cycleStart)
    .limit(1)
  if (existing && existing.length > 0) return
  await supabase.from("bajada_tickets").insert({
    employee_id: employeeId,
    source,
    cycle_start: cycleStart,
    status: "available",
  })
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

  // 2) Ticket de alta: exactamente uno por empleado (alineado al ancla vigente)
  const { data: altaRows } = await supabase
    .from("bajada_tickets")
    .select("id, cycle_start, status")
    .eq("employee_id", emp.id)
    .eq("source", "alta")
    .limit(1)
  const alta = (altaRows ?? [])[0] as { id: string; cycle_start: string | null; status: string } | undefined
  if (!alta) {
    await supabase.from("bajada_tickets").insert({
      employee_id: emp.id,
      source: "alta",
      cycle_start: anchorStart,
      status: "available",
    })
  } else if (alta.status === "available" && alta.cycle_start !== anchorStart) {
    // Si el ancla cambió y el ticket sigue sin usarse, lo realineamos (no se duplica)
    await supabase.from("bajada_tickets").update({ cycle_start: anchorStart }).eq("id", alta.id)
  }

  // 3) Un ticket por cada bimestre INICIADO (índice ≥ 1). El consumo (confirmar
  //    la recurrente o usar "Utilizar") se descuenta por separado del saldo, así
  //    que por cada cupo se puede confirmar la recurrente O usar la extemporánea,
  //    nunca las dos. Si un bimestre no se usa, su ticket queda disponible.
  const started = occurrencesUpTo(anchorStart, anchorEnd, today).filter((o) => o.index >= 1)
  for (const occ of started) await ensureTicket(emp.id, "cycle", occ.start)

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
