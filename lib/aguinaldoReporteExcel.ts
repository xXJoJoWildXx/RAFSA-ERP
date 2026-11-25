// lib/aguinaldoReporteExcel.ts
// Excel de la corrida de aguinaldo. Dos hojas:
//   · Resumen  — los totales y la fórmula, para la hoja que se firma
//   · Detalle  — tabla plana con filtro, para trabajarla y pivotearla
//
// Los montos van como NÚMERO con formato de moneda, no como texto: tienen
// que poder sumarse en la hoja.

import ExcelJS from "exceljs"
import {
  type CorridaAguinaldo,
  fechaCorta,
  nombreArchivo,
  ordenarFilas,
  estadoDe,
  proporcionDe,
} from "./aguinaldoReporte"

const BRAND = "FF0174BD"
const DARK = "FF1E293B"
const HEAD_BG = "FFF1F5F9"
const ZEBRA = "FFF8FAFC"
const BORDER = "FFE2E8F0"
const AMBER = "FFB45309"
const MONEY_FMT = '"$"#,##0.00'

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: BORDER } },
  left: { style: "thin", color: { argb: BORDER } },
  bottom: { style: "thin", color: { argb: BORDER } },
  right: { style: "thin", color: { argb: BORDER } },
}

export async function generateAguinaldoReporteExcel(c: CorridaAguinaldo): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = "RAFSA ERP"
  wb.created = new Date()

  // ═══════════════ Hoja 1: Resumen ═══════════════
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 34 }, { width: 22 }, { width: 46 }]

  ws.mergeCells("A1:C1")
  const t = ws.getCell("A1")
  t.value = `RAFSA · Corrida de aguinaldo ${c.anio}`
  t.font = { bold: true, size: 15, color: { argb: "FFFFFFFF" } }
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } }
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 }
  ws.getRow(1).height = 24

  ws.mergeCells("A2:C2")
  ws.getCell("A2").value = `Corte: ${fechaCorta(c.corte)}   ·   Generado: ${new Date().toLocaleDateString("es-MX")} por ${c.generadoPor}`
  ws.getCell("A2").font = { size: 10, color: { argb: "FF475569" } }

  ws.mergeCells("A3:C3")
  ws.getCell("A3").value =
    "Fórmula: (días trabajados en el año ÷ 365) × 15 × salario diario   ·   salario diario = sueldo semanal ÷ 7"
  ws.getCell("A3").font = { size: 10, italic: true, color: { argb: "FF64748B" } }

  let r = 5
  const dato = (etiqueta: string, valor: number | string, nota: string, dinero = false) => {
    const row = ws.getRow(r)
    row.getCell(1).value = etiqueta
    row.getCell(1).font = { bold: true, size: 10 }
    const v = row.getCell(2)
    v.value = valor
    if (dinero) v.numFmt = MONEY_FMT
    v.font = { bold: true, size: 11 }
    v.alignment = { horizontal: "right" }
    row.getCell(3).value = nota
    row.getCell(3).font = { size: 9, color: { argb: "FF94A3B8" } }
    for (let i = 1; i <= 3; i++) row.getCell(i).border = thin
    r++
  }

  dato("Total a pagar", c.resumen.total, "No incluye a los marcados para revisar", true)
  dato("Empleados en la corrida", c.resumen.empleados, "")
  dato("Con año completo", c.resumen.completo, "365 días o más")
  dato("Proporcional", c.resumen.proporcional, "Entraron durante el año")
  dato("Cambian al aplicar", c.resumen.porAplicar, "Su expediente trae otro monto hoy")
  dato(
    "Marcados para revisar",
    c.resumen.revisar,
    c.resumen.revisar > 0 ? "NO se les aplica el monto" : "Ninguno",
  )

  if (c.resumen.revisar > 0) {
    r++
    ws.mergeCells(`A${r}:C${r}`)
    const a = ws.getCell(`A${r}`)
    a.value = `Atención: ${c.resumen.revisar} empleado(s) quedan fuera al aplicar. El motivo de cada uno está en la hoja Detalle.`
    a.font = { bold: true, size: 10, color: { argb: AMBER } }
    a.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } }
    a.alignment = { vertical: "middle", indent: 1 }
    ws.getRow(r).height = 20
  }

  // ═══════════════ Hoja 2: Detalle ═══════════════
  const ws2 = wb.addWorksheet("Detalle", { views: [{ showGridLines: false, state: "frozen", ySplit: 1 }] })
  const COLS: { header: string; width: number; dinero?: boolean }[] = [
    { header: "Código", width: 12 },
    { header: "Empleado", width: 34 },
    { header: "Fecha de ingreso", width: 18 },
    { header: "Inicio de conteo", width: 18 },
    { header: "Días en el año", width: 14 },
    { header: "Proporción", width: 18 },
    { header: "Sueldo semanal", width: 17, dinero: true },
    { header: "Salario diario", width: 16, dinero: true },
    { header: "Aguinaldo calculado", width: 20, dinero: true },
    { header: "Aguinaldo capturado", width: 20, dinero: true },
    { header: "Diferencia", width: 16, dinero: true },
    { header: "Estado", width: 30 },
  ]
  ws2.columns = COLS.map((x) => ({ width: x.width }))

  const head = ws2.getRow(1)
  COLS.forEach((col, i) => {
    const cell = head.getCell(i + 1)
    cell.value = col.header
    cell.font = { bold: true, size: 10, color: { argb: "FF334155" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_BG } }
    cell.alignment = { horizontal: col.dinero ? "right" : "left" }
    cell.border = thin
  })
  head.height = 20

  const filas = ordenarFilas(c.filas)
  filas.forEach((f, idx) => {
    const row = ws2.getRow(idx + 2)
    const est = estadoDe(f)

    row.getCell(1).value = f.payroll_code || "—"
    row.getCell(2).value = f.full_name || "—"
    row.getCell(3).value = fechaCorta(f.hire_date)
    row.getCell(4).value = fechaCorta(f.inicio_conteo)
    row.getCell(5).value = f.dias_en_el_anio ?? null
    row.getCell(6).value = proporcionDe(f)

    const dinero: [number, number][] = [
      [7, Number(f.salario_semanal ?? 0)],
      [8, Number(f.salario_diario ?? 0)],
      [9, Number(f.aguinaldo_calculado ?? 0)],
      [10, Number(f.aguinaldo_capturado ?? 0)],
      [11, Number(f.diferencia ?? 0)],
    ]
    for (const [i, v] of dinero) {
      const cell = row.getCell(i)
      cell.value = v
      cell.numFmt = MONEY_FMT
      cell.alignment = { horizontal: "right" }
    }
    row.getCell(9).font = { bold: true }

    const estCell = row.getCell(12)
    estCell.value = est.texto
    if (est.tono === "revisar") estCell.font = { color: { argb: AMBER }, bold: true }
    else if (est.tono === "cambia") estCell.font = { color: { argb: BRAND } }
    else estCell.font = { color: { argb: "FF94A3B8" } }

    if (idx % 2 === 1) {
      for (let i = 1; i <= COLS.length; i++) {
        row.getCell(i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }
      }
    }
    row.font = { ...(row.font || {}), size: 10 }
  })

  // Total al pie, para que cuadre con la hoja de resumen.
  const totalRow = ws2.getRow(filas.length + 2)
  totalRow.getCell(8).value = "TOTAL"
  totalRow.getCell(8).alignment = { horizontal: "right" }
  const tc = totalRow.getCell(9)
  tc.value = filas.filter((f) => !f.revisar).reduce((s, f) => s + Number(f.aguinaldo_calculado ?? 0), 0)
  tc.numFmt = MONEY_FMT
  tc.alignment = { horizontal: "right" }
  for (let i = 1; i <= COLS.length; i++) {
    const cell = totalRow.getCell(i)
    cell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } }
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } }
  }
  totalRow.height = 20

  ws2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLS.length } }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombreArchivo(c, "xlsx")
  a.click()
  URL.revokeObjectURL(url)
}
