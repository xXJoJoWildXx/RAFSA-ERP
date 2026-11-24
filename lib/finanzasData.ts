/**
 * Finanzas: cómo le fue a la empresa en un periodo.
 *
 * Junta en un solo lugar lo que hoy vive separado —cobranza de obras,
 * facturación, nómina, material de almacén y proveedores— y lo presenta como
 * un resultado del periodo, con el periodo anterior al lado para comparar.
 *
 * Tres decisiones que vale la pena conocer antes de leer los números:
 *
 * 1. INGRESO = LO COBRADO. El resultado se construye sobre `obra_state_accounts`,
 *    que es dinero que entró. Lo facturado se reporta aparte porque mide otra
 *    cosa: trabajo entregado que todavía puede estar por cobrarse.
 *
 * 2. EL MATERIAL NO SE CUENTA DOS VECES. En este ERP no existen órdenes de
 *    compra al almacén (`restock`): toda orden es una salida a obra con su
 *    CFDI encima, así que comprar y enviar son el mismo movimiento. Por eso el
 *    egreso de almacén es el material ya entregado, y nada más.
 *
 * 3. LO QUE NO ESTÁ CAPTURADO SE DICE. Si en el periodo no hay nóminas o no
 *    hay facturas de proveedor, el resultado sale inflado. En vez de callarlo,
 *    cada fuente reporta su cobertura y la pantalla lo advierte: un número
 *    bonito que nadie puede defender es peor que un hueco declarado.
 *
 * Los importes van tal como se capturaron (cobros y facturas con IVA, material
 * calculado con IVA, nómina sin IVA porque no lo lleva).
 */

import { supabase } from "@/lib/supabaseClient"

// ─── Periodos ─────────────────────────────────────────────────────────────────

export type TipoPeriodo = "mes" | "anio"

