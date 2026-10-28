/**
 * Hoja de surtido de una orden de almacén.
 *
 * Documento para imprimir y llevar al almacén: lista los artículos con su
 * código, descripción y cantidad, con una casilla para ir palomeando lo que se
 * va juntando, y espacio de firmas al final.
 *
 * Incluye precio unitario e importe, ambos CON IVA, y el total de la orden.
 * Se genera en el navegador con jsPDF y no se guarda en ningún lado, así que
 * no requiere cambios de base de datos ni de storage.
 */

type Orden = {
  folio: string
  type: string
  obra_name?: string | null
  supplier_name?: string | null
  notes?: string | null
  created_at: string
}

type Articulo = {
  codigo: string | null
  descripcion: string | null
  quantity: number
  /** Precio unitario SIN IVA, tal como se guarda en la orden */
  unit_price: number
  note?: string | null
}

const IVA_RATE = 0.16

function conIva(base: number): number {
  return Math.round((Number(base) || 0) * (1 + IVA_RATE) * 100) / 100
}

function money(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n)
}

const NAVY: [number, number, number] = [4, 21, 39]
const BRAND: [number, number, number] = [1, 116, 189]
const INK: [number, number, number] = [30, 41, 59]
const MUTED: [number, number, number] = [110, 123, 136]
const HAIR: [number, number, number] = [214, 224, 233]
const ZEBRA: [number, number, number] = [245, 249, 252]

const PW = 210
const PH = 297
const ML = 14
const CW = PW - ML * 2

function fmtFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    })
  } catch {
    return iso
  }
}

/** Reduce el tamaño hasta que el texto quepa; sólo recorta como último recurso. */
function ajustar(doc: any, texto: string, anchoMax: number, base: number, minimo = 6.5): number {
  let size = base
  doc.setFontSize(size)
  while (doc.getTextWidth(texto) > anchoMax && size > minimo) {
    size -= 0.5
    doc.setFontSize(size)
  }
  return size
}

