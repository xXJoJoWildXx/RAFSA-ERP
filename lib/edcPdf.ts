/**
 * RAFSA – Generador de Estado de Cuenta (EDC) en PDF
 * Diseño editorial: jerarquía por tipografía y grises, sin rellenos de color.
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

// ── Paleta (escala de grises + acento header) ────────────────────────────────

const PAGE_W    = 210
const PAGE_H    = 297
const MARGIN    = 14
const CONTENT_W = PAGE_W - MARGIN * 2   // 182 mm

// Azul RAFSA — sólo para el membrete superior y pie de página
const BLUE_R = 1,   BLUE_G = 116, BLUE_B = 189

// Escala de grises para el cuerpo
const INK   = { r: 28,  g: 28,  b: 28  }   // casi negro — texto principal
const MID   = { r: 95,  g: 95,  b: 95  }   // gris medio — texto secundario
const LITE  = { r: 155, g: 155, b: 155 }   // gris claro — etiquetas/subtexto
const RULE  = { r: 210, g: 210, b: 210 }   // gris muy claro — líneas divisorias
const BG_ROW_ALT = { r: 248, g: 248, b: 248 }  // fila alternada casi blanca
const BG_COT     = { r: 238, g: 238, b: 238 }  // franja cotización
const BG_PAY_HDR = { r: 30,  g: 70,  b: 115 }  // encabezado tabla pagos
const BG_OBR_HDR = { r: 245, g: 245, b: 245 }  // cabecera de obra (claro)
const BG_EMP     = { r: 12,  g: 40,  b: 78  }  // banda empresa — azul marino
const BG_SUBTOT  = { r: 22,  g: 58,  b: 100 }  // subtotal empresa
const BG_SUM1    = { r: 238, g: 238, b: 238 }  // total cobrado obra
const BG_SUM2    = { r: 250, g: 250, b: 250 }  // saldo pendiente obra

// Color semántico — único uso de color en el cuerpo
const RED_DED = { r: 180, g: 30, b: 30 }   // montos de retención/devolución

// Columnas de la sección de pagos
// indent(6) + concepto(90) + fecha(30) + monto(56) = 182 = CONTENT_W ✓
const PAY_IND   = 6
const PAY_CON_W = 90
const PAY_FEC_W = 30
const PAY_MON_W = 56
const PAY_CON_X   = MARGIN + PAY_IND
const PAY_FEC_X   = PAY_CON_X + PAY_CON_W
const PAY_MON_END = PAY_FEC_X + PAY_FEC_W + PAY_MON_W  // = PAGE_W − MARGIN ✓

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
  let y = drawIntro(doc, 45, empresas.length)

  // 2. Cuerpo
  let grandBudget = 0
  let grandSpent  = 0
  let firstEmpresa = true

  type EmpresaSummary = { name: string; obraCount: number; spent: number; saldo: number }
  const empresaSummaries: EmpresaSummary[] = []

  for (let empIdx = 0; empIdx < empresas.length; empIdx++) {
    const empresa = empresas[empIdx]
    const secNum = empIdx + 1

    // Separación visual entre empresas
    if (!firstEmpresa) {
      y += 8
      doc.setDrawColor(RULE.r, RULE.g, RULE.b)
      doc.setLineWidth(0.4)
      doc.line(MARGIN, y - 4, MARGIN + CONTENT_W, y - 4)
    }
    firstEmpresa = false

    if (y > PAGE_H - 80) { doc.addPage(); y = MARGIN }

    // Etiqueta "Inicio sección #X"
    y = drawSectionLabel(doc, y, `Inicio sección #${secNum}`)

    y = drawEmpresaBand(doc, y, empresa)

    let empBudget = 0
    let empSpent  = 0

    for (let obraIdx = 0; obraIdx < empresa.obras.length; obraIdx++) {
      const obra = empresa.obras[obraIdx]
      const minH = 34 + (obra.pagos.length > 0 ? obra.pagos.length * 7 + 8 : 10) + 23
      if (y + minH > PAGE_H - 22) { doc.addPage(); y = MARGIN }

      y = drawObraSection(doc, y, obra, obraIdx + 1)
      empBudget   += obra.budget
      empSpent    += obra.spent
      grandBudget += obra.budget
      grandSpent  += obra.spent
    }

    if (y + 10 > PAGE_H - 22) { doc.addPage(); y = MARGIN }
    y = drawEmpresaSubtotal(doc, y, empBudget, empSpent, empresa.name, empresa.obras.length)
    empresaSummaries.push({ name: empresa.name, obraCount: empresa.obras.length, spent: empSpent, saldo: empBudget - empSpent })

    // Etiqueta "Final sección #X"
    y = drawSectionLabel(doc, y, `Final sección #${secNum}`)
  }

  // 3. Resumen general
  const summaryH = 14 + empresaSummaries.length * 8 + 14
  if (y + summaryH > PAGE_H - 22) { doc.addPage(); y = MARGIN }
  drawGrandTotal(doc, y, grandBudget, grandSpent, empresaSummaries)

  // Etiqueta "Final del Documento" — después del resumen
  const finalY = y + 10 + 4 + 10 + (empresaSummaries.length * 8) + 12 + 8
  drawSectionLabel(doc, finalY, "Final del Documento")

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

/** Etiqueta pequeña centrada de sección (inicio/final/fin de documento). */
function drawSectionLabel(doc: jsPDF, y: number, text: string): number {
  const H = 6
  doc.setFont("helvetica", "italic")
  doc.setFontSize(6)
  doc.setTextColor(LITE.r, LITE.g, LITE.b)
  doc.text(text, PAGE_W / 2, y + 4, { align: "center" })
  return y + H
}

