// lib/payroll/reportXlsx.ts
// Reporte de dispersión de nómina en Excel (.xlsx), mismo contenido que el PDF.
//  - Hoja "Resumen por obra": agrupado por obra, con subtotales y total general.
//  - Hoja "Detalle": tabla plana (una fila por empleado) con autofiltro y totales.
// Columnas: Código · Empleado · Cuenta bancaria · Sueldo total · A depositar (fiscal) · Efectivo.

import type { ReconResult, ReconLine, ReconStatus } from "./types"

const MONEY_FMT = '"$"#,##0.00'
const BRAND = "FF0174BD"
const DARK = "FF1E293B"
const HEAD_BG = "FFEEF3F8"
const ZEBRA = "FFF5F7FA"
const BORDER = "FFD2D8E0"

const STATUS_LABEL: Record<ReconStatus, string> = {
  matched: "Empatado",
  unmatched: "Sin empatar",
  sin_asistencia: "Sin asistencia",
  sin_fiscal: "Sin fiscal",
}

function fmtDateDisplay(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

function accountOf(l: ReconLine): string {
  return [l.bank_name, l.account_number || l.interbank_clabe].filter(Boolean).join(" ") || "—"
}

export async function generatePayrollReportXlsx(result: ReconResult): Promise<void> {
  const mod: any = await import("exceljs")
  const ExcelJS = mod.default ?? mod
  const wb = new ExcelJS.Workbook()
  wb.creator = "RAFSA ERP"
  wb.created = new Date()

  const thinBorder = {
    bottom: { style: "thin", color: { argb: BORDER } },
  }

  // ── Agrupar por obra (obra ERP o departamento del reporte) ──
  const groups = new Map<string, ReconLine[]>()
  for (const l of result.lines) {
    const key = l.obra_names_erp[0] || l.departamento_raw || "Sin clasificar"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }
  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  // ═══════════════════ Hoja 1: Resumen por obra ═══════════════════
  const ws = wb.addWorksheet("Resumen por obra", {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 16 },
  })
  ws.columns = [
    { width: 12 }, // Código
    { width: 36 }, // Empleado
    { width: 30 }, // Cuenta
    { width: 16 }, // Sueldo total
    { width: 16 }, // A depositar
    { width: 16 }, // Efectivo
  ]

  // Título
  ws.mergeCells("A1:F1")
  const title = ws.getCell("A1")
  title.value = "RAFSA · Dispersión de nómina"
  title.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } }
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
  title.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  ws.getRow(1).height = 24

  ws.mergeCells("A2:F2")
  ws.getCell("A2").value = `Semana: ${fmtDateDisplay(result.week_start)} – ${fmtDateDisplay(result.week_end)}`
  ws.getCell("A2").font = { size: 10, color: { argb: "FF475569" } }

  let r = 3
  if (result.period_label) {
    ws.mergeCells(`A${r}:F${r}`)
    ws.getCell(`A${r}`).value = `Documento fiscal: ${result.period_label}`
    ws.getCell(`A${r}`).font = { size: 9, color: { argb: "FF64748B" } }
    r++
  }
  ws.mergeCells(`A${r}:F${r}`)
  ws.getCell(`A${r}`).value = `Generado: ${new Date().toLocaleDateString("es-MX")}`
  ws.getCell(`A${r}`).font = { size: 9, color: { argb: "FF64748B" } }
  r += 2 // fila en blanco

  const HEADERS = ["Código", "Empleado", "Cuenta bancaria", "Sueldo total", "A depositar", "Efectivo"]

  const money = (v: number | null) => (v == null ? null : Number(v))

  for (const [groupName, rowsRaw] of sortedGroups) {
    const deptSet = Array.from(new Set(rowsRaw.map((x) => x.departamento_raw).filter(Boolean)))
    const sub = deptSet.length ? `Reporte: ${deptSet.join(", ")}` : ""

    // Encabezado de grupo (obra)
    ws.mergeCells(`A${r}:F${r}`)
    const gCell = ws.getCell(`A${r}`)
    gCell.value = sub ? `${groupName}    ·    ${sub}` : groupName
    gCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } }
    gCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    gCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
    ws.getRow(r).height = 20
    r++

    // Encabezado de columnas
    const headRow = ws.getRow(r)
    HEADERS.forEach((h, i) => {
      const c = headRow.getCell(i + 1)
      c.value = h
      c.font = { bold: true, size: 9, color: { argb: "FF475569" } }
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BG } }
      c.alignment = { horizontal: i >= 3 ? "right" : "left" }
      c.border = thinBorder
    })
    r++

    const rows = [...rowsRaw].sort((a, b) =>
      (a.employee_name_erp || a.employee_name_raw || "").localeCompare(
        b.employee_name_erp || b.employee_name_raw || "",
      ),
    )

    let gReal = 0
    let gFiscal = 0
    let gEfectivo = 0
    rows.forEach((l, idx) => {
      const row = ws.getRow(r)
      row.getCell(1).value = l.codigo || "—"
      row.getCell(2).value = l.employee_name_erp || l.employee_name_raw || "—"
      row.getCell(3).value = accountOf(l)
      // Sueldo total
      const realCell = row.getCell(4)
      if (l.real_total != null) { realCell.value = money(l.real_total); realCell.numFmt = MONEY_FMT }
      else { realCell.value = "pend." }
      realCell.alignment = { horizontal: "right" }
      // A depositar (fiscal)
      const fiscalCell = row.getCell(5)
      fiscalCell.value = money(l.fiscal_neto) ?? 0
      fiscalCell.numFmt = MONEY_FMT
      fiscalCell.alignment = { horizontal: "right" }
      // Efectivo
      const efCell = row.getCell(6)
      if (l.real_total != null) { efCell.value = money(l.efectivo); efCell.numFmt = MONEY_FMT }
      else { efCell.value = "—" }
      efCell.font = { bold: true }
      efCell.alignment = { horizontal: "right" }

      if (idx % 2 === 1) {
        for (let c = 1; c <= 6; c++) {
          row.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }
        }
      }
      row.font = { ...(row.font || {}), size: 10 }

      gReal += l.real_total ?? 0
      gFiscal += l.fiscal_neto ?? 0
      if (l.real_total != null) gEfectivo += l.efectivo ?? 0
      r++
    })

    // Subtotal del grupo
    const subRow = ws.getRow(r)
    subRow.getCell(3).value = "Subtotal"
    subRow.getCell(3).alignment = { horizontal: "right" }
    const subCells: [number, number][] = [[4, gReal], [5, gFiscal], [6, gEfectivo]]
    for (const [c, v] of subCells) {
      const cell = subRow.getCell(c)
      cell.value = Number(v)
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: "right" }
    }
    for (let c = 1; c <= 6; c++) {
      subRow.getCell(c).font = { bold: true, size: 10 }
      subRow.getCell(c).border = { top: { style: "thin", color: { argb: BORDER } } }
    }
    r += 2 // fila en blanco entre grupos
  }

  // Total general
  const totalRow = ws.getRow(r)
  ws.mergeCells(`A${r}:C${r}`)
  const tLabel = ws.getCell(`A${r}`)
  tLabel.value = "TOTAL GENERAL"
  tLabel.alignment = { horizontal: "left", indent: 1, vertical: "middle" }
  const totals: [number, number][] = [
    [4, result.totals.real],
    [5, result.totals.fiscal],
    [6, result.totals.efectivo],
  ]
  for (const [c, v] of totals) {
    const cell = totalRow.getCell(c)
    cell.value = Number(v) || 0
    cell.numFmt = MONEY_FMT
    cell.alignment = { horizontal: "right" }
  }
  for (let c = 1; c <= 6; c++) {
    const cell = totalRow.getCell(c)
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }
  }
  totalRow.height = 20

  // ═══════════════════ Hoja 2: Detalle (plana) ═══════════════════
  const ws2 = wb.addWorksheet("Detalle", { views: [{ state: "frozen", ySplit: 1 }] })
  const DET_COLS = [
    { header: "Obra", width: 28 },
    { header: "Código", width: 12 },
    { header: "Empleado", width: 34 },
    { header: "Banco", width: 18 },
    { header: "Cuenta / CLABE", width: 24 },
    { header: "Sueldo total", width: 16 },
    { header: "A depositar", width: 16 },
    { header: "Efectivo", width: 16 },
    { header: "Estatus", width: 16 },
  ]
  ws2.columns = DET_COLS.map((c) => ({ width: c.width }))

  const detHead = ws2.getRow(1)
  DET_COLS.forEach((c, i) => {
    const cell = detHead.getCell(i + 1)
    cell.value = c.header
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
    cell.alignment = { horizontal: i >= 5 && i <= 7 ? "right" : "left" }
  })
  detHead.height = 18

  let dr = 2
  let tReal = 0
  let tFiscal = 0
  let tEfectivo = 0
  for (const [groupName, rowsRaw] of sortedGroups) {
    const rows = [...rowsRaw].sort((a, b) =>
      (a.employee_name_erp || a.employee_name_raw || "").localeCompare(
        b.employee_name_erp || b.employee_name_raw || "",
      ),
    )
    for (const l of rows) {
      const row = ws2.getRow(dr)
      row.getCell(1).value = groupName
      row.getCell(2).value = l.codigo || "—"
      row.getCell(3).value = l.employee_name_erp || l.employee_name_raw || "—"
      row.getCell(4).value = l.bank_name || "—"
      row.getCell(5).value = l.account_number || l.interbank_clabe || "—"
      const rc = row.getCell(6)
      if (l.real_total != null) { rc.value = Number(l.real_total); rc.numFmt = MONEY_FMT } else { rc.value = "pend." }
      rc.alignment = { horizontal: "right" }
      const fc = row.getCell(7)
      fc.value = Number(l.fiscal_neto) || 0
      fc.numFmt = MONEY_FMT
      fc.alignment = { horizontal: "right" }
      const ec = row.getCell(8)
      if (l.real_total != null) { ec.value = Number(l.efectivo); ec.numFmt = MONEY_FMT } else { ec.value = "—" }
      ec.alignment = { horizontal: "right" }
      row.getCell(9).value = STATUS_LABEL[l.match_status] ?? l.match_status

      tReal += l.real_total ?? 0
      tFiscal += l.fiscal_neto ?? 0
      if (l.real_total != null) tEfectivo += l.efectivo ?? 0
      dr++
    }
  }

  // Autofiltro sobre el encabezado
  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: DET_COLS.length } }

  // Fila de totales
  const totRow = ws2.getRow(dr)
  totRow.getCell(5).value = "Total"
  totRow.getCell(5).alignment = { horizontal: "right" }
  const detTotals: [number, number][] = [[6, tReal], [7, tFiscal], [8, tEfectivo]]
  for (const [c, v] of detTotals) {
    const cell = totRow.getCell(c)
    cell.value = Number(v)
    cell.numFmt = MONEY_FMT
    cell.alignment = { horizontal: "right" }
  }
  for (let c = 1; c <= DET_COLS.length; c++) {
    totRow.getCell(c).font = { bold: true }
    totRow.getCell(c).border = { top: { style: "thin", color: { argb: BORDER } } }
  }

  // ── Descargar ──
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `Dispersion_Nomina_${result.week_start}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
