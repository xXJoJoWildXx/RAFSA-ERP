/*
  Lector de CFDI (facturas del SAT) en XML.

  Qué hace y qué NO hace:
  - Lee el XML y devuelve los datos ya tipados y redondeados a como los
    guarda la base. No toca la red ni Supabase.
  - NO clasifica conceptos ni adivina la obra: eso vive en la base
    (proveedores_clasificar_concepto, proveedores_sugerir_obra), para que
    la regla sea una sola aunque la factura entre por otro lado.

  Funciona con CFDI 4.0 y 3.3: busca los nodos por nombre local, sin
  amarrarse al namespace, porque entre una versión y otra cambia la URL.
*/

export type CfdiConcepto = {
  line_no: number
  no_identificacion: string | null
  descripcion: string
  clave_prod_serv: string | null
  clave_unidad: string | null
  unidad: string | null
  cantidad: number
  valor_unitario: number
  importe: number
  descuento: number
  iva_importe: number
  objeto_imp: string | null
}

export type CfdiParsed = {
  version: string | null
  uuid: string | null
  serie: string | null
  folio: string | null
  /** Tal como viene en el XML: hora local, sin zona. La base la interpreta como hora de CDMX. */
  fecha: string | null
  rfc_emisor: string
  nombre_emisor: string | null
  rfc_receptor: string
  nombre_receptor: string | null
  moneda: string
  tipo_cambio: number
  tipo_comprobante: string | null
  forma_pago: string | null
  metodo_pago: string | null
  condiciones_pago: string | null
  uso_cfdi: string | null
  subtotal: number
  descuento: number
  iva: number
  total: number
  conceptos: CfdiConcepto[]
  /** Cosas que no cuadran. Se muestran en el modal, no detienen la carga. */
  avisos: string[]
}

export class CfdiError extends Error {}

/* ── utilidades ───────────────────────────────────────────────── */

const num = (v: string | null | undefined, porDefecto = 0): number => {
  if (v == null || v === "") return porDefecto
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}

const round = (n: number, d: number): number => {
  const f = Math.pow(10, d)
  return Math.round((n + Number.EPSILON) * f) / f
}

const texto = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim()
  return t === "" ? null : t
}

/** "NO APLICA", "N/A" y similares ensucian el catálogo de productos. */
const unidadLimpia = (v: string | null | undefined): string | null => {
  const t = texto(v)
  if (!t) return null
  return /^(no\s*aplica|n\/?a|ninguno?)$/i.test(t) ? null : t
}

const nombreLocal = (el: Element): string =>
  el.localName || el.nodeName.split(":").pop() || ""

/**
 * Solo hijos DIRECTOS. Es la que hay que usar para los nodos de nivel
 * comprobante: <Impuestos> existe tanto en el comprobante como dentro de
 * cada concepto, y buscando entre descendientes gana el del primer
 * concepto — que no trae TotalImpuestosTrasladados y deja el IVA en cero.
 */
function hijosDirectos(nodo: Element | Document, nombre: string): Element[] {
  const out: Element[] = []
  const ns = nodo.childNodes
  for (let i = 0; i < ns.length; i++) {
    const n = ns[i] as Element
    if (n.nodeType === 1 && nombreLocal(n) === nombre) out.push(n)
  }
  return out
}

function hijoDirecto(nodo: Element | Document, nombre: string): Element | null {
  return hijosDirectos(nodo, nombre)[0] ?? null
}

/** Busca en todo el subárbol. Para nodos anidados, como el timbre. */
function descendientes(nodo: Element | Document, nombre: string): Element[] {
  const out: Element[] = []
  const todos = nodo.getElementsByTagName("*")
  for (let i = 0; i < todos.length; i++) {
    const el = todos[i]
    if (nombreLocal(el) === nombre) out.push(el)
  }
  return out
}

function descendiente(nodo: Element | Document, nombre: string): Element | null {
  return descendientes(nodo, nombre)[0] ?? null
}

/* ── el lector ────────────────────────────────────────────────── */

