/**
 * RAFSA – Generador de Estado de Cuenta (EDC) en PDF
 *
 * Estructura inspirada en el formato preferido por el cliente:
 *   • Página 1 (VERTICAL): resumen ejecutivo de todo lo que abarca el EDC
 *     — resumen por obra (monto, pagado, saldo, % pagado), subtotales por
 *     empresa, total general, saldo exigible y notas.
 *   • Páginas siguientes (HORIZONTAL): desarrollo detallado por empresa y obra
 *     — resumen de contrato (anticipo, fondo de garantía, neto a facturar,
 *     facturado), estimaciones como columnas (EST 1..N), aditivas, y las
 *     columnas SUMA PAGOS / SUMA TRABAJOS / SALDO.
 */

import { jsPDF } from "jspdf"

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type EDCPago = {
  concept: "deposit" | "advance" | "retention" | "return"
  date: string | null
  amount: number
}

export type EDCEstimacion = {
  number: number
  label: string
  description: string
  isAnticipo: boolean
  status: string
  amount: number
  retencion: number
  amortizacion: number
  neto: number
  facturaNumber: string | null
  facturaAmount: number | null
  facturaPaid: number
  facturaStatus: string | null
}

export type EDCAditiva = {
  description: string
  amount: number
  facturaNumber: string | null
  facturaAmount: number | null
  facturaPaid: number
  facturaStatus: string | null
}

export type EDCObra = {
  id: string
  code: string | null
  name: string
  clientName: string | null
  location: string
  status: string

  contractTotal: number
  cotizacion: number
  aditivasTotal: number
  budget: number
  anticipoPct: number
  anticipoAmount: number
  anticipoPaid: number
  garantiaPct: number
  garantiaAmount: number
  saldoContrato: number

  estimaciones: EDCEstimacion[]
  aditivas: EDCAditiva[]
  facturadoTotal: number

  spent: number
  pagos: EDCPago[]
}

export type EDCEmpresa = {
  id: string
  name: string
  obras: EDCObra[]
}

// ── Colores ───────────────────────────────────────────────────────────────────

type RGB = { r: number; g: number; b: number }
const BLUE_BAR = { r: 31, g: 113, b: 181 }   // barras de sección
const BLUE_DK = { r: 20, g: 74, b: 138 }     // totales / títulos
const BLUE_TXT = { r: 21, g: 92, b: 158 }    // subtítulos
const GRAY_HDR = { r: 219, g: 222, b: 226 }  // encabezado de columnas
const GRAY_SUB = { r: 232, g: 235, b: 238 }  // subtotales
const BG_COT = { r: 237, g: 240, b: 243 }    // fila de totales de tabla
const INK = { r: 33, g: 37, b: 41 }
const MID = { r: 90, g: 96, b: 104 }
const LITE = { r: 140, g: 146, b: 154 }
const RULE = { r: 196, g: 201, b: 207 }
const WHITE = { r: 255, g: 255, b: 255 }
const GREEN = { r: 33, g: 138, b: 60 }
const ORANGE = { r: 214, g: 104, b: 20 }
const AMBER_HL = { r: 255, g: 228, b: 130 }
const RED_DED = { r: 178, g: 34, b: 34 }

// ── Geometría ───────────────────────────────────────────────────────────────

const MARGIN = 12
const HEADER_BOTTOM = 48          // inicio de contenido en la página 1 (vertical)
const DETAIL_HEADER_BOTTOM = 31   // inicio de contenido en la 1ª página horizontal
const DETAIL_TOP = 14             // inicio de contenido en páginas horizontales sin encabezado

// ── Helpers de dibujo ─────────────────────────────────────────────────────────

const fill = (doc: jsPDF, c: RGB) => doc.setFillColor(c.r, c.g, c.b)
const txt = (doc: jsPDF, c: RGB) => doc.setTextColor(c.r, c.g, c.b)
const stroke = (doc: jsPDF, c: RGB) => doc.setDrawColor(c.r, c.g, c.b)

