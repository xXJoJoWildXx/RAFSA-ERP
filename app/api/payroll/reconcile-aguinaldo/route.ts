// app/api/payroll/reconcile-aguinaldo/route.ts
// Concilia el documento de AGUINALDO (CONTPAQi, Lista de Raya extraordinaria)
// contra el aguinaldo capturado en el ERP.
//
// Diferencias con la nómina semanal:
//   - No hay semana ni asistencia. El "real" es employees.aguinaldo_amount.
//   - El "fiscal" es el NETO del documento, que es lo que se deposita.
//   - El efectivo es la diferencia: real - fiscal.
//
// Devuelve un PREVIEW (no guarda nada todavía), igual que /reconcile.

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseContpaqi, normalizeCode } from "@/lib/payroll/contpaqi"
import type { ReconLine, ReconResult, ReconStatus } from "@/lib/payroll/types"

export const runtime = "nodejs"

/* eslint-disable @typescript-eslint/no-explicit-any */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const round2 = (n: number) => Math.round(n * 100) / 100

export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get("file") as File | null
    const reusePath = String(form.get("source_object_path") || "")

    if (!file && !reusePath) {
      return NextResponse.json({ error: "No se recibió el archivo." }, { status: 400 })
    }

    // ── 1) Archivo nuevo o el ya subido al bucket ──
    let buffer: Buffer
    let fileName: string
    if (file) {
      buffer = Buffer.from(await file.arrayBuffer())
      fileName = file.name || "aguinaldo.xlsx"
    } else {
      const { data: dl, error: dlErr } = await admin.storage
        .from("payroll-files")
        .download(reusePath)
      if (dlErr || !dl) {
        return NextResponse.json(
          { error: "No se pudo recuperar el archivo subido.", details: dlErr?.message },
          { status: 404 },
        )
      }
      buffer = Buffer.from(await dl.arrayBuffer())
      fileName = reusePath.split("/").pop() || "aguinaldo.xlsx"
    }

    // ── 2) Parsear (mismo lector que la nómina: el formato es el mismo) ──
    let parsed
    try {
      parsed = await parseContpaqi(buffer)
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || "No se pudo leer el documento de aguinaldo." },
        { status: 422 },
      )
    }

    // ── 3) Guardar el archivo como evidencia ──
    let sourceObjectPath: string | null = reusePath || null
    if (file) {
      try {
        const safeName = fileName.replace(/[^\w.\-]+/g, "_")
        const path = `aguinaldo/${Date.now()}_${safeName}`
        const { error: upErr } = await admin.storage.from("payroll-files").upload(path, buffer, {
          contentType:
            file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        })
        if (!upErr) sourceObjectPath = path
      } catch {
        /* la evidencia es deseable, no indispensable */
      }
    }

    // ── 4) Empleados: aguinaldo capturado + datos bancarios ──
    const { data: empData, error: empErr } = await admin
      .from("employees")
      .select(
        "id, full_name, status, payroll_code, bank_name, account_number, interbank_clabe, aguinaldo_amount",
      )
    if (empErr) {
      return NextResponse.json(
        { error: "No se pudieron cargar los empleados.", details: empErr.message },
        { status: 500 },
      )
    }

    const empByCode = new Map<string, any>()
    for (const e of empData || []) {
      const key = normalizeCode(e.payroll_code)
      if (key) empByCode.set(key, e)
    }

    // ── 5) Conciliación ──
    const lines: ReconLine[] = []
    const consumed = new Set<string>()

    for (const fl of parsed.lines) {
      const emp = empByCode.get(normalizeCode(fl.codigo))
      const fiscal = round2(fl.neto)

      if (!emp) {
        lines.push({
          codigo: fl.codigo,
          employee_id: null,
          employee_name_raw: fl.nombre,
          employee_name_erp: null,
          departamento_raw: fl.departamento,
          obra_names_erp: [],
          real_total: null,
          fiscal_neto: fiscal,
          efectivo: 0,
          bank_name: null,
          account_number: null,
          interbank_clabe: null,
          match_status: "unmatched",
          flags: ["unmatched"],
        })
        continue
      }

      consumed.add(emp.id)
      const real = Number(emp.aguinaldo_amount) || 0
      // Sin aguinaldo capturado no se puede calcular el efectivo
      const tieneReal = real > 0
      const status: ReconStatus = tieneReal ? "matched" : "sin_aguinaldo"

      lines.push({
        codigo: fl.codigo,
        employee_id: emp.id,
        employee_name_raw: fl.nombre,
        employee_name_erp: emp.full_name,
        departamento_raw: fl.departamento,
        obra_names_erp: [],
        real_total: tieneReal ? round2(real) : null,
        fiscal_neto: fiscal,
        efectivo: tieneReal ? round2(real - fiscal) : 0,
        bank_name: emp.bank_name,
        account_number: emp.account_number,
        interbank_clabe: emp.interbank_clabe,
        match_status: status,
        flags: tieneReal ? [] : ["sin_aguinaldo"],
      })
    }

    // ── 6) Activos con aguinaldo capturado que NO vienen en el documento ──
    for (const e of empData || []) {
      if (consumed.has(e.id)) continue
      if ((e.status || "").toLowerCase() !== "active") continue
      const real = Number(e.aguinaldo_amount) || 0
      if (real <= 0) continue

      lines.push({
        codigo: e.payroll_code ?? null,
        employee_id: e.id,
        employee_name_raw: null,
        employee_name_erp: e.full_name,
        departamento_raw: null,
        obra_names_erp: [],
        real_total: round2(real),
        fiscal_neto: 0,
        efectivo: round2(real),
        bank_name: e.bank_name,
        account_number: e.account_number,
        interbank_clabe: e.interbank_clabe,
        match_status: "sin_fiscal",
        flags: ["sin_fiscal"],
      })
    }

    // ── 7) Totales y conteos ──
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
      sin_asistencia: 0,
      sin_fiscal: lines.filter((l) => l.match_status === "sin_fiscal").length,
      sin_aguinaldo: lines.filter((l) => l.match_status === "sin_aguinaldo").length,
    }

    // Orden: por departamento del documento y luego por nombre
    lines.sort((a, b) => {
      const ad = (a.departamento_raw || "~").toLowerCase()
      const bd = (b.departamento_raw || "~").toLowerCase()
      if (ad !== bd) return ad < bd ? -1 : 1
      const an = (a.employee_name_erp || a.employee_name_raw || "").toLowerCase()
      const bn = (b.employee_name_erp || b.employee_name_raw || "").toLowerCase()
      return an < bn ? -1 : an > bn ? 1 : 0
    })

    // payroll_runs exige fechas: se usan las que declara el documento y, si no
    // las trae, la fecha de hoy. No se usan para calcular nada.
    const hoy = new Date().toISOString().slice(0, 10)
    const inicio = parsed.periodStart || hoy
    const fin = parsed.periodEnd || inicio

    const result: ReconResult = {
      kind: "aguinaldo",
      week_start: inicio,
      week_end: fin,
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
    console.error("POST /api/payroll/reconcile-aguinaldo error:", err)
    return NextResponse.json(
      { error: "No se pudo conciliar el aguinaldo.", details: err?.message },
      { status: 500 },
    )
  }
}
