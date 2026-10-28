/**
 * Reporte general de captura de expedientes — RAFSA ERP
 *
 * Objetivo del documento: ver de un vistazo qué falta por capturar de cada
 * empleado y revisar lo ya capturado para confirmar que esté correcto.
 *
 * Estructura:
 *   1. Resumen con indicadores y los pendientes más frecuentes
 *   2. Matrices de captura (datos y expediente) de los empleados activos
 *   3. Ficha de cada empleado con los valores capturados y lo que falta
 *
 * Requiere: jspdf
 */

import {
  buildEmployeeAudit,
  sortAudits,
  missingRanking,
  type EmployeeAudit,
  type EmployeeAuditSource,
  type CheckItem,
} from "@/lib/employeeCompleteness"

type Doc = InstanceType<typeof import("jspdf").default>

// ── Paleta ─────────────────────────────────────────────────────────────────
const NAVY: [number, number, number] = [4, 21, 39]
const BRAND: [number, number, number] = [1, 116, 189]
const GREEN: [number, number, number] = [22, 163, 74]
const RED: [number, number, number] = [220, 38, 38]
const AMBER: [number, number, number] = [217, 119, 6]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [110, 123, 136]
const HAIR: [number, number, number] = [214, 224, 233]
const ZEBRA: [number, number, number] = [245, 249, 252]

// ── Métricas de página ─────────────────────────────────────────────────────
const PW = 210
const PH = 297
const ML = 12
const CW = PW - ML * 2 // 186
const TOP = 26 // debajo del encabezado
const BOTTOM = PH - 14

// Columnas de las matrices: claves fijas (la residencia del foráneo es
// condicional, así que sólo aparece en la ficha de detalle).
const MATRIX_DATOS = [
  { key: "photo", short: "Foto" },
  { key: "birth_date", short: "Nac" },
  { key: "rfc", short: "RFC" },
  { key: "imss_number", short: "NSS" },
  { key: "hire_date", short: "Ing" },
  { key: "roles", short: "Rol" },
  { key: "payroll_code", short: "Cód" },
  { key: "real_salary", short: "Sdo" },
  { key: "overtime", short: "HEx" },
  { key: "bank_name", short: "Bco" },
  { key: "account_number", short: "Cta" },
  { key: "clabe", short: "CLB" },
]

const MATRIX_EXPEDIENTE = [
  { key: "curp", short: "CURP" },
  { key: "ine", short: "INE" },
  { key: "tax_certificate", short: "Fisc" },
  { key: "birth_certificate", short: "Acta" },
  { key: "address_proof", short: "Dom" },
  { key: "imss", short: "IMSS" },
  { key: "imss_alta", short: "Alta" },
  { key: "dc3", short: "DC-3" },
  { key: "medical_reports", short: "Méd" },
]

// ── Utilidades de dibujo ───────────────────────────────────────────────────

function itemByKey(audit: EmployeeAudit, key: string): CheckItem | null {
  for (const g of audit.groups) {
    const found = g.items.find((i) => i.key === key)
    if (found) return found
  }
  return null
}

function fit(doc: Doc, text: string, maxW: number, size: number): string {
  doc.setFontSize(size)
  if (doc.getTextWidth(text) <= maxW) return text
  let t = text
  while (t.length > 1 && doc.getTextWidth(t + "...") > maxW) t = t.slice(0, -1)
  return t + "..."
}

function drawHeader(doc: Doc, subtitle: string): void {
  doc.setFillColor(...NAVY)
  doc.rect(0, 0, PW, 17, "F")
  doc.setFillColor(...BRAND)
  doc.rect(0, 17, PW, 1.2, "F")

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(255, 255, 255)
  doc.text("RAFSA INDUSTRIAL COATINGS", ML, 8)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(150, 185, 215)
  doc.text(subtitle, ML, 13)
}

function drawFooter(doc: Doc, page: number, generatedAt: string): void {
  doc.setDrawColor(...HAIR)
  doc.setLineWidth(0.3)
  doc.line(ML, BOTTOM + 2, PW - ML, BOTTOM + 2)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(6.8)
  doc.setTextColor(...MUTED)
  doc.text(`Generado el ${generatedAt}  |  Uso interno y confidencial`, ML, BOTTOM + 6)
  doc.text(`Página ${page}`, PW - ML, BOTTOM + 6, { align: "right" })
}