export type Periodo = {
  clave: string
  etiqueta: string
  tipo: TipoPeriodo
  desde: Date
  hasta: Date
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function periodoMes(anio: number, mes: number): Periodo {
  return {
    clave: `mes-${anio}-${String(mes + 1).padStart(2, "0")}`,
    etiqueta: `${capitalizar(MESES[mes])} ${anio}`,
    tipo: "mes",
    desde: new Date(anio, mes, 1),
    hasta: new Date(anio, mes + 1, 0),
  }
}

export function periodoAnio(anio: number): Periodo {
  return {
    clave: `anio-${anio}`,
    etiqueta: `Año ${anio}`,
    tipo: "anio",
    desde: new Date(anio, 0, 1),
    hasta: new Date(anio, 11, 31),
  }
}

/** El periodo con el que se compara: el mes o el año inmediato anterior. */
export function periodoAnterior(p: Periodo): Periodo {
  if (p.tipo === "anio") return periodoAnio(p.desde.getFullYear() - 1)
  const d = new Date(p.desde.getFullYear(), p.desde.getMonth() - 1, 1)
  return periodoMes(d.getFullYear(), d.getMonth())
}

/** Los atajos de la pantalla, en el orden en que se usan. */
export function periodosSugeridos(hoy = new Date()): Periodo[] {
  const a = hoy.getFullYear()
  const m = hoy.getMonth()
  const mesPasado = new Date(a, m - 1, 1)
  return [
    periodoMes(a, m),
    periodoMes(mesPasado.getFullYear(), mesPasado.getMonth()),
    periodoAnio(a),
    periodoAnio(a - 1),
  ]
}

/** Los últimos `n` meses como opciones del selector, del más reciente al más viejo. */
export function mesesDisponibles(n = 24, hoy = new Date()): Periodo[] {
  const out: Periodo[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    out.push(periodoMes(d.getFullYear(), d.getMonth()))
  }
  return out
}

// ─── Resultado ────────────────────────────────────────────────────────────────

export type Ingresos = {
  /** Dinero que entró en el periodo */
  cobrado: number
  cobros: number
  /** Trabajo facturado al cliente en el periodo */
  facturado: number
  facturas: number
  /** Estimaciones con corte en el periodo */
  estimado: number
  estimaciones: number
}

export type Egresos = {
  nomina: number
  nominaSemanas: number
  nominaSalarios: number
  nominaBonos: number
  nominaViaticos: number
  nominaOvertime: number
  /** Material entregado a obra, con IVA */
  material: number
  materialOrdenes: number
  proveedores: number
  proveedoresFacturas: number
  total: number
}

export type ObraMargen = {
  id: string
  nombre: string
  empresa: string | null
  cobrado: number
  facturado: number
  nomina: number
  material: number
  egresos: number
  margen: number
  /** Margen sobre lo cobrado, 0–100; null cuando no hubo cobros */
  pct: number | null
}

export type PuntoMes = {
  clave: string
  etiqueta: string
  ingresos: number
  egresos: number
}

export type Aviso = {
  nivel: "alto" | "medio"
  texto: string
}

export type ResumenFinanzas = {
  periodo: Periodo
  comparado: Periodo
  ingresos: Ingresos
  egresos: Egresos
  /** Cobrado menos egresos */
  resultado: number
  /** Resultado sobre lo cobrado, 0–100; null cuando no hubo cobros */
  margen: number | null
  anterior: {
    cobrado: number
    facturado: number
    egresos: number
    resultado: number
  }
  obras: ObraMargen[]
  serie: PuntoMes[]
  avisos: Aviso[]
  generado: Date
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const IVA = 1.16
const round2 = (n: number) => Math.round(n * 100) / 100

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Inicio del día en ISO completo, para columnas timestamptz. */
function isoInicio(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
}
function isoFin(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
}

export function money(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(n ?? 0)
}

export function moneyExacto(n: number | null | undefined): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(n ?? 0)
}

/** Variación porcentual contra el periodo anterior; null si no hay con qué comparar. */
export function variacion(actual: number, previo: number): number | null {
  if (!previo) return null
  return Math.round(((actual - previo) / Math.abs(previo)) * 100)
}

// ─── Consultas por periodo ────────────────────────────────────────────────────

type CobroRow = { obra_id: string; amount: number | null; concept: string; date: string }
type FacturaRow = { obra_id: string; amount: number | null; date: string | null }
type NominaRow = {
  obra_id: string
  week_start: string
  total_general: number | null
  total_salarios: number | null
  total_bonificaciones: number | null
  total_viaticos: number | null
  total_overtime: number | null
}
type OrdenRow = {
  obra_id: string | null
  status: string
  created_at: string
  inventory_order_items: { quantity: number; unit_price: number }[] | null
}

const signo = (c: string) => (c === "return" ? -1 : 1)

/** Importe con IVA de una orden entregada. */
function importeOrden(o: OrdenRow): number {
  return round2(
    (o.inventory_order_items ?? []).reduce(
      (s, it) => s + round2(round2(Number(it.unit_price) * IVA) * Number(it.quantity)),
      0,
    ),
  )
}

/** El material cuenta como egreso cuando ya salió del almacén. */
const salio = (status: string) => status === "delivered" || status === "completed"

async function cargarMovimientos(desde: Date, hasta: Date) {
  const d = iso(desde)
  const h = iso(hasta)

  const [cobrosRes, facturasRes, estimacionesRes, nominasRes, ordenesRes, provRes] = await Promise.all([
    supabase.from("obra_state_accounts").select("obra_id, amount, concept, date").gte("date", d).lte("date", h),
    supabase.from("obra_facturas").select("obra_id, amount, date").gte("date", d).lte("date", h),
    supabase.from("obra_estimaciones").select("id, amount, date_end").gte("date_end", d).lte("date_end", h),
    supabase
      .from("obra_nominas")
      .select("obra_id, week_start, total_general, total_salarios, total_bonificaciones, total_viaticos, total_overtime")
      .gte("week_start", d)
      .lte("week_start", h),
    supabase
      .from("inventory_orders")
      .select("obra_id, status, created_at, inventory_order_items(quantity, unit_price)")
      .gte("created_at", isoInicio(desde))
      .lte("created_at", isoFin(hasta))
      .neq("status", "cancelled"),
    // Proveedores: lo facturado por el proveedor en el periodo, pagado o no.
    supabase.from("proveedores_facturas").select("total, fecha, status").gte("fecha", d).lte("fecha", h),
  ])

  return {
    cobros: (cobrosRes.data as CobroRow[] | null) ?? [],
    facturas: (facturasRes.data as FacturaRow[] | null) ?? [],
    estimaciones: (estimacionesRes.data as { id: string; amount: number | null }[] | null) ?? [],
    nominas: (nominasRes.data as NominaRow[] | null) ?? [],
    ordenes: (ordenesRes.data as OrdenRow[] | null) ?? [],
    proveedores:
      ((provRes.data as { total: number | null; status: string | null }[] | null) ?? []).filter(
        (f) => f.status !== "cancelada",
      ),
  }
}

type Movimientos = Awaited<ReturnType<typeof cargarMovimientos>>

function sumarIngresos(m: Movimientos): Ingresos {
  return {
    cobrado: round2(m.cobros.reduce((s, c) => s + signo(c.concept) * Number(c.amount || 0), 0)),
    cobros: m.cobros.length,
    facturado: round2(m.facturas.reduce((s, f) => s + Number(f.amount || 0), 0)),
    facturas: m.facturas.length,
    estimado: round2(m.estimaciones.reduce((s, e) => s + Number(e.amount || 0), 0)),
    estimaciones: m.estimaciones.length,
  }
}

function sumarEgresos(m: Movimientos): Egresos {
  const nomina = round2(m.nominas.reduce((s, n) => s + Number(n.total_general || 0), 0))
  const material = round2(m.ordenes.filter((o) => salio(o.status)).reduce((s, o) => s + importeOrden(o), 0))
  const proveedores = round2(m.proveedores.reduce((s, f) => s + Number(f.total || 0), 0))
  return {
    nomina,
    nominaSemanas: new Set(m.nominas.map((n) => n.week_start)).size,
    nominaSalarios: round2(m.nominas.reduce((s, n) => s + Number(n.total_salarios || 0), 0)),
    nominaBonos: round2(m.nominas.reduce((s, n) => s + Number(n.total_bonificaciones || 0), 0)),
    nominaViaticos: round2(m.nominas.reduce((s, n) => s + Number(n.total_viaticos || 0), 0)),
    nominaOvertime: round2(m.nominas.reduce((s, n) => s + Number(n.total_overtime || 0), 0)),
    material,
    materialOrdenes: m.ordenes.filter((o) => salio(o.status)).length,
    proveedores,
    proveedoresFacturas: m.proveedores.length,
    total: round2(nomina + material + proveedores),
  }
}

// ─── Carga principal ──────────────────────────────────────────────────────────

export async function cargarFinanzas(periodo: Periodo): Promise<ResumenFinanzas> {
  const comparado = periodoAnterior(periodo)

  // La serie siempre son los 12 meses que terminan con el periodo, para que la
  // gráfica dé contexto sin importar qué se haya elegido.
  const finSerie = new Date(periodo.hasta.getFullYear(), periodo.hasta.getMonth() + 1, 0)
  const inicioSerie = new Date(finSerie.getFullYear(), finSerie.getMonth() - 11, 1)

  const [actual, previo, serieMov, obrasRes, plantillaRes] = await Promise.all([
    cargarMovimientos(periodo.desde, periodo.hasta),
    cargarMovimientos(comparado.desde, comparado.hasta),
    cargarMovimientos(inicioSerie, finSerie),
    supabase.from("obras").select("id, name, empresa_id, empresas(name)"),
    // Para medir si la nómina capturada es creíble hace falta saber cuánto
    // cuesta la plantilla: sin esa vara, 5 mil pesos de nómina en un mes
    // pasan por buenos.
    supabase.from("employees").select("real_salary").eq("status", "active"),
  ])

  const ingresos = sumarIngresos(actual)
  const egresos = sumarEgresos(actual)
  const ingresosPrevios = sumarIngresos(previo)
  const egresosPrevios = sumarEgresos(previo)

  // ── Rendimiento por obra ──
  type ObraRow = { id: string; name: string; empresa_id: string | null; empresas: { name: string } | { name: string }[] | null }
  const obrasRows = (obrasRes.data as ObraRow[] | null) ?? []
  const obraPorId = new Map<string, ObraRow>()
  for (const o of obrasRows) obraPorId.set(o.id, o)

  const acum = new Map<string, { cobrado: number; facturado: number; nomina: number; material: number }>()
  const tomar = (id: string) => {
    if (!acum.has(id)) acum.set(id, { cobrado: 0, facturado: 0, nomina: 0, material: 0 })
    return acum.get(id)!
  }
  for (const c of actual.cobros) tomar(c.obra_id).cobrado += signo(c.concept) * Number(c.amount || 0)
  for (const f of actual.facturas) if (f.obra_id) tomar(f.obra_id).facturado += Number(f.amount || 0)
  for (const n of actual.nominas) tomar(n.obra_id).nomina += Number(n.total_general || 0)
  for (const o of actual.ordenes) if (o.obra_id && salio(o.status)) tomar(o.obra_id).material += importeOrden(o)

  const obras: ObraMargen[] = [...acum.entries()]
    .map(([id, v]) => {
      const obra = obraPorId.get(id)
      const emp = Array.isArray(obra?.empresas) ? obra?.empresas[0] : obra?.empresas
      const cobrado = round2(v.cobrado)
      const egresosObra = round2(v.nomina + v.material)
      const margen = round2(cobrado - egresosObra)
      return {
        id,
        nombre: obra?.name ?? "Obra no encontrada",
        empresa: emp?.name ?? null,
        cobrado,
        facturado: round2(v.facturado),
        nomina: round2(v.nomina),
        material: round2(v.material),
        egresos: egresosObra,
        margen,
        pct: cobrado > 0 ? Math.round((margen / cobrado) * 100) : null,
      }
    })
    .filter((o) => o.cobrado !== 0 || o.egresos !== 0)
    .sort((a, b) => b.margen - a.margen)

  // ── Serie de 12 meses ──
  const serie: PuntoMes[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(inicioSerie.getFullYear(), inicioSerie.getMonth() + i, 1)
    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const enMes = (f: string) => f.slice(0, 7) === clave

    const ing = serieMov.cobros
      .filter((c) => enMes(c.date))
      .reduce((s, c) => s + signo(c.concept) * Number(c.amount || 0), 0)
    const egrNomina = serieMov.nominas.filter((n) => enMes(n.week_start)).reduce((s, n) => s + Number(n.total_general || 0), 0)
    const egrMaterial = serieMov.ordenes
      .filter((o) => salio(o.status) && enMes(o.created_at))
      .reduce((s, o) => s + importeOrden(o), 0)

    serie.push({
      clave,
      etiqueta: `${MESES[d.getMonth()].slice(0, 3)} ${String(d.getFullYear()).slice(2)}`,
      ingresos: round2(ing),
      egresos: round2(egrNomina + egrMaterial),
    })
  }

  // ── Avisos de cobertura ──
  // Un resultado se lee como verdad; si le falta una pata hay que decirlo.
  const avisos: Aviso[] = []
  const semanasDelPeriodo = Math.max(
    1,
    Math.round((periodo.hasta.getTime() - periodo.desde.getTime()) / (7 * 86400000)),
  )

  // Lo que costaría la plantilla activa en el periodo, como vara de medir.
  const plantilla = (plantillaRes.data as { real_salary: number | string | null }[] | null) ?? []
  const salarioSemanal = round2(plantilla.reduce((s, e) => s + Number(e.real_salary || 0), 0))
  const nominaEsperada = round2(salarioSemanal * semanasDelPeriodo)

  if (egresos.nomina === 0) {
    avisos.push({
      nivel: "alto",
      texto:
        salarioSemanal > 0
          ? `No hay nóminas capturadas en el periodo. Con ${plantilla.length} empleados activos el costo rondaría ${money(nominaEsperada)}, y nada de eso está en el resultado.`
          : "No hay nóminas capturadas en el periodo. El costo de mano de obra no está en el resultado.",
    })
  } else if (nominaEsperada > 0 && egresos.nomina < nominaEsperada * 0.5) {
    const cobertura = Math.round((egresos.nomina / nominaEsperada) * 100)
    avisos.push({
      nivel: "alto",
      texto: `La nómina capturada (${money(egresos.nomina)} en ${egresos.nominaSemanas} ${egresos.nominaSemanas === 1 ? "semana" : "semanas"}) cubre apenas el ${cobertura}% de lo que costaría la plantilla activa en el periodo (~${money(nominaEsperada)}). El resultado está inflado por ese faltante.`,
    })
  } else if (egresos.nominaSemanas < semanasDelPeriodo * 0.6) {
    avisos.push({
      nivel: "medio",
      texto: `Sólo ${egresos.nominaSemanas} ${egresos.nominaSemanas === 1 ? "semana" : "semanas"} de nómina capturadas para un periodo de ${semanasDelPeriodo}. El costo de mano de obra está incompleto.`,
    })
  }

  if (egresos.proveedores === 0) {
    avisos.push({
      nivel: "medio",
      texto: "No hay facturas de proveedor en el periodo. Si hubo compras, el egreso no está reflejado.",
    })
  }

  if (ingresos.cobrado === 0 && ingresos.facturado > 0) {
    avisos.push({
      nivel: "medio",
      texto: "Hubo facturación pero ningún cobro registrado en el periodo.",
    })
  }

  const resultado = round2(ingresos.cobrado - egresos.total)

  return {
    periodo,
    comparado,
    ingresos,
    egresos,
    resultado,
    margen: ingresos.cobrado > 0 ? Math.round((resultado / ingresos.cobrado) * 100) : null,
    anterior: {
      cobrado: ingresosPrevios.cobrado,
      facturado: ingresosPrevios.facturado,
      egresos: egresosPrevios.total,
      resultado: round2(ingresosPrevios.cobrado - egresosPrevios.total),
    },
    obras,
    serie,
    avisos,
    generado: new Date(),
  }
}