function fmtNum(n: number): string {
  return (n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtMoney(n: number): string {
  return "$" + fmtNum(n)
}
function trunc(text: string, max: number): string {
  if (!text) return ""
  return text.length <= max ? text : text.slice(0, max - 1) + "…"
}

function statusStyle(s: string): { label: string; color: RGB } {
  switch (s) {
    case "closed": return { label: "TERMINADA", color: GREEN }
    case "in_progress": return { label: "EN PROGRESO", color: BLUE_BAR }
    case "paused": return { label: "EN PAUSA", color: MID }
    default: return { label: "POR INICIAR", color: ORANGE }
  }
}
const isEjecutada = (s: string) => s !== "planned"

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/brand/rafsa-logo.png")
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => reject(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Función principal ──────────────────────────────────────────────────────────

export async function generateEDCPdf(
  empresas: EDCEmpresa[],
  date: Date = new Date(),
  generatedBy = "Sistema",
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" })
  const logo = await loadLogoDataUrl()
  const multi = empresas.length > 1
  const subtitle = multi ? "RESUMEN CONSOLIDADO DE EMPRESAS" : (empresas[0]?.name || "").toUpperCase()

  // ═══════════ PÁGINA 1 — RESUMEN (VERTICAL) ═══════════
  const WP = doc.internal.pageSize.getWidth()
  drawDocHeader(doc, WP, date, logo, subtitle, false, generatedBy, false)
  drawResumenPage(doc, empresas, date, generatedBy, multi, logo)

  // ═══════════ DETALLE (HORIZONTAL) ═══════════
  doc.addPage("letter", "landscape")
  const WL = doc.internal.pageSize.getWidth()
  const HL = doc.internal.pageSize.getHeight()
  drawDocHeader(doc, WL, date, logo, subtitle, true, generatedBy)

  let y = DETAIL_HEADER_BOTTOM

  // Acumuladores para TOTALES
  let ejPagos = 0, ejTrab = 0, ejSaldo = 0
  let perPagos = 0, perTrab = 0, perSaldo = 0

  // Las páginas horizontales siguientes NO llevan encabezado ni pie.
  const newLandscape = () => {
    doc.addPage("letter", "landscape")
    return DETAIL_TOP
  }

  for (let ei = 0; ei < empresas.length; ei++) {
    const empresa = empresas[ei]

    if (multi) {
      if (y + 14 > HL - 16) y = newLandscape()
      y = drawDetailEmpresaBar(doc, y, WL, empresa.name)
    }

    for (const obra of empresa.obras) {
      y = drawObraDetail(doc, y, obra, newLandscape)

      const saldo = obra.budget - obra.spent
      if (isEjecutada(obra.status)) { ejPagos += obra.spent; ejTrab += obra.budget; ejSaldo += saldo }
      else { perPagos += obra.spent; perTrab += obra.budget; perSaldo += saldo }
    }
    y += 2
  }

  // TOTALES
  const totalesH = 7 + 8 * 3
  if (y + totalesH > HL - 16) y = newLandscape()
  drawTotales(doc, y, WL, { ejPagos, ejTrab, ejSaldo, perPagos, perTrab, perSaldo })

  // ── Pie de página SOLO en la última hoja ──
  const lastPage = doc.getNumberOfPages()
  doc.setPage(lastPage)
  drawFooter(doc, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight())

  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  doc.save(`EDC_RAFSA_${ymd}.pdf`)
}

// ── Membrete ────────────────────────────────────────────────────────────────

function drawDocHeader(doc: jsPDF, W: number, date: Date, logo: string | null, subtitle: string, detail: boolean, generatedBy = "Sistema", showDate = true) {
  const rx = W - MARGIN
  const dateStrUpper = date.toLocaleDateString("es-MX", { day: "2-digit", month: "long", year: "numeric" }).toUpperCase()

  if (detail) {
    // ── Encabezado compacto (páginas horizontales): logo chico, fecha sola ──
    if (logo) {
      const h = 16
      const w = h * (1748 / 1241)
      doc.addImage(logo, "PNG", MARGIN, 6, w, h)
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); txt(doc, BLUE_DK)
      doc.text("RAFSA", MARGIN, 18)
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); txt(doc, BLUE_DK)
    doc.text("ESTADO DE CUENTA · DETALLE POR OBRA", rx, 12, { align: "right" })
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); txt(doc, BLUE_TXT)
    doc.text(trunc(subtitle, 80), rx, 18, { align: "right" })
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); txt(doc, MID)
    doc.text(dateStrUpper, rx, 23, { align: "right" })
    fill(doc, BLUE_BAR)
    doc.rect(MARGIN, 26.5, W - MARGIN * 2, 1.4, "F")
    return
  }

  // ── Encabezado grande (página 1, vertical) ──
  if (logo) {
    const h = 38
    const w = h * (1748 / 1241)
    doc.addImage(logo, "PNG", MARGIN, 4, w, h)
  } else {
    doc.setFont("helvetica", "bold"); doc.setFontSize(36); txt(doc, BLUE_DK)
    doc.text("RAFSA", MARGIN, 30)
  }

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); txt(doc, BLUE_DK)
  doc.text("ESTADO DE CUENTA", rx, 15, { align: "right" })
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); txt(doc, BLUE_TXT)
  doc.text(trunc(subtitle, 70), rx, 21.5, { align: "right" })

  let my = 27.5
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); txt(doc, MID)
  if (showDate) { doc.text(`FECHA DE CORTE: ${dateStrUpper}`, rx, my, { align: "right" }); my += 5 }
  doc.text(`ELABORÓ: ${generatedBy}`, rx, my, { align: "right" })

  fill(doc, BLUE_BAR)
  doc.rect(MARGIN, 44, W - MARGIN * 2, 1.4, "F")
}

function drawFooter(doc: jsPDF, W: number, H: number) {
  const barH = 9
  const y = H - barH - 3
  fill(doc, BLUE_BAR)
  doc.rect(MARGIN, y, W - MARGIN * 2, barH, "F")
  const text =
    "RECUBRIMIENTOS TÉCNICOS RAF S.A. DE C.V.   ·   AV. SEBASTIÁN BACH 4978, COL. PRADOS DE GUADALUPE, ZAPOPAN, JALISCO, C.P. 45030   ·   T. 33 1057 8344   ·   RFC: RTR220502PH6   ·   rafsa.com.mx"
  doc.setFont("helvetica", "normal")
  let fs = 6
  doc.setFontSize(fs)
  const maxW = W - MARGIN * 2 - 8
  while (doc.getTextWidth(text) > maxW && fs > 4) { fs -= 0.2; doc.setFontSize(fs) }
  txt(doc, WHITE)
  doc.text(text, W / 2, y + barH / 2 + 1.2, { align: "center" })
}

// ── PÁGINA 1: RESUMEN (vertical) ──────────────────────────────────────────────

