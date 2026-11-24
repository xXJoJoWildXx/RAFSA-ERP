/**
 * Reporte financiero del periodo en PDF.
 *
 * Primera hoja: el resumen de la empresa. Después, una sección por obra con
 * todo impreso renglón por renglón —órdenes de almacén, egresos de proveedor
 * y la nómina del equipo, comparando lo capturado contra lo supuesto.
 *
 * Mismo lenguaje visual que los demás documentos del ERP (banda marina,
 * encabezado sólo en la primera hoja, pie con el periodo y la paginación).
 */

import {
  money,
  moneyExacto,
  variacion,
  type Periodo,
} from "@/lib/finanzasData"
import {
  nombreArchivo,
  type ObraReporte,
  type ReporteFinanzas,
} from "@/lib/finanzasReporte"

const NAVY: [number, number, number] = [4, 21, 39]
const BRAND: [number, number, number] = [1, 116, 189]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [110, 123, 136]
const HAIR: [number, number, number] = [214, 224, 233]
const ZEBRA: [number, number, number] = [245, 249, 252]
const SOFT: [number, number, number] = [237, 243, 248]
const VERDE: [number, number, number] = [21, 128, 61]
const ROJO: [number, number, number] = [185, 28, 28]
const AMBAR: [number, number, number] = [180, 83, 9]

const PW = 210
const PH = 297
const ML = 14
const CW = PW - ML * 2
const PIE = 20
const BANDA = 24
const TOP_1 = BANDA + 8
const TOP_N = 18

/** Ver lib/inventoryOrdersReportPdf.ts: el PNG trae margen transparente. */
const LOGO = { x0: 0.1116, y0: 0.3916, w: 0.7763, h: 0.2772, ratio: 1748 / 1241 }

async function cargarLogo(): Promise<string | null> {
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

function fechaLarga(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d.length === 10 ? `${d}T00:00:00` : d) : d
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
}
function fechaCorta(d: string): string {
  if (!d) return "—"
  return new Date(d.length === 10 ? `${d}T00:00:00` : d).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
  })
}
const ESTADO: Record<string, string> = { delivered: "Entregada", completed: "Completada" }
const cantidad = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2))

type Alineacion = "izq" | "der" | "centro"
type Col = { titulo: string; ancho: number; al?: Alineacion; mono?: boolean }
type Celda = { texto: string; color?: [number, number, number]; bold?: boolean }

