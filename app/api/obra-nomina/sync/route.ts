import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

// ───────────────────────────────────────────────────────────────────────────
//  Sync de nómina semanal por obra (real, NO fiscal).
//
//  Mantiene al día un resumen financiero por semana (Jueves → Miércoles) desde
//  que inició la obra hasta la semana en curso. Calcula SIEMPRE desde
//  obra_attendance con la MISMA fórmula que nominasTab, y hace upsert en
//  obra_nominas / obra_nomina_details SOLO de las semanas que cambiaron.
//
//  Así, si se sube o corrige asistencia de una semana pasada, al volver a abrir
//  el tab (o pulsar "Actualizar") el resumen de esa semana se recalcula.
//  No depende de la nómina fiscal ni de "Generar nómina" manual.
// ───────────────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─── Helpers de fecha (todo en UTC sobre 'yyyy-mm-dd', determinista) ─────────

/** Fecha de hoy en zona horaria de México, como 'yyyy-mm-dd'. */
function mexicoTodayISO(): string {
  // en-CA produce formato YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}

/** Jueves (yyyy-mm-dd) del periodo Jue→Mié que contiene a `iso`. */
function thursdayOf(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  let diff = d.getUTCDay() - 4 // Jueves = 4
  if (diff < 0) diff += 7
  return addDays(iso, -diff)
}

/** Las 6 fechas laborales (Jue–Sáb + Lun–Mié, sin domingo) desde el week_start. */
function getWorkDates(weekStart: string): string[] {
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart + "T00:00:00Z")
    d.setUTCDate(d.getUTCDate() + i)
    if (d.getUTCDay() !== 0) out.push(d.toISOString().split("T")[0])
  }
  return out
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100
}