/** Cuadrito de estado: verde si está capturado, rojo si falta. */
function statusMark(doc: Doc, x: number, y: number, ok: boolean): void {
  const s = 2.6
  if (ok) {
    doc.setFillColor(...GREEN)
    doc.roundedRect(x - s / 2, y - s / 2, s, s, 0.6, 0.6, "F")
  } else {
    doc.setFillColor(255, 235, 235)
    doc.setDrawColor(...RED)
    doc.setLineWidth(0.4)
    doc.roundedRect(x - s / 2, y - s / 2, s, s, 0.6, 0.6, "FD")
  }
}

function progressBar(
  doc: Doc,
  x: number,
  y: number,
  w: number,
  h: number,
  pct: number,
  color: [number, number, number],
): void {
  doc.setFillColor(...HAIR)
  doc.roundedRect(x, y, w, h, h / 2, h / 2, "F")
  const filled = Math.max(0, Math.min(100, pct)) / 100
  if (filled > 0) {
    doc.setFillColor(...color)
    doc.roundedRect(x, y, Math.max(w * filled, h), h, h / 2, h / 2, "F")
  }
}

function pctColor(pct: number): [number, number, number] {
  if (pct >= 90) return GREEN
  if (pct >= 60) return AMBER
  return RED
}

// ── 1. Resumen ─────────────────────────────────────────────────────────────

function drawSummary(doc: Doc, audits: EmployeeAudit[], generatedAt: string): void {
  drawHeader(doc, "Reporte de captura de expedientes")



  const activos = audits.filter((a) => a.isActive)
  const inactivos = audits.filter((a) => !a.isActive)
  const completos = activos.filter((a) => a.isComplete)
  const incompletos = activos.filter((a) => !a.isComplete)

  const okTotal = activos.reduce((s, a) => s + a.okCount, 0)
  const campoTotal = activos.reduce((s, a) => s + a.total, 0)
  const avance = campoTotal > 0 ? Math.round((okTotal / campoTotal) * 100) : 0

  let y = TOP + 4

  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...NAVY)
  doc.text("Reporte general de empleados", ML, y)
  y += 6

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(
    "Control de información faltante y verificación de lo ya capturado.",
    ML,
    y,
  )
  y += 10

  // ── Tarjetas de conteo ───────────────────────────────────────────────────
  const cards: { label: string; value: string; color: [number, number, number] }[] = [
    { label: "EMPLEADOS ACTIVOS", value: String(activos.length), color: GREEN },
    { label: "CON FALTANTES", value: String(incompletos.length), color: RED },
    { label: "EXPEDIENTE COMPLETO", value: String(completos.length), color: BRAND },
    { label: "INACTIVOS", value: String(inactivos.length), color: MUTED },
  ]
  const gap = 4
  const cardW = (CW - gap * (cards.length - 1)) / cards.length
  const cardH = 22

  cards.forEach((c, i) => {
    const x = ML + i * (cardW + gap)
    doc.setFillColor(250, 252, 254)
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "FD")
    doc.setFillColor(...c.color)
    doc.rect(x, y + 3, 1.2, cardH - 6, "F")

    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.2)
    doc.setTextColor(...MUTED)
    doc.text(c.label, x + cardW / 2, y + 7, { align: "center" })

    doc.setFont("helvetica", "bold")
    doc.setFontSize(17)
    doc.setTextColor(...c.color)
    doc.text(c.value, x + cardW / 2, y + 17, { align: "center" })
  })
  y += cardH + 10

  // ── Avance global ────────────────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text("Avance de captura de los empleados activos", ML, y)
  y += 5

  progressBar(doc, ML, y, CW - 24, 5, avance, pctColor(avance))
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...pctColor(avance))
  doc.text(`${avance}%`, PW - ML, y + 4.2, { align: "right" })
  y += 8

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text(
    `${okTotal} de ${campoTotal} puntos de información capturados entre los ${activos.length} empleados activos.`,
    ML,
    y,
  )
  y += 10

  // ── Pendientes más frecuentes ────────────────────────────────────────────
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.setTextColor(...NAVY)
  doc.text("Pendientes más frecuentes", ML, y)
  y += 2
  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text("Por dónde conviene empezar: lo que le falta a más gente.", ML, y + 4)
  y += 9

  const ranking = missingRanking(audits).slice(0, 20)
  const barX = ML + 96
  const barW = CW - 96 - 16

  if (ranking.length === 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9)
    doc.setTextColor(...GREEN)
    doc.text("No hay pendientes: todos los empleados activos están completos.", ML, y)
  } else {
    ranking.forEach((r, i) => {
      const rowY = y + i * 6.4
      if (i % 2 === 0) {
        doc.setFillColor(...ZEBRA)
        doc.rect(ML - 1.5, rowY - 3.6, CW + 3, 6, "F")
      }
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.8)
      doc.setTextColor(...INK)
      doc.text(fit(doc, r.label, 70, 7.8), ML, rowY)

      doc.setFontSize(6.5)
      doc.setTextColor(...MUTED)
      doc.text(fit(doc, r.group, 22, 6.5), ML + 72, rowY)

      const pct = activos.length > 0 ? (r.count / activos.length) * 100 : 0
      progressBar(doc, barX, rowY - 2.6, barW, 3.2, pct, RED)

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.8)
      doc.setTextColor(...RED)
      doc.text(String(r.count), PW - ML, rowY, { align: "right" })
    })
  }
}

