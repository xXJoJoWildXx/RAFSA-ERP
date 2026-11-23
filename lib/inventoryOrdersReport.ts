/**
 * Reporte de órdenes de inventario.
 *
 * Convierte las órdenes de un rango de fechas en el modelo que consumen el
 * PDF y el Excel: división por obra, gasto por obra, gran total y el ranking
 * de artículos del más utilizado al menos utilizado.
 *
 * Las reglas son las mismas que usa el tab de Egresos de la obra, para que
 * los números cuadren entre pantallas y nadie tenga que explicar por qué una
 * obra aparece con dos cifras distintas:
 *
 *   · Las órdenes CANCELADAS no son gasto: no suman en ningún total.
 *   · "Ejercido" = el material ya salió del almacén (entregada o completada).
 *   · "Comprometido" = la orden está abierta (pendiente): el material está
 *     apartado pero todavía no sale.
 *   · Todos los importes llevan IVA, igual que la hoja de surtido y el
 *     detalle de la orden en pantalla.
 *
 * El ranking de artículos se arma con lo EJERCIDO, porque "más utilizado"
 * significa consumido, no apartado; lo pendiente se reporta en su propia
 * columna para que no se pierda de vista.
 */

import { withIva } from "@/lib/inventory"

// ─── Entrada ──────────────────────────────────────────────────────────────────

export type ReportItem = {
  codigo: string | null
  descripcion: string | null
  quantity: number | string
  unit_price: number | string
}

export type ReportOrder = {
  id: string
  folio: string
  type: string
  status: string
  obra_id: string | null
  supplier_name: string | null
  notes: string | null
  created_at: string
  items: ReportItem[]
}

export type ReportObra = {
  id: string
  name: string
  code: string | null
  empresa: string | null
}

// ─── Salida ───────────────────────────────────────────────────────────────────

export type OrdenResumen = {
  folio: string
  fecha: string
  tipo: string
  estado: string
  /** Renglones distintos de la orden */
  renglones: number
  /** Suma de cantidades */
  piezas: number
  /** Importe con IVA */
  importe: number
  /** El material ya salió del almacén */
  ejercida: boolean
}

export type GrupoObra = {
  key: string
  obra: string
  codigo: string | null
  empresa: string | null
  /** Compras que entran al almacén, no salidas a una obra */
  esAlmacen: boolean
  ordenes: OrdenResumen[]
  ejercido: number
  comprometido: number
  total: number
  piezas: number
}

export type ArticuloRanking = {
  codigo: string
  descripcion: string
  /** Cantidad ya surtida (órdenes ejercidas) */
  cantidad: number
  /** Cantidad apartada en órdenes abiertas */
  pendiente: number
  /** En cuántas órdenes ejercidas aparece */
  ordenes: number
  /** Importe con IVA de lo ejercido */
  importe: number
}

/**
 * Un renglón de una orden, ya aplanado con el nombre de la obra. Es la materia
 * prima de la hoja "Detalle" del Excel: con esto el cliente arma sus propias
 * tablas dinámicas sin pedirnos otro reporte.
 */
export type RenglonDetalle = {
  folio: string
  fecha: string
  empresa: string | null
  obra: string
  tipo: string
  estado: string
  ejercida: boolean
  codigo: string
  descripcion: string
  cantidad: number
  /** Precio unitario con IVA */
  precio: number
  importe: number
}

export type ReporteOrdenes = {
  desde: Date
  hasta: Date
  generado: Date
  generadoPor: string
  grupos: GrupoObra[]
  articulos: ArticuloRanking[]
  renglones: RenglonDetalle[]
  totales: {
    ejercido: number
    comprometido: number
    total: number
    ordenes: number
    obras: number
    piezas: number
    canceladas: number
    renglones: number
  }
}

// ─── Reglas de estado ─────────────────────────────────────────────────────────

/** El material ya salió del almacén. */
export function esEjercida(status: string): boolean {
  return status === "delivered" || status === "completed"
}

/** La orden está viva pero el material no ha salido. */
export function esComprometida(status: string): boolean {
  return status === "pending" || status === "in_progress"
}

export const ESTADO_LABEL: Record<string, string> = {
  pending: "Pendiente",
  in_progress: "En proceso",
  delivered: "Entregada",
  completed: "Completada",
  cancelled: "Cancelada",
}

export const TIPO_LABEL: Record<string, string> = {
  dispatch: "Salida a obra",
  restock: "Compra a almacén",
}

const CLAVE_ALMACEN = "__almacen__"

function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/** Importe con IVA de un renglón. */
function importeRenglon(it: ReportItem): number {
  return redondear(withIva(Number(it.unit_price) || 0) * (Number(it.quantity) || 0))
}

/**
 * Identidad del artículo: el código cuando existe y, si no, la descripción
 * normalizada. Sin esto, el material capturado sin código aparecía una vez
 * por orden en lugar de acumularse.
 */
function claveArticulo(it: ReportItem): string {
  const codigo = (it.codigo ?? "").trim().toUpperCase()
  if (codigo) return `C:${codigo}`
  const desc = (it.descripcion ?? "").trim().toUpperCase().replace(/\s+/g, " ")
  return `D:${desc || "SIN DESCRIPCIÓN"}`
}

// ─── Armado ───────────────────────────────────────────────────────────────────