function drawResumenPage(doc: jsPDF, empresas: EDCEmpresa[], date: Date, generatedBy: string, multi: boolean, logo: string | null) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const contentW = W - MARGIN * 2

  // Columnas del resumen
  const cNo = MARGIN
  const wNo = 10
  const cObra = cNo + wNo
  const wStatus = 28, wMonto = 30, wPag = 30, wSaldo = 30, wPct = 16
  const wObra = contentW - wNo - wStatus - wMonto - wPag - wSaldo - wPct
  const cStatus = cObra + wObra
  const cMonto = cStatus + wStatus
  const cPag = cMonto + wMonto
  const cSaldo = cPag + wPag
  const cPct = cSaldo + wSaldo
  const rEnd = MARGIN + contentW

  let y = HEADER_BOTTOM + 2

  // ── Leyenda del documento (fecha de generación + folio + descripción) ──
  {
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
    const dateLong = date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })

    doc.setFont("helvetica", "bold"); doc.setFontSize(8); txt(doc, INK)
    doc.text("Fecha de generación:", MARGIN, y + 3)
    const lblW = doc.getTextWidth("Fecha de generación: ")
    doc.setFont("helvetica", "normal")
    doc.text(dateLong, MARGIN + lblW, y + 3)

    doc.setFont("helvetica", "bold")
    doc.text(`Folio: EDC-${ymd}`, MARGIN + contentW, y + 3, { align: "right" })
    y += 8

    const n = empresas.length
    const intro =
      `El presente documento refleja el estado financiero de las obras contratadas con ` +
      `${n === 1 ? "la empresa indicada" : `las ${n} empresas indicadas`}, detallando el valor del ` +
      `contrato, el anticipo y fondo de garantía pactados, las estimaciones y su neto a facturar, así como ` +
      `los cobros registrados y el saldo pendiente por proyecto.`
    doc.setFont("helvetica", "italic"); doc.setFontSize(7.8); txt(doc, MID)
    const lines = doc.splitTextToSize(intro, contentW - 4)
    doc.text(lines, MARGIN + 2, y + 3.5)
    y += lines.length * 4.3 + 5

    stroke(doc, RULE); doc.setLineWidth(0.2)
    doc.line(MARGIN, y, MARGIN + contentW, y)
    y += 5
  }

  const newPage = () => {
    doc.addPage("letter", "portrait")
    drawDocHeader(doc, W, date, logo, multi ? "RESUMEN CONSOLIDADO DE EMPRESAS" : (empresas[0]?.name || "").toUpperCase(), false, generatedBy, false)
    return HEADER_BOTTOM + 4
  }

  // Totales globales
  let gPag = 0, gTrab = 0, gSaldo = 0, gExigible = 0

  const drawColHeader = (yy: number): number => {
    const h = 7
    fill(doc, GRAY_HDR)
    doc.rect(MARGIN, yy, contentW, h, "F")
    stroke(doc, RULE); doc.setLineWidth(0.1)
    doc.rect(MARGIN, yy, contentW, h)
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); txt(doc, INK)
    doc.text("No.", cNo + 2, yy + 4.6)
    doc.text("OBRA", cObra + 2, yy + 4.6)
    doc.text("ESTATUS", cStatus + 2, yy + 4.6)
    doc.text("MONTO C/IVA", cMonto + wMonto - 2, yy + 4.6, { align: "right" })
    doc.text("PAGADO", cPag + wPag - 2, yy + 4.6, { align: "right" })
    doc.text("SALDO", cSaldo + wSaldo - 2, yy + 4.6, { align: "right" })
    doc.text("% PAG.", cPct + wPct - 2, yy + 4.6, { align: "right" })
    return yy + h
  }

  const drawTotalRow = (yy: number, label: string, monto: number, pag: number, saldo: number, blue: boolean): number => {
    const h = 7.5
    fill(doc, blue ? BLUE_DK : GRAY_SUB)
    doc.rect(MARGIN, yy, contentW, h, "F")
    stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, yy, contentW, h)
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); txt(doc, blue ? WHITE : INK)
    doc.text(label, cStatus + wStatus - 2, yy + 5, { align: "right" })
    doc.text(fmtMoney(monto), cMonto + wMonto - 2, yy + 5, { align: "right" })
    doc.text(fmtMoney(pag), cPag + wPag - 2, yy + 5, { align: "right" })
    doc.text(fmtMoney(saldo), cSaldo + wSaldo - 2, yy + 5, { align: "right" })
    const pct = monto > 0 ? Math.round((pag / monto) * 1000) / 10 : 0
    doc.text(`${pct}%`, cPct + wPct - 2, yy + 5, { align: "right" })
    return yy + h
  }

  for (let ei = 0; ei < empresas.length; ei++) {
    const empresa = empresas[ei]

    if (y + 22 > H - 20) y = newPage()

    // Barra de sección
    const barH = 7
    fill(doc, BLUE_BAR)
    doc.rect(MARGIN, y, contentW, barH, "F")
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); txt(doc, WHITE)
    const barTitle = multi
      ? `RESUMEN POR OBRA · ${trunc(empresa.name.toUpperCase(), 60)}`
      : "RESUMEN POR OBRA · IMPORTES CON IVA (MXN)"
    doc.text(barTitle, cNo + 2, y + 4.8)
    y += barH

    y = drawColHeader(y)

    let eMonto = 0, ePag = 0, eSaldo = 0
    let ejMonto = 0, ejPag = 0, ejSaldo = 0
    let peMonto = 0, pePag = 0, peSaldo = 0
    let idx = 0

    for (const obra of empresa.obras) {
      if (y + 7 > H - 20) { y = newPage(); y = drawColHeader(y) }
      idx++
      const rowH = 7
      const monto = obra.budget
      const pag = obra.spent
      const saldo = monto - pag
      const pct = monto > 0 ? Math.round((pag / monto) * 1000) / 10 : 0
      const st = statusStyle(obra.status)

      if (idx % 2 === 0) { fill(doc, { r: 248, g: 249, b: 250 }); doc.rect(MARGIN, y, contentW, rowH, "F") }
      stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, rowH)

      doc.setFont("helvetica", "normal"); doc.setFontSize(7); txt(doc, INK)
      doc.text(String(idx), cNo + wNo / 2, y + 4.8, { align: "center" })
      doc.text(trunc(obra.name, 42), cObra + 2, y + 4.8)
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.3); txt(doc, st.color)
      doc.text(st.label, cStatus + 2, y + 4.7)
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); txt(doc, INK)
      doc.text(fmtMoney(monto), cMonto + wMonto - 2, y + 4.8, { align: "right" })
      doc.text(fmtMoney(pag), cPag + wPag - 2, y + 4.8, { align: "right" })
      doc.setFont("helvetica", "bold")
      doc.text(fmtMoney(saldo), cSaldo + wSaldo - 2, y + 4.8, { align: "right" })
      doc.setFont("helvetica", "normal"); txt(doc, MID)
      doc.text(`${pct}%`, cPct + wPct - 2, y + 4.8, { align: "right" })
      y += rowH

      eMonto += monto; ePag += pag; eSaldo += saldo
      if (isEjecutada(obra.status)) { ejMonto += monto; ejPag += pag; ejSaldo += saldo; gExigible += saldo }
      else { peMonto += monto; pePag += pag; peSaldo += saldo }
    }

    // Subtotales por grupo
    if (ejMonto !== 0 || ejPag !== 0) {
      if (y + 8 > H - 20) y = newPage()
      y = drawTotalRow(y, "SUBTOTAL OBRA EJECUTADA", ejMonto, ejPag, ejSaldo, false)
    }
    if (peMonto !== 0) {
      if (y + 8 > H - 20) y = newPage()
      y = drawTotalRow(y, "OBRA CONTRATADA POR EJERCER (POR INICIAR)", peMonto, pePag, peSaldo, false)
    }
    // Total de la empresa
    if (y + 8 > H - 20) y = newPage()
    y = drawTotalRow(y, multi ? `SUBTOTAL ${trunc(empresa.name.toUpperCase(), 34)}` : "TOTAL GENERAL", eMonto, ePag, eSaldo, true)

    gPag += ePag; gTrab += eMonto; gSaldo += eSaldo
    y += 4
  }

  // Total general consolidado (solo si múltiples empresas)
  if (multi) {
    if (y + 9 > H - 20) y = newPage()
    y = drawTotalRow(y, "TOTAL GENERAL (TODAS LAS EMPRESAS)", gTrab, gPag, gSaldo, true)
    y += 3
  }

  // ── Saldo exigible (recuadro resaltado) ──
  if (y + 12 > H - 20) y = newPage()
  const boxH = 9
  const label = "SALDO EXIGIBLE A LA FECHA (SOLO OBRA EJECUTADA):"
  doc.setFont("helvetica", "bold"); doc.setFontSize(9)
  const valText = fmtMoney(gExigible)
  const valW = doc.getTextWidth(valText) + 8
  const labelW = doc.getTextWidth(label)
  const totalW = labelW + 6 + valW
  const startX = MARGIN + (contentW - totalW) / 2
  txt(doc, BLUE_DK)
  doc.text(label, startX, y + 6)
  fill(doc, AMBER_HL)
  doc.rect(startX + labelW + 6, y, valW, boxH, "F")
  stroke(doc, { r: 214, g: 180, b: 60 }); doc.setLineWidth(0.2)
  doc.rect(startX + labelW + 6, y, valW, boxH)
  txt(doc, INK)
  doc.text(valText, startX + labelW + 6 + valW - 4, y + 6, { align: "right" })
  y += boxH + 8

  // ── Notas ──
  if (y + 30 > H - 20) y = newPage()
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); txt(doc, INK)
  doc.text("NOTAS:", MARGIN, y)
  y += 5
  const notas = [
    "1. Todos los importes incluyen IVA y están expresados en pesos mexicanos (MXN).",
    "2. El saldo exigible corresponde únicamente a la obra ejecutada; la obra contratada por iniciar no forma parte del saldo exigible.",
    "3. El neto a facturar de cada estimación descuenta la retención por fondo de garantía y la amortización de anticipo.",
  ]
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); txt(doc, MID)
  for (const n of notas) {
    const lines = doc.splitTextToSize(n, contentW)
    doc.text(lines, MARGIN, y)
    y += lines.length * 4 + 1
  }
}