// ── 2. Matriz de captura ───────────────────────────────────────────────────

type MatrixCol = { key: string; short: string }

function drawMatrix(
  doc: Doc,
  audits: EmployeeAudit[],
  cols: MatrixCol[],
  title: string,
  hint: string,
  generatedAt: string,
  pageRef: { n: number },
): void {
  const NAME_W = 70
  const FALTA_W = 14
  const colW = (CW - NAME_W - FALTA_W) / cols.length
  const ROW_H = 5.4

  let first = true
  let y = 0

  const startPage = () => {
    doc.addPage()
    pageRef.n += 1
    drawHeader(doc, "Matriz de captura")
    drawFooter(doc, pageRef.n, generatedAt)
    y = TOP + 2

    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
    doc.text(title + (first ? "" : " (continuación)"), ML, y)
    y += 5

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(hint, ML, y)
    y += 6

    // Encabezado de columnas
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 6, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.4)
    doc.setTextColor(255, 255, 255)
    doc.text("EMPLEADO", ML + 2, y + 4)
    cols.forEach((c, i) => {
      doc.text(c.short, ML + NAME_W + colW * i + colW / 2, y + 4, { align: "center" })
    })
    doc.text("FALTAN", PW - ML - FALTA_W / 2, y + 4, { align: "center" })
    y += 6
    first = false
  }

  startPage()

  audits.forEach((a, idx) => {
    if (y + ROW_H > BOTTOM - 4) startPage()

    if (idx % 2 === 0) {
      doc.setFillColor(...ZEBRA)
      doc.rect(ML, y, CW, ROW_H, "F")
    }

    const faltan = cols.filter((c) => {
      const it = itemByKey(a, c.key)
      return it ? !it.ok : false
    }).length

    doc.setFont("helvetica", faltan > 0 ? "bold" : "normal")
    doc.setFontSize(7)
    doc.setTextColor(...(faltan > 0 ? INK : MUTED))
    doc.text(fit(doc, a.full_name, NAME_W - 4, 7), ML + 2, y + 3.7)

    cols.forEach((c, i) => {
      const it = itemByKey(a, c.key)
      if (!it) return
      statusMark(doc, ML + NAME_W + colW * i + colW / 2, y + 2.7, it.ok)
    })

    doc.setFont("helvetica", "bold")
    doc.setFontSize(7)
    doc.setTextColor(...(faltan > 0 ? RED : GREEN))
    doc.text(
      faltan > 0 ? String(faltan) : "OK",
      PW - ML - FALTA_W / 2,
      y + 3.7,
      { align: "center" },
    )

    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.2)
    doc.line(ML, y + ROW_H, PW - ML, y + ROW_H)

    y += ROW_H
  })

  // Leyenda
  y += 4
  if (y + 8 < BOTTOM) {
    statusMark(doc, ML + 1.5, y, true)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    doc.text("Capturado", ML + 5, y + 1)
    statusMark(doc, ML + 30, y, false)
    doc.text("Falta por capturar", ML + 33.5, y + 1)
  }
}