export function construirReporte(
  ordenes: ReportOrder[],
  obras: ReportObra[],
  rango: { desde: Date; hasta: Date },
  generadoPor = "Sistema",
): ReporteOrdenes {
  const porObra = new Map<string, ReportObra>()
  for (const o of obras) porObra.set(o.id, o)

  const grupos = new Map<string, GrupoObra>()
  const articulos = new Map<string, ArticuloRanking>()
  const detalle: RenglonDetalle[] = []

  let canceladas = 0
  let renglonesTotal = 0

  for (const orden of ordenes) {
    if (orden.status === "cancelled") {
      canceladas += 1
      continue
    }

    const ejercida = esEjercida(orden.status)
    const items = orden.items ?? []
    const importe = redondear(items.reduce((s, it) => s + importeRenglon(it), 0))
    const piezas = items.reduce((s, it) => s + (Number(it.quantity) || 0), 0)
    renglonesTotal += items.length

    // ── Grupo ──
    // Una compra al proveedor entra al almacén: no es gasto de una obra, pero
    // tampoco se puede esconder del reporte, así que lleva su propio grupo.
    const esAlmacen = orden.type === "restock" || !orden.obra_id
    const obra = orden.obra_id ? porObra.get(orden.obra_id) : undefined
    const key = esAlmacen ? CLAVE_ALMACEN : (orden.obra_id as string)

    let grupo = grupos.get(key)
    if (!grupo) {
      grupo = {
        key,
        obra: esAlmacen ? "Compras a almacén" : (obra?.name ?? "Obra sin asignar"),
        codigo: esAlmacen ? null : (obra?.code ?? null),
        empresa: esAlmacen ? null : (obra?.empresa ?? null),
        esAlmacen,
        ordenes: [],
        ejercido: 0,
        comprometido: 0,
        total: 0,
        piezas: 0,
      }
      grupos.set(key, grupo)
    }

    grupo.ordenes.push({
      folio: orden.folio,
      fecha: orden.created_at,
      tipo: orden.type,
      estado: orden.status,
      renglones: items.length,
      piezas,
      importe,
      ejercida,
    })
    if (ejercida) grupo.ejercido = redondear(grupo.ejercido + importe)
    else grupo.comprometido = redondear(grupo.comprometido + importe)
    grupo.total = redondear(grupo.ejercido + grupo.comprometido)
    grupo.piezas += piezas

    // ── Ranking de artículos y detalle plano ──
    for (const it of items) {
      detalle.push({
        folio: orden.folio,
        fecha: orden.created_at,
        empresa: grupo.empresa,
        obra: grupo.obra,
        tipo: orden.type,
        estado: orden.status,
        ejercida,
        codigo: (it.codigo ?? "").trim() || "—",
        descripcion: (it.descripcion ?? "").trim() || "Sin descripción",
        cantidad: Number(it.quantity) || 0,
        precio: withIva(Number(it.unit_price) || 0),
        importe: importeRenglon(it),
      })

      const clave = claveArticulo(it)
      let art = articulos.get(clave)
      if (!art) {
        art = {
          codigo: (it.codigo ?? "").trim() || "—",
          descripcion: (it.descripcion ?? "").trim() || "Sin descripción",
          cantidad: 0,
          pendiente: 0,
          ordenes: 0,
          importe: 0,
        }
        articulos.set(clave, art)
      }
      const cant = Number(it.quantity) || 0
      if (ejercida) {
        art.cantidad += cant
        art.ordenes += 1
        art.importe = redondear(art.importe + importeRenglon(it))
      } else {
        art.pendiente += cant
      }
    }
  }

  // Las órdenes de cada grupo, de la más reciente a la más antigua
  for (const g of grupos.values()) {
    g.ordenes.sort((a, b) => b.fecha.localeCompare(a.fecha))
  }

  // Obras por gasto, de mayor a menor. El almacén siempre al final: no compite
  // con las obras, es otra naturaleza de gasto.
  const listaGrupos = [...grupos.values()].sort((a, b) => {
    if (a.esAlmacen !== b.esAlmacen) return a.esAlmacen ? 1 : -1
    return b.total - a.total
  })

  // Del más utilizado al menos utilizado. Con la misma cantidad gana el de
  // mayor importe, que es el que de verdad pesa en el gasto.
  const listaArticulos = [...articulos.values()].sort(
    (a, b) =>
      b.cantidad - a.cantidad ||
      b.importe - a.importe ||
      b.pendiente - a.pendiente ||
      a.descripcion.localeCompare(b.descripcion),
  )

  const ejercido = redondear(listaGrupos.reduce((s, g) => s + g.ejercido, 0))
  const comprometido = redondear(listaGrupos.reduce((s, g) => s + g.comprometido, 0))

  return {
    desde: rango.desde,
    hasta: rango.hasta,
    generado: new Date(),
    generadoPor,
    grupos: listaGrupos,
    articulos: listaArticulos,
    renglones: detalle.sort(
      (a, b) => b.fecha.localeCompare(a.fecha) || a.folio.localeCompare(b.folio),
    ),
    totales: {
      ejercido,
      comprometido,
      total: redondear(ejercido + comprometido),
      ordenes: listaGrupos.reduce((s, g) => s + g.ordenes.length, 0),
      obras: listaGrupos.filter((g) => !g.esAlmacen).length,
      piezas: listaGrupos.reduce((s, g) => s + g.piezas, 0),
      canceladas,
      renglones: renglonesTotal,
    },
  }
}

// ─── Formato ──────────────────────────────────────────────────────────────────

export function money(n: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n || 0)
}

export function fechaCorta(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "2-digit" })
}

export function fechaLarga(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d
  return date.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })
}

/** Cantidades sin decimales inútiles: 12 y no 12.00, pero 1.5 sí se conserva. */
export function cantidad(n: number): string {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/0$/, "")
}

/** Nombre del archivo: RAFSA_Ordenes_20260101_20260131 */
export function nombreArchivo(desde: Date, hasta: Date): string {
  const ymd = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
  return `RAFSA_Ordenes_${ymd(desde)}_${ymd(hasta)}`
}
