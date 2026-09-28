/**
 * RAFSA – Generador de Estado de Cuenta (EDC) en Excel (.xlsx)
 *
 * Reutiliza la misma estructura de datos que el PDF (EDCEmpresa[] de edcPdf):
 *   • Hoja "Resumen": resumen por obra (monto, pagado, saldo, %), subtotales,
 *     total general y saldo exigible.
 *   • Hoja "Detalle": por obra, resumen de contrato + estimaciones (con
 *     amortización, retención y neto), aditivas, fondo de garantía y totales.
 *
 * ExcelJS se importa dinámicamente para no pesar en el bundle principal.
 * Requiere la dependencia: npm install exceljs
 */

import type { EDCEmpresa, EDCObra } from "@/lib/edcPdf"

const MONEY = '"$"#,##0.00'

// Colores (ARGB)
const C = {
  blue: "FF1F71B5",
  blueDk: "FF144A8A",
  grayHdr: "FFDBDEE2",
  graySub: "FFE8EBEE",
  rowAlt: "FFF6F8FA",
  white: "FFFFFFFF",
  ink: "FF212529",
  green: "FF1E7A3C",
  orange: "FFCC6A18",
  red: "FFB22222",
  amber: "FFFFE482",
  box: "FFF4F6F8",
}

const statusLabel = (s: string): string =>
  ({ closed: "TERMINADA", in_progress: "EN PROGRESO", paused: "EN PAUSA", planned: "POR INICIAR" } as Record<string, string>)[s] ?? s
const statusArgb = (s: string): string =>
  s === "closed" ? C.green : s === "in_progress" ? C.blue : s === "paused" ? "FF5A6068" : C.orange
const isEjecutada = (s: string) => s !== "planned"
const facLabel = (s: string | null): string =>
  !s ? "" : (({ pending: "Pendiente", paid: "Pagada", partial: "Saldo pend." } as Record<string, string>)[s] ?? s)
const facArgb = (s: string | null): string =>
  s === "paid" ? C.green : s === "partial" ? C.orange : s === "pending" ? C.red : C.ink