/**
 * Párrafo introductorio del documento.
 * Contextualiza al lector antes de los bloques de empresa.
 */
function drawIntro(doc: jsPDF, y: number, empresaCount: number): number {
  const intro =
    `El presente documento refleja el estado financiero de las obras contratadas con ` +
    `${empresaCount === 1 ? "la empresa indicada" : `las ${empresaCount} empresas indicadas`}, ` +
    `incluyendo el valor cotizado, los movimientos registrados y el saldo pendiente por proyecto.`

  doc.setFont("helvetica", "italic")
  doc.setFontSize(7.5)
  doc.setTextColor(INK.r, INK.g, INK.b)

  // splitTextToSize respeta el ancho del contenido
  const lines = doc.splitTextToSize(intro, CONTENT_W - 4)
  doc.text(lines, MARGIN + 2, y + 5)

  const blockH = lines.length * 4.5 + 8

  // Línea separadora antes del cuerpo
  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y + blockH - 2, MARGIN + CONTENT_W, y + blockH - 2)

  return y + blockH + 2
}

/** Membrete superior con fondo oscuro y logo. */
function drawHeader(doc: jsPDF, date: Date, logoDataUrl: string | null, generatedBy = "Sistema") {
  // Barra oscura principal
  doc.setFillColor(8, 18, 42)
  doc.rect(0, 0, PAGE_W, 26, "F")

  // Acento azul debajo del header
  doc.setFillColor(BLUE_R, BLUE_G, BLUE_B)
  doc.rect(0, 26, PAGE_W, 1, "F")

  // Logo (derecha, proporción 1748×1241 ≈ 1.41:1)
  if (logoDataUrl) {
    const logoH = 21
    const logoW = logoH * (1748 / 1241)
    doc.addImage(logoDataUrl, "PNG", PAGE_W - MARGIN - logoW, 2.5, logoW, logoH)
  }

  // Nombre de la empresa
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
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("ESTADO DE CUENTA", PAGE_W / 2, 33, { align: "center" })

  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.3)
  doc.line(PAGE_W / 2 - 30, 35, PAGE_W / 2 + 30, 35)

  // Fecha y folio
  const dateStr = date.toLocaleDateString("es-MX", {
    day: "2-digit", month: "long", year: "numeric",
  })
  const folio = `EDC-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(`Fecha: ${dateStr}`, MARGIN, 42)
  doc.text(`Folio: ${folio}`, PAGE_W - MARGIN, 42, { align: "right" })
}

/** Banda de encabezado de empresa. Fondo casi negro, texto blanco prominente. */
function drawEmpresaBand(doc: jsPDF, y: number, empresa: EDCEmpresa): number {
  const H = 14

  // Fondo casi negro
  doc.setFillColor(BG_EMP.r, BG_EMP.g, BG_EMP.b)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")

  // Acento izquierdo — gris medio (no color)
  doc.setFillColor(100, 100, 100)
  doc.rect(MARGIN, y, 3.5, H, "F")

  // Label "EMPRESA"
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.5)
  doc.setTextColor(255, 255, 255)
  doc.text("EMPRESA", MARGIN + 6.5, y + 4.8)

  // Nombre en grande
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(trunc(empresa.name.toUpperCase(), 55), MARGIN + 6.5, y + 11)

  // Cantidad de obras (derecha)
  const obraCount = empresa.obras.length
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text(`${obraCount} obra${obraCount !== 1 ? "s" : ""} en contrato`, PAGE_W - MARGIN - 2, y + 11, { align: "right" })

  return y + H + 2
}

/** Bloque completo de una obra: cabecera + cotización + pagos + totales. */
function drawObraSection(doc: jsPDF, y: number, obra: EDCObra, obraNum: number): number {
  const HDR_H = 17   // más alto para acomodar el número + nombre centrado
  const COT_H = 5.5

  // Línea separadora — encima del bloque, antes del número de obra
  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.15)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)

  y += 1.5   // pequeño respiro entre la línea y el contenido

  // ── Cabecera de obra — fondo gris claro, texto oscuro ──
  doc.setFillColor(BG_OBR_HDR.r, BG_OBR_HDR.g, BG_OBR_HDR.b)
  doc.rect(MARGIN, y, CONTENT_W, HDR_H, "F")

  // Acento izquierdo — gris medio
  doc.setFillColor(180, 180, 180)
  doc.rect(MARGIN, y, 2.5, HDR_H, "F")

  const textX = MARGIN + 7   // margen izquierdo con espacio del acento

  // Fila única de metadatos: Obra #X  ·  código | estatus
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(`Obra #${obraNum}`, textX, y + 6)
  if (obra.code) {
    const obraNumW = doc.getTextWidth(`Obra #${obraNum}`)
    doc.setFontSize(6)
    doc.text(`· ${trunc(obra.code, 12)}`, textX + obraNumW + 2, y + 6)
  }
  doc.setFontSize(6.5)
  doc.text(statusLabel(obra.status), PAGE_W - MARGIN - 2, y + 6, { align: "right" })

  // Nombre de obra — izquierda, grande (fila inferior)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(trunc(obra.name, 44), textX, y + 14)

  // Ubicación — derecha, fila del nombre
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(trunc(obra.location, 28), PAGE_W - MARGIN - 2, y + 14, { align: "right" })

  y += HDR_H

  // ── Franja cotización — gris suave ──
  doc.setFillColor(BG_COT.r, BG_COT.g, BG_COT.b)
  doc.rect(MARGIN, y, CONTENT_W, COT_H, "F")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(6)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Valor cotizado del proyecto", MARGIN + 5, y + 4)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(fmtCurrency(obra.budget), PAGE_W - MARGIN - 2, y + 4, { align: "right" })

  y += COT_H

  // ── Sección de pagos ──
  // Etiqueta de sección
  doc.setFont("helvetica", "italic")
  doc.setFontSize(6.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Movimientos registrados", MARGIN + 2, y + 4.5)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.text(
    `(${obra.pagos.length === 0 ? "ninguno" : `${obra.pagos.length} movimiento${obra.pagos.length !== 1 ? "s" : ""}`})`,
    MARGIN + 2 + doc.getTextWidth("Movimientos registrados") + 1.5,
    y + 4.5
  )
  y += 7

  if (obra.pagos.length === 0) {
    doc.setFillColor(255, 255, 255)
    doc.rect(MARGIN, y, CONTENT_W, 7, "F")
    doc.setDrawColor(RULE.r, RULE.g, RULE.b)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7)
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7)
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text("No se han registrado cobros para esta obra.", PAY_CON_X, y + 4.8)
    y += 7
  } else {
    y = drawPayHeader(doc, y)
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

  // Etiqueta de sección de resumen
  doc.setFont("helvetica", "italic")
  doc.setFontSize(6.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Resumen financiero", MARGIN + 2, y + 4.5)
  y += 7

  // Total cobrado
  doc.setFillColor(BG_SUM1.r, BG_SUM1.g, BG_SUM1.b)
  doc.rect(MARGIN, y, CONTENT_W, SUM_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7)
  const spentText = fmtCurrency(obra.spent)
  const spentW = doc.getTextWidth(spentText)
  // Marcatextos verde pastel detrás del monto
  doc.setFillColor(180, 235, 175)
  doc.rect(PAY_MON_END - 1.5 - spentW - 1, y + 1.8, spentW + 2, 4, "F")
  doc.setFont("helvetica", "normal")
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Total cobrado", PAY_CON_X, y + 5)
  doc.setFont("helvetica", "bold")
  doc.text(spentText, PAY_MON_END - 1.5, y + 5, { align: "right" })
  y += SUM_H

  // Saldo pendiente
  doc.setFillColor(BG_SUM2.r, BG_SUM2.g, BG_SUM2.b)
  doc.rect(MARGIN, y, CONTENT_W, SUM_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  const saldoText = fmtCurrency(saldo)
  const saldoW = doc.getTextWidth(saldoText)
  // Marcatextos amarillo pastel detrás del monto
  doc.setFillColor(255, 238, 120)
  doc.rect(PAY_MON_END - 1.5 - saldoW - 1, y + 1.2, saldoW + 2, 5, "F")
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Saldo pendiente", PAY_CON_X, y + 5)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.text(saldoText, PAY_MON_END - 1.5, y + 5.5, { align: "right" })
  y += SUM_H

  // Línea de cierre de la obra
  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)

  return y + 4
}

/** Encabezado oscuro de la tabla de pagos. */
function drawPayHeader(doc: jsPDF, y: number): number {
  const H = 6
  doc.setFillColor(BG_PAY_HDR.r, BG_PAY_HDR.g, BG_PAY_HDR.b)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6.5)
  doc.setTextColor(255, 255, 255)
  doc.text("CONCEPTO", PAY_CON_X,         y + 4.2)
  doc.text("FECHA",    PAY_FEC_X + 1,     y + 4.2)
  doc.text("MONTO",    PAY_MON_END - 1.5, y + 4.2, { align: "right" })
  return y + H
}

