// lib/payroll/report.ts
// Reporte imprimible de dispersión de nómina, dividido por obra.
// Columnas: Código · Empleado · Cuenta bancaria · Sueldo total · A depositar (fiscal) · Efectivo.

import { jsPDF } from "jspdf"
import type { ReconResult, ReconLine } from "./types"

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toLocaleString("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 })
}

function fmtDateDisplay(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr + "T00:00:00")
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })
}

export function generatePayrollReportPdf(result: ReconResult): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12
  const brand: [number, number, number] = [1, 116, 189]
  const ink: [number, number, number] = [30, 41, 59]
  const muted: [number, number, number] = [100, 116, 139]
  const line: [number, number, number] = [210, 216, 224]

  // Agrupar por obra (obra ERP o departamento del reporte)
  const groups = new Map<string, ReconLine[]>()
  for (const l of result.lines) {
    const key = l.obra_names_erp[0] || l.departamento_raw || "Sin clasificar"
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(l)
  }

  // Columnas
  const cols = [
    { key: "codigo", label: "Código", x: margin, w: 16, align: "left" as const },
    { key: "nombre", label: "Empleado", x: margin + 16, w: 62, align: "left" as const },
    { key: "cuenta", label: "Cuenta bancaria", x: margin + 78, w: 58, align: "left" as const },
    { key: "real", label: "Sueldo total", x: margin + 136, w: 38, align: "right" as const },
    { key: "fiscal", label: "A depositar", x: margin + 174, w: 38, align: "right" as const },
    { key: "efectivo", label: "Efectivo", x: margin + 212, w: 40, align: "right" as const },
  ]
  const tableRight = margin + 252

  let y = 0

  function header() {
    doc.setFillColor(...brand)
    doc.rect(0, 0, pageW, 16, "F")
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.text("RAFSA · Dispersión de nómina", margin, 11)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.text(
      `Semana: ${fmtDateDisplay(result.week_start)} – ${fmtDateDisplay(result.week_end)}`,
      pageW - margin,
      7,
      { align: "right" },
    )
    doc.text(`Generado: ${new Date().toLocaleDateString("es-MX")}`, pageW - margin, 12.5, {
      align: "right",
    })
    y = 24
    if (result.period_label) {
      doc.setTextColor(...muted)
      doc.setFontSize(8)
      doc.text(`Documento fiscal: ${result.period_label}`, margin, y)
      y += 6
    }
  }

  function colHeader(groupLabel: string, sub: string) {
    // Encabezado de grupo (obra)
    doc.setFillColor(...brand)
    doc.setTextColor(255, 255, 255)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.roundedRect(margin, y, tableRight - margin, 8, 1, 1, "F")
    doc.text(groupLabel, margin + 2, y + 5.5)
    if (sub) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.5)
      doc.text(sub, tableRight - 2, y + 5.5, { align: "right" })
    }
    y += 11

    // Encabezado de columnas
    doc.setTextColor(...muted)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    for (const c of cols) {
      doc.text(c.label.toUpperCase(), c.align === "right" ? c.x + c.w : c.x, y, {
        align: c.align,
      })
    }
    y += 2
    doc.setDrawColor(...line)
    doc.setLineWidth(0.2)
    doc.line(margin, y, tableRight, y)
    y += 4
    doc.setFont("helvetica", "normal")
    doc.setTextColor(...ink)
    doc.setFontSize(8.5)
  }

  function ensureSpace(groupLabel: string, sub: string, needed = 8) {
    if (y > pageH - needed - 10) {
      doc.addPage()
      header()
      colHeader(groupLabel + " (cont.)", sub)
    }
  }

  header()

  const sortedGroups = Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]))

  for (const [groupName, rowsRaw] of sortedGroups) {
    // nombre del reporte (departamento) para el subtítulo si difiere
    const deptSet = Array.from(new Set(rowsRaw.map((r) => r.departamento_raw).filter(Boolean)))
    const sub = deptSet.length ? `Reporte: ${deptSet.join(", ")}` : ""

    if (y > pageH - 40) {
      doc.addPage()
      header()
    }
    colHeader(groupName, sub)

    const rows = [...rowsRaw].sort((a, b) =>
      (a.employee_name_erp || a.employee_name_raw || "").localeCompare(
        b.employee_name_erp || b.employee_name_raw || "",
      ),
    )

    let gReal = 0
    let gFiscal = 0
    let gEfectivo = 0
    let i = 0
    for (const r of rows) {
      ensureSpace(groupName, sub)
      if (i % 2 === 0) {
        doc.setFillColor(245, 247, 250)
        doc.rect(margin, y - 3.6, tableRight - margin, 6.4, "F")
      }
      const cuenta =
        [r.bank_name, r.account_number || r.interbank_clabe].filter(Boolean).join(" ") || "—"
      const nombre = r.employee_name_erp || r.employee_name_raw || "—"

      doc.setTextColor(...ink)
      doc.text(r.codigo || "—", cols[0].x, y)
      doc.text(doc.splitTextToSize(nombre, cols[1].w - 2)[0] || nombre, cols[1].x, y)
      doc.setTextColor(...muted)
      doc.setFontSize(7.5)
      doc.text(doc.splitTextToSize(cuenta, cols[2].w - 2)[0] || cuenta, cols[2].x, y)
      doc.setFontSize(8.5)
      doc.setTextColor(...ink)

      doc.text(r.real_total != null ? money(r.real_total) : "pend.", cols[3].x + cols[3].w, y, { align: "right" })
      doc.text(money(r.fiscal_neto), cols[4].x + cols[4].w, y, { align: "right" })
      doc.setFont("helvetica", "bold")
      doc.text(
        r.real_total != null ? money(r.efectivo) : "—",
        cols[5].x + cols[5].w,
        y,
        { align: "right" },
      )
      doc.setFont("helvetica", "normal")

      gReal += r.real_total ?? 0
      gFiscal += r.fiscal_neto ?? 0
      if (r.real_total != null) gEfectivo += r.efectivo ?? 0
      y += 6.4
      i++
    }

    // Subtotal del grupo
    doc.setDrawColor(...line)
    doc.line(margin, y - 1, tableRight, y - 1)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...ink)
    doc.text("Subtotal", cols[2].x, y + 3)
    doc.text(money(gReal), cols[3].x + cols[3].w, y + 3, { align: "right" })
    doc.text(money(gFiscal), cols[4].x + cols[4].w, y + 3, { align: "right" })
    doc.text(money(gEfectivo), cols[5].x + cols[5].w, y + 3, { align: "right" })
    doc.setFont("helvetica", "normal")
    y += 12
  }

  // Totales generales
  if (y > pageH - 24) {
    doc.addPage()
    header()
  }
  doc.setFillColor(...ink)
  doc.roundedRect(margin, y, tableRight - margin, 12, 1, 1, "F")
  doc.setTextColor(255, 255, 255)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  doc.text("TOTAL GENERAL", cols[0].x + 2, y + 7.5)
  doc.text(`Real: ${money(result.totals.real)}`, cols[3].x + cols[3].w, y + 7.5, { align: "right" })
  doc.text(`Depósito: ${money(result.totals.fiscal)}`, cols[4].x + cols[4].w, y + 7.5, { align: "right" })
  doc.text(`Efectivo: ${money(result.totals.efectivo)}`, cols[5].x + cols[5].w, y + 7.5, { align: "right" })

  // Pie
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...muted)
    doc.text("RAFSA ERP · Dispersión de nómina", margin, pageH - 5)
    doc.text(`Pág ${p}/${pages}`, pageW - margin, pageH - 5, { align: "right" })
  }

  const fname = `Dispersion_Nomina_${result.week_start}.pdf`
  doc.save(fname)
}
