/**
 * RAFSA – Generador de Estado de Cuenta (EDC) en PDF
 * Con logo institucional, pagos detallados por obra y membrete profesional.
 */

import jsPDF from "jspdf"

// ── Tipos públicos ──────────────────────────────────────────────────────────

export type EDCPago = {
  concept: "deposit" | "advance" | "retention" | "return"
  date: string | null
  amount: number   // siempre positivo; el concepto indica si es cargo o abono
}

export type EDCObra = {
  id: string
  code: string | null
  name: string
  location: string
  status: string        // DB: planned | in_progress | paused | closed
  budget: number        // cotización total
  spent: number         // cobrado neto
  pagos: EDCPago[]      // pagos individuales ordenados por fecha
}

export type EDCEmpresa = {
  id: string
  name: string
  obras: EDCObra[]
}

// ── Constantes de diseño ─────────────────────────────────────────────────────

const PAGE_W    = 210
const PAGE_H    = 297
const MARGIN    = 14
const CONTENT_W = PAGE_W - MARGIN * 2   // 182 mm

// RAFSA Blue
const BLUE_H = "#0174bd"
const BLUE_R = 1,   BLUE_G = 116, BLUE_B = 189

// Colores de texto
const DARK_R = 15,  DARK_G = 23,  DARK_B = 42
const GRAY_R = 100, GRAY_G = 116, GRAY_B = 139

// Columnas de la sección de pagos
// indent(6) + concepto(90) + fecha(30) + monto(56) = 182 = CONTENT_W ✓
const PAY_IND   = 6
const PAY_CON_W = 90
const PAY_FEC_W = 30
const PAY_MON_W = 56
const PAY_CON_X   = MARGIN + PAY_IND                              // = 20
const PAY_FEC_X   = PAY_CON_X + PAY_CON_W                        // = 110
const PAY_MON_END = PAY_FEC_X + PAY_FEC_W + PAY_MON_W            // = 196 = PAGE_W − MARGIN ✓

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(n: number): string {
  if (n === 0) return "$0.00"
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 2,
  })
}

function statusLabel(s: string): string {
  const m: Record<string, string> = {
    planned:     "Planeación",
    in_progress: "En progreso",
    paused:      "En pausa",
    closed:      "Completada",
  }
  return m[s] ?? s
}

function statusRgb(s: string): [number, number, number] {
  if (s === "in_progress") return [0,   130, 210]
  if (s === "planned")     return [190, 130,   0]
  if (s === "closed")      return [ 20, 150,  70]
  return [130, 140, 155]   // paused / unknown
}

function conceptLabel(c: string): string {
  const m: Record<string, string> = {
    deposit:   "Depósito",
    advance:   "Anticipo",
    retention: "Retención",
    return:    "Devolución",
  }
  return m[c] ?? c
}

