/**
 * Reporte de órdenes de inventario en Excel (.xlsx)
 *
 * El PDF es para presentar; este archivo es para trabajar. Mismas cifras y
 * mismas reglas (lib/inventoryOrdersReport.ts), repartidas en cuatro hojas:
 *
 *   • Resumen   → gasto por obra, con el gran total del reporte.
 *   • Órdenes   → una fila por orden, con filtros.
 *   • Artículos → del más utilizado al menos utilizado.
 *   • Detalle   → una fila por renglón, para que el cliente arme sus propias
 *                 tablas dinámicas sin pedirnos otro reporte.
 *
 * ExcelJS se importa dinámicamente para no pesar en el bundle principal.
 */

import {
  ReporteOrdenes,
  ESTADO_LABEL,
  TIPO_LABEL,
  fechaLarga,
  nombreArchivo,
} from "@/lib/inventoryOrdersReport"

const MONEY = '"$"#,##0.00'
const NUM = "#,##0.##"
const FECHA = "dd/mm/yyyy"

// Colores (ARGB), los mismos del Estado de Cuenta
const C = {
  blue: "FF1F71B5",
  blueDk: "FF144A8A",
  navy: "FF041527",
  grayHdr: "FFDBDEE2",
  rowAlt: "FFF6F8FA",
  white: "FFFFFFFF",
  ink: "FF212529",
  muted: "FF6E7B88",
  green: "FF1E7A3C",
  orange: "FFCC6A18",
  box: "FFF4F6F8",
  podio: "FFEDF6FC",
}

type Cell = any

function fillCell(cell: Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }
}

function borderAll(cell: Cell, argb = "FFC8CDD3") {
  cell.border = {
    top: { style: "thin", color: { argb } },
    bottom: { style: "thin", color: { argb } },
    left: { style: "thin", color: { argb } },
    right: { style: "thin", color: { argb } },
  }
}

/** Encabezado de tabla: fondo marino, letra blanca, centrado donde toca. */
function headerRow(ws: any, r: number, titulos: string[], alineaciones: string[]) {
  titulos.forEach((t, i) => {
    const cell = ws.getCell(r, i + 1)
    cell.value = t
    cell.font = { bold: true, size: 9, color: { argb: C.white } }
    fillCell(cell, C.navy)
    cell.alignment = { horizontal: alineaciones[i] ?? "left", vertical: "middle", wrapText: true }
    borderAll(cell, C.navy)
  })
  ws.getRow(r).height = 22
}

/** Título, periodo y sello de generación, iguales en las cuatro hojas. */
function tituloHoja(ws: any, rep: ReporteOrdenes, titulo: string, lastCol: number): number {
  let r = 1
  ws.mergeCells(r, 1, r, lastCol)
  let c = ws.getCell(r, 1)
  c.value = titulo
  c.font = { bold: true, size: 16, color: { argb: C.blueDk } }
  c.alignment = { horizontal: "center" }
  ws.getRow(r).height = 22
  r++

  ws.mergeCells(r, 1, r, lastCol)
  c = ws.getCell(r, 1)
  c.value = `${fechaLarga(rep.desde)} — ${fechaLarga(rep.hasta)}`
  c.font = { bold: true, size: 11, color: { argb: C.blue } }
  c.alignment = { horizontal: "center" }
  r++

  ws.mergeCells(r, 1, r, lastCol)
  c = ws.getCell(r, 1)
  c.value = `Generado el ${fechaLarga(rep.generado)} por ${rep.generadoPor}  ·  Importes con IVA`
  c.font = { size: 9, color: { argb: C.muted } }
  c.alignment = { horizontal: "center" }
  r += 2
  return r
}

