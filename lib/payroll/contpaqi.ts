// lib/payroll/contpaqi.ts
// Lector determinista del export CONTPAQi "Lista de Raya (forma tabular)" (.xlsx).
// Regla validada contra el archivo real: 49 empleados, suma NETO == Total Gral.

import type { ContpaqiLine, ContpaqiParseResult } from "./types"

/* eslint-disable @typescript-eslint/no-explicit-any */

function cellText(v: any): string {
  if (v == null) return ""
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t: any) => t.text).join("")
    if ("text" in v) return String(v.text ?? "")
    if ("result" in v) return String(v.result ?? "")
    if (v instanceof Date) return v.toISOString()
    return String(v)
  }
  return String(v)
}

function cellNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (v && typeof v === "object" && typeof v.result === "number") return v.result
  const n = parseFloat(String(v ?? "").replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) ? n : null
}

function ddmmyyyyToISO(s: string): string | null {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

export async function parseContpaqi(buffer: ArrayBuffer | Buffer): Promise<ContpaqiParseResult> {
  const mod: any = await import("exceljs")
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer as any)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error("El archivo no contiene hojas.")

  const maxCol = Math.max(ws.columnCount || 0, 16)
  const get = (r: number, c: number) => ws.getRow(r).getCell(c).value

  // ── 1) Encabezado: fila con "Empleado" y "NETO" ──
  let headerRow = 0
  const cols: Record<string, number> = {}
  for (let r = 1; r <= 25; r++) {
    const texts: string[] = []
    for (let c = 1; c <= maxCol; c++) texts.push(cellText(get(r, c)))
    const joined = texts.join(" ").toUpperCase()
    if (joined.includes("EMPLEADO") && joined.includes("NETO")) {
      headerRow = r
      for (let c = 1; c <= maxCol; c++) {
        const u = texts[c - 1].toUpperCase().trim()
        if (!u) continue
        const lettersOnly = u.replace(/[^A-Z]/g, "") // "*NETO*" -> "NETO", "AJUSTE AL NETO" -> "AJUSTEALNETO"
        // NETO exacto (evita "Ajuste al neto"); se queda con la última coincidencia exacta.
        if (lettersOnly === "NETO") cols.neto = c
        else if ((u.includes("CÓDIGO") || u.includes("CODIGO")) && cols.codigo == null) cols.codigo = c
        else if (u === "EMPLEADO" && cols.empleado == null) cols.empleado = c
        else if (u.includes("PERCEPCIONES") && cols.percepciones == null) cols.percepciones = c
        else if (u.includes("DEDUCCIONES") && cols.deducciones == null) cols.deducciones = c
      }
      break
    }
  }
  if (!headerRow || cols.empleado == null || cols.neto == null) {
    throw new Error(
      "No se reconoció el formato CONTPAQi (no se encontró la fila de encabezados con Empleado/NETO).",
    )
  }
  if (cols.codigo == null) cols.codigo = 1

  // ── 2) Periodo y empresa (informativo) ──
  let periodLabel: string | null = null
  let periodStart: string | null = null
  let periodEnd: string | null = null
  let companyName: string | null = null
  for (let r = 1; r < headerRow; r++) {
    for (let c = 1; c <= maxCol; c++) {
      const t = cellText(get(r, c)).trim()
      if (!t) continue
      const m = t.match(/del\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i)
      if (m) {
        periodLabel = t
        periodStart = ddmmyyyyToISO(m[1])
        periodEnd = ddmmyyyyToISO(m[2])
      }
      if (!companyName && /RECUBRIMIENTOS|RAF/i.test(t) && t.length < 80) companyName = t
    }
  }

  // ── 3) Renglones de empleados ──
  const lines: ContpaqiLine[] = []
  let currentDept: string | null = null
  let grandTotalNeto: number | null = null

  const lastRow = ws.rowCount || headerRow
  for (let r = headerRow + 1; r <= lastRow; r++) {
    const aRaw = cellText(get(r, cols.codigo)).trim()
    const bRaw = cellText(get(r, cols.empleado)).trim()

    const deptMatch = aRaw.match(/^Departamento\s+(.+)$/i)
    if (deptMatch) {
      currentDept = deptMatch[1].trim()
      continue
    }
    if (/^Total\s+Gral/i.test(aRaw)) {
      grandTotalNeto = cellNum(get(r, cols.neto))
      continue
    }
    if (/^Total/i.test(aRaw) || /^Reg\.?\s*Pat/i.test(aRaw)) continue
    if (!aRaw || !bRaw) continue

    const neto = cellNum(get(r, cols.neto))
    if (neto == null) continue // salta separadores / filas sin monto

    lines.push({
      codigo: aRaw,
      nombre: bRaw,
      departamento: currentDept,
      percepciones: cols.percepciones ? cellNum(get(r, cols.percepciones)) ?? 0 : 0,
      deducciones: cols.deducciones ? cellNum(get(r, cols.deducciones)) ?? 0 : 0,
      neto,
    })
  }

  const parsedSumNeto = Math.round(lines.reduce((s, l) => s + l.neto, 0) * 100) / 100

  return {
    lines,
    grandTotalNeto,
    parsedSumNeto,
    periodLabel,
    periodStart,
    periodEnd,
    companyName,
  }
}

/** Normaliza un código para empatar (quita espacios y ceros a la izquierda). */
export function normalizeCode(code: string | null | undefined): string {
  if (!code) return ""
  return String(code).trim().replace(/^0+/, "").toUpperCase()
}