// ── DETALLE (horizontal) ───────────────────────────────────────────────────

type EstCols = {
  est: { x: number; w: number }
  desc: { x: number; w: number }
  monto: { x: number; w: number }
  amortizacion: { x: number; w: number }
  retencion: { x: number; w: number }
  neto: { x: number; w: number }
  fac: { x: number; w: number }
  facturado: { x: number; w: number }
  pagado: { x: number; w: number }
}

/** Columnas fijas de la tabla de estimaciones (las estimaciones van en filas). */
function estCols(W: number): EstCols {
  const contentW = W - MARGIN * 2
  const wEst = 13, wMonto = 28, wAmort = 24, wRet = 24, wNeto = 28, wFac = 30, wFacturado = 26, wPagado = 24
  const wDesc = contentW - (wEst + wMonto + wAmort + wRet + wNeto + wFac + wFacturado + wPagado)
  let x = MARGIN
  const est = { x, w: wEst }; x += wEst
  const desc = { x, w: wDesc }; x += wDesc
  const monto = { x, w: wMonto }; x += wMonto
  const amortizacion = { x, w: wAmort }; x += wAmort
  const retencion = { x, w: wRet }; x += wRet
  const neto = { x, w: wNeto }; x += wNeto
  const fac = { x, w: wFac }; x += wFac
  const facturado = { x, w: wFacturado }; x += wFacturado
  const pagado = { x, w: wPagado }; x += wPagado
  return { est, desc, monto, amortizacion, retencion, neto, fac, facturado, pagado }
}