export async function generateInventoryOrdersReportExcel(rep: ReporteOrdenes): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "RAFSA ERP"
  wb.created = rep.generado

  buildResumen(wb, rep)
  buildOrdenes(wb, rep)
  buildArticulos(wb, rep)
  buildDetalle(wb, rep)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${nombreArchivo(rep.desde, rep.hasta)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Hoja Resumen ─── */

function buildResumen(wb: any, rep: ReporteOrdenes) {
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 42 }, { width: 14 }, { width: 28 }, { width: 10 },
    { width: 12 }, { width: 16 }, { width: 18 }, { width: 18 },
  ]
  const LAST = 8
  let r = tituloHoja(ws, rep, "REPORTE DE ÓRDENES DE INVENTARIO", LAST)

  // ── Cifras gruesas ──
  const kpis: [string, number | string, string][] = [
    ["Ejercido", rep.totales.ejercido, C.green],
    ["Comprometido", rep.totales.comprometido, C.orange],
    ["Total del reporte", rep.totales.total, C.blueDk],
    ["Órdenes", rep.totales.ordenes, C.ink],
    ["Obras", rep.totales.obras, C.ink],
  ]
  kpis.forEach(([etiqueta], i) => {
    const cell = ws.getCell(r, i + 1)
    cell.value = etiqueta.toUpperCase()
    cell.font = { bold: true, size: 8, color: { argb: C.muted } }
    fillCell(cell, C.box)
    cell.alignment = { horizontal: "center" }
    borderAll(cell)
  })
  r++
  kpis.forEach(([etiqueta, valor, color], i) => {
    const cell = ws.getCell(r, i + 1)
    cell.value = valor
    cell.numFmt = typeof valor === "number" && etiqueta !== "Órdenes" && etiqueta !== "Obras" ? MONEY : NUM
    cell.font = { bold: true, size: 12, color: { argb: color } }
    fillCell(cell, C.box)
    cell.alignment = { horizontal: "center" }
    borderAll(cell)
  })
  ws.getRow(r).height = 20
  r += 2

  // ── Tabla por obra ──
  headerRow(
    ws, r,
    ["OBRA", "CÓDIGO", "EMPRESA", "ÓRDENES", "PIEZAS", "EJERCIDO", "COMPROMETIDO", "TOTAL"],
    ["left", "center", "left", "center", "center", "right", "right", "right"],
  )
  r++

  const primeraFila = r
  rep.grupos.forEach((g, i) => {
    const fila = [
      g.obra,
      g.codigo ?? "",
      g.esAlmacen ? "Entradas al almacén" : (g.empresa ?? ""),
      g.ordenes.length,
      g.piezas,
      g.ejercido,
      g.comprometido,
      g.total,
    ]
    fila.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1)
      cell.value = v
      if (j >= 5) cell.numFmt = MONEY
      else if (j >= 3) cell.numFmt = NUM
      cell.font = {
        size: 10,
        bold: j === 0 || j === 7,
        italic: g.esAlmacen && j === 2,
        color: { argb: j === 5 ? C.green : j === 6 ? C.orange : C.ink },
      }
      cell.alignment = {
        horizontal: j === 0 || j === 2 ? "left" : j === 1 || j === 3 || j === 4 ? "center" : "right",
      }
      if (i % 2 === 1) fillCell(cell, C.rowAlt)
      borderAll(cell)
    })
    r++
  })

  if (rep.grupos.length === 0) {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = "Sin órdenes en el periodo seleccionado."
    cell.font = { italic: true, size: 10, color: { argb: C.muted } }
    cell.alignment = { horizontal: "center" }
    r++
  }

  // ── Gran total ──
  const totales = [
    "GRAN TOTAL DEL REPORTE", "", "",
    rep.totales.ordenes, rep.totales.piezas,
    rep.totales.ejercido, rep.totales.comprometido, rep.totales.total,
  ]
  totales.forEach((v, j) => {
    const cell = ws.getCell(r, j + 1)
    cell.value = v
    if (j >= 5) cell.numFmt = MONEY
    else if (j >= 3) cell.numFmt = NUM
    cell.font = { bold: true, size: j === 7 ? 12 : 10, color: { argb: C.white } }
    fillCell(cell, C.navy)
    cell.alignment = { horizontal: j === 0 ? "left" : j >= 5 ? "right" : "center" }
    borderAll(cell, C.navy)
  })
  ws.getRow(r).height = 20
  r += 2

  // ── Nota de criterios ──
  const notas = [
    "Ejercido: material que ya salió del almacén (órdenes entregadas o completadas).",
    "Comprometido: órdenes abiertas; el material está apartado pero todavía no sale.",
    rep.totales.canceladas > 0
      ? `Las ${rep.totales.canceladas} órdenes canceladas del periodo no suman en ningún total.`
      : "Las órdenes canceladas no suman en ningún total.",
    "Las compras que entran al almacén se reportan aparte: no son gasto de una obra.",
  ]
  for (const nota of notas) {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = `·  ${nota}`
    cell.font = { size: 8.5, color: { argb: C.muted } }
    r++
  }

  if (rep.grupos.length > 0) ws.views = [{ showGridLines: false, state: "frozen", ySplit: primeraFila - 1 }]
}

