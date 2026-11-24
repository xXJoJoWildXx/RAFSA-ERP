/**
 * Reporte de órdenes de inventario en PDF.
 *
 * Mismo lenguaje visual que la hoja de surtido (lib/pickingListPdf.ts): banda
 * marina arriba, línea de marca, tablas con encabezado oscuro y cebra clara.
 * Se genera en el navegador con jsPDF; no se guarda en ningún lado.
 *
 * El orden del documento sigue la lectura natural de quien lo recibe:
 *   1. Periodo y cifras gruesas (ejercido, comprometido, total).
 *   2. Resumen por obra, de mayor a menor gasto: la foto de una página.
 *   3. Detalle de las órdenes de cada obra, para auditar folio por folio.
 *   4. Artículos del más utilizado al menos utilizado.
 */

import {
  ReporteOrdenes,
  ESTADO_LABEL,
  TIPO_LABEL,
  money,
  cantidad,
  fechaCorta,
  fechaLarga,
  nombreArchivo,
} from "@/lib/inventoryOrdersReport"

const NAVY: [number, number, number] = [4, 21, 39]
const BRAND: [number, number, number] = [1, 116, 189]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [110, 123, 136]
const HAIR: [number, number, number] = [214, 224, 233]
const ZEBRA: [number, number, number] = [245, 249, 252]
const GREEN: [number, number, number] = [21, 128, 61]
const AMBER: [number, number, number] = [180, 83, 9]
const SOFT: [number, number, number] = [237, 243, 248]

const PW = 210
const PH = 297
const ML = 14
const CW = PW - ML * 2
const PIE = 22

/** Alto de la banda del encabezado, que sólo existe en la primera página. */
const BANDA = 24
/** Dónde empieza el contenido: debajo de la banda en la página 1, arriba en las demás. */
const TOP_1 = BANDA + 8
const TOP_N = 20

/**
 * El PNG del logo trae mucho margen transparente alrededor de la marca. jsPDF
 * no sabe recortar, así que se escala la imagen completa a partir del tamaño
 * que debe tener la marca y se corre para que ésta caiga donde se quiere; el
 * margen sobrante es transparente y no se ve, aunque salga de la banda.
 * Medido sobre public/brand/rafsa-logo.png (1748×1241).
 */
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

/** Reduce el tamaño hasta que el texto quepa; sólo recorta como último recurso. */
function ajustar(doc: any, texto: string, anchoMax: number, base: number, minimo = 6): number {
  let size = base
  doc.setFontSize(size)
  while (doc.getTextWidth(texto) > anchoMax && size > minimo) {
    size -= 0.5
    doc.setFontSize(size)
  }
  return size
}

/** Recorta con puntos suspensivos sin cambiar el tamaño de letra. */
function recortar(doc: any, texto: string, anchoMax: number): string {
  if (doc.getTextWidth(texto) <= anchoMax) return texto
  let t = texto
  while (t.length > 1 && doc.getTextWidth(t + "...") > anchoMax) t = t.slice(0, -1)
  return t + "..."
}