/** Fila de pago individual. */
function drawPayRow(doc: jsPDF, y: number, pago: EDCPago, index: number): number {
  const H = 7.5
  const isDeduction = pago.concept === "retention" || pago.concept === "return"

  // Fondo alternado (sólo en filas pares)
  if (index % 2 === 0) {
    doc.setFillColor(BG_ROW_ALT.r, BG_ROW_ALT.g, BG_ROW_ALT.b)
    doc.rect(MARGIN, y, CONTENT_W, H, "F")
  }

  // Línea divisoria inferior
  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.1)
  doc.line(MARGIN, y + H, MARGIN + CONTENT_W, y + H)

  // Concepto
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(conceptLabel(pago.concept), PAY_CON_X, y + 5.5)

  // Fecha
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(formatDate(pago.date), PAY_FEC_X + 1, y + 5.5)

  // Monto — rojo oscuro si es deducción, negro si es abono
  if (isDeduction) {
    doc.setTextColor(RED_DED.r, RED_DED.g, RED_DED.b)
  } else {
    doc.setTextColor(INK.r, INK.g, INK.b)
  }
  doc.text(
    (isDeduction ? "−" : "") + fmtCurrency(Math.abs(pago.amount)),
    PAY_MON_END - 1.5,
    y + 5.5,
    { align: "right" }
  )

  return y + H
}