const facStatusLabelShort = (s: string | null): string => {
  if (!s) return ""
  const m: Record<string, string> = { pending: "Pendiente", paid: "Pagada", partial: "Saldo pend." }
  return m[s] ?? s
}

// Color del estado de la factura: Pagada=verde, Saldo pend.=naranja, Pendiente=rojo
const facStatusColor = (s: string | null): RGB => {
  if (s === "paid") return GREEN
  if (s === "partial") return ORANGE
  if (s === "pending") return RED_DED
  return MID
}

function drawDetailEmpresaBar(doc: jsPDF, y: number, W: number, name: string): number {
  const contentW = W - MARGIN * 2
  const h = 8
  fill(doc, BLUE_DK)
  doc.rect(MARGIN, y, contentW, h, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); txt(doc, WHITE)
  doc.text(`EMPRESA: ${trunc(name.toUpperCase(), 80)}`, MARGIN + 3, y + 5.5)
  return y + h + 2
}

// Fila lógica de la tabla de estimaciones
type EstRow = {
  label: string
  desc: string
  isAnticipo: boolean
  monto: number
  retencion: number
  amortizacion: number
  neto: number
  facNum: string | null
  facAmt: number | null
  facPaid: number
  facStatus: string | null
}

function contractStripHeight(obra: EDCObra): number {
  const hasLine2 = obra.anticipoAmount > 0 || obra.anticipoPct > 0 || obra.garantiaAmount > 0 || obra.garantiaPct > 0
  return hasLine2 ? 11 : 6.5
}

function drawObraDetail(doc: jsPDF, y: number, obra: EDCObra, newPage: () => number): number {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const contentW = W - MARGIN * 2
  const rEnd = MARGIN + contentW
  const bottom = H - 16
  const cols = estCols(W)
  const rowH = 8.5

  // Filas de estimaciones (Anticipo → #) y, aparte, aditivas
  const estRows: EstRow[] = []
  const anticipo = obra.estimaciones.find((e) => e.isAnticipo)
  if (anticipo) estRows.push({
    label: "Anticipo", desc: anticipo.description, isAnticipo: true,
    monto: anticipo.amount, retencion: 0, amortizacion: 0, neto: anticipo.neto,
    facNum: anticipo.facturaNumber, facAmt: anticipo.facturaAmount, facPaid: anticipo.facturaPaid, facStatus: anticipo.facturaStatus,
  })
  obra.estimaciones.filter((e) => !e.isAnticipo).sort((a, b) => a.number - b.number).forEach((e) => {
    estRows.push({
      label: `#${e.number}`, desc: e.description, isAnticipo: false,
      monto: e.amount, retencion: e.retencion, amortizacion: e.amortizacion, neto: e.neto,
      facNum: e.facturaNumber, facAmt: e.facturaAmount, facPaid: e.facturaPaid, facStatus: e.facturaStatus,
    })
  })
  const aditRows: EstRow[] = obra.aditivas.map((ad) => ({
    label: "Aditiva", desc: ad.description, isAnticipo: false,
    monto: ad.amount, retencion: 0, amortizacion: 0, neto: ad.amount,
    facNum: ad.facturaNumber, facAmt: ad.facturaAmount, facPaid: ad.facturaPaid, facStatus: ad.facturaStatus,
  }))

  // Asegurar que quepa cabecera + franja + encabezado tabla + 1 fila
  const stripH = contractStripHeight(obra)
  if (y + 8 + stripH + 1.5 + 6 + rowH > bottom) y = newPage()

  // ── Barra de obra + chip de estatus ──
  y = drawObraBar(doc, y, W, obra, false)

  // ── Franja de contrato ──
  y = drawContractStrip(doc, y, contentW, obra)

  // ── Encabezado de la tabla ──
  y = drawEstHeader(doc, y, cols)

  // ── Filas ──
  let totMonto = 0, totAmort = 0, totRet = 0, totNeto = 0, totFacturado = 0, totPagado = 0
  let vi = 0
  const drawRow = (row: EstRow) => {
    if (y + rowH > bottom) {
      y = newPage()
      y = drawObraBar(doc, y, W, obra, true)
      y = drawEstHeader(doc, y, cols)
    }
    drawEstRow(doc, y, cols, row, vi, rowH, rEnd)
    totMonto += row.monto; totAmort += row.amortizacion; totRet += row.retencion
    totNeto += row.neto; totFacturado += row.facAmt ?? 0; totPagado += row.facPaid
    vi++; y += rowH
  }

  if (estRows.length === 0 && aditRows.length === 0) {
    fill(doc, WHITE); doc.rect(MARGIN, y, contentW, rowH, "F")
    stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, rowH)
    doc.setFont("helvetica", "italic"); doc.setFontSize(7); txt(doc, LITE)
    doc.text("Sin estimaciones registradas para esta obra.", cols.desc.x + 2, y + 5.8)
    y += rowH
  } else {
    estRows.forEach(drawRow)
    if (aditRows.length > 0) {
      // Espaciador delgado dentro de la misma tabla, luego aditivas
      if (y + 4.5 + rowH > bottom) {
        y = newPage()
        y = drawObraBar(doc, y, W, obra, true)
        y = drawEstHeader(doc, y, cols)
      } else if (estRows.length > 0) {
        y = drawSpacerRow(doc, y, cols, rEnd)
      }
      aditRows.forEach(drawRow)
    }
  }

  // ── Fondo de garantía (solo si aplica) — separado por otro espaciador ──
  const hasGarantia = obra.garantiaAmount > 0 || obra.garantiaPct > 0
  if (hasGarantia) {
    const hadContent = estRows.length > 0 || aditRows.length > 0
    if (y + 4.5 + rowH > bottom) {
      y = newPage()
      y = drawObraBar(doc, y, W, obra, true)
      y = drawEstHeader(doc, y, cols)
    } else if (hadContent) {
      y = drawSpacerRow(doc, y, cols, rEnd)
    }
    drawGarantiaRow(doc, y, cols, obra, rEnd, rowH)
    y += rowH
  }

  // ── Fila de totales de la tabla ──
  const th = 7.5
  if (y + th > bottom) { y = newPage(); y = drawEstHeader(doc, y, cols) }
  fill(doc, BG_COT); doc.rect(MARGIN, y, contentW, th, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, th)
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); txt(doc, INK)
  doc.text("TOTALES", cols.desc.x + 2, y + 5)
  doc.text(fmtNum(totMonto), cols.monto.x + cols.monto.w - 2, y + 5, { align: "right" })
  doc.text(fmtNum(totAmort), cols.amortizacion.x + cols.amortizacion.w - 2, y + 5, { align: "right" })
  doc.text(fmtNum(totRet), cols.retencion.x + cols.retencion.w - 2, y + 5, { align: "right" })
  doc.text(fmtNum(totNeto), cols.neto.x + cols.neto.w - 2, y + 5, { align: "right" })
  doc.text(fmtNum(totFacturado), cols.facturado.x + cols.facturado.w - 2, y + 5, { align: "right" })
  doc.text(fmtNum(totPagado), cols.pagado.x + cols.pagado.w - 2, y + 5, { align: "right" })
  y += th

  // ── Resumen de la obra (cobrado real / saldo) ──
  y = drawObraSummary(doc, y, W, obra)

  return y + 5
}