export async function generatePickingListPdf(orden: Orden, articulos: Articulo[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })

  const esSalida = orden.type === "dispatch"
  const destino = esSalida
    ? orden.obra_name || "Obra sin asignar"
    : orden.supplier_name || "Proveedor sin asignar"

  let pagina = 1

  const encabezado = () => {
    doc.setFillColor(...NAVY)
    doc.rect(0, 0, PW, 20, "F")
    doc.setFillColor(...BRAND)
    doc.rect(0, 20, PW, 1.4, "F")

    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(255, 255, 255)
    doc.text("RAFSA INDUSTRIAL COATINGS", ML, 9)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(150, 185, 215)
    doc.text(
      esSalida ? "Hoja de surtido · Salida a obra" : "Hoja de surtido · Compra a proveedor",
      ML,
      15,
    )

    doc.setFont("helvetica", "bold")
    doc.setFontSize(14)
    doc.setTextColor(255, 255, 255)
    doc.text(orden.folio, PW - ML, 13, { align: "right" })
  }

  const pie = () => {
    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.3)
    doc.line(ML, PH - 16, PW - ML, PH - 16)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(7)
    doc.setTextColor(...MUTED)
    doc.text(`Orden ${orden.folio}  ·  Impreso el ${fmtFecha(new Date().toISOString())}`, ML, PH - 11)
    doc.text(`Página ${pagina}`, PW - ML, PH - 11, { align: "right" })
  }

  encabezado()
  pie()

  let y = 30

  // ── Datos de la orden ────────────────────────────────────────────────────
  doc.setFillColor(250, 252, 254)
  doc.setDrawColor(...HAIR)
  doc.setLineWidth(0.3)
  doc.roundedRect(ML, y, CW, 18, 2, 2, "FD")
  doc.setFillColor(...BRAND)
  doc.rect(ML, y + 2.5, 1.4, 13, "F")

  const campos: { etiqueta: string; valor: string; ancho: number }[] = [
    { etiqueta: esSalida ? "OBRA DESTINO" : "PROVEEDOR", valor: destino, ancho: 84 },
    { etiqueta: "FECHA DE LA ORDEN", valor: fmtFecha(orden.created_at), ancho: 56 },
    { etiqueta: "ARTÍCULOS", valor: String(articulos.length), ancho: 30 },
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

  if (orden.notes) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.5)
    doc.setTextColor(...MUTED)
    doc.text("NOTAS DE LA ORDEN", ML, y)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    const lineas = doc.splitTextToSize(orden.notes, CW)
    doc.text(lineas, ML, y + 4.5)
    y += 4.5 + lineas.length * 4.2 + 5
  }

  // ── Tabla de artículos ───────────────────────────────────────────────────
  const COL_CHECK = 8
  const COL_NUM = 7
  const COL_CODIGO = 30
  const COL_CANT = 17
  const COL_PU = 25
  const COL_IMP = 27
  const COL_DESC = CW - COL_CHECK - COL_NUM - COL_CODIGO - COL_CANT - COL_PU - COL_IMP

  const cabeceraTabla = () => {
    doc.setFillColor(...NAVY)
    doc.rect(ML, y, CW, 7, "F")
    doc.setFont("helvetica", "bold")
    doc.setFontSize(6.8)
    doc.setTextColor(255, 255, 255)
    let x = ML
    doc.text("OK", x + COL_CHECK / 2, y + 4.6, { align: "center" })
    x += COL_CHECK
    doc.text("#", x + COL_NUM / 2, y + 4.6, { align: "center" })
    x += COL_NUM
    doc.text("CÓDIGO", x + 2, y + 4.6)
    x += COL_CODIGO
    doc.text("DESCRIPCIÓN", x + 2, y + 4.6)
    x += COL_DESC
    doc.text("CANT.", x + COL_CANT / 2, y + 4.6, { align: "center" })
    x += COL_CANT
    doc.text("P. UNIT. C/IVA", x + COL_PU - 2, y + 4.6, { align: "right" })
    x += COL_PU
    doc.text("IMPORTE C/IVA", x + COL_IMP - 2, y + 4.6, { align: "right" })
    y += 7
  }

  cabeceraTabla()

  const ROW_H = 9
  let totalConIva = 0

  articulos.forEach((a, i) => {
    if (y + ROW_H > PH - 22) {
      doc.addPage()
      pagina += 1
      encabezado()
      pie()
      y = 30
      cabeceraTabla()
    }

    if (i % 2 === 1) {
      doc.setFillColor(...ZEBRA)
      doc.rect(ML, y, CW, ROW_H, "F")
    }

    let x = ML

    // Casilla para palomear conforme se junta el material
    doc.setDrawColor(120, 135, 150)
    doc.setLineWidth(0.4)
    doc.roundedRect(x + COL_CHECK / 2 - 2.4, y + ROW_H / 2 - 2.4, 4.8, 4.8, 0.8, 0.8, "S")
    x += COL_CHECK

    doc.setFont("helvetica", "normal")
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(String(i + 1), x + COL_NUM / 2, y + 5.8, { align: "center" })
    x += COL_NUM

    // El código se lee a distancia en el anaquel, así que va grande.
    // ajustar() lo encoge sólo si es un código inusualmente largo.
    doc.setFont("courier", "bold")
    doc.setTextColor(...INK)
    const codigo = a.codigo || "-"
    ajustar(doc, codigo, COL_CODIGO - 4, 10, 7)
    doc.text(codigo, x + 2, y + 6)
    x += COL_CODIGO

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...INK)
    const desc: string[] = doc.splitTextToSize(a.descripcion || "Sin descripción", COL_DESC - 4)

    if (a.note) {
      // Con nota: una línea de descripción arriba y la nota debajo
      doc.text(desc[0], x + 2, y + 4.4)
      doc.setFontSize(6.5)
      doc.setTextColor(...MUTED)
      doc.text(doc.splitTextToSize(a.note, COL_DESC - 4)[0], x + 2, y + 7.6)
    } else if (desc.length > 1) {
      // Sin nota: caben dos líneas, así no se pierde el nombre del material
      doc.setFontSize(7.4)
      const dos: string[] = doc.splitTextToSize(a.descripcion || "", COL_DESC - 4)
      doc.text(dos[0], x + 2, y + 4.2)
      doc.text(dos.length > 2 ? dos[1].replace(/\s+\S*$/, "...") : dos[1], x + 2, y + 7.4)
    } else {
      doc.text(desc[0], x + 2, y + 5.8)
    }
    x += COL_DESC

    doc.setFont("helvetica", "bold")
    doc.setFontSize(11)
    doc.setTextColor(...INK)
    doc.text(String(a.quantity), x + COL_CANT / 2, y + 6.1, { align: "center" })
    x += COL_CANT

    const pu = conIva(a.unit_price)
    const importe = Math.round(pu * Number(a.quantity) * 100) / 100
    totalConIva += importe

    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...MUTED)
    doc.text(money(pu), x + COL_PU - 2, y + 6, { align: "right" })
    x += COL_PU

    doc.setFont("helvetica", "bold")
    doc.setFontSize(8.5)
    doc.setTextColor(...INK)
    doc.text(money(importe), x + COL_IMP - 2, y + 6, { align: "right" })

    doc.setDrawColor(...HAIR)
    doc.setLineWidth(0.2)
    doc.line(ML, y + ROW_H, PW - ML, y + ROW_H)

    y += ROW_H
  })

  // ── Total de la orden ────────────────────────────────────────────────────
  if (y + 12 > PH - 22) {
    doc.addPage()
    pagina += 1
    encabezado()
    pie()
    y = 30
  }

  const anchoTotal = COL_CANT + COL_PU + COL_IMP + 34
  const xTotal = PW - ML - anchoTotal

  doc.setFillColor(...NAVY)
  doc.roundedRect(xTotal, y + 2, anchoTotal, 11, 1.8, 1.8, "F")

  doc.setFont("helvetica", "normal")
  doc.setFontSize(7.5)
  doc.setTextColor(150, 185, 215)
  doc.text("TOTAL DE LA ORDEN (IVA INCLUIDO)", xTotal + 4, y + 8.6)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(money(totalConIva), PW - ML - 4, y + 9.2, { align: "right" })

  y += 16

  // ── Firmas ───────────────────────────────────────────────────────────────
  y += 10
  if (y > PH - 34) {
    doc.addPage()
    pagina += 1
    encabezado()
    pie()
    y = 46
  }

  const anchoFirma = (CW - 18) / 2
  const firmas = ["Surtió (almacén)", esSalida ? "Recibió (obra)" : "Recibió (almacén)"]
  firmas.forEach((etiqueta, i) => {
    const x = ML + i * (anchoFirma + 18)
    doc.setDrawColor(...MUTED)
    doc.setLineWidth(0.4)
    doc.line(x, y, x + anchoFirma, y)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(7.5)
    doc.setTextColor(...INK)
    doc.text(etiqueta, x, y + 4.5)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    doc.text("Nombre y firma", x, y + 8.5)
  })

  doc.save(`Surtido_${orden.folio}.pdf`)
}
