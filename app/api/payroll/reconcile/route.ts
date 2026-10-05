// app/api/payroll/reconcile/route.ts
// Concilia el documento fiscal (CONTPAQi) contra el sueldo real de la semana.
// El sueldo real se calcula DIRECTAMENTE de obra_attendance + sueldos del empleado
// (misma fórmula que nominasTab), de forma INDEPENDIENTE a si ya se generó o no la
// nómina de la obra. Sube el archivo al bucket, parsea, empata por código y calcula
// el efectivo. Devuelve un PREVIEW (no guarda nada todavía).

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseContpaqi, normalizeCode } from "@/lib/payroll/contpaqi"
import { getWorkDatesFromWeekStart } from "@/lib/payroll/weeks"
import type { ReconLine, ReconResult, ReconStatus } from "@/lib/payroll/types"

export const runtime = "nodejs"

/* eslint-disable @typescript-eslint/no-explicit-any */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const round2 = (n: number) => Math.round(n * 100) / 100

type RealInfo = { total: number; obras: Set<string>; daysAbsent: number }

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const weekStart = String(form.get("week_start") || "")
    const weekEnd = String(form.get("week_end") || "")
    const reusePath = String(form.get("source_object_path") || "")

    if (!weekStart || !weekEnd)
      return NextResponse.json({ error: "Falta la semana (week_start / week_end)." }, { status: 400 })
    if (!file && !reusePath)
      return NextResponse.json({ error: "No se recibió el archivo." }, { status: 400 })

    // Archivo nuevo o reutilizar el ya subido en el bucket
    let buffer: Buffer
    let fileName: string
    if (file) {
      buffer = Buffer.from(await file.arrayBuffer())
      fileName = file.name || "nomina.xlsx"
    } else {
      const { data: dl, error: dlErr } = await admin.storage.from("payroll-files").download(reusePath)
      if (dlErr || !dl)
        return NextResponse.json(
          { error: "No se pudo recuperar el archivo subido.", details: dlErr?.message },
          { status: 404 },
        )
      buffer = Buffer.from(await dl.arrayBuffer())
      fileName = reusePath.split("/").pop() || "nomina.xlsx"
    }

    // ── 1) Parsear el documento ──
    let parsed
    try {
      parsed = await parseContpaqi(buffer)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "No se pudo leer el archivo de nómina." },
        { status: 422 },
      )
    }

    // ── 2) Subir el archivo al bucket (evidencia) — solo si es archivo nuevo ──
    let sourceObjectPath: string | null = reusePath || null
    if (file) {
      try {
        const safeName = fileName.replace(/[^\w.\-]+/g, "_")
        const path = `${weekStart}/${Date.now()}_${safeName}`
        const { error: upErr } = await admin.storage
          .from("payroll-files")
          .upload(path, buffer, {
            contentType:
              file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            upsert: true,
          })
        if (!upErr) sourceObjectPath = path
        else console.error("[payroll/reconcile] upload:", upErr.message)
      } catch (e) {
        console.error("[payroll/reconcile] upload ex:", e)
      }
    }

    // ── 3) Empleados (empate por código + datos bancarios + sueldos) ──
    const { data: empData, error: empErr } = await admin
      .from("employees")
      .select(
        "id, full_name, payroll_code, bank_name, account_number, interbank_clabe, real_salary, bonus_amount, viatics_amount, overtime_hour_cost",
      )
    if (empErr)
      return NextResponse.json(
        { error: "No se pudieron cargar los empleados.", details: empErr.message },
        { status: 500 },
      )
    const empById = new Map<string, any>()
    const empByCode = new Map<string, any>()
    for (const e of empData || []) {
      empById.set(e.id, e)
      const key = normalizeCode(e.payroll_code)
      if (key) empByCode.set(key, e)
    }

    // ── 4) Sueldo real de la semana desde ASISTENCIA (independiente de la nómina) ──
    const workDates = getWorkDatesFromWeekStart(weekStart)
    const { data: attData } = await admin
      .from("obra_attendance")
      .select("employee_id, obra_id, date, status, overtime_hours")
      .gte("date", weekStart)
      .lte("date", weekEnd)

    // Nombres de obra para las obras con asistencia
    const obraIds = Array.from(new Set((attData || []).map((a: any) => a.obra_id).filter(Boolean)))
    const obraNameById = new Map<string, string>()
    if (obraIds.length) {
      const { data: obrasData } = await admin.from("obras").select("id, name").in("id", obraIds)
      ;(obrasData || []).forEach((o: any) => obraNameById.set(o.id, o.name))
    }

    // Asistencia por empleado
    const attByEmp = new Map<string, any[]>()
    for (const a of attData || []) {
      if (!a.employee_id) continue
      const arr = attByEmp.get(a.employee_id) || []
      arr.push(a)
      attByEmp.set(a.employee_id, arr)
    }

    // Calcula el total real de un empleado con la MISMA fórmula de nominasTab
    function computeReal(empId: string): RealInfo | null {
      const recs = attByEmp.get(empId)
      if (!recs || recs.length === 0) return null // sin asistencia registrada → no calculable
      const emp = empById.get(empId)
      if (!emp) return null

      const realSalary = Number(emp.real_salary) || 0
      const bonus = Number(emp.bonus_amount) || 0
      const viatics = Number(emp.viatics_amount) || 0
      const otCost = Number(emp.overtime_hour_cost) || 0

      let daysAbsent = 0
      let overtimeHours = 0
      const obras = new Set<string>()

      for (const workDate of workDates) {
        const dayRecs = recs.filter((r) => r.date === workDate)
        if (dayRecs.length === 0) {
          daysAbsent += 1 // sin registro = falta (igual que nominasTab)
          continue
        }
        for (const r of dayRecs) {
          overtimeHours += Number(r.overtime_hours) || 0
          if (r.obra_id && obraNameById.get(r.obra_id)) obras.add(obraNameById.get(r.obra_id)!)
        }
        const statuses = dayRecs.map((r) => r.status)
        if (statuses.includes("present") || statuses.includes("bajada")) {
          // trabajó
        } else if (statuses.includes("half_day")) {
          daysAbsent += 0.5
        } else {
          daysAbsent += 1 // absent / justified
        }
      }

      let salaryPaid =
        daysAbsent === 0 ? realSalary : realSalary - (realSalary / 7) * daysAbsent
      salaryPaid = round2(salaryPaid)
      const overtimePay = round2(overtimeHours * otCost)
      const total = round2(salaryPaid + bonus + viatics + overtimePay)
      return { total, obras, daysAbsent }
    }

    // Cache de cálculo por empleado
    const realCache = new Map<string, RealInfo | null>()
    const realOf = (empId: string): RealInfo | null => {
      if (!realCache.has(empId)) realCache.set(empId, computeReal(empId))
      return realCache.get(empId) ?? null
    }

    // ── 5) Construir conciliación ──
    const lines: ReconLine[] = []
    const consumedEmp = new Set<string>()

    for (const fl of parsed.lines) {
      const emp = empByCode.get(normalizeCode(fl.codigo))
      if (emp) {
        consumedEmp.add(emp.id)
        const real = realOf(emp.id)
        const realTotal = real ? real.total : null
        const fiscal = round2(fl.neto)
        const status: ReconStatus = real ? "matched" : "sin_asistencia"
        lines.push({
          codigo: fl.codigo,
          employee_id: emp.id,
          employee_name_raw: fl.nombre,
          employee_name_erp: emp.full_name,
          departamento_raw: fl.departamento,
          obra_names_erp: real ? Array.from(real.obras) : [],
          real_total: realTotal,
          fiscal_neto: fiscal,
          efectivo: realTotal != null ? round2(realTotal - fiscal) : 0,
          bank_name: emp.bank_name,
          account_number: emp.account_number,
          interbank_clabe: emp.interbank_clabe,
          match_status: status,
          flags: real ? [] : ["sin_asistencia"],
        })
      } else {
        lines.push({
          codigo: fl.codigo,
          employee_id: null,
          employee_name_raw: fl.nombre,
          employee_name_erp: null,
          departamento_raw: fl.departamento,
          obra_names_erp: [],
          real_total: null,
          fiscal_neto: round2(fl.neto),
          efectivo: 0,
          bank_name: null,
          account_number: null,
          interbank_clabe: null,
          match_status: "unmatched",
          flags: ["unmatched"],
        })
      }
    }

    // Empleados con asistencia esta semana pero que NO aparecen en el documento fiscal
    for (const empId of attByEmp.keys()) {
      if (consumedEmp.has(empId)) continue
      const real = realOf(empId)
      if (!real) continue
      const emp = empById.get(empId)
      lines.push({
        codigo: emp?.payroll_code ?? null,
        employee_id: empId,
        employee_name_raw: null,
        employee_name_erp: emp?.full_name ?? "(empleado)",
        departamento_raw: null,
        obra_names_erp: Array.from(real.obras),
        real_total: real.total,
        fiscal_neto: 0,
        efectivo: real.total,
        bank_name: emp?.bank_name ?? null,
        account_number: emp?.account_number ?? null,
        interbank_clabe: emp?.interbank_clabe ?? null,
        match_status: "sin_fiscal",
        flags: ["sin_fiscal"],
      })
    }

    // ── 6) Totales y conteos ──
    const totals = {
      real: round2(lines.reduce((s, l) => s + (l.real_total ?? 0), 0)),
      fiscal: round2(lines.reduce((s, l) => s + (l.fiscal_neto ?? 0), 0)),
      efectivo: round2(
        lines.filter((l) => l.real_total != null).reduce((s, l) => s + (l.efectivo ?? 0), 0),
      ),
    }
    const counts = {
      total: lines.length,
      matched: lines.filter((l) => l.match_status === "matched").length,
      unmatched: lines.filter((l) => l.match_status === "unmatched").length,
      sin_asistencia: lines.filter((l) => l.match_status === "sin_asistencia").length,
      sin_fiscal: lines.filter((l) => l.match_status === "sin_fiscal").length,
    }

    // Orden: por obra ERP / departamento, luego por nombre
    lines.sort((a, b) => {
      const ao = (a.obra_names_erp[0] || a.departamento_raw || "~").toLowerCase()
      const bo = (b.obra_names_erp[0] || b.departamento_raw || "~").toLowerCase()
      if (ao !== bo) return ao < bo ? -1 : 1
      const an = (a.employee_name_erp || a.employee_name_raw || "").toLowerCase()
      const bn = (b.employee_name_erp || b.employee_name_raw || "").toLowerCase()
      return an < bn ? -1 : an > bn ? 1 : 0
    })

    const result: ReconResult = {
      week_start: weekStart,
      week_end: weekEnd,
      period_label: parsed.periodLabel,
      doc_period_start: parsed.periodStart,
      doc_period_end: parsed.periodEnd,
      source_object_path: sourceObjectPath,
      source_file_name: fileName || null,
      fiscal_total_neto: parsed.grandTotalNeto,
      parsed_sum_neto: parsed.parsedSumNeto,
      totals,
      counts,
      lines,
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error("POST /api/payroll/reconcile error:", err)
    return NextResponse.json(
      { error: "No se pudo conciliar la nómina.", details: err?.message },
      { status: 500 },
    )
  }
}