function formatDate(d: string | null): string {
  if (!d) return "—"
  return new Date(d + "T12:00:00").toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

function trunc(text: string, max: number): string {
  if (text.length <= max) return text
  return text.slice(0, max - 1) + "…"
}

/** Carga el logo RAFSA desde /public como dataURL (para jsPDF.addImage). */
async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/brand/rafsa-logo.png")
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror   = () => reject(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

// ── Función principal (exportada) ────────────────────────────────────────────

/**
 * Genera y descarga el PDF de Estado de Cuenta.
 * @param empresas    Empresas con sus obras y pagos.
 * @param date        Fecha del documento (default = hoy).
 * @param generatedBy Nombre o email del usuario que genera el reporte.
 */
export async function generateEDCPdf(
  empresas: EDCEmpresa[],
  date: Date = new Date(),
  generatedBy = "Sistema"
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  // Cargar logo (silenciosamente si falla)
  const logoDataUrl = await loadLogoDataUrl()

  // 1. Membrete
  drawHeader(doc, date, logoDataUrl, generatedBy)
  let y = 45

  // 2. Cuerpo
  let grandBudget = 0
  let grandSpent  = 0

  let firstEmpresa = true

  for (const empresa of empresas) {
    // Espacio de separación entre empresas (excepto la primera)
    if (!firstEmpresa) y += 6
    firstEmpresa = false

    if (y > PAGE_H - 80) { doc.addPage(); y = MARGIN }

    // ── Banda de empresa (azul RAFSA prominente) ──
    // Línea decorativa superior
    doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
    doc.rect(MARGIN, y, CONTENT_W, 1.2, "F")
    y += 1.2

    // Bloque principal azul
    const EMP_H = 15
    doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
    doc.rect(MARGIN, y, CONTENT_W, EMP_H, "F")

    // Acento lateral izquierdo blanco
    doc.setFillColor(255, 255, 255)
    doc.rect(MARGIN, y, 4, EMP_H, "F")

    // Label "EMPRESA" pequeño arriba
    doc.setFont("helvetica", "bold")
    doc.setFontSize(5.5)
    doc.setTextColor(180, 220, 255)
    doc.text("EMPRESA", MARGIN + 7, y + 5)

    // Nombre en grande
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(255, 255, 255)
    doc.text(trunc(empresa.name.toUpperCase(), 55), MARGIN + 7, y + 12)

    // Cuenta de obras a la derecha
    const obraCount = empresa.obras.length
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(190, 230, 255)
    doc.text(`${obraCount} obra${obraCount !== 1 ? "s" : ""}`, PAGE_W - MARGIN - 3, y + 12, { align: "right" })

    y += EMP_H + 3

    let empBudget = 0
    let empSpent  = 0

    for (const obra of empresa.obras) {
      // Estimado mínimo de altura para esta obra
      const minH = 20 + (obra.pagos.length > 0 ? obra.pagos.length * 7 + 8 : 10) + 16
      if (y + minH > PAGE_H - 22) { doc.addPage(); y = MARGIN }

      y      = drawObraSection(doc, y, obra)
      empBudget += obra.budget
      empSpent  += obra.spent
      grandBudget += obra.budget
      grandSpent  += obra.spent
    }

    // Subtotal de empresa
    if (y + 10 > PAGE_H - 22) { doc.addPage(); y = MARGIN }
    y = drawEmpresaSubtotal(doc, y, empBudget, empSpent)
  }

  // 3. Total general
  if (y + 18 > PAGE_H - 22) { doc.addPage(); y = MARGIN }
  drawGrandTotal(doc, y, grandBudget, grandSpent)

  // 4. Pie de página en cada hoja
  const totalPages = doc.getNumberOfPages()
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg)
    drawPageFooter(doc, pg, totalPages)
  }

  // 5. Descargar
  const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`
  doc.save(`EDC_RAFSA_${ymd}.pdf`)
}

// ── Funciones de dibujo ──────────────────────────────────────────────────────

function drawHeader(doc: jsPDF, date: Date, logoDataUrl: string | null, generatedBy = "Sistema") {
  // Barra oscura principal (evita que el logo azul se pierda con el fondo)
  doc.setFillColor(8, 18, 42)
  doc.rect(0, 0, PAGE_W, 26, "F")

  // Acento azul debajo
  doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
  doc.rect(0, 26, PAGE_W, 1, "F")

  // Logo (derecha de la barra, proporción 1748×1241 ≈ 1.41:1)
  if (logoDataUrl) {
    const logoH = 21
    const logoW = logoH * (1748 / 1241)   // ≈ 29.6 mm
    doc.addImage(logoDataUrl, "PNG", PAGE_W - MARGIN - logoW, 2.5, logoW, logoH)
  }

  // Nombre empresa
  doc.setFont("helvetica", "bold")
  doc.setFontSize(15)
  doc.setTextColor(255, 255, 255)
  doc.text("RAFSA INDUSTRIAL COATINGS", MARGIN, 13)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(155, 190, 240)
  doc.text(`Guadalajara, Jalisco  ·  Generado por: ${generatedBy}`, MARGIN, 20)

  // Título del documento
  doc.setFont("helvetica", "bold")
  doc.setFontSize(13)
  doc.setTextColor(DARK_R, DARK_G, DARK_B)
  doc.text("ESTADO DE CUENTA", PAGE_W / 2, 33, { align: "center" })

  doc.setDrawColor(BLUE_R, BLUE_G, BLUE_B)
  doc.setLineWidth(0.35)
  doc.line(PAGE_W / 2 - 32, 35.2, PAGE_W / 2 + 32, 35.2)

  // Fecha y folio
  const dateStr = date.toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
  })
  const folio = `EDC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(GRAY_R, GRAY_G, GRAY_B)
  doc.text(`Fecha: ${dateStr}`, MARGIN, 42)
  doc.text(`Folio: ${folio}`, PAGE_W - MARGIN, 42, { align: "right" })
}