/* ─── Hoja Órdenes ─── */

function buildOrdenes(wb: any, rep: ReporteOrdenes) {
  const ws = wb.addWorksheet("Órdenes", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 16 }, { width: 12 }, { width: 26 }, { width: 38 },
    { width: 18 }, { width: 14 }, { width: 11 }, { width: 11 }, { width: 16 },
  ]
  const LAST = 9
  let r = tituloHoja(ws, rep, "ÓRDENES DEL PERIODO", LAST)

  headerRow(
    ws, r,
    ["FOLIO", "FECHA", "EMPRESA", "OBRA", "TIPO", "ESTADO", "RENGLONES", "PIEZAS", "IMPORTE"],
    ["left", "center", "left", "left", "left", "left", "center", "center", "right"],
  )
  const filaHeader = r
  r++

  // Las órdenes van de la más reciente a la más antigua, sin importar la obra:
  // así se lee como una bitácora del periodo.
  const todas = rep.grupos
    .flatMap((g) => g.ordenes.map((o) => ({ ...o, obra: g.obra, empresa: g.esAlmacen ? "Almacén" : g.empresa })))
    .sort((a, b) => b.fecha.localeCompare(a.fecha) || a.folio.localeCompare(b.folio))

  todas.forEach((o, i) => {
    const fila = [
      o.folio,
      new Date(o.fecha),
      o.empresa ?? "",
      o.obra,
      TIPO_LABEL[o.tipo] ?? o.tipo,
      ESTADO_LABEL[o.estado] ?? o.estado,
      o.renglones,
      o.piezas,
      o.importe,
    ]
    fila.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1)
      cell.value = v
      if (j === 1) cell.numFmt = FECHA
      else if (j === 8) cell.numFmt = MONEY
      else if (j === 6 || j === 7) cell.numFmt = NUM
      cell.font = {
        size: 10,
        bold: j === 0 || j === 8,
        color: { argb: j === 5 ? (o.ejercida ? C.green : C.orange) : C.ink },
      }
      cell.alignment = {
        horizontal: j === 1 || j === 6 || j === 7 ? "center" : j === 8 ? "right" : "left",
      }
      if (i % 2 === 1) fillCell(cell, C.rowAlt)
      borderAll(cell)
    })
    r++
  })

  if (todas.length > 0) {
    const cell = ws.getCell(r, 8)
    cell.value = "TOTAL"
    cell.font = { bold: true, size: 10, color: { argb: C.white } }
    fillCell(cell, C.navy)
    cell.alignment = { horizontal: "right" }
    const tot = ws.getCell(r, 9)
    tot.value = rep.totales.total
    tot.numFmt = MONEY
    tot.font = { bold: true, size: 11, color: { argb: C.white } }
    fillCell(tot, C.navy)
    tot.alignment = { horizontal: "right" }

    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
  }
}

/* ─── Hoja Artículos ─── */