/** Barra de subtotal de empresa — azul, texto blanco. */
function drawEmpresaSubtotal(
  doc: jsPDF, y: number,
  budget: number, spent: number,
  empresaNombre: string, obraCount: number
): number {
  const H = 13
  const saldo = budget - spent

  doc.setFillColor(BG_SUBTOT.r, BG_SUBTOT.g, BG_SUBTOT.b)
  doc.rect(MARGIN, y, CONTENT_W, H, "F")

  // Etiqueta "SUBTOTAL" pequeña arriba
  doc.setFont("helvetica", "normal")
  doc.setFontSize(5.5)
  doc.setTextColor(255, 255, 255)
  doc.text("SUBTOTAL EMPRESA", MARGIN + 5, y + 4.5)

  // Nombre de empresa + conteo de obras
  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text(
    `${trunc(empresaNombre, 40)}  ·  ${obraCount} obra${obraCount !== 1 ? "s" : ""}`,
    MARGIN + 5, y + 10
  )

  // Cifras a la derecha
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7)
  doc.text(`Cobrado: ${fmtCurrency(spent)}`, PAY_FEC_X - 14, y + 10)

  doc.setFont("helvetica", "bold")
  doc.text(`Pendiente: ${fmtCurrency(saldo)}`, PAY_MON_END - 1.5, y + 10, { align: "right" })

  return y + H
}