/** Barra de título de obra + chip de estatus. `cont` marca continuación. */
function drawObraBar(doc: jsPDF, y: number, W: number, obra: EDCObra, cont: boolean): number {
  const contentW = W - MARGIN * 2
  const rEnd = MARGIN + contentW
  const hBar = 8
  fill(doc, BLUE_BAR)
  doc.rect(MARGIN, y, contentW, hBar, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); txt(doc, WHITE)
  let title = obra.name.toUpperCase()
  if (obra.code) title += `   ·   ${obra.code}`
  if (cont) title += "   (continuación)"
  doc.text(trunc(title, 95), MARGIN + 3, y + 5.5)

  const st = statusStyle(obra.status)
  const chipLabel = `OBRA ${st.label}`
  doc.setFontSize(7)
  const chipW = doc.getTextWidth(chipLabel) + 8
  fill(doc, st.color)
  doc.rect(rEnd - chipW - 2, y + 1.4, chipW, hBar - 2.8, "F")
  txt(doc, WHITE); doc.setFont("helvetica", "bold")
  doc.text(chipLabel, rEnd - chipW - 2 + chipW / 2, y + 5.4, { align: "center" })
  return y + hBar
}

function drawContractStrip(doc: jsPDF, y: number, contentW: number, obra: EDCObra): number {
  const h = contractStripHeight(obra)
  fill(doc, { r: 245, g: 247, b: 249 })
  doc.rect(MARGIN, y, contentW, h, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, h)

  const montoContrato = obra.contractTotal > 0 ? obra.contractTotal : obra.budget
  const seg = (label: string, value: string) => ({ label, value })

  const line1 = [
    seg("Monto contrato:", fmtMoney(montoContrato)),
    seg("Cotización:", fmtMoney(obra.cotizacion)),
    ...(obra.aditivasTotal > 0 ? [seg("Aditivas:", fmtMoney(obra.aditivasTotal))] : []),
  ]
  const line2 = [
    ...(obra.anticipoAmount > 0 || obra.anticipoPct > 0
      ? [seg(`Anticipo (${obra.anticipoPct}%):`, `${fmtMoney(obra.anticipoAmount)}${obra.anticipoPaid > 0 ? ` (pagado ${fmtMoney(obra.anticipoPaid)})` : ""}`)]
      : []),
    ...(obra.garantiaAmount > 0 || obra.garantiaPct > 0
      ? [seg(`Fondo de garantía (${obra.garantiaPct}%):`, fmtMoney(obra.garantiaAmount))] : []),
  ]

  const drawLine = (items: { label: string; value: string }[], ly: number) => {
    let x = MARGIN + 3
    for (const it of items) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.4); txt(doc, MID)
      doc.text(it.label, x, ly)
      x += doc.getTextWidth(it.label) + 1.5
      doc.setFont("helvetica", "bold"); txt(doc, INK)
      doc.text(it.value, x, ly)
      x += doc.getTextWidth(it.value) + 7
    }
  }
  if (line2.length > 0) { drawLine(line1, y + 4.3); drawLine(line2, y + 8.8) }
  else drawLine(line1, y + 4.4)

  return y + h + 1.5
}