function buildArticulos(wb: any, rep: ReporteOrdenes) {
  const ws = wb.addWorksheet("Artículos", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 7 }, { width: 18 }, { width: 58 },
    { width: 13 }, { width: 13 }, { width: 11 }, { width: 16 },
  ]
  const LAST = 7
  let r = tituloHoja(ws, rep, "ARTÍCULOS: DEL MÁS UTILIZADO AL MENOS UTILIZADO", LAST)

  headerRow(
    ws, r,
    ["#", "CÓDIGO", "DESCRIPCIÓN", "SURTIDO", "APARTADO", "ÓRDENES", "IMPORTE"],
    ["center", "left", "left", "center", "center", "center", "right"],
  )
  const filaHeader = r
  r++

  rep.articulos.forEach((a, i) => {
    const podio = i < 3 && a.cantidad > 0
    const fila = [i + 1, a.codigo, a.descripcion, a.cantidad, a.pendiente, a.ordenes, a.importe]
    fila.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1)
      cell.value = v
      if (j === 6) cell.numFmt = MONEY
      else if (j >= 3) cell.numFmt = NUM
      cell.font = {
        size: 10,
        bold: podio || j === 3 || j === 6,
        color: { argb: j === 4 && a.pendiente > 0 ? C.orange : j === 0 && podio ? C.blue : C.ink },
      }
      cell.alignment = { horizontal: j === 1 || j === 2 ? "left" : j === 6 ? "right" : "center" }
      if (podio) fillCell(cell, C.podio)
      else if (i % 2 === 1) fillCell(cell, C.rowAlt)
      borderAll(cell)
    })
    r++
  })

  if (rep.articulos.length === 0) {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = "Sin artículos surtidos en el periodo seleccionado."
    cell.font = { italic: true, size: 10, color: { argb: C.muted } }
    cell.alignment = { horizontal: "center" }
    r += 2
  } else {
    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
    r++
  }

  ws.mergeCells(r, 1, r, LAST)
  const nota = ws.getCell(r, 1)
  nota.value =
    "Surtido: cantidad entregada en órdenes ya salidas del almacén, que es la base del ranking. Apartado: material de órdenes abiertas que todavía no sale."
  nota.font = { size: 8.5, color: { argb: C.muted } }
  nota.alignment = { wrapText: true }
}

/* ─── Hoja Detalle ─── */

function buildDetalle(wb: any, rep: ReporteOrdenes) {
  const ws = wb.addWorksheet("Detalle", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 16 }, { width: 12 }, { width: 26 }, { width: 34 },
    { width: 18 }, { width: 14 }, { width: 18 }, { width: 50 },
    { width: 11 }, { width: 15 }, { width: 16 },
  ]
  const LAST = 11
  let r = tituloHoja(ws, rep, "DETALLE POR RENGLÓN", LAST)

  headerRow(
    ws, r,
    ["FOLIO", "FECHA", "EMPRESA", "OBRA", "TIPO", "ESTADO", "CÓDIGO", "DESCRIPCIÓN", "CANTIDAD", "P. UNIT. C/IVA", "IMPORTE"],
    ["left", "center", "left", "left", "left", "left", "left", "left", "center", "right", "right"],
  )
  const filaHeader = r
  r++

  rep.renglones.forEach((d, i) => {
    const fila = [
      d.folio,
      new Date(d.fecha),
      d.empresa ?? "",
      d.obra,
      TIPO_LABEL[d.tipo] ?? d.tipo,
      ESTADO_LABEL[d.estado] ?? d.estado,
      d.codigo,
      d.descripcion,
      d.cantidad,
      d.precio,
      d.importe,
    ]
    fila.forEach((v, j) => {
      const cell = ws.getCell(r, j + 1)
      cell.value = v
      if (j === 1) cell.numFmt = FECHA
      else if (j >= 9) cell.numFmt = MONEY
      else if (j === 8) cell.numFmt = NUM
      cell.font = {
        size: 9.5,
        bold: j === 10,
        color: { argb: j === 5 ? (d.ejercida ? C.green : C.orange) : C.ink },
      }
      cell.alignment = {
        horizontal: j === 1 || j === 8 ? "center" : j >= 9 ? "right" : "left",
      }
      if (i % 2 === 1) fillCell(cell, C.rowAlt)
      borderAll(cell)
    })
    r++
  })

  if (rep.renglones.length > 0) {
    const cell = ws.getCell(r, 10)
    cell.value = "TOTAL"
    cell.font = { bold: true, size: 10, color: { argb: C.white } }
    fillCell(cell, C.navy)
    cell.alignment = { horizontal: "right" }
    const tot = ws.getCell(r, 11)
    tot.value = rep.totales.total
    tot.numFmt = MONEY
    tot.font = { bold: true, size: 11, color: { argb: C.white } }
    fillCell(tot, C.navy)
    tot.alignment = { horizontal: "right" }

    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
  }
}