function nominaName(weekStart: string): string {
  return `Nomina${weekStart.replace(/-/g, "")}`
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

type AttRow = { employee_id: string; date: string; status: string; overtime_hours: number | null }
type EmpRow = {
  id: string
  full_name: string
  real_salary: number | null
  bonus_amount: number | null
  viatics_amount: number | null
  overtime_hour_cost: number | null
}
type ExistingHeader = {
  id: string
  week_start: string
  week_end: string
  total_salarios: number
  total_bonificaciones: number
  total_viaticos: number
  total_overtime: number
  total_general: number
  employee_count: number
}
type DetailRow = {
  employee_id: string
  full_name: string
  role_on_site: string | null
  days_worked: number
  days_absent: number
  days_bajada: number
  real_salary: number
  salary_paid: number
  bonus_amount: number
  viatics_amount: number
  overtime_hours: number
  overtime_rate: number
  overtime_pay: number
  total_paid: number
}
type WeekResult = {
  week_start: string
  week_end: string
  name: string
  total_salarios: number
  total_bonificaciones: number
  total_viaticos: number
  total_overtime: number
  total_general: number
  employee_count: number
  details: DetailRow[]
}

const MAX_WEEKS = 400 // salvaguarda contra datos de fecha corruptos

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const obraId = body?.obraId as string | undefined
    if (!obraId) {
      return NextResponse.json({ error: "Falta obraId." }, { status: 400 })
    }

    // 1. Obra (para fecha de inicio)
    const { data: obra, error: obraErr } = await supabase
      .from("obras")
      .select("id, name, start_date_actual, start_date_planned, created_at")
      .eq("id", obraId)
      .single()
    if (obraErr || !obra) {
      return NextResponse.json({ error: "Obra no encontrada." }, { status: 404 })
    }

    const todayISO = mexicoTodayISO()
    const currentThu = thursdayOf(todayISO)

    const startDate: string =
      (obra.start_date_actual as string | null) ||
      (obra.start_date_planned as string | null) ||
      ((obra.created_at as string) || todayISO).split("T")[0]
    let firstThu = thursdayOf(startDate)

    // 2. Encabezados ya almacenados (para hacer diff y refrescar los existentes)
    const { data: existingRaw } = await supabase
      .from("obra_nominas")
      .select("id, week_start, week_end, total_salarios, total_bonificaciones, total_viaticos, total_overtime, total_general, employee_count")
      .eq("obra_id", obraId)
    const existing = (existingRaw ?? []) as ExistingHeader[]
    const existingByWeek = new Map<string, ExistingHeader>()
    for (const h of existing) existingByWeek.set(h.week_start, h)

    // Arranca el enumerado en la más antigua entre: inicio de obra y lo ya guardado
    for (const h of existing) {
      if (h.week_start < firstThu) firstThu = thursdayOf(h.week_start)
    }

    // 3. Lista de semanas (jueves) desde firstThu hasta la semana en curso
    const weekStarts: string[] = []
    if (firstThu <= currentThu) {
      let w = firstThu
      let guard = 0
      while (w <= currentThu && guard < MAX_WEEKS) {
        weekStarts.push(w)
        w = addDays(w, 7)
        guard++
      }
    }
    // Garantiza la semana en curso aunque la obra "inicie" en el futuro
    if (!weekStarts.includes(currentThu)) weekStarts.push(currentThu)

    const rangeStart = weekStarts[0]
    const rangeEnd = addDays(weekStarts[weekStarts.length - 1], 6)

    // 4. Asistencia de todo el rango, en una sola consulta
    const { data: attRaw } = await supabase
      .from("obra_attendance")
      .select("employee_id, date, status, overtime_hours")
      .eq("obra_id", obraId)
      .gte("date", rangeStart)
      .lte("date", rangeEnd)
    const attendance = (attRaw ?? []) as AttRow[]

    // 5. Empleados referenciados + rol vigente en la obra
    const empIds = [...new Set(attendance.map((a) => a.employee_id))]
    const empById = new Map<string, EmpRow>()
    if (empIds.length > 0) {
      const { data: empsRaw } = await supabase
        .from("employees")
        .select("id, full_name, real_salary, bonus_amount, viatics_amount, overtime_hour_cost")
        .in("id", empIds)
      for (const e of (empsRaw ?? []) as EmpRow[]) empById.set(e.id, e)
    }

    const roleByEmp = new Map<string, string | null>()
    const { data: asgRaw } = await supabase
      .from("obra_assignments")
      .select("employee_id, role_on_site")
      .eq("obra_id", obraId)
      .is("assigned_to", null)
    for (const a of (asgRaw ?? []) as { employee_id: string; role_on_site: string | null }[]) {
      if (!roleByEmp.has(a.employee_id)) roleByEmp.set(a.employee_id, a.role_on_site ?? null)
    }

    // 6. Cálculo por semana
    const results: WeekResult[] = weekStarts.map((weekStart) => {
      const weekEnd = addDays(weekStart, 6)
      const workDates = getWorkDates(weekStart)
      const weekAtt = attendance.filter((a) => a.date >= weekStart && a.date <= weekEnd)
      const participants = [...new Set(weekAtt.map((a) => a.employee_id))]

      let totalSalarios = 0
      let totalBonificaciones = 0
      let totalViaticos = 0
      let totalOvertime = 0
      let totalGeneral = 0
      const details: DetailRow[] = []

      for (const empId of participants) {
        const emp = empById.get(empId)
        if (!emp) continue
        const realSalary = Number(emp.real_salary) || 0
        const bonus = Number(emp.bonus_amount) || 0
        const viatics = Number(emp.viatics_amount) || 0
        const otRate = Number(emp.overtime_hour_cost) || 0
        const empAtt = weekAtt.filter((a) => a.employee_id === empId)

        let daysWorked = 0
        let daysBajada = 0
        let daysAbsent = 0
        let overtimeHours = 0
        for (const wd of workDates) {
          const rec = empAtt.find((a) => a.date === wd)
          if (!rec || rec.status === "absent" || rec.status === "justified") {
            daysAbsent += 1
          } else if (rec.status === "present") {
            daysWorked += 1
          } else if (rec.status === "half_day") {
            daysWorked += 0.5
            daysAbsent += 0.5
          } else if (rec.status === "bajada") {
            daysWorked += 1
            daysBajada += 1
          }
          if (rec) overtimeHours += Number(rec.overtime_hours) || 0
        }

        const salaryPaid =
          daysAbsent === 0 ? realSalary : round2(realSalary - (realSalary / 7) * daysAbsent)
        const overtimePay = round2(overtimeHours * otRate)
        const total = round2(salaryPaid + bonus + viatics + overtimePay)

        totalSalarios += salaryPaid
        totalBonificaciones += bonus
        totalViaticos += viatics
        totalOvertime += overtimePay
        totalGeneral += total

        details.push({
          employee_id: empId,
          full_name: emp.full_name ?? "Sin nombre",
          role_on_site: roleByEmp.get(empId) ?? null,
          days_worked: daysWorked,
          days_absent: daysAbsent,
          days_bajada: daysBajada,
          real_salary: realSalary,
          salary_paid: salaryPaid,
          bonus_amount: bonus,
          viatics_amount: viatics,
          overtime_hours: overtimeHours,
          overtime_rate: otRate,
          overtime_pay: overtimePay,
          total_paid: total,
        })
      }

      details.sort((a, b) => a.full_name.localeCompare(b.full_name))

      return {
        week_start: weekStart,
        week_end: weekEnd,
        name: nominaName(weekStart),
        total_salarios: round2(totalSalarios),
        total_bonificaciones: round2(totalBonificaciones),
        total_viaticos: round2(totalViaticos),
        total_overtime: round2(totalOvertime),
        total_general: round2(totalGeneral),
        employee_count: participants.length,
        details,
      }
    })

    // 7. Upsert SOLO de semanas cambiadas (o nuevas con actividad / en curso)
    let written = 0
    for (const r of results) {
      const prev = existingByWeek.get(r.week_start)
      const isCurrent = r.week_start === currentThu

      // No crear filas vacías para semanas viejas sin actividad (evita ruido);
      // sí se crea la semana en curso y se actualiza cualquier fila ya existente.
      if (!prev && r.employee_count === 0 && !isCurrent) continue

      const headerFields = {
        obra_id: obraId,
        week_start: r.week_start,
        week_end: r.week_end,
        name: r.name,
        total_salarios: r.total_salarios,
        total_bonificaciones: r.total_bonificaciones,
        total_viaticos: r.total_viaticos,
        total_overtime: r.total_overtime,
        total_general: r.total_general,
        employee_count: r.employee_count,
        pdf_object_path: null, // el PDF se genera al descargar
        generated_by: null,
      }

      const unchanged =
        prev &&
        round2(prev.total_salarios) === r.total_salarios &&
        round2(prev.total_bonificaciones) === r.total_bonificaciones &&
        round2(prev.total_viaticos) === r.total_viaticos &&
        round2(prev.total_overtime) === r.total_overtime &&
        round2(prev.total_general) === r.total_general &&
        Number(prev.employee_count) === r.employee_count &&
        prev.week_end === r.week_end

      if (unchanged) continue

      let nominaId: string | null = prev?.id ?? null
      if (prev) {
        await supabase.from("obra_nominas").update(headerFields).eq("id", prev.id)
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("obra_nominas")
          .insert(headerFields)
          .select("id")
          .single()
        if (insErr || !ins) {
          console.error("insert obra_nominas error:", insErr)
          continue
        }
        nominaId = (ins as { id: string }).id
      }

      if (!nominaId) continue

      // Reemplaza los detalles de la semana
      await supabase.from("obra_nomina_details").delete().eq("nomina_id", nominaId)
      if (r.details.length > 0) {
        const rows = r.details.map((d) => ({ ...d, nomina_id: nominaId }))
        await supabase.from("obra_nomina_details").insert(rows)
      }
      written++
    }

    // 8. Devolver la lista fresca (desc), marcando la semana en curso
    const { data: freshRaw } = await supabase
      .from("obra_nominas")
      .select("*")
      .eq("obra_id", obraId)
      .order("week_start", { ascending: false })
    const nominas = (freshRaw ?? []).map((n: any) => ({
      ...n,
      is_current: n.week_start === currentThu,
    }))

    return NextResponse.json({
      ok: true,
      obra_name: obra.name,
      current_week_start: currentThu,
      weeks_written: written,
      nominas,
    })
  } catch (err: any) {
    console.error("POST /api/obra-nomina/sync error:", err)
    return NextResponse.json(
      { error: "Error inesperado en sync de nómina.", message: err?.message },
      { status: 500 },
    )
  }
}