// ── 3. Fichas de detalle ───────────────────────────────────────────────────

function drawEmployeeCard(doc: Doc, a: EmployeeAudit, y: number, index: number): void {
  const COL_W = (CW - 6) / 2
  const LH = 3.7

  // Encabezado de la ficha
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9.5)
  doc.setTextColor(...NAVY)
  doc.text(`${index}. ${fit(doc, a.full_name, 110, 9.5)}`, ML, y)

  if (!a.isActive) {
    doc.setFillColor(...MUTED)
    doc.roundedRect(PW - ML - 22, y - 3.4, 22, 4.6, 1.2, 1.2, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.4)
    doc.setTextColor(255, 255, 255)
    doc.text("INACTIVO", PW - ML - 11, y - 0.2, { align: "center" })
  } else {
    const col = a.isComplete ? GREEN : pctColor(a.percent)
    progressBar(doc, PW - ML - 44, y - 2.6, 30, 3.2, a.percent, col)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.4)
    doc.setTextColor(...col)
    doc.text(
      a.isComplete ? "Completo" : `Faltan ${a.missingCount}`,
      PW - ML,
      y,
      { align: "right" },
    )
  }

  doc.setDrawColor(...HAIR)
  doc.setLineWidth(0.3)
  doc.line(ML, y + 1.8, PW - ML, y + 1.8)

  // Los inactivos no se evalúan: sólo se deja constancia
  if (!a.isActive) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.4)
    doc.setTextColor(...MUTED)
    doc.text(
      "Empleado inactivo: no se evalúa la completitud de su expediente.",
      ML,
      y + 7,
    )
    return
  }

  // Dos columnas: izquierda identidad + laboral, derecha bancario + expediente
  const columnas = [
    { x: ML, groups: a.groups.filter((g) => g.key === "identidad" || g.key === "laboral") },
    { x: ML + COL_W + 6, groups: a.groups.filter((g) => g.key === "bancario" || g.key === "expediente") },
  ]

  for (const col of columnas) {
    let cy = y + 6
    for (const g of col.groups) {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.4)
      doc.setTextColor(...BRAND)
      doc.text(`${g.label.toUpperCase()}  ${g.okCount}/${g.total}`, col.x, cy)
      cy += LH + 0.6

      for (const it of g.items) {
        statusMark(doc, col.x + 1.3, cy - 1, it.ok)

        doc.setFont("helvetica", "normal")
        doc.setFontSize(6.8)
        doc.setTextColor(...MUTED)
        const labelTxt = fit(doc, it.label, 36, 6.8)
        doc.text(labelTxt, col.x + 4, cy)

        doc.setFont("helvetica", it.ok ? "normal" : "bold")
        doc.setTextColor(...(it.ok ? INK : RED))
        doc.text(fit(doc, it.value, COL_W - 44, 6.8), col.x + 42, cy)

        cy += LH
      }
      cy += 1.4
    }
  }
}

// ── Listado compacto de inactivos ──────────────────────────────────────────
//  No se evalúa su expediente, así que una ficha por cabeza desperdiciaba
//  páginas enteras. Van como lista a tres columnas.