/** Dibuja el bloque completo de una obra: cabecera + pagos + totales. */
function drawObraSection(doc: jsPDF, y: number, obra: EDCObra): number {
  const HDR_H  = 13   // altura de la cabecera de obra (2 líneas)
  const COT_H  = 5.5  // franja de cotización

  // ── Cabecera de obra (tono apagado, subordinado a la empresa) ──
  doc.setFillColor(32, 46, 72)
  doc.rect(MARGIN, y, CONTENT_W, HDR_H, "F")

  // Acento izquierdo — línea delgada gris-azul (no azul vivo para no competir)
  doc.setFillColor(80, 110, 155)
  doc.rect(MARGIN, y, 2.5, HDR_H, "F")

  // Código (línea 1, tono muy apagado)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(95, 125, 170)
  doc.text(obra.code ? trunc(obra.code, 12) : "—", MARGIN + 5, y + 5)

  // Nombre de obra (línea 2, blanco apagado — no compite con la empresa)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8.5)
  doc.setTextColor(200, 215, 235)
  doc.text(trunc(obra.name, 40), MARGIN + 5, y + 10.5)

  // Estatus (derecha, línea 1)
  const [sr, sg, sb] = statusRgb(obra.status)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(sr, sg, sb)
  doc.text(statusLabel(obra.status), PAGE_W - MARGIN - 1, y + 5, { align: "right" })

  // Ubicación (derecha, línea 2, muy apagada)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(110, 135, 175)
  doc.text(trunc(obra.location, 32), PAGE_W - MARGIN - 1, y + 10.5, { align: "right" })

  y += HDR_H

  // ── Franja de cotización ──
  doc.setFillColor(22, 38, 62)
  doc.rect(MARGIN, y, CONTENT_W, COT_H, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(95, 130, 175)
  doc.text("COTIZACIÓN", MARGIN + 4, y + 4)
  doc.setFont("helvetica", "bold")
  doc.setTextColor(210, 195, 100)  // dorado apagado
  doc.text(fmtCurrency(obra.budget), PAGE_W - MARGIN - 2, y + 4, { align: "right" })
  y += COT_H

  // ── Sección de pagos ──
  if (obra.pagos.length === 0) {
    doc.setFillColor(248, 250, 253)
    doc.rect(MARGIN, y, CONTENT_W, 8, "F")
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.5)
    doc.setTextColor(GRAY_R, GRAY_G, GRAY_B)
    doc.text("Sin pagos registrados", PAY_CON_X, y + 5.5)
    y += 8
  } else {
    // Encabezado de tabla de pagos
    y = drawPayHeader(doc, y)

    // Filas de pagos
    for (let i = 0; i < obra.pagos.length; i++) {
      if (y + 7.5 > PAGE_H - 22) {
        doc.addPage()
        y = MARGIN
        y = drawPayHeader(doc, y)
      }
      y = drawPayRow(doc, y, obra.pagos[i], i)
    }
  }

  // ── Totales de la obra ──
  const SUM_H = 7
  const saldo = obra.budget - obra.spent

  // Total cobrado
  doc.setFillColor(215, 232, 255)
  doc.rect(MARGIN, y, CONTENT_W, SUM_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(BLUE_R, BLUE_G, BLUE_B)
  doc.text("Total cobrado", PAY_CON_X, y + 5)
  doc.text(fmtCurrency(obra.spent), PAY_MON_END - 1.5, y + 5, { align: "right" })
  y += SUM_H

  // Saldo pendiente
  doc.setFillColor(232, 243, 255)
  doc.rect(MARGIN, y, CONTENT_W, SUM_H, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(GRAY_R, GRAY_G, GRAY_B)
  doc.text("Saldo pendiente", PAY_CON_X, y + 5)
  doc.setFont("helvetica", "bold")
  const saldoColor: [number, number, number] = saldo <= 0 ? [20, 150, 65] : [DARK_R, DARK_G, DARK_B]
  doc.setTextColor(...saldoColor)
  doc.text(fmtCurrency(saldo), PAY_MON_END - 1.5, y + 5, { align: "right" })
  y += SUM_H

  // Separador después de la obra
  doc.setDrawColor(185, 208, 238)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5)

  return y + 5
}

/** Encabezado azul de la tabla de pagos. Devuelve nueva y. */
function drawPayHeader(doc: jsPDF, y: number): number {
  const H = 6
  doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text("CONCEPTO",    PAY_CON_X,          y + 4.3)
  doc.text("FECHA",       PAY_FEC_X + 1,      y + 4.3)
  doc.text("MONTO",       PAY_MON_END - 1.5,  y + 4.3, { align: "right" })
  return y + H
}

/** Dibuja una fila de pago. Devuelve nueva y. */
function drawPayRow(doc: jsPDF, y: number, pago: EDCPago, index: number): number {
  const H = 7.5
  const isDeduction = pago.concept === "retention" || pago.concept === "return"

  if (index % 2 === 0) {
    doc.setFillColor(246, 250, 255)
    doc.rect(MARGIN, y, CONTENT_W, H, "F")
  }

  // Línea divisoria inferior muy suave
  doc.setDrawColor(210, 225, 245)
  doc.setLineWidth(0.1)
  doc.line(MARGIN, y + H, MARGIN + CONTENT_W, y + H)

  // Concepto
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(DARK_R, DARK_G, DARK_B)
  doc.text(conceptLabel(pago.concept), PAY_CON_X, y + 5.5)

  // Fecha
  doc.setTextColor(GRAY_R, GRAY_G, GRAY_B)
  doc.text(formatDate(pago.date), PAY_FEC_X + 1, y + 5.5)

  // Monto (rojo si es descuento, oscuro si es cobro)
  doc.setTextColor(
    isDeduction ? 190 : DARK_R,
    isDeduction ?  40 : DARK_G,
    isDeduction ?  40 : DARK_B
  )
  doc.text(
    (isDeduction ? "−" : "") + fmtCurrency(Math.abs(pago.amount)),
    PAY_MON_END - 1.5,
    y + 5.5,
    { align: "right" }
  )

  return y + H
}

/** Barra de subtotal de empresa. Devuelve nueva y. */
function drawEmpresaSubtotal(doc: jsPDF, y: number, budget: number, spent: number): number {
  const H = 9
  const saldo = budget - spent

  doc.setFillColor(DARK_R + 10, DARK_G + 15, DARK_B + 30)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(185, 205, 235)
  doc.text("SUBTOTAL", MARGIN + 4, y + 6)

  // Cobrado (centro-derecha)
  doc.setTextColor(200, 225, 255)
  doc.text(`Cobrado: ${fmtCurrency(spent)}`, PAY_FEC_X - 20, y + 6)

  // Saldo (derecha)
  const saldoClr: [number, number, number] = saldo <= 0 ? [100, 240, 140] : [255, 240, 130]
  doc.setTextColor(...saldoClr)
  doc.text(`Saldo: ${fmtCurrency(saldo)}`, PAY_MON_END - 1.5, y + 6, { align: "right" })

  return y + H
}

/** Barra de total general. */
function drawGrandTotal(doc: jsPDF, y: number, budget: number, spent: number) {
  const H = 11
  const saldo = budget - spent

  doc.setDrawColor(BLUE_R, BLUE_G, BLUE_B)
  doc.setLineWidth(0.5)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  y += 1.5

  doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(255, 255, 255)
  doc.text("TOTAL GENERAL", MARGIN + 4, y + 7)

  doc.setFontSize(7.5)
  doc.setTextColor(190, 225, 255)
  doc.text(`Cobrado: ${fmtCurrency(spent)}`, PAY_FEC_X - 18, y + 7)

  doc.setFont("helvetica", "bold")
  doc.setTextColor(255, 245, 140)
  doc.text(`Saldo: ${fmtCurrency(saldo)}`, PAY_MON_END - 1.5, y + 7, { align: "right" })
}

/** Pie de página con número de página. */
function drawPageFooter(doc: jsPDF, page: number, total: number) {
  const fy = PAGE_H - 7

  doc.setDrawColor(BLUE_R, BLUE_G, BLUE_B)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, fy - 3, PAGE_W - MARGIN, fy - 3)

  doc.setFont("helvetica", "italic")
  doc.setFontSize(6.5)
  doc.setTextColor(GRAY_R, GRAY_G, GRAY_B)
  doc.text("Generado por RAFSA ERP  ·  Documento confidencial", MARGIN, fy)

  doc.setFont("helvetica", "normal")
  doc.text(`Página ${page} de ${total}`, PAGE_W - MARGIN, fy, { align: "right" })
}