export async function generateFinanzasReportePdf(rep: ReporteFinanzas): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const logo = await cargarLogo()

  const periodo: Periodo = rep.resumen.periodo
  let pagina = 1
  let y = TOP_1

  const pie = () => {
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.line(ML, PH - 15, PW - ML, PH - 15)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(
      `Reporte financiero · ${periodo.etiqueta}  ·  Generado el ${fechaLarga(rep.generado)} por ${rep.generadoPor}`,
      ML,
      PH - 10,
    )
    doc.text(`Página ${pagina}`, PW - ML, PH - 10, { align: "right" })
  }

  const encabezado = () => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, PW, BANDA, "F")
    doc.setFillColor(...BRAND)
    doc.rect(0, BANDA, PW, 1.4, "F")

    if (logo) {
      const altoMarca = 12
      const alto = altoMarca / LOGO.h
      const ancho = alto * LOGO.ratio
      doc.addImage(logo, "PNG", ML - LOGO.x0 * ancho, 6 - LOGO.y0 * alto, ancho, alto, "rafsa-logo", "FAST")
    } else {
      doc.setFont("helvetica", "bold")
      doc.setFontSize(15)
      doc.setTextColor(255, 255, 255)
      doc.text("RAFSA", ML, 14)
    }

    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text("REPORTE FINANCIERO", PW - ML, 12.5, { align: "right" })
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(150, 185, 215)
    doc.text(
      `${periodo.etiqueta} · del ${fechaLarga(periodo.desde)} al ${fechaLarga(periodo.hasta)}`,
      PW - ML,
      18.5,
      { align: "right" },
    )
  }

  const nuevaPagina = () => {
    doc.addPage()
    pagina += 1
    pie()
    y = TOP_N
  }

  /** Abre página si no caben `alto` milímetros. */
  const asegurar = (alto: number): boolean => {
    if (y + alto <= PH - PIE) return false
    nuevaPagina()
    return true
  }

  const seccion = (titulo: string, nota?: string) => {
    asegurar(nota ? 16 : 12)
    doc.setFillColor(...BRAND)
    doc.rect(ML, y, 2.4, 6.2, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(...INK)
    doc.text(titulo.toUpperCase(), ML + 5, y + 4.8)
    if (nota) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.8)
      doc.setTextColor(...MUTED)
      doc.text(nota, ML + 5, y + 9.4)
      y += 13.5
    } else {
      y += 10
    }
  }

  /** Tabla genérica con encabezado que se repite al cambiar de página. */
  const tabla = (cols: Col[], filas: Celda[][], opciones?: { totales?: Celda[] }) => {
    const ancho = cols.reduce((s, c) => s + c.ancho, 0)
    const xDe = (i: number) => ML + cols.slice(0, i).reduce((s, c) => s + c.ancho, 0)

    const pos = (i: number, texto: string) => {
      const c = cols[i]
      const x = xDe(i)
      if (c.al === "der") return { x: x + c.ancho - 2, align: "right" as const }
      if (c.al === "centro") return { x: x + c.ancho / 2, align: "center" as const }
      return { x: x + 2, align: "left" as const }
    }

    const cabecera = () => {
      doc.setFillColor(...NAVY)
      doc.rect(ML, y, ancho, 6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.2)
      doc.setTextColor(255, 255, 255)
      cols.forEach((c, i) => {
        const p = pos(i, c.titulo)
        doc.text(c.titulo, p.x, y + 4, { align: p.align })
      })
      y += 6
    }

    asegurar(6 + 7)
    cabecera()

    const H = 6.4
    filas.forEach((fila, idx) => {
      if (asegurar(H + 2)) cabecera()
      if (idx % 2 === 1) {
        doc.setFillColor(...ZEBRA)
        doc.rect(ML, y, ancho, H, "F")
      }
      fila.forEach((celda, i) => {
        const c = cols[i]
        doc.setFont(c.mono ? "courier" : "helvetica", celda.bold ? "bold" : "normal")
        doc.setFontSize(c.mono ? 7 : 7.4)
        doc.setTextColor(...(celda.color ?? INK))
        const p = pos(i, celda.texto)
        let t = celda.texto
        // Recorte por ancho real: contar caracteres falla con nombres largos
        while (t.length > 1 && doc.getTextWidth(t) > c.ancho - 4) t = t.slice(0, -1)
        if (t !== celda.texto) t = t.slice(0, -1) + "..."
        doc.text(t, p.x, y + 4.4, { align: p.align })
      })
      doc.setDrawColor(...HAIR)
      doc.setLineWidth(0.15)
      doc.line(ML, y + H, ML + ancho, y + H)
      y += H
    })

    if (opciones?.totales) {
      asegurar(7)
      doc.setFillColor(...SOFT)
      doc.rect(ML, y, ancho, 6.8, "F")
      opciones.totales.forEach((celda, i) => {
        if (!celda.texto) return
        const c = cols[i]
        doc.setFont(c.mono ? "courier" : "helvetica", "bold")
        doc.setFontSize(c.mono ? 7 : 7.4)
        doc.setTextColor(...(celda.color ?? INK))
        const p = pos(i, celda.texto)
        doc.text(celda.texto, p.x, y + 4.7, { align: p.align })
      })
      y += 6.8
    }
    y += 4
  }

  // ════════════════════════════════════════════════════════════════════════
  //  Página 1 — Resumen general
  // ════════════════════════════════════════════════════════════════════════
  encabezado()
  pie()

  const r = rep.resumen

  // ── Las tres cifras ──
  const anchoCifra = (CW - 8) / 3
  const cifras: { etiqueta: string; valor: string; color: [number, number, number]; pie: string; fuerte?: boolean }[] = [
    {
      etiqueta: "INGRESOS COBRADOS",
      valor: moneyExacto(r.ingresos.cobrado),
      color: VERDE,
      pie: `${r.ingresos.cobros} ${r.ingresos.cobros === 1 ? "movimiento" : "movimientos"}`,
    },
    {
      etiqueta: "EGRESOS DEL PERIODO",
      valor: moneyExacto(r.egresos.total),
      color: AMBAR,
      pie: "Nómina, material y proveedores",
    },
    {
      etiqueta: "RESULTADO",
      valor: moneyExacto(r.resultado),
      color: NAVY,
      pie: r.margen != null ? `Margen ${r.margen}% de lo cobrado` : "Sin cobros en el periodo",
      fuerte: true,
    },
  ]
  cifras.forEach((c, i) => {
    const x = ML + i * (anchoCifra + 4)
    if (c.fuerte) {
      doc.setFillColor(...NAVY)
      doc.roundedRect(x, y, anchoCifra, 20, 2, 2, "F")
    } else {
      doc.setFillColor(...SOFT)
      doc.setDrawColor(...HAIR)
      doc.setLineWidth(0.3)
      doc.roundedRect(x, y, anchoCifra, 20, 2, 2, "FD")
      doc.setFillColor(...c.color)
      doc.rect(x, y + 2.5, 1.4, 15, "F")
    }
    doc.setFont("helvetica", "normal")
    doc.setFontSize(5.8)
    doc.setTextColor(...(c.fuerte ? ([150, 185, 215] as [number, number, number]) : MUTED))
    doc.text(c.etiqueta, x + 4.5, y + 6)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(13)
    doc.setTextColor(...(c.fuerte ? ([255, 255, 255] as [number, number, number]) : c.color))
    let v = c.valor
    while (doc.getTextWidth(v) > anchoCifra - 9) {
      doc.setFontSize(doc.getFontSize() - 0.5)
      if (doc.getFontSize() < 8) break
    }
    doc.text(v, x + 4.5, y + 13)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6)
    doc.setTextColor(...(c.fuerte ? ([150, 185, 215] as [number, number, number]) : MUTED))
    doc.text(c.pie, x + 4.5, y + 17.5)
  })
  y += 26

  // ── Comparativo ──
  seccion("Comparado contra " + r.comparado.etiqueta)
  const pct = (a: number, b: number) => {
    const v = variacion(a, b)
    if (v === null) return "—"
    const abs = Math.abs(v)
    return `${v > 0 ? "+" : v < 0 ? "-" : ""}${abs > 999 ? ">999" : abs}%`
  }
  tabla(
    [
      { titulo: "CONCEPTO", ancho: 70 },
      { titulo: periodo.etiqueta.toUpperCase(), ancho: 40, al: "der" },
      { titulo: r.comparado.etiqueta.toUpperCase(), ancho: 40, al: "der" },
      { titulo: "VARIACIÓN", ancho: CW - 150, al: "der" },
    ],
    [
      [
        { texto: "Ingresos cobrados" },
        { texto: moneyExacto(r.ingresos.cobrado), bold: true },
        { texto: moneyExacto(r.anterior.cobrado) },
        { texto: pct(r.ingresos.cobrado, r.anterior.cobrado), color: r.ingresos.cobrado >= r.anterior.cobrado ? VERDE : ROJO },
      ],
      [
        { texto: "Facturado al cliente" },
        { texto: moneyExacto(r.ingresos.facturado) },
        { texto: moneyExacto(r.anterior.facturado) },
        { texto: pct(r.ingresos.facturado, r.anterior.facturado), color: r.ingresos.facturado >= r.anterior.facturado ? VERDE : ROJO },
      ],
      [
        { texto: "Egresos" },
        { texto: moneyExacto(r.egresos.total) },
        { texto: moneyExacto(r.anterior.egresos) },
        { texto: pct(r.egresos.total, r.anterior.egresos), color: r.egresos.total <= r.anterior.egresos ? VERDE : ROJO },
      ],
      [
        { texto: "Resultado", bold: true },
        { texto: moneyExacto(r.resultado), bold: true },
        { texto: moneyExacto(r.anterior.resultado) },
        { texto: pct(r.resultado, r.anterior.resultado), color: r.resultado >= r.anterior.resultado ? VERDE : ROJO },
      ],
    ],
  )

  // ── Desglose de ingresos y egresos ──
  seccion("Desglose del periodo")
  tabla(
    [
      { titulo: "CONCEPTO", ancho: 92 },
      { titulo: "REGISTROS", ancho: 30, al: "centro" },
      { titulo: "IMPORTE", ancho: CW - 122, al: "der" },
    ],
    [
      [{ texto: "INGRESOS", bold: true, color: VERDE }, { texto: "" }, { texto: "" }],
      [{ texto: "   Cobrado (dinero que entró)" }, { texto: String(r.ingresos.cobros), color: MUTED }, { texto: moneyExacto(r.ingresos.cobrado), bold: true }],
      [{ texto: "   Facturado al cliente" }, { texto: String(r.ingresos.facturas), color: MUTED }, { texto: moneyExacto(r.ingresos.facturado) }],
      [{ texto: "   Estimaciones con corte en el periodo" }, { texto: String(r.ingresos.estimaciones), color: MUTED }, { texto: moneyExacto(r.ingresos.estimado) }],
      [{ texto: "EGRESOS", bold: true, color: AMBAR }, { texto: "" }, { texto: "" }],
      [
        { texto: `   Nómina de obra (${r.egresos.nominaSemanas} ${r.egresos.nominaSemanas === 1 ? "semana" : "semanas"})` },
        { texto: "", color: MUTED },
        { texto: moneyExacto(r.egresos.nomina) },
      ],
      [{ texto: "      Sueldos" }, { texto: "", color: MUTED }, { texto: moneyExacto(r.egresos.nominaSalarios), color: MUTED }],
      [{ texto: "      Bonificaciones" }, { texto: "", color: MUTED }, { texto: moneyExacto(r.egresos.nominaBonos), color: MUTED }],
      [{ texto: "      Viáticos" }, { texto: "", color: MUTED }, { texto: moneyExacto(r.egresos.nominaViaticos), color: MUTED }],
      [{ texto: "      Horas extra" }, { texto: "", color: MUTED }, { texto: moneyExacto(r.egresos.nominaOvertime), color: MUTED }],
      [
        { texto: "   Material de almacén entregado" },
        { texto: String(r.egresos.materialOrdenes), color: MUTED },
        { texto: moneyExacto(r.egresos.material) },
      ],
      [
        { texto: "   Proveedores" },
        { texto: String(r.egresos.proveedoresFacturas), color: MUTED },
        { texto: moneyExacto(r.egresos.proveedores) },
      ],
    ],
    {
      totales: [
        { texto: "RESULTADO DEL PERIODO" },
        { texto: "" },
        { texto: moneyExacto(r.resultado), color: r.resultado >= 0 ? VERDE : ROJO },
      ],
    },
  )

  // ── Avisos de cobertura ──
  if (r.avisos.length > 0) {
    seccion("Qué tan completo está este reporte")
    for (const a of r.avisos) {
      const lineas = doc.splitTextToSize(a.texto, CW - 10) as string[]
      const alto = lineas.length * 3.8 + 5
      asegurar(alto + 2)
      doc.setFillColor(a.nivel === "alto" ? 254 : 255, a.nivel === "alto" ? 242 : 251, a.nivel === "alto" ? 242 : 235)
      doc.setDrawColor(...(a.nivel === "alto" ? ROJO : AMBAR))
      doc.setLineWidth(0.3)
      doc.roundedRect(ML, y, CW, alto, 1.5, 1.5, "FD")
      doc.setFillColor(...(a.nivel === "alto" ? ROJO : AMBAR))
      doc.rect(ML, y, 1.4, alto, "F")
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.4)
      doc.setTextColor(...INK)
      doc.text(lineas, ML + 5, y + 4.5)
      y += alto + 2.5
    }
    y += 2
  }

  // ── Tabla resumen de obras ──
  seccion("Resumen por obra", "El detalle de cada una viene en las hojas siguientes.")
  tabla(
    [
      { titulo: "OBRA", ancho: 50 },
      { titulo: "COBRADO", ancho: 24, al: "der" },
      { titulo: "FACTURADO", ancho: 24, al: "der" },
      { titulo: "NÓMINA", ancho: 21, al: "der" },
      { titulo: "MATERIAL", ancho: 23, al: "der" },
      { titulo: "PROVEED.", ancho: 20, al: "der" },
      { titulo: "RESULTADO", ancho: 20, al: "der" },
    ],
    rep.obras.map((o) => [
      { texto: o.nombre, bold: true },
      { texto: money(o.cobrado) },
      { texto: money(o.facturado), color: MUTED },
      { texto: money(o.nominaCapturada), color: MUTED },
      { texto: money(o.materialTotal), color: MUTED },
      { texto: money(o.proveedoresTotal), color: MUTED },
      { texto: money(o.margen), bold: true, color: o.margen >= 0 ? VERDE : ROJO },
    ]),
    {
      totales: [
        { texto: "TOTALES" },
        { texto: money(rep.obras.reduce((s, o) => s + o.cobrado, 0)) },
        { texto: money(rep.obras.reduce((s, o) => s + o.facturado, 0)) },
        { texto: money(rep.obras.reduce((s, o) => s + o.nominaCapturada, 0)) },
        { texto: money(rep.obras.reduce((s, o) => s + o.materialTotal, 0)) },
        { texto: money(rep.obras.reduce((s, o) => s + o.proveedoresTotal, 0)) },
        { texto: money(rep.obras.reduce((s, o) => s + o.margen, 0)) },
      ],
    },
  )

  // ════════════════════════════════════════════════════════════════════════
  //  Una sección por obra
  // ════════════════════════════════════════════════════════════════════════
  for (const o of rep.obras) {
    // Cada obra empieza en hoja nueva: es un documento que se reparte por obra
    nuevaPagina()
    dibujarObra(o)
  }

  function dibujarObra(o: ObraReporte) {
    // ── Barra con el nombre ──
    doc.setFillColor(...INK)
    doc.rect(ML, y, CW, 10, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10.5)
    doc.setTextColor(255, 255, 255)
    let titulo = o.nombre
    while (doc.getTextWidth(titulo) > CW - 70) titulo = titulo.slice(0, -1)
    doc.text(titulo, ML + 3, y + 6.8)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.4)
    doc.setTextColor(190, 205, 220)
    const sub = [o.codigo, o.empresa].filter(Boolean).join("  ·  ")
    if (sub) doc.text(sub, PW - ML - 3, y + 6.5, { align: "right" })
    y += 14

    // ── Ingresos: cuatro cifras, sin desglosar los pagos ──
    seccion("Ingresos de la obra", "El movimiento por movimiento está en el Estado de Cuenta.")
    tabla(
      [
        { titulo: "CONCEPTO", ancho: 110 },
        { titulo: "IMPORTE", ancho: CW - 110, al: "der" },
      ],
      [
        [{ texto: "Cobrado en el periodo" }, { texto: moneyExacto(o.cobrado), bold: true, color: VERDE }],
        [{ texto: "Facturado en el periodo" }, { texto: moneyExacto(o.facturado) }],
        [{ texto: "Faltante por cobrar (facturas abiertas de la obra)" }, { texto: moneyExacto(o.faltantePorCobrar), color: o.faltantePorCobrar > 0 ? AMBAR : MUTED }],
        [{ texto: "Total contratado (cotización más aditivas)" }, { texto: moneyExacto(o.contratado), color: MUTED }],
      ],
    )

    // ── Órdenes de almacén ──
    seccion(`Órdenes de inventario (${o.ordenes.length})`)
    if (o.ordenes.length === 0) {
      sinDatos("Sin órdenes entregadas a esta obra en el periodo.")
    } else {
      tabla(
        [
          { titulo: "FOLIO", ancho: 34, mono: true },
          { titulo: "FECHA", ancho: 24 },
          { titulo: "ESTADO", ancho: 30 },
          { titulo: "RENGLONES", ancho: 26, al: "centro" },
          { titulo: "PIEZAS", ancho: 24, al: "centro" },
          { titulo: "IMPORTE C/IVA", ancho: CW - 138, al: "der" },
        ],
        o.ordenes.map((x) => [
          { texto: x.folio },
          { texto: fechaCorta(x.fecha) },
          { texto: ESTADO[x.estado] ?? x.estado, color: MUTED },
          { texto: String(x.renglones), color: MUTED },
          { texto: cantidad(x.piezas) },
          { texto: moneyExacto(x.importe), bold: true },
        ]),
        {
          totales: [
            { texto: "TOTAL MATERIAL" },
            { texto: "" }, { texto: "" }, { texto: "" }, { texto: "" },
            { texto: moneyExacto(o.materialTotal) },
          ],
        },
      )
    }

    // ── Proveedores ──
    seccion(`Egresos de proveedores (${o.proveedores.length})`)
    if (o.proveedores.length === 0) {
      sinDatos("Sin material ni rentas de proveedor cargados a esta obra en el periodo.")
    } else {
      tabla(
        [
          { titulo: "FECHA", ancho: 20 },
          { titulo: "TIPO", ancho: 24 },
          { titulo: "PROVEEDOR", ancho: 44 },
          { titulo: "DESCRIPCIÓN", ancho: 54 },
          { titulo: "CANT.", ancho: 16, al: "centro" },
          { titulo: "IMPORTE", ancho: CW - 158, al: "der" },
        ],
        o.proveedores.map((x) => [
          { texto: fechaCorta(x.fecha) },
          { texto: x.tipo, color: MUTED },
          { texto: x.proveedor },
          { texto: x.descripcion, color: MUTED },
          { texto: x.cantidad != null ? cantidad(x.cantidad) : "—", color: MUTED },
          { texto: moneyExacto(x.importe), bold: true },
        ]),
        {
          totales: [
            { texto: "TOTAL PROVEEDORES" },
            { texto: "" }, { texto: "" }, { texto: "" }, { texto: "" },
            { texto: moneyExacto(o.proveedoresTotal) },
          ],
        },
      )
    }

    // ── Nómina del equipo ──
    seccion(
      `Nómina del equipo (${o.nomina.length} ${o.nomina.length === 1 ? "persona" : "personas"})`,
      `"Supuesto" es el sueldo semanal del trabajador por las ${rep.semanas} semanas del periodo. La diferencia es lo que falta por capturar.`,
    )
    if (o.nomina.length === 0) {
      sinDatos("Sin equipo asignado ni nómina capturada para esta obra en el periodo.")
    } else {
      tabla(
        [
          { titulo: "TRABAJADOR", ancho: 52 },
          { titulo: "PUESTO EN OBRA", ancho: 32 },
          { titulo: "SEM.", ancho: 12, al: "centro" },
          { titulo: "DÍAS", ancho: 12, al: "centro" },
          { titulo: "CAPTURADO", ancho: 24, al: "der" },
          { titulo: "SUPUESTO", ancho: 24, al: "der" },
          { titulo: "DIFERENCIA", ancho: 26, al: "der" },
        ],
        o.nomina.map((n) => [
          { texto: n.nombre, bold: true },
          { texto: n.rol ?? "—", color: MUTED },
          { texto: String(n.semanas), color: n.semanas === 0 ? ROJO : MUTED },
          { texto: cantidad(n.diasTrabajados), color: MUTED },
          { texto: moneyExacto(n.capturado), color: n.capturado > 0 ? INK : MUTED },
          { texto: moneyExacto(n.supuesto), color: MUTED },
          { texto: moneyExacto(n.diferencia), bold: true, color: n.diferencia > 0.5 ? ROJO : VERDE },
        ]),
        {
          totales: [
            { texto: "TOTALES" },
            { texto: "" }, { texto: "" }, { texto: "" },
            { texto: moneyExacto(o.nominaCapturada) },
            { texto: moneyExacto(o.nominaSupuesta) },
            {
              texto: moneyExacto(o.nominaSupuesta - o.nominaCapturada),
              color: o.nominaSupuesta - o.nominaCapturada > 0.5 ? ROJO : VERDE,
            },
          ],
        },
      )
    }

    // ── Resultado de la obra ──
    asegurar(24)
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 9, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text(`RESULTADO DE ${o.nombre.toUpperCase()}`, ML + 3, y + 6)
    doc.setFontSize(10)
    doc.text(moneyExacto(o.margen), PW - ML - 3, y + 6.2, { align: "right" })
    y += 9

    doc.setFillColor(...SOFT)
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.rect(ML, y, CW, 12, "FD")
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    doc.text(
      `Cobrado ${moneyExacto(o.cobrado)}  -  material ${moneyExacto(o.materialTotal)}  -  proveedores ${moneyExacto(o.proveedoresTotal)}  -  nómina capturada ${moneyExacto(o.nominaCapturada)}`,
      ML + 3,
      y + 4.8,
    )
    doc.setTextColor(...(o.margenAjustado >= 0 ? VERDE : ROJO))
    doc.setFont("helvetica", "bold")
    doc.text(
      `Con la nómina supuesta en vez de la capturada, el resultado sería ${moneyExacto(o.margenAjustado)}.`,
      ML + 3,
      y + 9.2,
    )
    y += 16
  }

  function sinDatos(texto: string) {
    asegurar(10)
    doc.setFillColor(250, 251, 252)
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.rect(ML, y, CW, 8, "FD")
    doc.setFont("helvetica", "italic")
    doc.setFontSize(7.4)
    doc.setTextColor(...MUTED)
    doc.text(texto, ML + 3, y + 5.2)
    y += 12
  }

  doc.save(`${nombreArchivo(periodo)}.pdf`)
}