export async function generateInventoryOrdersReportPdf(rep: ReporteOrdenes): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const logo = await cargarLogo()

  const periodo = `${fechaLarga(rep.desde)} — ${fechaLarga(rep.hasta)}`
  const periodoCorto = `${fechaCorta(rep.desde)} – ${fechaCorta(rep.hasta)}`
  let pagina = 1

  /** Portada del documento. Va sólo en la página 1: de la 2 en adelante el
   *  pie ya dice de qué reporte y de qué periodo se trata. */
  const encabezado = () => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, PW, BANDA, "F")
    doc.setFillColor(...BRAND)
    doc.rect(0, BANDA, PW, 1.4, "F")

    if (logo) {
      const altoMarca = 12
      const alto = altoMarca / LOGO.h
      const ancho = alto * LOGO.ratio
      // Centrada en la banda: (BANDA - altoMarca) / 2
      // alias + compresión: sin ellos jsPDF guarda el PNG sin comprimir y
      // una vez por página, y el documento se iba a varios MB.
      doc.addImage(logo, "PNG", ML - LOGO.x0 * ancho, 6 - LOGO.y0 * alto, ancho, alto, "rafsa-logo", "FAST")
    } else {
      // Sin logo (archivo movido o fetch bloqueado) el documento no se queda sin firma
      doc.setFont("helvetica", "bold")
      doc.setFontSize(15)
      doc.setTextColor(255, 255, 255)
      doc.text("RAFSA", ML, 14)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(150, 185, 215)
      doc.text("INDUSTRIAL COATINGS", ML, 19)
    }

    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text("REPORTE DE ÓRDENES DE INVENTARIO", PW - ML, 12.5, { align: "right" })

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(150, 185, 215)
    doc.text(periodo, PW - ML, 18.5, { align: "right" })
  }

  const pie = () => {
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.line(ML, PH - 16, PW - ML, PH - 16)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(
      `Órdenes de inventario ${periodoCorto}  ·  Generado el ${fechaLarga(rep.generado)} por ${rep.generadoPor}`,
      ML,
      PH - 11,
    )
    doc.text(`Página ${pagina}`, PW - ML, PH - 11, { align: "right" })
  }

  let y = TOP_1
  encabezado()
  pie()

  /** Abre página nueva si no caben `alto` milímetros. */
  const asegurar = (alto: number) => {
    if (y + alto <= PH - PIE) return false
    doc.addPage()
    pagina += 1
    pie()
    y = TOP_N
    return true
  }

  const seccion = (titulo: string, nota?: string) => {
    asegurar(nota ? 16 : 13)
    doc.setFillColor(...BRAND)
    doc.rect(ML, y, 2.4, 6.4, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10.5)
    doc.setTextColor(...INK)
    doc.text(titulo.toUpperCase(), ML + 5, y + 5)
    if (nota) {
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7)
      doc.setTextColor(...MUTED)
      doc.text(nota, ML + 5, y + 9.6)
      y += 14
    } else {
      y += 10.5
    }
  }

  // ── Periodo ────────────────────────────────────────────────────────────────
  doc.setFillColor(250, 252, 254)
  doc.setDrawColor(...HAIR)
  doc.setLineWidth(0.3)
  doc.roundedRect(ML, y, CW, 18, 2, 2, "FD")
  doc.setFillColor(...BRAND)
  doc.rect(ML, y + 2.5, 1.4, 13, "F")

  // El periodo ya va en la banda de arriba; aquí van los conteos, que es lo
  // que no cabe allá.
  const campos: { etiqueta: string; valor: string; ancho: number }[] = [
    { etiqueta: "ÓRDENES", valor: String(rep.totales.ordenes), ancho: 28 },
    { etiqueta: "OBRAS", valor: String(rep.totales.obras), ancho: 24 },
    { etiqueta: "ARTÍCULOS DISTINTOS", valor: String(rep.articulos.length), ancho: 44 },
    { etiqueta: "PIEZAS", valor: cantidad(rep.totales.piezas), ancho: 30 },
    { etiqueta: "GENERADO", valor: fechaLarga(rep.generado), ancho: 50 },
  ]
  let cx = ML + 6
  for (const c of campos) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.2)
    doc.setTextColor(...MUTED)
    doc.text(c.etiqueta, cx, y + 6.5)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...INK)
    ajustar(doc, c.valor, c.ancho - 6, 10)
    doc.text(c.valor, cx, y + 13)
    cx += c.ancho
  }
  y += 24

  // ── Cifras gruesas ─────────────────────────────────────────────────────────
  const kpis: { etiqueta: string; valor: string; color: [number, number, number]; fuerte?: boolean }[] = [
    { etiqueta: "EJERCIDO (MATERIAL ENTREGADO)", valor: money(rep.totales.ejercido), color: GREEN },
    { etiqueta: "COMPROMETIDO (ÓRDENES ABIERTAS)", valor: money(rep.totales.comprometido), color: AMBER },
    { etiqueta: "TOTAL DEL REPORTE", valor: money(rep.totales.total), color: NAVY, fuerte: true },
  ]
  const anchoKpi = (CW - 2 * 4) / 3
  kpis.forEach((k, i) => {
    const x = ML + i * (anchoKpi + 4)
    if (k.fuerte) {
      doc.setFillColor(...NAVY)
      doc.roundedRect(x, y, anchoKpi, 17, 2, 2, "F")
    } else {
      doc.setFillColor(...SOFT)
      doc.setDrawColor(...HAIR)
      doc.setLineWidth(0.3)
      doc.roundedRect(x, y, anchoKpi, 17, 2, 2, "FD")
      doc.setFillColor(...k.color)
      doc.rect(x, y + 2.5, 1.4, 12, "F")
    }
    doc.setFont("helvetica", "normal")
    doc.setFontSize(5.8)
    doc.setTextColor(...(k.fuerte ? ([150, 185, 215] as [number, number, number]) : MUTED))
    doc.text(k.etiqueta, x + 4.5, y + 6.2)
    doc.setFont("helvetica", "bold")
    doc.setTextColor(...(k.fuerte ? ([255, 255, 255] as [number, number, number]) : k.color))
    ajustar(doc, k.valor, anchoKpi - 9, 12.5)
    doc.text(k.valor, x + 4.5, y + 13.4)
  })
  y += 23

  if (rep.totales.canceladas > 0) {
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(
      `${rep.totales.canceladas} orden${rep.totales.canceladas !== 1 ? "es" : ""} cancelada${rep.totales.canceladas !== 1 ? "s" : ""} en el periodo; no suman en ningún total.`,
      ML,
      y,
    )
    y += 6
  }

  // ── Resumen por obra ───────────────────────────────────────────────────────
  seccion("Resumen por obra", "Importes con IVA, de mayor a menor gasto.")

  const R_ORD = 14
  const R_PZA = 18
  const R_EJE = 30
  const R_COM = 32
  const R_TOT = 32
  const R_OBRA = CW - R_ORD - R_PZA - R_EJE - R_COM - R_TOT

  const cabResumen = () => {
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 7, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.6)
    doc.setTextColor(255, 255, 255)
    let x = ML
    doc.text("OBRA", x + 2, y + 4.6)
    x += R_OBRA
    doc.text("ÓRD.", x + R_ORD / 2, y + 4.6, { align: "center" })
    x += R_ORD
    doc.text("PIEZAS", x + R_PZA / 2, y + 4.6, { align: "center" })
    x += R_PZA
    doc.text("EJERCIDO", x + R_EJE - 2, y + 4.6, { align: "right" })
    x += R_EJE
    doc.text("COMPROMETIDO", x + R_COM - 2, y + 4.6, { align: "right" })
    x += R_COM
    doc.text("TOTAL", x + R_TOT - 2, y + 4.6, { align: "right" })
    y += 7
  }
  cabResumen()

  if (rep.grupos.length === 0) {
    doc.setFont("helvetica", "italic")
    doc.setFontSize(8.5)
    doc.setTextColor(...MUTED)
    doc.text("Sin órdenes en el periodo seleccionado.", ML + 2, y + 6)
    y += 12
  }

  const ROW = 10
  rep.grupos.forEach((g, i) => {
    if (asegurar(ROW + 2)) cabResumen()
    if (i % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(ML, y, CW, ROW, "F")
    }
    let x = ML

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.2)
    doc.setTextColor(...INK)
    doc.text(recortar(doc, g.obra, R_OBRA - 4), x + 2, y + 4.4)

    const subtitulo = g.esAlmacen
      ? "Entradas al almacén · no es gasto de obra"
      : [g.codigo, g.empresa].filter(Boolean).join(" · ") || "Sin empresa asignada"
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.4)
    doc.setTextColor(...MUTED)
    doc.text(recortar(doc, subtitulo, R_OBRA - 4), x + 2, y + 7.8)
    x += R_OBRA

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    doc.text(String(g.ordenes.length), x + R_ORD / 2, y + 6.2, { align: "center" })
    x += R_ORD
    doc.text(cantidad(g.piezas), x + R_PZA / 2, y + 6.2, { align: "center" })
    x += R_PZA

    doc.setTextColor(...(g.ejercido > 0 ? GREEN : MUTED))
    doc.text(money(g.ejercido), x + R_EJE - 2, y + 6.2, { align: "right" })
    x += R_EJE
    doc.setTextColor(...(g.comprometido > 0 ? AMBER : MUTED))
    doc.text(money(g.comprometido), x + R_COM - 2, y + 6.2, { align: "right" })
    x += R_COM

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    doc.text(money(g.total), x + R_TOT - 2, y + 6.2, { align: "right" })

    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.2)
    doc.line(ML, y + ROW, PW - ML, y + ROW)
    y += ROW
  })

  // Gran total
  if (rep.grupos.length > 0) {
    asegurar(14)
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 11, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(255, 255, 255)
    doc.text("GRAN TOTAL DEL REPORTE (IVA INCLUIDO)", ML + 3, y + 7)
    let x = ML + R_OBRA + R_ORD
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.6)
    doc.setTextColor(150, 185, 215)
    doc.text(cantidad(rep.totales.piezas), x + R_PZA / 2, y + 7, { align: "center" })
    x += R_PZA
    doc.text(money(rep.totales.ejercido), x + R_EJE - 2, y + 7, { align: "right" })
    x += R_EJE
    doc.text(money(rep.totales.comprometido), x + R_COM - 2, y + 7, { align: "right" })
    x += R_COM
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(255, 255, 255)
    doc.text(money(rep.totales.total), x + R_TOT - 2, y + 7.4, { align: "right" })
    y += 17
  }

  // ── Detalle por obra ───────────────────────────────────────────────────────
  if (rep.grupos.length > 0) {
    seccion("Detalle de órdenes por obra", "Cada orden con su folio, fecha y estado.")

    const D_FOLIO = 30
    const D_FECHA = 24
    const D_TIPO = 32
    const D_EST = 26
    const D_REN = 16
    const D_PZA = 18
    const D_IMP = CW - D_FOLIO - D_FECHA - D_TIPO - D_EST - D_REN - D_PZA

    const cabDetalle = () => {
      doc.setFillColor(...SOFT)
      doc.rect(ML, y, CW, 6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.2)
      doc.setTextColor(...MUTED)
      let x = ML
      doc.text("FOLIO", x + 2, y + 4)
      x += D_FOLIO
      doc.text("FECHA", x + 2, y + 4)
      x += D_FECHA
      doc.text("TIPO", x + 2, y + 4)
      x += D_TIPO
      doc.text("ESTADO", x + 2, y + 4)
      x += D_EST
      doc.text("RENGL.", x + D_REN / 2, y + 4, { align: "center" })
      x += D_REN
      doc.text("PIEZAS", x + D_PZA / 2, y + 4, { align: "center" })
      x += D_PZA
      doc.text("IMPORTE", x + D_IMP - 2, y + 4, { align: "right" })
      y += 6
    }

    /** Barra con el nombre de la obra. Se repite al cambiar de página para
     *  que ninguna tabla quede huérfana de su obra. */
    const barraGrupo = (g: (typeof rep.grupos)[number], continuacion = false) => {
      doc.setFillColor(...INK)
      doc.rect(ML, y, CW, 8.6, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.6)
      doc.setTextColor(255, 255, 255)
      const titulo = g.codigo ? `${g.obra}  ·  ${g.codigo}` : g.obra
      ajustar(doc, titulo, CW - 60, 8.6, 6.5)
      doc.text(titulo, ML + 3, y + 5.9)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.4)
      doc.setTextColor(190, 205, 220)
      const resumenGrupo = continuacion
        ? "continúa"
        : `${g.ordenes.length} orden${g.ordenes.length !== 1 ? "es" : ""}  ·  ${money(g.total)}`
      doc.text(resumenGrupo, PW - ML - 3, y + 5.7, { align: "right" })
      y += 8.6
    }

    for (const g of rep.grupos) {
      // La barra del grupo y al menos una orden deben caber juntas: una barra
      // sola al pie de la página se lee como si la obra no tuviera órdenes.
      asegurar(9 + 6 + 8 + 2)
      barraGrupo(g)
      cabDetalle()

      g.ordenes.forEach((o, i) => {
        if (asegurar(8 + 2)) {
          barraGrupo(g, true)
          cabDetalle()
        }
        if (i % 2 === 1) {
          doc.setFillColor(...ZEBRA)
          doc.rect(ML, y, CW, 8, "F")
        }
        let x = ML

        doc.setFont("courier", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...INK)
        doc.text(o.folio, x + 2, y + 5.4)
        x += D_FOLIO

        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.6)
        doc.setTextColor(...INK)
        doc.text(fechaCorta(o.fecha), x + 2, y + 5.4)
        x += D_FECHA

        doc.setTextColor(...MUTED)
        doc.text(TIPO_LABEL[o.tipo] ?? o.tipo, x + 2, y + 5.4)
        x += D_TIPO

        doc.setFont("helvetica", "bold")
        doc.setFontSize(7.2)
        doc.setTextColor(...(o.ejercida ? GREEN : AMBER))
        doc.text(ESTADO_LABEL[o.estado] ?? o.estado, x + 2, y + 5.4)
        x += D_EST

        doc.setFont("helvetica", "normal")
        doc.setFontSize(7.6)
        doc.setTextColor(...MUTED)
        doc.text(String(o.renglones), x + D_REN / 2, y + 5.4, { align: "center" })
        x += D_REN
        doc.setTextColor(...INK)
        doc.text(cantidad(o.piezas), x + D_PZA / 2, y + 5.4, { align: "center" })
        x += D_PZA

        doc.setFont("helvetica", "bold")
        doc.setFontSize(8)
        doc.setTextColor(...INK)
        doc.text(money(o.importe), x + D_IMP - 2, y + 5.4, { align: "right" })

        doc.setDrawColor(...HAIR)
        doc.setLineWidth(0.2)
        doc.line(ML, y + 8, PW - ML, y + 8)
        y += 8
      })

      // Subtotal de la obra
      asegurar(9)
      doc.setFillColor(...SOFT)
      doc.rect(ML, y, CW, 7.4, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.2)
      doc.setTextColor(...INK)
      doc.text(`SUBTOTAL ${g.obra.toUpperCase()}`, ML + 3, y + 5)
      doc.setFont("helvetica", "normal")
      doc.setFontSize(6.8)
      doc.setTextColor(...MUTED)
      doc.text(
        `Ejercido ${money(g.ejercido)}   ·   Comprometido ${money(g.comprometido)}`,
        PW - ML - 44,
        y + 5,
        { align: "right" },
      )
      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.6)
      doc.setTextColor(...INK)
      doc.text(money(g.total), PW - ML - 3, y + 5.2, { align: "right" })
      y += 13
    }
  }

  // ── Artículos más utilizados ───────────────────────────────────────────────
  if (rep.articulos.length > 0) {
    seccion(
      "Artículos del más utilizado al menos utilizado",
      "Cantidad surtida en órdenes ya entregadas. La columna «apartado» es material de órdenes abiertas que todavía no sale del almacén.",
    )

    const A_NUM = 10
    const A_COD = 28
    const A_SUR = 18
    const A_PEN = 18
    const A_ORD = 13
    const A_IMP = 30
    const A_DESC = CW - A_NUM - A_COD - A_SUR - A_PEN - A_ORD - A_IMP

    const cabArt = () => {
      doc.setFillColor(...NAVY)
      doc.rect(ML, y, CW, 7, "F")
      doc.setFont("helvetica", "bold")
      doc.setFontSize(6.4)
      doc.setTextColor(255, 255, 255)
      let x = ML
      doc.text("#", x + A_NUM / 2, y + 4.6, { align: "center" })
      x += A_NUM
      doc.text("CÓDIGO", x + 2, y + 4.6)
      x += A_COD
      doc.text("DESCRIPCIÓN", x + 2, y + 4.6)
      x += A_DESC
      doc.text("SURTIDO", x + A_SUR / 2, y + 4.6, { align: "center" })
      x += A_SUR
      doc.text("APARTADO", x + A_PEN / 2, y + 4.6, { align: "center" })
      x += A_PEN
      doc.text("ÓRD.", x + A_ORD / 2, y + 4.6, { align: "center" })
      x += A_ORD
      doc.text("IMPORTE", x + A_IMP - 2, y + 4.6, { align: "right" })
      y += 7
    }
    cabArt()

    const ROW_A = 8
    rep.articulos.forEach((a, i) => {
      if (asegurar(ROW_A + 2)) cabArt()

      // El podio se marca: es la primera pregunta que hace quien lee el reporte.
      const podio = i < 3 && a.cantidad > 0
      if (podio) {
        doc.setFillColor(237, 246, 252)
        doc.rect(ML, y, CW, ROW_A, "F")
      } else if (i % 2 === 1) {
        doc.setFillColor(...ZEBRA)
        doc.rect(ML, y, CW, ROW_A, "F")
      }
      let x = ML

      doc.setFont("helvetica", podio ? "bold" : "normal")
      doc.setFontSize(7.6)
      doc.setTextColor(...(podio ? BRAND : MUTED))
      doc.text(String(i + 1), x + A_NUM / 2, y + 5.4, { align: "center" })
      x += A_NUM

      doc.setFont("courier", "bold")
      doc.setTextColor(...INK)
      ajustar(doc, a.codigo, A_COD - 4, 8, 6)
      doc.text(a.codigo, x + 2, y + 5.4)
      x += A_COD

      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.8)
      doc.setTextColor(...INK)
      doc.text(recortar(doc, a.descripcion, A_DESC - 4), x + 2, y + 5.4)
      x += A_DESC

      doc.setFont("helvetica", "bold")
      doc.setFontSize(8.4)
      doc.setTextColor(...INK)
      doc.text(cantidad(a.cantidad), x + A_SUR / 2, y + 5.4, { align: "center" })
      x += A_SUR

      doc.setFont("helvetica", "normal")
      doc.setFontSize(7.6)
      doc.setTextColor(...(a.pendiente > 0 ? AMBER : [190, 200, 210] as [number, number, number]))
      doc.text(a.pendiente > 0 ? cantidad(a.pendiente) : "—", x + A_PEN / 2, y + 5.4, { align: "center" })
      x += A_PEN

      doc.setTextColor(...MUTED)
      doc.text(String(a.ordenes), x + A_ORD / 2, y + 5.4, { align: "center" })
      x += A_ORD

      doc.setFont("helvetica", "bold")
      doc.setFontSize(7.8)
      doc.setTextColor(...INK)
      doc.text(money(a.importe), x + A_IMP - 2, y + 5.4, { align: "right" })

      doc.setDrawColor(...HAIR)
      doc.setLineWidth(0.2)
      doc.line(ML, y + ROW_A, PW - ML, y + ROW_A)
      y += ROW_A
    })

    asegurar(12)
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 9, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.4)
    doc.setTextColor(255, 255, 255)
    doc.text(
      `${rep.articulos.length} artículo${rep.articulos.length !== 1 ? "s" : ""} distinto${rep.articulos.length !== 1 ? "s" : ""} en el periodo`,
      ML + 3,
      y + 5.9,
    )
    doc.setFontSize(8.6)
    doc.text(money(rep.totales.ejercido), PW - ML - 3, y + 6.1, { align: "right" })
    y += 14
  }

  doc.save(`${nombreArchivo(rep.desde, rep.hasta)}.pdf`)
}
