// lib/aguinaldoReportePdf.ts
// PDF de la corrida de aguinaldo. A4 horizontal, una tabla corrida con el
// encabezado repetido en cada página, porque la lista puede pasar de 100
// renglones y hay que poder leer una hoja suelta.

import { jsPDF } from "jspdf"
import {
  type CorridaAguinaldo,
  money,
  fechaCorta,
  nombreArchivo,
  ordenarFilas,
  estadoDe,
  proporcionDe,
} from "./aguinaldoReporte"

const BRAND: [number, number, number] = [1, 116, 189]
const DARK: [number, number, number] = [30, 41, 59]
const INK: [number, number, number] = [15, 23, 42]
const MUTED: [number, number, number] = [100, 116, 139]
const AMBER: [number, number, number] = [180, 83, 9]
const GREEN: [number, number, number] = [21, 128, 61]

export function generateAguinaldoReportePdf(c: CorridaAguinaldo): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12

  // Anchos medidos para que nada se corte: el nombre se lleva lo que sobra.
  // La última columna es sólo la marca de color: va sin rótulo porque
  // "ESTADO" se pegaba con "DIFERENCIA". Su significado se explica en la
  // leyenda debajo de la tabla.
  const cols = [
    { label: "Código",     x: margin,       w: 16, align: "left"  as const },
    { label: "Empleado",   x: margin + 16,  w: 70, align: "left"  as const },
    { label: "Ingreso",    x: margin + 86,  w: 24, align: "left"  as const },
    { label: "Antigüedad", x: margin + 110, w: 26, align: "left"  as const },
    { label: "Sueldo sem.",x: margin + 136, w: 24, align: "right" as const },
    { label: "Salario día",x: margin + 160, w: 22, align: "right" as const },
    { label: "Calculado",  x: margin + 182, w: 28, align: "right" as const },
    { label: "Capturado",  x: margin + 210, w: 28, align: "right" as const },
    { label: "Diferencia", x: margin + 238, w: 23, align: "right" as const },
    { label: "",           x: margin + 265, w: 8,  align: "left"  as const },
  ]
  const tableRight = margin + 273

  let y = 0
  let pagina = 0

  function encabezadoPagina() {
    pagina++
    doc.setFillColor(...BRAND)
    doc.rect(0, 0, pageW, 16, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text(`RAFSA - Corrida de aguinaldo ${c.anio}`, margin, 11)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(`Corte: ${fechaCorta(c.corte)}`, pageW - margin, 7, { align: "right" })
    doc.text(
      `Generado: ${new Date().toLocaleDateString("es-MX")} - ${c.generadoPor}`,
      pageW - margin,
      12,
      { align: "right" },
    )
    doc.setTextColor(...INK)
    y = 24
  }

  function encabezadoTabla() {
    doc.setFillColor(241, 245, 249)
    doc.rect(margin, y - 4.4, tableRight - margin, 6.4, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    for (const col of cols) {
      doc.text(
        col.label.toUpperCase(),
        col.align === "right" ? col.x + col.w : col.x,
        y,
        { align: col.align },
      )
    }
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...INK)
    y += 6
  }

  function espacio(alto: number) {
    if (y + alto > pageH - 14) {
      pie()
      doc.addPage()
      encabezadoPagina()
      encabezadoTabla()
    }
  }

  function pie() {
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text("RAFSA ERP - Corrida de aguinaldo", margin, pageH - 7)
    doc.text(`Pág ${pagina}`, pageW - margin, pageH - 7, { align: "right" })
    doc.setTextColor(...INK)
  }

  // ── Página 1: resumen ──
  encabezadoPagina()

  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("Resumen de la corrida", margin, y)
  y += 5

  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...MUTED)
  doc.text(
    "(días trabajados en el año ÷ 365) × 15 × salario diario    ·    salario diario = sueldo semanal ÷ 7",
    margin,
    y,
  )
  doc.setTextColor(...INK)
  y += 7

  const cajas: [string, string, [number, number, number]][] = [
    ["Total a pagar",   money(c.resumen.total),               BRAND],
    ["Empleados",       String(c.resumen.empleados),          DARK],
    ["Año completo",    String(c.resumen.completo),           GREEN],
    ["Proporcional",    String(c.resumen.proporcional),       DARK],
    ["Cambian al aplicar", String(c.resumen.porAplicar),      BRAND],
    ["Por revisar",     String(c.resumen.revisar),            c.resumen.revisar > 0 ? AMBER : DARK],
  ]
  const anchoCaja = (tableRight - margin - 5 * 3) / 6
  cajas.forEach(([etiqueta, valor, color], i) => {
    const x = margin + i * (anchoCaja + 3)
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, anchoCaja, 16, 1.5, 1.5, "FD")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(etiqueta.toUpperCase(), x + 3, y + 5.5)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...color)
    doc.text(valor, x + 3, y + 12.5)
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...INK)
  })
  y += 22

  if (c.resumen.revisar > 0) {
    doc.setFillColor(254, 243, 199)
    doc.setDrawColor(252, 211, 77)
    doc.roundedRect(margin, y, tableRight - margin, 9, 1.5, 1.5, "FD")
    doc.setFontSize(8)
    doc.setTextColor(...AMBER)
    doc.text(
      `${c.resumen.revisar} empleado(s) quedan marcados para revisar y NO se les aplica el monto al expediente. Vienen al final de la lista.`,
      margin + 3,
      y + 5.8,
    )
    doc.setTextColor(...INK)
    y += 17
  }

  // ── Tabla ──
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("Detalle por empleado", margin, y)
  doc.setFont("helvetica", "normal")
  y += 5
  encabezadoTabla()

  const filas = ordenarFilas(c.filas)
  let i = 0
  for (const f of filas) {
    espacio(7)

    if (i % 2 === 0) {
      doc.setFillColor(245, 247, 250)
      doc.rect(margin, y - 3.6, tableRight - margin, 6.4, "F")
    }

    const est = estadoDe(f)
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text(f.payroll_code || "—", cols[0].x, y)
    doc.text(
      doc.splitTextToSize(f.full_name || "—", cols[1].w - 2)[0] || "—",
      cols[1].x,
      y,
    )

    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(fechaCorta(f.hire_date ?? f.inicio_conteo), cols[2].x, y)
    doc.text(proporcionDe(f), cols[3].x, y)
    doc.setFontSize(8)
    doc.setTextColor(...INK)

    doc.text(money(f.salario_semanal), cols[4].x + cols[4].w, y, { align: "right" })
    doc.text(money(f.salario_diario), cols[5].x + cols[5].w, y, { align: "right" })
    doc.setFont("helvetica", "bold")
    doc.text(money(f.aguinaldo_calculado), cols[6].x + cols[6].w, y, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.text(money(f.aguinaldo_capturado), cols[7].x + cols[7].w, y, { align: "right" })

    const dif = Number(f.diferencia ?? 0)
    if (Math.abs(dif) > 0.005) doc.setTextColor(...BRAND)
    doc.text(
      // El signo menos Unicode sale como basura en jsPDF: se usa el ASCII.
      `${dif > 0 ? "+" : ""}${money(dif)}`.replace("-$", "-$"),
      cols[8].x + cols[8].w,
      y,
      { align: "right" },
    )
    doc.setTextColor(...INK)

    // Marca de estado: un punto, porque el texto no cabe y el detalle de
    // los marcados va en la hoja de revisión.
    if (est.tono === "revisar") doc.setFillColor(...AMBER)
    else if (est.tono === "cambia") doc.setFillColor(...BRAND)
    else doc.setFillColor(203, 213, 225)
    doc.circle(cols[9].x + 2, y - 1, 1.3, "F")

    y += 6.4
    i++
  }

  // ── Leyenda de la marca de color ──
  espacio(10)
  y += 4
  doc.setFontSize(7)
  const leyenda: [[number, number, number], string][] = [
    [BRAND, "Cambia al aplicar"],
    [[203, 213, 225], "Ya coincide"],
    [AMBER, "Por revisar"],
  ]
  let lx = margin
  for (const [color, texto] of leyenda) {
    doc.setFillColor(...color)
    doc.circle(lx + 1.3, y - 1, 1.3, "F")
    doc.setTextColor(...MUTED)
    doc.text(texto, lx + 4, y)
    lx += doc.getTextWidth(texto) + 12
  }
  doc.setTextColor(...INK)
  doc.setFontSize(8)
  y += 4

  // ── Marcados para revisar, con su motivo ──
  const revisar = filas.filter((f) => f.revisar)
  if (revisar.length > 0) {
    espacio(20)
    y += 6
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.text("Marcados para revisar", margin, y)
    doc.setFont("helvetica", "normal")
    y += 2
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    y += 4
    doc.text("A estos no se les escribe el monto en el expediente al aplicar la corrida.", margin, y)
    doc.setTextColor(...INK)
    y += 6

    for (const f of revisar) {
      espacio(6)
      doc.setFontSize(8)
      doc.setFillColor(...AMBER)
      doc.circle(margin + 1.5, y - 1, 1.3, "F")
      doc.text(f.full_name || "—", margin + 5, y)
      doc.setTextColor(...MUTED)
      doc.text(f.revisar || "—", margin + 80, y)
      doc.setTextColor(...INK)
      doc.text(money(f.aguinaldo_calculado), margin + 200, y, { align: "right" })
      y += 5.6
    }
  }

  // ── Total ──
  espacio(16)
  y += 4
  doc.setFillColor(...DARK)
  doc.rect(margin, y, tableRight - margin, 11, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(10)
  doc.text("TOTAL A PAGAR (sin los marcados para revisar)", margin + 3, y + 7.2)
  doc.text(money(c.resumen.total), tableRight - 3, y + 7.2, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setTextColor(...INK)

  pie()
  doc.save(nombreArchivo(c, "pdf"))
}
