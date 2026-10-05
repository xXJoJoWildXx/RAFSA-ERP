// app/api/payroll/route.ts
// POST  → guarda una corrida de nómina (payroll_runs + payroll_run_lines)
// GET   → lista las corridas guardadas

import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { ReconResult } from "@/lib/payroll/types"

export const runtime = "nodejs"

/* eslint-disable @typescript-eslint/no-explicit-any */

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReconResult & { created_by?: string | null }
    if (!body?.week_start || !body?.week_end || !Array.isArray(body.lines)) {
      return NextResponse.json({ error: "Datos de la corrida incompletos." }, { status: 400 })
    }

    // Encabezado
    const { data: run, error: runErr } = await admin
      .from("payroll_runs")
      .insert({
        week_start: body.week_start,
        week_end: body.week_end,
        period_label: body.period_label ?? null,
        source_bucket: "payroll-files",
        source_object_path: body.source_object_path ?? null,
        source_file_name: body.source_file_name ?? null,
        extraction_method: "xlsx",
        raw_json: {
          doc_period_start: body.doc_period_start ?? null,
          doc_period_end: body.doc_period_end ?? null,
          counts: body.counts ?? null,
          parsed_sum_neto: body.parsed_sum_neto ?? null,
        },
        fiscal_total_neto: body.fiscal_total_neto ?? 0,
        total_real: body.totals?.real ?? 0,
        total_fiscal: body.totals?.fiscal ?? 0,
        total_efectivo: body.totals?.efectivo ?? 0,
        employee_count: body.counts?.total ?? body.lines.length,
        status: "reconciled",
        created_by: body.created_by ?? null,
      })
      .select("id")
      .single()

    if (runErr || !run) {
      return NextResponse.json(
        { error: "No se pudo guardar la corrida.", details: runErr?.message },
        { status: 500 },
      )
    }

    // Líneas
    const lineRows = body.lines.map((l) => ({
      run_id: run.id,
      employee_id: l.employee_id,
      payroll_code: l.codigo,
      employee_name_raw: l.employee_name_raw,
      departamento_raw: l.departamento_raw,
      obra_id: null, // (se resuelve por nombre en el reporte; FK opcional)
      real_total: l.real_total ?? 0,
      fiscal_neto: l.fiscal_neto ?? 0,
      efectivo: l.real_total != null ? l.efectivo ?? 0 : 0,
      bank_name: l.bank_name,
      account_number: l.account_number,
      interbank_clabe: l.interbank_clabe,
      match_status:
        l.match_status === "matched" || l.match_status === "manual" ? l.match_status : "unmatched",
      note:
        l.obra_names_erp && l.obra_names_erp.length
          ? `obras:${l.obra_names_erp.join(" | ")}`
          : null,
      paid: false,
    }))

    const { error: linesErr } = await admin.from("payroll_run_lines").insert(lineRows)
    if (linesErr) {
      // rollback best-effort
      await admin.from("payroll_runs").delete().eq("id", run.id)
      return NextResponse.json(
        { error: "No se pudieron guardar las líneas.", details: linesErr.message },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, id: run.id })
  } catch (err: any) {
    console.error("POST /api/payroll error:", err)
    return NextResponse.json(
      { error: "No se pudo guardar la corrida.", details: err?.message },
      { status: 500 },
    )
  }
}

export async function GET() {
  try {
    const { data, error } = await admin
      .from("payroll_runs")
      .select(
        "id, week_start, week_end, period_label, fiscal_total_neto, total_real, total_fiscal, total_efectivo, employee_count, status, source_file_name, created_at",
      )
      .order("week_start", { ascending: false })
      .order("created_at", { ascending: false })

    if (error)
      return NextResponse.json({ error: "No se pudieron cargar las corridas.", details: error.message }, { status: 500 })

    return NextResponse.json({ runs: data ?? [] })
  } catch (err: any) {
    return NextResponse.json({ error: "Error al listar corridas.", details: err?.message }, { status: 500 })
  }
}