function drawEstHeader(doc: jsPDF, y: number, cols: EstCols): number {
  const W = doc.internal.pageSize.getWidth()
  const contentW = W - MARGIN * 2
  const h = 6
  fill(doc, GRAY_HDR)
  doc.rect(MARGIN, y, contentW, h, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, h)
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.6); txt(doc, INK)
  doc.text("EST.", cols.est.x + cols.est.w / 2, y + 4, { align: "center" })
  doc.text("DESCRIPCIÓN", cols.desc.x + 2, y + 4)
  doc.text("MONTO C/IVA", cols.monto.x + cols.monto.w - 2, y + 4, { align: "right" })
  doc.text("AMORTIZACIÓN", cols.amortizacion.x + cols.amortizacion.w - 2, y + 4, { align: "right" })
  doc.text("RETENCIÓN", cols.retencion.x + cols.retencion.w - 2, y + 4, { align: "right" })
  doc.text("NETO A FACTURAR", cols.neto.x + cols.neto.w - 2, y + 4, { align: "right" })
  doc.text("FACTURA", cols.fac.x + 2, y + 4)
  doc.text("FACTURADO", cols.facturado.x + cols.facturado.w - 2, y + 4, { align: "right" })
  doc.text("PAGADO", cols.pagado.x + cols.pagado.w - 2, y + 4, { align: "right" })
  // separadores verticales
  ;[cols.est.x, cols.desc.x, cols.monto.x, cols.amortizacion.x, cols.retencion.x, cols.neto.x, cols.fac.x, cols.facturado.x, cols.pagado.x, MARGIN + contentW].forEach((vx) => doc.line(vx, y, vx, y + h))
  return y + h
}

function drawEstRow(doc: jsPDF, y: number, cols: EstCols, row: EstRow, index: number, rowH: number, rEnd: number) {
  const contentW = rEnd - MARGIN
  if (index % 2 === 1) { fill(doc, { r: 248, g: 249, b: 250 }); doc.rect(MARGIN, y, contentW, rowH, "F") }

  // rejilla
  stroke(doc, RULE); doc.setLineWidth(0.1)
  ;[cols.est.x, cols.desc.x, cols.monto.x, cols.amortizacion.x, cols.retencion.x, cols.neto.x, cols.fac.x, cols.facturado.x, cols.pagado.x, rEnd].forEach((vx) => doc.line(vx, y, vx, y + rowH))
  doc.line(MARGIN, y + rowH, rEnd, y + rowH)

  const baseY = y + 5.2

  // EST label
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.6)
  txt(doc, row.isAnticipo ? BLUE_TXT : INK)
  doc.text(row.label, cols.est.x + cols.est.w / 2, baseY, { align: "center" })

  // Descripción
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8); txt(doc, INK)
  doc.text(trunc(row.desc, Math.floor(cols.desc.w / 1.5)), cols.desc.x + 2, baseY)

  // Monto
  doc.text(fmtNum(row.monto), cols.monto.x + cols.monto.w - 2, baseY, { align: "right" })

  // Amortización (solo cantidad)
  txt(doc, row.amortizacion > 0 ? RED_DED : LITE)
  doc.text(row.amortizacion > 0 ? fmtNum(row.amortizacion) : "—", cols.amortizacion.x + cols.amortizacion.w - 2, baseY, { align: "right" })

  // Retención (solo cantidad)
  txt(doc, row.retencion > 0 ? RED_DED : LITE)
  doc.text(row.retencion > 0 ? fmtNum(row.retencion) : "—", cols.retencion.x + cols.retencion.w - 2, baseY, { align: "right" })

  // Neto a facturar
  doc.setFont("helvetica", "bold"); txt(doc, INK)
  doc.text(fmtNum(row.neto), cols.neto.x + cols.neto.w - 2, baseY, { align: "right" })

  // Factura (número + estado)
  if (row.facNum) {
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); txt(doc, INK)
    doc.text(trunc(row.facNum, 15), cols.fac.x + 2, y + 3.8)
    doc.setFont("helvetica", "bold"); doc.setFontSize(5.2); txt(doc, facStatusColor(row.facStatus))
    doc.text(facStatusLabelShort(row.facStatus), cols.fac.x + 2, y + 6.8)
  } else {
    doc.setFont("helvetica", "italic"); doc.setFontSize(6); txt(doc, LITE)
    doc.text("Sin factura", cols.fac.x + 2, baseY)
  }

  // Facturado
  doc.setFont("helvetica", "normal"); doc.setFontSize(6.8)
  txt(doc, row.facAmt != null ? INK : LITE)
  doc.text(row.facAmt != null ? fmtNum(row.facAmt) : "—", cols.facturado.x + cols.facturado.w - 2, baseY, { align: "right" })

  // Pagado
  txt(doc, row.facPaid > 0 ? GREEN : LITE)
  doc.text(row.facPaid > 0 ? fmtNum(row.facPaid) : "—", cols.pagado.x + cols.pagado.w - 2, baseY, { align: "right" })
}

/** Fila espaciadora delgada y vacía dentro de la misma tabla (separa estimaciones de aditivas). */
function drawSpacerRow(doc: jsPDF, y: number, cols: EstCols, rEnd: number): number {
  const h = 3.4
  fill(doc, { r: 242, g: 244, b: 246 })
  doc.rect(MARGIN, y, rEnd - MARGIN, h, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1)
  ;[cols.est.x, cols.desc.x, cols.monto.x, cols.amortizacion.x, cols.retencion.x, cols.neto.x, cols.fac.x, cols.facturado.x, cols.pagado.x, rEnd].forEach((vx) => doc.line(vx, y, vx, y + h))
  doc.line(MARGIN, y + h, rEnd, y + h)
  return y + h
}