/** Sección de resumen general al final del documento. */
function drawGrandTotal(
  doc: jsPDF, y: number,
  budget: number, spent: number,
  summaries: { name: string; obraCount: number; spent: number; saldo: number }[]
) {
  const grandSaldo = budget - spent

  // Separación extra respecto a la última sección
  y += 10

  // Regla doble de apertura
  doc.setDrawColor(BLUE_R, BLUE_G, BLUE_B)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, y, MARGIN + CONTENT_W, y)
  doc.setLineWidth(0.25)
  doc.line(MARGIN, y + 1.5, MARGIN + CONTENT_W, y + 1.5)
  y += 4

  // ── Encabezado "RESUMEN GENERAL" ──
  const TITLE_H = 10
  doc.setFillColor(8, 28, 60)
  doc.rect(MARGIN, y, CONTENT_W, TITLE_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.setTextColor(255, 255, 255)
  doc.text("RESUMEN GENERAL", MARGIN + 5, y + 7)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.5)
  doc.setTextColor(180, 210, 255)
  doc.text("Consolidado de todas las empresas y obras del documento", PAGE_W - MARGIN - 2, y + 7, { align: "right" })
  y += TITLE_H

  // ── Columnas encabezado ──
  const COL_H = 6
  doc.setFillColor(22, 58, 100)
  doc.rect(MARGIN, y, CONTENT_W, COL_H, "F")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(6)
  doc.setTextColor(255, 255, 255)
  doc.text("EMPRESA", MARGIN + 5, y + 4.2)
  doc.text("OBRAS", MARGIN + 100, y + 4.2, { align: "right" })
  doc.text("COBRADO", MARGIN + 140, y + 4.2, { align: "right" })
  doc.text("PENDIENTE", PAY_MON_END - 1.5, y + 4.2, { align: "right" })
  y += COL_H

  // ── Filas por empresa ──
  const ROW_H = 8
  summaries.forEach((s, i) => {
    if (i % 2 === 0) {
      doc.setFillColor(BG_ROW_ALT.r, BG_ROW_ALT.g, BG_ROW_ALT.b)
      doc.rect(MARGIN, y, CONTENT_W, ROW_H, "F")
    }
    doc.setDrawColor(RULE.r, RULE.g, RULE.b)
    doc.setLineWidth(0.1)
    doc.line(MARGIN, y + ROW_H, MARGIN + CONTENT_W, y + ROW_H)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(INK.r, INK.g, INK.b)
    doc.text(trunc(s.name, 45), MARGIN + 5, y + 5.5)

    doc.setFontSize(7)
    doc.text(`${s.obraCount}`, MARGIN + 100, y + 5.5, { align: "right" })
    doc.text(fmtCurrency(s.spent), MARGIN + 140, y + 5.5, { align: "right" })

    doc.setFont("helvetica", "bold")
    doc.text(fmtCurrency(s.saldo), PAY_MON_END - 1.5, y + 5.5, { align: "right" })
    y += ROW_H
  })

  // ── Fila de total general ──
  const TOT_H = 12
  doc.setFillColor(8, 28, 60)
  doc.rect(MARGIN, y, CONTENT_W, TOT_H, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(7.5)
  doc.setTextColor(255, 255, 255)
  doc.text("TOTAL", MARGIN + 5, y + 8)

  doc.setFontSize(7)
  doc.setFont("helvetica", "normal")
  doc.text(fmtCurrency(spent), MARGIN + 140, y + 8, { align: "right" })

  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text(fmtCurrency(grandSaldo), PAY_MON_END - 1.5, y + 8, { align: "right" })
}

/** Pie de página con folio y número de hoja. */
function drawPageFooter(doc: jsPDF, page: number, total: number) {
  const fy = PAGE_H - 7

  doc.setDrawColor(RULE.r, RULE.g, RULE.b)
  doc.setLineWidth(0.2)
  doc.line(MARGIN, fy - 3, PAGE_W - MARGIN, fy - 3)

  doc.setFont("helvetica", "italic")
  doc.setFontSize(6.5)
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text("Generado por RAFSA ERP  ·  Documento confidencial", MARGIN, fy)

  doc.setFont("helvetica", "normal")
  doc.setTextColor(INK.r, INK.g, INK.b)
  doc.text(`Página ${page} de ${total}`, PAGE_W - MARGIN, fy, { align: "right" })
}