export async function generateEDCExcel(
  empresas: EDCEmpresa[],
  date: Date = new Date(),
  generatedBy = "Sistema",
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "RAFSA ERP"
  wb.created = date

  const multi = empresas.length > 1
  const subtitle = multi ? "RESUMEN CONSOLIDADO DE EMPRESAS" : (empresas[0]?.name ?? "")
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  const dateLong = date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })

  buildResumen(ExcelJS, wb, empresas, subtitle, dateLong, ymd, generatedBy, multi)
  buildDetalle(ExcelJS, wb, empresas, subtitle, dateLong, generatedBy)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `EDC_RAFSA_${ymd}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Helpers de estilo ─── */

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

/* ─── Hoja Resumen ─── */

function buildResumen(
  ExcelJS: any, wb: any, empresas: EDCEmpresa[],
  subtitle: string, dateLong: string, ymd: string, generatedBy: string, multi: boolean,
) {
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 6 }, { width: 40 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 10 },
  ]
  const LASTCOL = 7
  let r = 1

  // Título
  ws.mergeCells(r, 1, r, LASTCOL)
  let c = ws.getCell(r, 1)
  c.value = "ESTADO DE CUENTA"
  c.font = { bold: true, size: 18, color: { argb: C.blueDk } }
  c.alignment = { horizontal: "center" }
  ws.getRow(r).height = 24
  r++

  ws.mergeCells(r, 1, r, LASTCOL)
  c = ws.getCell(r, 1)
  c.value = subtitle
  c.font = { bold: true, size: 11, color: { argb: C.blue } }
  c.alignment = { horizontal: "center" }
  r++

  ws.mergeCells(r, 1, r, LASTCOL)
  c = ws.getCell(r, 1)
  c.value = `Fecha de generación: ${dateLong}     ·     Folio: EDC-${ymd}     ·     Elaboró: ${generatedBy}`
  c.font = { size: 9, color: { argb: "FF5A6068" } }
  c.alignment = { horizontal: "center" }
  r++
  r++ // blank

  let gExigible = 0
  let gMonto = 0, gPag = 0, gSaldo = 0

  const headerRow = () => {
    const row = ws.getRow(r)
    const heads = ["No.", "OBRA", "ESTATUS", "MONTO C/IVA", "PAGADO", "SALDO", "% PAG."]
    heads.forEach((h, i) => {
      const cell = row.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, size: 9, color: { argb: C.ink } }
      fillCell(cell, C.grayHdr)
      borderAll(cell)
      cell.alignment = { horizontal: i >= 3 ? "right" : i === 0 ? "center" : "left" }
    })
    r++
  }

  const moneyCell = (row: any, col: number, val: number, bold = false, argb = C.ink) => {
    const cell = row.getCell(col)
    cell.value = val
    cell.numFmt = MONEY
    cell.font = { size: 9, bold, color: { argb } }
    cell.alignment = { horizontal: "right" }
    borderAll(cell)
  }

  const totalRow = (label: string, monto: number, pag: number, saldo: number, blue: boolean) => {
    const row = ws.getRow(r)
    ws.mergeCells(r, 1, r, 3)
    const lc = row.getCell(1)
    lc.value = label
    lc.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }
    lc.alignment = { horizontal: "right" }
    for (let i = 1; i <= 3; i++) { fillCell(row.getCell(i), blue ? C.blueDk : C.graySub); borderAll(row.getCell(i)) }
    moneyCell(row, 4, monto, true, blue ? C.white : C.ink)
    moneyCell(row, 5, pag, true, blue ? C.white : C.ink)
    moneyCell(row, 6, saldo, true, blue ? C.white : C.ink)
    const pc = row.getCell(7)
    pc.value = monto > 0 ? Math.round((pag / monto) * 1000) / 10 / 100 : 0
    pc.numFmt = "0.0%"
    pc.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }
    pc.alignment = { horizontal: "right" }
    borderAll(pc)
    for (let i = 4; i <= 7; i++) fillCell(row.getCell(i), blue ? C.blueDk : C.graySub)
    r++
  }

  for (const empresa of empresas) {
    // Barra de empresa / sección
    ws.mergeCells(r, 1, r, LASTCOL)
    const bar = ws.getCell(r, 1)
    bar.value = multi ? `RESUMEN POR OBRA · ${empresa.name.toUpperCase()}` : "RESUMEN POR OBRA · IMPORTES CON IVA (MXN)"
    bar.font = { bold: true, size: 10, color: { argb: C.white } }
    fillCell(bar, C.blue)
    bar.alignment = { horizontal: "left", indent: 1 }
    ws.getRow(r).height = 18
    r++

    headerRow()

    let eMonto = 0, ePag = 0, eSaldo = 0
    let ejM = 0, ejP = 0, ejS = 0, peM = 0, peP = 0, peS = 0
    let idx = 0
    let alt = false
    for (const obra of empresa.obras) {
      idx++
      const monto = obra.budget, pag = obra.spent, saldo = monto - pag
      const row = ws.getRow(r)
      const bg = alt ? C.rowAlt : C.white
      alt = !alt
      const noC = row.getCell(1); noC.value = idx; noC.alignment = { horizontal: "center" }; noC.font = { size: 9, color: { argb: C.ink } }; fillCell(noC, bg); borderAll(noC)
      const nameC = row.getCell(2); nameC.value = obra.name; nameC.font = { size: 9, color: { argb: C.ink } }; fillCell(nameC, bg); borderAll(nameC)
      const stC = row.getCell(3); stC.value = statusLabel(obra.status); stC.font = { size: 8, bold: true, color: { argb: statusArgb(obra.status) } }; fillCell(stC, bg); borderAll(stC)
      moneyCell(row, 4, monto); fillCell(row.getCell(4), bg)
      moneyCell(row, 5, pag); fillCell(row.getCell(5), bg)
      moneyCell(row, 6, saldo, true); fillCell(row.getCell(6), bg)
      const pc = row.getCell(7); pc.value = monto > 0 ? (pag / monto) : 0; pc.numFmt = "0.0%"; pc.font = { size: 9, color: { argb: "FF5A6068" } }; pc.alignment = { horizontal: "right" }; fillCell(pc, bg); borderAll(pc)
      r++
      eMonto += monto; ePag += pag; eSaldo += saldo
      if (isEjecutada(obra.status)) { ejM += monto; ejP += pag; ejS += saldo; gExigible += saldo }
      else { peM += monto; peP += pag; peS += saldo }
    }

    if (ejM !== 0 || ejP !== 0) totalRow("SUBTOTAL OBRA EJECUTADA", ejM, ejP, ejS, false)
    if (peM !== 0) totalRow("OBRA CONTRATADA POR EJERCER (POR INICIAR)", peM, peP, peS, false)
    totalRow(multi ? `SUBTOTAL ${empresa.name.toUpperCase()}` : "TOTAL GENERAL", eMonto, ePag, eSaldo, true)

    gMonto += eMonto; gPag += ePag; gSaldo += eSaldo
    r++ // blank
  }

  if (multi) { totalRow("TOTAL GENERAL (TODAS LAS EMPRESAS)", gMonto, gPag, gSaldo, true); r++ }

  // Saldo exigible
  ws.mergeCells(r, 1, r, 4)
  const se = ws.getCell(r, 1)
  se.value = "SALDO EXIGIBLE A LA FECHA (SOLO OBRA EJECUTADA):"
  se.font = { bold: true, size: 10, color: { argb: C.blueDk } }
  se.alignment = { horizontal: "right" }
  ws.mergeCells(r, 5, r, 6)
  const sev = ws.getCell(r, 5)
  sev.value = gExigible
  sev.numFmt = MONEY
  sev.font = { bold: true, size: 11, color: { argb: C.ink } }
  sev.alignment = { horizontal: "center" }
  fillCell(sev, C.amber)
  borderAll(sev)
  r += 2

  // Notas
  const notas = [
    "NOTAS:",
    "1. Todos los importes incluyen IVA y están expresados en pesos mexicanos (MXN).",
    "2. El saldo exigible corresponde únicamente a la obra ejecutada; la obra por iniciar no forma parte del saldo exigible.",
    "3. El neto a facturar de cada estimación descuenta la retención por fondo de garantía y la amortización de anticipo.",
  ]
  notas.forEach((n, i) => {
    ws.mergeCells(r, 1, r, LASTCOL)
    const cell = ws.getCell(r, 1)
    cell.value = n
    cell.font = { size: 8, bold: i === 0, color: { argb: "FF5A6068" } }
    r++
  })
}

/* ─── Hoja Detalle ─── */

function buildDetalle(
  ExcelJS: any, wb: any, empresas: EDCEmpresa[], subtitle: string, dateLong: string, generatedBy: string,
) {
  const ws = wb.addWorksheet("Detalle", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 10 }, { width: 42 }, { width: 16 }, { width: 15 }, { width: 15 },
    { width: 16 }, { width: 16 }, { width: 13 }, { width: 16 }, { width: 16 },
  ]
  const LASTCOL = 10
  let r = 1

  ws.mergeCells(r, 1, r, LASTCOL)
  let c = ws.getCell(r, 1)
  c.value = "ESTADO DE CUENTA · DETALLE POR OBRA"
  c.font = { bold: true, size: 15, color: { argb: C.blueDk } }
  ws.getRow(r).height = 22
  r++
  ws.mergeCells(r, 1, r, LASTCOL)
  c = ws.getCell(r, 1)
  c.value = `${subtitle}     ·     ${dateLong}     ·     Elaboró: ${generatedBy}`
  c.font = { size: 9, color: { argb: "FF5A6068" } }
  r += 2

  const moneyCell = (row: any, col: number, val: number | null, bold = false, argb = C.ink, bg?: string) => {
    const cell = row.getCell(col)
    if (val === null) { cell.value = "—"; cell.alignment = { horizontal: "right" }; cell.font = { size: 9, color: { argb: "FF9AA0A6" } } }
    else { cell.value = val; cell.numFmt = MONEY; cell.font = { size: 9, bold, color: { argb } }; cell.alignment = { horizontal: "right" } }
    borderAll(cell)
    if (bg) fillCell(cell, bg)
  }

  const tableHeader = () => {
    const heads = ["EST.", "DESCRIPCIÓN", "MONTO C/IVA", "AMORTIZACIÓN", "RETENCIÓN", "NETO A FACTURAR", "FACTURA", "ESTADO", "FACTURADO", "PAGADO"]
    const row = ws.getRow(r)
    heads.forEach((h, i) => {
      const cell = row.getCell(i + 1)
      cell.value = h
      cell.font = { bold: true, size: 8, color: { argb: C.ink } }
      fillCell(cell, C.grayHdr)
      borderAll(cell)
      cell.alignment = { horizontal: i === 0 ? "center" : (i >= 2 && i !== 6 && i !== 7) ? "right" : "left" }
    })
    r++
  }

  let gEjP = 0, gEjT = 0, gEjS = 0, gPeP = 0, gPeT = 0, gPeS = 0

  for (const empresa of empresas) {
    if (empresas.length > 1) {
      ws.mergeCells(r, 1, r, LASTCOL)
      const bar = ws.getCell(r, 1)
      bar.value = `EMPRESA: ${empresa.name.toUpperCase()}`
      bar.font = { bold: true, size: 11, color: { argb: C.white } }
      fillCell(bar, C.blueDk)
      bar.alignment = { horizontal: "left", indent: 1 }
      ws.getRow(r).height = 18
      r++
    }

    for (const obra of empresa.obras) {
      // Barra de obra
      ws.mergeCells(r, 1, r, 8)
      const bar = ws.getCell(r, 1)
      bar.value = `${obra.name.toUpperCase()}${obra.code ? `   ·   ${obra.code}` : ""}`
      bar.font = { bold: true, size: 10, color: { argb: C.white } }
      fillCell(bar, C.blue)
      bar.alignment = { horizontal: "left", indent: 1 }
      ws.mergeCells(r, 9, r, 10)
      const st = ws.getCell(r, 9)
      st.value = `OBRA ${statusLabel(obra.status)}`
      st.font = { bold: true, size: 9, color: { argb: C.white } }
      fillCell(st, statusArgb(obra.status))
      st.alignment = { horizontal: "center" }
      ws.getRow(r).height = 16
      r++

      // Resumen de contrato
      const montoContrato = obra.contractTotal > 0 ? obra.contractTotal : obra.budget
      const parts: string[] = [
        `Monto contrato: ${money(montoContrato)}`,
        `Cotización: ${money(obra.cotizacion)}`,
      ]
      if (obra.aditivasTotal > 0) parts.push(`Aditivas: ${money(obra.aditivasTotal)}`)
      if (obra.anticipoAmount > 0 || obra.anticipoPct > 0) parts.push(`Anticipo (${obra.anticipoPct}%): ${money(obra.anticipoAmount)}${obra.anticipoPaid > 0 ? ` (pagado ${money(obra.anticipoPaid)})` : ""}`)
      if (obra.garantiaAmount > 0 || obra.garantiaPct > 0) parts.push(`Fondo de garantía (${obra.garantiaPct}%): ${money(obra.garantiaAmount)}`)
      ws.mergeCells(r, 1, r, LASTCOL)
      const cs = ws.getCell(r, 1)
      cs.value = parts.join("     ·     ")
      cs.font = { size: 8.5, color: { argb: C.ink } }
      fillCell(cs, C.box)
      borderAll(cs)
      cs.alignment = { horizontal: "left", indent: 1 }
      r++

      tableHeader()

      // Filas de estimaciones + aditivas + garantía
      let tM = 0, tA = 0, tR = 0, tN = 0, tF = 0, tP = 0
      let alt = false
      const drawRow = (opts: {
        label: string; desc: string; isAnt?: boolean; monto: number; amort: number; ret: number; neto: number;
        facNum: string | null; facStatus: string | null; facAmt: number | null; facPaid: number
      }) => {
        const bg = alt ? C.rowAlt : C.white
        alt = !alt
        const row = ws.getRow(r)
        const lc = row.getCell(1); lc.value = opts.label; lc.font = { bold: true, size: 8.5, color: { argb: opts.isAnt ? C.blue : C.ink } }; lc.alignment = { horizontal: "center" }; fillCell(lc, bg); borderAll(lc)
        const dc = row.getCell(2); dc.value = opts.desc; dc.font = { size: 8.5, color: { argb: C.ink } }; fillCell(dc, bg); borderAll(dc)
        moneyCell(row, 3, opts.monto, false, C.ink, bg)
        moneyCell(row, 4, opts.amort > 0 ? opts.amort : null, false, C.red, bg)
        moneyCell(row, 5, opts.ret > 0 ? opts.ret : null, false, C.red, bg)
        moneyCell(row, 6, opts.neto, true, C.ink, bg)
        const fc = row.getCell(7); fc.value = opts.facNum ?? "Sin factura"; fc.font = { size: 8.5, color: { argb: opts.facNum ? C.ink : "FF9AA0A6" } }; fillCell(fc, bg); borderAll(fc)
        const sc = row.getCell(8); sc.value = facLabel(opts.facStatus); sc.font = { size: 8, bold: true, color: { argb: facArgb(opts.facStatus) } }; sc.alignment = { horizontal: "left" }; fillCell(sc, bg); borderAll(sc)
        moneyCell(row, 9, opts.facAmt, false, C.ink, bg)
        moneyCell(row, 10, opts.facPaid > 0 ? opts.facPaid : null, false, C.green, bg)
        r++
        tM += opts.monto; tA += opts.amort; tR += opts.ret; tN += opts.neto; tF += opts.facAmt ?? 0; tP += opts.facPaid
      }

      const anticipo = obra.estimaciones.find((e) => e.isAnticipo)
      if (anticipo) drawRow({ label: "Anticipo", desc: anticipo.description, isAnt: true, monto: anticipo.amount, amort: 0, ret: 0, neto: anticipo.neto, facNum: anticipo.facturaNumber, facStatus: anticipo.facturaStatus, facAmt: anticipo.facturaAmount, facPaid: anticipo.facturaPaid })
      obra.estimaciones.filter((e) => !e.isAnticipo).sort((a, b) => a.number - b.number).forEach((e) =>
        drawRow({ label: `#${e.number}`, desc: e.description, monto: e.amount, amort: e.amortizacion, ret: e.retencion, neto: e.neto, facNum: e.facturaNumber, facStatus: e.facturaStatus, facAmt: e.facturaAmount, facPaid: e.facturaPaid }))

      if (obra.estimaciones.length === 0 && obra.aditivas.length === 0) {
        ws.mergeCells(r, 1, r, LASTCOL)
        const cell = ws.getCell(r, 1)
        cell.value = "Sin estimaciones registradas para esta obra."
        cell.font = { italic: true, size: 8.5, color: { argb: "FF9AA0A6" } }
        borderAll(cell)
        r++
      }

      // Aditivas
      if (obra.aditivas.length > 0) {
        ws.mergeCells(r, 1, r, LASTCOL)
        const ah = ws.getCell(r, 1)
        ah.value = "ADITIVAS"
        ah.font = { bold: true, size: 8, color: { argb: C.blueDk } }
        fillCell(ah, C.graySub)
        borderAll(ah)
        ah.alignment = { horizontal: "left", indent: 1 }
        r++
        obra.aditivas.forEach((ad) =>
          drawRow({ label: "Aditiva", desc: ad.description, monto: ad.amount, amort: 0, ret: 0, neto: ad.amount, facNum: ad.facturaNumber, facStatus: ad.facturaStatus, facAmt: ad.facturaAmount, facPaid: ad.facturaPaid }))
      }

      // Fondo de garantía (si aplica)
      if (obra.garantiaAmount > 0 || obra.garantiaPct > 0) {
        const row = ws.getRow(r)
        const lc = row.getCell(1); lc.value = "F.G."; lc.font = { bold: true, size: 8, color: { argb: C.blue } }; lc.alignment = { horizontal: "center" }; fillCell(lc, C.box); borderAll(lc)
        const dc = row.getCell(2); dc.value = `Fondo de garantía (${obra.garantiaPct}%)`; dc.font = { bold: true, size: 8.5, color: { argb: C.ink } }; fillCell(dc, C.box); borderAll(dc)
        moneyCell(row, 3, null, false, C.ink, C.box)
        moneyCell(row, 4, null, false, C.ink, C.box)
        moneyCell(row, 5, obra.garantiaAmount, true, C.red, C.box)
        for (let i = 6; i <= 10; i++) { const cell = row.getCell(i); cell.value = ""; borderAll(cell); fillCell(cell, C.box) }
        r++
      }

      // Totales de la tabla
      const trow = ws.getRow(r)
      ws.mergeCells(r, 1, r, 2)
      const tl = trow.getCell(1); tl.value = "TOTALES"; tl.font = { bold: true, size: 8.5, color: { argb: C.ink } }; tl.alignment = { horizontal: "right" }; fillCell(tl, C.graySub); fillCell(trow.getCell(2), C.graySub); borderAll(trow.getCell(1)); borderAll(trow.getCell(2))
      moneyCell(trow, 3, tM, true, C.ink, C.graySub)
      moneyCell(trow, 4, tA, true, C.ink, C.graySub)
      moneyCell(trow, 5, tR, true, C.ink, C.graySub)
      moneyCell(trow, 6, tN, true, C.ink, C.graySub)
      const e7 = trow.getCell(7); e7.value = ""; fillCell(e7, C.graySub); borderAll(e7)
      const e8 = trow.getCell(8); e8.value = ""; fillCell(e8, C.graySub); borderAll(e8)
      moneyCell(trow, 9, tF, true, C.ink, C.graySub)
      moneyCell(trow, 10, tP, true, C.ink, C.graySub)
      r++

      // Resumen de la obra
      const saldo = obra.budget - obra.spent
      ws.mergeCells(r, 1, r, 5)
      const rl = ws.getCell(r, 1); rl.value = "RESUMEN DE LA OBRA"; rl.font = { bold: true, size: 8.5, color: { argb: C.ink } }; rl.alignment = { horizontal: "left", indent: 1 }; fillCell(rl, C.graySub)
      for (let i = 1; i <= 5; i++) borderAll(ws.getCell(r, i))
      ws.mergeCells(r, 6, r, 10)
      const rv = ws.getCell(r, 6)
      rv.value = `Suma trabajos: ${money(obra.budget)}     ·     Cobrado: ${money(obra.spent)}     ·     Saldo por cobrar: ${money(saldo)}`
      rv.font = { bold: true, size: 8.5, color: { argb: C.ink } }
      rv.alignment = { horizontal: "right" }
      fillCell(rv, C.graySub)
      borderAll(rv)
      r += 2

      if (isEjecutada(obra.status)) { gEjP += obra.spent; gEjT += obra.budget; gEjS += saldo }
      else { gPeP += obra.spent; gPeT += obra.budget; gPeS += saldo }
    }
  }

  // TOTALES generales
  ws.mergeCells(r, 1, r, LASTCOL)
  const tb = ws.getCell(r, 1)
  tb.value = "TOTALES"
  tb.font = { bold: true, size: 11, color: { argb: C.white } }
  fillCell(tb, C.blueDk)
  tb.alignment = { horizontal: "left", indent: 1 }
  r++

  const totRow = (label: string, p: number, t: number, s: number, blue: boolean) => {
    const row = ws.getRow(r)
    ws.mergeCells(r, 1, r, 6)
    const lc = row.getCell(1); lc.value = label; lc.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }; lc.alignment = { horizontal: "right" }
    for (let i = 1; i <= 6; i++) { fillCell(row.getCell(i), blue ? C.blueDk : C.graySub); borderAll(row.getCell(i)) }
    // columnas: 7 SUMA PAGOS, 8 SUMA TRABAJOS, 9-10 SALDO
    const pC = row.getCell(7); pC.value = p; pC.numFmt = MONEY; pC.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }; pC.alignment = { horizontal: "right" }; fillCell(pC, blue ? C.blueDk : C.graySub); borderAll(pC)
    const tC = row.getCell(8); tC.value = t; tC.numFmt = MONEY; tC.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }; tC.alignment = { horizontal: "right" }; fillCell(tC, blue ? C.blueDk : C.graySub); borderAll(tC)
    ws.mergeCells(r, 9, r, 10)
    const sC = row.getCell(9); sC.value = s; sC.numFmt = MONEY; sC.font = { bold: true, size: 9, color: { argb: blue ? C.white : C.ink } }; sC.alignment = { horizontal: "right" }; fillCell(sC, blue ? C.blueDk : C.graySub); fillCell(row.getCell(10), blue ? C.blueDk : C.graySub); borderAll(sC); borderAll(row.getCell(10))
    r++
  }
  // Encabezado de columnas de totales
  const hr = ws.getRow(r)
  const h7 = hr.getCell(7); h7.value = "SUMA PAGOS"; h7.font = { bold: true, size: 8, color: { argb: C.ink } }; h7.alignment = { horizontal: "right" }; fillCell(h7, C.grayHdr); borderAll(h7)
  const h8 = hr.getCell(8); h8.value = "SUMA TRABAJOS"; h8.font = { bold: true, size: 8, color: { argb: C.ink } }; h8.alignment = { horizontal: "right" }; fillCell(h8, C.grayHdr); borderAll(h8)
  ws.mergeCells(r, 9, r, 10)
  const h9 = hr.getCell(9); h9.value = "SALDO"; h9.font = { bold: true, size: 8, color: { argb: C.ink } }; h9.alignment = { horizontal: "right" }; fillCell(h9, C.grayHdr); fillCell(hr.getCell(10), C.grayHdr); borderAll(h9); borderAll(hr.getCell(10))
  for (let i = 1; i <= 6; i++) { const cell = hr.getCell(i); fillCell(cell, C.grayHdr); borderAll(cell) }
  r++

  totRow("OBRA EJECUTADA (EN CURSO / TERMINADA)", gEjP, gEjT, gEjS, false)
  totRow("OBRA CONTRATADA POR EJERCER (POR INICIAR)", gPeP, gPeT, gPeS, false)
  totRow("TOTAL GENERAL", gEjP + gPeP, gEjT + gPeT, gEjS + gPeS, true)
}

function money(n: number): string {
  return "$" + (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
