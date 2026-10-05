// lib/payroll/types.ts
// Tipos del módulo de Nómina (conciliación fiscal vs real → efectivo).

/** Una línea de empleado leída del documento CONTPAQi (Lista de Raya). */
export type ContpaqiLine = {
  codigo: string
  nombre: string
  departamento: string | null
  percepciones: number
  deducciones: number
  neto: number
}

/** Resultado de parsear el archivo CONTPAQi. */
export type ContpaqiParseResult = {
  lines: ContpaqiLine[]
  grandTotalNeto: number | null
  parsedSumNeto: number
  periodLabel: string | null
  periodStart: string | null // yyyy-mm-dd (declarado en el documento, informativo)
  periodEnd: string | null
  companyName: string | null
}

/** Estado de empate de cada renglón de la conciliación. */
export type ReconStatus = "matched" | "unmatched" | "sin_asistencia" | "sin_fiscal"

/** Un renglón de la conciliación (por empleado). */
export type ReconLine = {
  codigo: string | null
  employee_id: string | null
  employee_name_raw: string | null // nombre tal como viene en el documento
  employee_name_erp: string | null // nombre registrado en el ERP
  departamento_raw: string | null // "obra" como aparece en el reporte de nómina
  obra_names_erp: string[] // obra(s) registradas en el ERP esa semana
  real_total: number | null // sueldo total real (de la nómina) ; null si no se ha generado
  fiscal_neto: number // NETO del documento ; 0 si no aparece en el documento
  efectivo: number // real_total - fiscal_neto
  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null
  match_status: ReconStatus
  flags: string[]
}

/** Resultado completo de la conciliación (preview, antes de guardar). */
export type ReconResult = {
  week_start: string
  week_end: string
  period_label: string | null
  doc_period_start: string | null
  doc_period_end: string | null
  source_object_path: string | null
  source_file_name: string | null
  fiscal_total_neto: number | null // Total Gral. del documento
  parsed_sum_neto: number // suma de los NETO parseados
  totals: { real: number; fiscal: number; efectivo: number }
  counts: {
    total: number
    matched: number
    unmatched: number
    sin_asistencia: number
    sin_fiscal: number
  }
  lines: ReconLine[]
}