/** Fila de Fondo de garantía (solo si la obra lo maneja). */
function drawGarantiaRow(doc: jsPDF, y: number, cols: EstCols, obra: EDCObra, rEnd: number, rowH: number) {
  const contentW = rEnd - MARGIN
  fill(doc, { r: 244, g: 246, b: 248 }); doc.rect(MARGIN, y, contentW, rowH, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1)
  ;[cols.est.x, cols.desc.x, cols.monto.x, cols.amortizacion.x, cols.retencion.x, cols.neto.x, cols.fac.x, cols.facturado.x, cols.pagado.x, rEnd].forEach((vx) => doc.line(vx, y, vx, y + rowH))
  doc.line(MARGIN, y + rowH, rEnd, y + rowH)

  const baseY = y + 5.2
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); txt(doc, BLUE_TXT)
  doc.text("F.G.", cols.est.x + cols.est.w / 2, baseY, { align: "center" })

  doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); txt(doc, INK)
  doc.text(`Fondo de garantía (${obra.garantiaPct}%)`, cols.desc.x + 2, baseY)

  // Monto del fondo en la columna de RETENCIÓN
  doc.setFont("helvetica", "bold"); txt(doc, RED_DED)
  doc.text(fmtNum(obra.garantiaAmount), cols.retencion.x + cols.retencion.w - 2, baseY, { align: "right" })
}

/** Renglón de resumen de la obra: suma de trabajos, cobrado (state accounts) y saldo. */
function drawObraSummary(doc: jsPDF, y: number, W: number, obra: EDCObra): number {
  const contentW = W - MARGIN * 2
  const rEnd = MARGIN + contentW
  const h = 8
  const saldo = obra.budget - obra.spent

  fill(doc, GRAY_SUB); doc.rect(MARGIN, y, contentW, h, "F")
  stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, h)

  doc.setFont("helvetica", "bold"); doc.setFontSize(6.8); txt(doc, INK)
  doc.text("RESUMEN DE LA OBRA", MARGIN + 3, y + 5.2)

  // Grupo de cifras a la derecha
  const items = [
    { label: "Suma trabajos:", value: fmtMoney(obra.budget), bold: false },
    { label: "Cobrado:", value: fmtMoney(obra.spent), bold: false },
    { label: "Saldo por cobrar:", value: fmtMoney(saldo), bold: true },
  ]
  // Medir de derecha a izquierda
  let x = rEnd - 3
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]
    doc.setFont("helvetica", it.bold ? "bold" : "bold"); doc.setFontSize(7)
    const vw = doc.getTextWidth(it.value)
    txt(doc, it.bold ? BLUE_DK : INK)
    doc.text(it.value, x, y + 5.4, { align: "right" })
    x -= vw + 2
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.6); txt(doc, MID)
    const lw = doc.getTextWidth(it.label)
    doc.text(it.label, x, y + 5.4, { align: "right" })
    x -= lw + 8
  }
  return y + h
}

function drawTotales(
  doc: jsPDF, y: number, W: number,
  t: { ejPagos: number; ejTrab: number; ejSaldo: number; perPagos: number; perTrab: number; perSaldo: number },
): number {
  const contentW = W - MARGIN * 2
  const rEnd = MARGIN + contentW
  // 3 columnas a la derecha
  const colW = 34
  const saldoR = rEnd - 2
  const trabR = saldoR - colW
  const pagosR = trabR - colW
  const labelRight = pagosR - colW - 2

  fill(doc, BLUE_DK)
  doc.rect(MARGIN, y, contentW, 7, "F")
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); txt(doc, WHITE)
  doc.text("TOTALES", MARGIN + 3, y + 4.8)
  doc.setFontSize(6)
  doc.text("SUMA PAGOS", pagosR, y + 4.8, { align: "right" })
  doc.text("SUMA TRABAJOS", trabR, y + 4.8, { align: "right" })
  doc.text("SALDO", saldoR, y + 4.8, { align: "right" })
  y += 7

  const row = (label: string, p: number, tr: number, sa: number, blue: boolean) => {
    const h = 8
    fill(doc, blue ? BLUE_DK : GRAY_SUB)
    doc.rect(MARGIN, y, contentW, h, "F")
    stroke(doc, RULE); doc.setLineWidth(0.1); doc.rect(MARGIN, y, contentW, h)
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); txt(doc, blue ? WHITE : INK)
    doc.text(label, labelRight, y + 5.2, { align: "right" })
    doc.text(fmtMoney(p), pagosR, y + 5.2, { align: "right" })
    doc.text(fmtMoney(tr), trabR, y + 5.2, { align: "right" })
    doc.text(fmtMoney(sa), saldoR, y + 5.2, { align: "right" })
    y += h
  }

  row("OBRA EJECUTADA (EN CURSO / TERMINADA)", t.ejPagos, t.ejTrab, t.ejSaldo, false)
  row("OBRA CONTRATADA POR EJERCER (POR INICIAR)", t.perPagos, t.perTrab, t.perSaldo, false)
  row("TOTAL GENERAL", t.ejPagos + t.perPagos, t.ejTrab + t.perTrab, t.ejSaldo + t.perSaldo, true)

  return y
}