function drawInactiveList(
  doc: Doc,
  inactivos: EmployeeAudit[],
  generatedAt: string,
  pageRef: { n: number },
): void {
  const COLS = 3
  const GAP = 4
  const colW = (CW - GAP * (COLS - 1)) / COLS
  const ROW_H = 5.2

  let y = 0
  let filasPorPagina = 0
  let primera = true

  const nuevaPagina = () => {
    doc.addPage()
    pageRef.n += 1
    drawHeader(doc, "Empleados inactivos")
    drawFooter(doc, pageRef.n, generatedAt)

    y = TOP + 2
    doc.setFont("helvetica", "bold")
    doc.setFontSize(12)
    doc.setTextColor(...NAVY)
    doc.text(
      primera ? `Empleados inactivos (${inactivos.length})` : "Empleados inactivos (continuación)",
      ML,
      y,
    )
    y += 5

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(
      "Se conservan en el padrón pero no se evalúa la completitud de su expediente.",
      ML,
      y,
    )
    y += 6

    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.line(ML, y, PW - ML, y)
    y += 4

    filasPorPagina = Math.max(1, Math.floor((BOTTOM - 4 - y) / ROW_H))
    primera = false
  }

  nuevaPagina()

  let i = 0
  while (i < inactivos.length) {
    const cabenAqui = filasPorPagina * COLS
    const bloque = inactivos.slice(i, i + cabenAqui)
    const yInicio = y

    // Reparto parejo entre las tres columnas: si no se usa el alto completo,
    // los nombres se distribuyen en vez de apilarse todos en la primera.
    const filasEfectivas = Math.max(1, Math.ceil(bloque.length / COLS))

    bloque.forEach((a, k) => {
      // Se llena por columnas: así la lista se lee de arriba abajo
      const col = Math.floor(k / filasEfectivas)
      const fila = k % filasEfectivas
      const x = ML + col * (colW + GAP)
      const fy = yInicio + fila * ROW_H

      if (fila % 2 === 0) {
        doc.setFillColor(...ZEBRA)
        doc.rect(x - 1, fy - 3.4, colW, ROW_H, "F")
      }

      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.6)
      doc.setTextColor(...MUTED)
      doc.text(String(i + k + 1).padStart(2, " "), x, fy)

      doc.setFontSize(7.4)
      doc.setTextColor(...INK)
      doc.text(fit(doc, a.full_name, colW - 9, 7.4), x + 6, fy)
    })

    i += bloque.length
    if (i < inactivos.length) nuevaPagina()
  }
}

// ── Export principal ───────────────────────────────────────────────────────

export async function generateEmployeesPdf(sources: EmployeeAuditSource[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const generatedAt = new Date().toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })

  const audits = sortAudits(sources.map(buildEmployeeAudit))
  const activos = audits.filter((a) => a.isActive)

  const pageRef = { n: 1 }

  // 1. Resumen
  drawSummary(doc, audits, generatedAt)
  drawFooter(doc, pageRef.n, generatedAt)

  // 2. Matrices (sólo activos: los inactivos ya no se capturan)
  if (activos.length > 0) {
    drawMatrix(
      doc,
      activos,
      MATRIX_DATOS,
      "Matriz de datos del empleado",
      "Foto / Nacimiento / RFC / NSS / Ingreso / Rol / Código de nómina / Sueldo / Hora extra / Banco / Cuenta / CLABE",
      generatedAt,
      pageRef,
    )
    drawMatrix(
      doc,
      activos,
      MATRIX_EXPEDIENTE,
      "Matriz del expediente de documentos",
      "CURP / INE / Constancia fiscal / Acta / Comprobante de domicilio / IMSS / Alta IMSS / DC-3 / Reportes médicos",
      generatedAt,
      pageRef,
    )
  }

  // 3. Fichas de detalle
  const CARD_H = 64
  const perPage = Math.floor((BOTTOM - TOP) / CARD_H)

  // Ficha detallada sólo para los activos: son los que hay que capturar.
  activos.forEach((a, i) => {
    const slot = i % perPage
    if (slot === 0) {
      doc.addPage()
      pageRef.n += 1
      drawHeader(doc, "Detalle por empleado")
      drawFooter(doc, pageRef.n, generatedAt)
    }
    drawEmployeeCard(doc, a, TOP + slot * CARD_H + 4, i + 1)
  })

  // Los inactivos cierran el documento como lista compacta
  const inactivos = audits.filter((a) => !a.isActive)
  if (inactivos.length > 0) {
    drawInactiveList(doc, inactivos, generatedAt, pageRef)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`Reporte_Captura_Empleados_RAFSA_${stamp}.pdf`)
}