export function parseCFDI(xml: string): CfdiParsed {
  if (typeof DOMParser === "undefined") {
    throw new CfdiError("El lector de CFDI solo corre en el navegador.")
  }

  const doc = new DOMParser().parseFromString(xml, "application/xml")

  // DOMParser no lanza excepción con XML inválido: mete un <parsererror>.
  if (descendiente(doc, "parsererror")) {
    throw new CfdiError("El archivo no es un XML válido.")
  }

  const comp = doc.documentElement
  if (!comp || (comp.localName || comp.nodeName.split(":").pop()) !== "Comprobante") {
    throw new CfdiError("El XML no es un CFDI (no se encontró el nodo Comprobante).")
  }

  const emisor = hijoDirecto(comp, "Emisor")
  const receptor = hijoDirecto(comp, "Receptor")
  if (!emisor || !receptor) {
    throw new CfdiError("El CFDI no trae Emisor o Receptor.")
  }

  const rfcEmisor = texto(emisor.getAttribute("Rfc"))
  const rfcReceptor = texto(receptor.getAttribute("Rfc"))
  if (!rfcEmisor || !rfcReceptor) {
    throw new CfdiError("El CFDI no trae el RFC del emisor o del receptor.")
  }

  // El UUID viene en mayúsculas en unos PACs y en minúsculas en otros.
  // Sin normalizar, la misma factura se podría cargar dos veces.
  const tfd = descendiente(comp, "TimbreFiscalDigital")
  const uuid = texto(tfd?.getAttribute("UUID"))?.toUpperCase() ?? null

  const avisos: string[] = []
  if (!uuid) {
    avisos.push("La factura no está timbrada: no trae UUID fiscal. No se podrá detectar si se carga dos veces.")
  }

  const tipoComprobante = texto(comp.getAttribute("TipoDeComprobante"))
  if (tipoComprobante && tipoComprobante !== "I") {
    avisos.push(
      `El comprobante es tipo "${tipoComprobante}", no una factura de ingreso (I). ` +
        `Las notas de crédito y los complementos de pago no se registran como factura.`,
    )
  }

  /* ── conceptos ── */
  const nodosConcepto = descendientes(hijoDirecto(comp, "Conceptos") ?? comp, "Concepto")
  if (nodosConcepto.length === 0) {
    throw new CfdiError("El CFDI no trae conceptos.")
  }

  const conceptos: CfdiConcepto[] = nodosConcepto.map((c, i) => {
    // El IVA del renglón: la suma de sus traslados. Un concepto puede traer
    // varios (IVA + IEPS); aquí solo nos interesa el 002 = IVA.
    let ivaRenglon = 0
    const impuestosRenglon = hijoDirecto(c, "Impuestos")
    for (const t of impuestosRenglon ? descendientes(impuestosRenglon, "Traslado") : []) {
      const impuesto = texto(t.getAttribute("Impuesto"))
      if (impuesto == null || impuesto === "002") {
        ivaRenglon += num(t.getAttribute("Importe"))
      }
    }

    return {
      line_no: i + 1,
      no_identificacion: texto(c.getAttribute("NoIdentificacion")),
      descripcion: texto(c.getAttribute("Descripcion")) ?? "(sin descripción)",
      clave_prod_serv: texto(c.getAttribute("ClaveProdServ")),
      clave_unidad: texto(c.getAttribute("ClaveUnidad")),
      unidad: unidadLimpia(c.getAttribute("Unidad")),
      cantidad: round(num(c.getAttribute("Cantidad")), 4),
      valor_unitario: round(num(c.getAttribute("ValorUnitario")), 4),
      importe: round(num(c.getAttribute("Importe")), 2),
      descuento: round(num(c.getAttribute("Descuento")), 2),
      iva_importe: round(ivaRenglon, 2),
      objeto_imp: texto(c.getAttribute("ObjetoImp")),
    }
  })

  /* ── totales ── */
  // OJO: hijo directo. Ver el comentario de hijosDirectos.
  const impuestos = hijoDirecto(comp, "Impuestos")
  const subtotal = round(num(comp.getAttribute("SubTotal")), 2)
  const descuento = round(num(comp.getAttribute("Descuento")), 2)
  const total = round(num(comp.getAttribute("Total")), 2)
  const iva = round(num(impuestos?.getAttribute("TotalImpuestosTrasladados")), 2)

  const retenidos = round(num(impuestos?.getAttribute("TotalImpuestosRetenidos")), 2)
  if (retenidos > 0) {
    avisos.push(
      `La factura trae $${retenidos.toLocaleString("es-MX", { minimumFractionDigits: 2 })} ` +
        `de impuestos retenidos, que este módulo todavía no guarda por separado.`,
    )
  }

  /* ── cuadres: avisamos, no corregimos ── */
  const sumaConceptos = round(
    conceptos.reduce((a, c) => a + c.importe - c.descuento, 0),
    2,
  )
  if (Math.abs(sumaConceptos - round(subtotal - descuento, 2)) > 0.05) {
    avisos.push(
      `La suma de los conceptos ($${sumaConceptos.toFixed(2)}) no coincide con el ` +
        `subtotal menos descuento del CFDI ($${round(subtotal - descuento, 2).toFixed(2)}).`,
    )
  }

  const calculado = round(subtotal - descuento + iva - retenidos, 2)
  if (Math.abs(calculado - total) > 0.05) {
    avisos.push(
      `El total del CFDI ($${total.toFixed(2)}) no coincide con subtotal − descuento + impuestos ` +
        `($${calculado.toFixed(2)}).`,
    )
  }

  const moneda = texto(comp.getAttribute("Moneda")) ?? "MXN"
  const tipoCambio = round(num(comp.getAttribute("TipoCambio"), 1) || 1, 6)
  if (moneda !== "MXN" && tipoCambio === 1) {
    avisos.push(`La factura está en ${moneda} pero no trae tipo de cambio: se asumió 1.`)
  }

  return {
    version: texto(comp.getAttribute("Version")),
    uuid,
    serie: texto(comp.getAttribute("Serie")),
    folio: texto(comp.getAttribute("Folio")),
    fecha: texto(comp.getAttribute("Fecha")),
    rfc_emisor: rfcEmisor.toUpperCase(),
    nombre_emisor: texto(emisor.getAttribute("Nombre")),
    rfc_receptor: rfcReceptor.toUpperCase(),
    nombre_receptor: texto(receptor.getAttribute("Nombre")),
    moneda,
    tipo_cambio: tipoCambio,
    tipo_comprobante: tipoComprobante,
    forma_pago: texto(comp.getAttribute("FormaPago")),
    metodo_pago: texto(comp.getAttribute("MetodoPago")),
    condiciones_pago: texto(comp.getAttribute("CondicionesDePago")),
    uso_cfdi: texto(receptor.getAttribute("UsoCFDI")),
    subtotal,
    descuento,
    iva,
    total,
    conceptos,
    avisos,
  }
}
