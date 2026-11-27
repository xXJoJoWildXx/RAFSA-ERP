/**
 * Datos del tablero.
 *
 * Un solo punto que reúne lo que el ERP sabe y nadie está mirando: lo que
 * espera una acción (facturas por revisar, órdenes por surtir, estimaciones
 * sin aprobar, expedientes incompletos) y las cifras que explican el estado
 * del negocio hoy.
 *
 * Dos reglas que valen para todo el archivo:
 *
 *   · Nada se inventa. Si un dato no está en la base, no aparece en el
 *     tablero. El tablero anterior mostraba "43 documentos pendientes" y
 *     tendencias "+12% vs mes anterior" escritas a mano; eso enseña a
 *     desconfiar de la pantalla completa.
 *   · Cada pendiente lleva a dónde se resuelve. Un número que no se puede
 *     accionar es decoración.
 *
 * Las consultas respetan el rol: lo que el rol no puede ver, no se pide.
 */

import { supabase } from "@/lib/supabaseClient"
import { can } from "@/lib/permissions"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type Urgencia = "alta" | "media" | "baja"

export type IconoPendiente =
  | "factura"
  | "pago"
  | "orden"
  | "entrega"
  | "renta"
  | "estimacion"
  | "cobranza"
  | "expediente"
  | "nomina"
  | "bajada"

/**
 * Renglón de un pendiente que se puede desplegar. El conteo dice cuántos
 * son; esto dice cuáles, y lleva a cada uno a donde se atiende.
 */
export type PendienteDetalle = {
  id: string
  titulo: string
  subtitulo: string
  monto: number | null
  /** Ruta relativa al panel (sin basePath) */
  ruta: string
}

export type Pendiente = {
  key: string
  titulo: string
  /** Una línea que dice por qué importa y qué hacer */
  detalle: string
  conteo: number
  /** Importe asociado, cuando lo hay */
  monto: number | null
  urgencia: Urgencia
  icono: IconoPendiente
  /** Ruta relativa al panel (sin basePath) */
  ruta: string
  /** Si viene, la fila se despliega en vez de navegar */
  detalles?: PendienteDetalle[]
}

export type ObraCobranza = {
  id: string
  nombre: string
  empresa: string | null
  contratado: number
  cobrado: number
  saldo: number
  /** 0–100 */
  avance: number
}

export type Bajada = {
  id: string
  nombre: string
  fecha: string
  reingreso: string | null
}

/**
 * Notificación de bajada que nadie confirmó ni descartó.
 *
 * Se resuelve dentro de la obra, no en el expediente: por eso la fila guarda
 * a dónde hay que ir. Mientras siga pendiente, ni la asistencia ni el saldo
 * de tickets del trabajador reflejan lo que de verdad pasó con ese viaje.
 */
export type BajadaSinResolver = {
  id: string
  empleado: string
  obra: string | null
  obraId: string | null
  empresaId: string | null
  fecha: string
  reingreso: string | null
  /** Días transcurridos desde la fecha de bajada */
  dias: number
}

export type ActividadRow = {
  id: string
  event_type: string
  entity_type: string
  entity_label: string | null
  actor_email: string | null
  created_at: string
}

export type Cifras = {
  porCobrar: number | null
  facturasPorCobrar: number
  porPagar: number | null
  facturasPorPagar: number
  egresosMes: number | null
  ordenesMes: number
  obrasActivas: number | null
  obrasPlaneadas: number
  empleadosActivos: number | null
  foraneos: number
}

export type ResumenDashboard = {
  pendientes: Pendiente[]
  cifras: Cifras
  cobranza: ObraCobranza[]
  bajadas: Bajada[]
  bajadasSinResolver: BajadaSinResolver[]
  actividad: ActividadRow[]
  /** Semana de la última nómina generada, para el encabezado de nómina */
  ultimaNomina: string | null
  generado: Date
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

const IVA = 1.16
const round2 = (n: number) => Math.round(n * 100) / 100

function hoyISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function enDiasISO(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function inicioDeMesISO(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString()
}

/** Días transcurridos desde una fecha ISO (negativo si está en el futuro). */
export function diasDesde(iso: string): number {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

/** 19 oct 2026. La pantalla tiene su propia versión sin año para los chips. */
export function fechaConAnio(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
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

/** El pendiente más urgente primero; a igual urgencia, el de mayor importe. */
const PESO: Record<Urgencia, number> = { alta: 0, media: 1, baja: 2 }
function ordenarPendientes(lista: Pendiente[]): Pendiente[] {
  return lista
    .filter((p) => p.conteo > 0)
    .sort((a, b) => PESO[a.urgencia] - PESO[b.urgencia] || (b.monto ?? 0) - (a.monto ?? 0) || b.conteo - a.conteo)
}

const plural = (n: number, singular: string, plural_: string) => (n === 1 ? singular : plural_)

// ─── Carga ────────────────────────────────────────────────────────────────────

export async function cargarResumen(role: string | null | undefined): Promise<ResumenDashboard> {
  const verObras = can(role, "projects.view")
  const verProveedores = can(role, "suppliers.view")
  const verInventario = can(role, "inventory.orders.view")
  const verEmpleados = can(role, "employees.view")
  const verNomina = can(role, "nomina.view")

  const hoy = hoyISO()
  const en7 = enDiasISO(7)
  const en14 = enDiasISO(14)

  const vacio = { data: null as any, count: null as number | null }
  const salta = Promise.resolve(vacio)

  const [
    provFacturas,
    provPorRevisar,
    provRentas,
    ordenesPorSurtir,
    ordenesEntregadas,
    ordenesMes,
    estimaciones,
    facturasObra,
    obrasRes,
    billingRes,
    cobrosRes,
    empleadosRes,
    docsEmpleadoRes,
    bajadasRes,
    bajadasPendRes,
    nominaRes,
    aguinaldoRes,
    actividadRes,
    estSinCorteRes,
  ] = await Promise.all([
    // ── Proveedores ──
    verProveedores
      ? supabase.from("proveedores_facturas").select("id, saldo, fecha_vencimiento, estado_pago, status")
      : salta,
    verProveedores
      ? supabase.from("proveedores_facturas").select("id", { count: "exact", head: true }).eq("status", "por_revisar")
      : salta,
    verProveedores
      ? supabase
          .from("proveedores_rentas")
          .select("id", { count: "exact", head: true })
          .neq("status", "devuelta")
          .neq("status", "cancelada")
          .not("en_obra_hasta", "is", null)
          .lte("en_obra_hasta", hoy)
      : salta,

    // ── Inventario ──
    verInventario
      ? supabase.from("inventory_orders").select("id", { count: "exact", head: true }).in("status", ["pending", "in_progress"])
      : salta,
    verInventario
      ? supabase.from("inventory_orders").select("id", { count: "exact", head: true }).eq("status", "delivered")
      : salta,
    verInventario
      ? supabase
          .from("inventory_orders")
          .select("id, status, inventory_order_items(quantity, unit_price)")
          .gte("created_at", inicioDeMesISO())
          .neq("status", "cancelled")
      : salta,

    // ── Obras ──
    verObras ? supabase.from("obra_estimaciones").select("id, amount").eq("status", "pending") : salta,
    verObras
      ? supabase.from("obra_facturas").select("id, obra_id, invoice_number, amount, amount_paid, date, status").neq("status", "paid")
      : salta,
    verObras ? supabase.from("obras").select("id, name, status, empresa_id, empresas(name)") : salta,
    verObras ? supabase.from("obra_billing_items").select("obra_id, amount") : salta,
    verObras ? supabase.from("obra_state_accounts").select("obra_id, amount, concept") : salta,

    // ── Empleados ──
    verEmpleados ? supabase.from("employees").select("id, status, is_foraneo").eq("status", "active") : salta,
    verEmpleados ? supabase.from("employee_documents").select("employee_id, doc_type") : salta,
    verEmpleados
      ? supabase
          .from("employees")
          .select("id, full_name, next_bajada_date, next_reingreso_date")
          .eq("status", "active")
          .eq("is_foraneo", true)
          .gte("next_bajada_date", hoy)
          .lte("next_bajada_date", en14)
          .order("next_bajada_date", { ascending: true })
      : salta,
    // Notificaciones de bajada que nadie confirmó ni descartó
    verEmpleados
      ? supabase
          .from("bajada_notifications")
          .select("id, bajada_date, reingreso_date, obra_id, employees(full_name), obras(name, empresa_id)")
          .eq("status", "pending")
          .order("bajada_date", { ascending: true })
          .limit(30)
      : salta,

    // ── Nómina ──
    verNomina ? supabase.from("obra_nominas").select("week_start").order("week_start", { ascending: false }).limit(1) : salta,
    verNomina
      ? supabase
          .from("employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "active")
          .or("aguinaldo_amount.is.null,aguinaldo_amount.eq.0")
      : salta,

    // ── Actividad ──
    supabase
      .from("activity_log")
      .select("id, event_type, entity_type, entity_label, actor_email, created_at")
      .order("created_at", { ascending: false })
      .limit(8),
    /* Estimaciones sin fecha de corte. No entran en ningún periodo de
       Finanzas porque ese filtro va sobre date_end: son trabajo medido que
       queda invisible hasta que alguien captura la fecha. */
    verObras
      ? supabase
          .from("obra_estimaciones")
          .select("id, number, amount, obra_id, status, created_at, obras(name, empresa_id)")
          .is("date_end", null)
      : salta,

  ])

  const pendientes: Pendiente[] = []

  // Las obras se usan en dos lugares —el detalle de la cobranza vencida y el
  // bloque de cobranza por obra—, así que se resuelven una sola vez.
  type ObraRow = {
    id: string
    name: string
    status: string
    empresa_id: string | null
    empresas: { name: string } | { name: string }[] | null
  }
  const obras = (obrasRes.data as ObraRow[] | null) || []
  const obraPorId = new Map<string, ObraRow>()
  for (const o of obras) obraPorId.set(o.id, o)

  // ── Proveedores: revisión y vencimientos ────────────────────────────────────
  type FacProv = { id: string; saldo: number | null; fecha_vencimiento: string | null; estado_pago: string | null }
  const facProv = ((provFacturas.data as FacProv[] | null) || []).filter((f) => Number(f.saldo || 0) > 0)
  const vencidas = facProv.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento < hoy)
  const porVencer = facProv.filter((f) => f.fecha_vencimiento && f.fecha_vencimiento >= hoy && f.fecha_vencimiento <= en7)
  const saldoProveedores = round2(facProv.reduce((s, f) => s + Number(f.saldo || 0), 0))

  if ((provPorRevisar.count ?? 0) > 0) {
    const n = provPorRevisar.count ?? 0
    pendientes.push({
      key: "prov-revisar",
      titulo: `${n} ${plural(n, "factura de proveedor por revisar", "facturas de proveedor por revisar")}`,
      detalle: "Se cargó el CFDI pero nadie ha validado el contenido; hasta entonces no se puede pagar.",
      conteo: n,
      monto: null,
      urgencia: "media",
      icono: "factura",
      ruta: "/proveedores",
    })
  }
  if (vencidas.length > 0) {
    const monto = round2(vencidas.reduce((s, f) => s + Number(f.saldo || 0), 0))
    pendientes.push({
      key: "prov-vencidas",
      titulo: `${vencidas.length} ${plural(vencidas.length, "factura vencida", "facturas vencidas")} sin pagar`,
      detalle: "Pasó la fecha de vencimiento y queda saldo.",
      conteo: vencidas.length,
      monto,
      urgencia: "alta",
      icono: "pago",
      ruta: "/proveedores",
    })
  }
  if (porVencer.length > 0) {
    const monto = round2(porVencer.reduce((s, f) => s + Number(f.saldo || 0), 0))
    pendientes.push({
      key: "prov-por-vencer",
      titulo: `${porVencer.length} ${plural(porVencer.length, "factura vence", "facturas vencen")} esta semana`,
      detalle: "Programar el pago antes de la fecha.",
      conteo: porVencer.length,
      monto,
      urgencia: "media",
      icono: "pago",
      ruta: "/proveedores",
    })
  }
  if ((provRentas.count ?? 0) > 0) {
    const n = provRentas.count ?? 0
    pendientes.push({
      key: "rentas",
      titulo: `${n} ${plural(n, "renta pasó", "rentas pasaron")} su fecha de devolución`,
      detalle: "Siguen marcadas en obra: confirmar la devolución o extender el periodo.",
      conteo: n,
      monto: null,
      urgencia: "alta",
      icono: "renta",
      ruta: "/proveedores",
    })
  }

  // ── Inventario ──────────────────────────────────────────────────────────────
  if ((ordenesPorSurtir.count ?? 0) > 0) {
    const n = ordenesPorSurtir.count ?? 0
    pendientes.push({
      key: "ordenes-surtir",
      titulo: `${n} ${plural(n, "orden de salida por surtir", "órdenes de salida por surtir")}`,
      detalle: "Almacén no ha preparado el material; la obra lo está esperando.",
      conteo: n,
      monto: null,
      urgencia: "media",
      icono: "orden",
      ruta: "/inventario/ordenes",
    })
  }
  if ((ordenesEntregadas.count ?? 0) > 0) {
    const n = ordenesEntregadas.count ?? 0
    pendientes.push({
      key: "ordenes-factura",
      titulo: `${n} ${plural(n, "orden entregada sin factura", "órdenes entregadas sin factura")}`,
      detalle: "El material ya salió pero falta subir el CFDI para cerrarla.",
      conteo: n,
      monto: null,
      urgencia: "media",
      icono: "entrega",
      ruta: "/inventario/ordenes",
    })
  }

  type OrdenMes = { status: string; inventory_order_items: { quantity: number; unit_price: number }[] | null }
  const ordenesDelMes = (ordenesMes.data as OrdenMes[] | null) || []
  const egresosMes = verInventario
    ? round2(
        ordenesDelMes
          .filter((o) => o.status === "delivered" || o.status === "completed")
          .reduce(
            (s, o) =>
              s +
              (o.inventory_order_items ?? []).reduce(
                (si, it) => si + round2(round2(Number(it.unit_price) * IVA) * Number(it.quantity)),
                0,
              ),
            0,
          ),
      )
    : null

  // ── Obras: estimaciones, cobranza y contratos ───────────────────────────────
  type Est = { id: string; amount: number | null }
  const estPend = (estimaciones.data as Est[] | null) || []
  if (estPend.length > 0) {
    const monto = round2(estPend.reduce((s, e) => s + Number(e.amount || 0), 0))
    pendientes.push({
      key: "estimaciones",
      titulo: `${estPend.length} ${plural(estPend.length, "estimación pendiente", "estimaciones pendientes")} de autorizar`,
      detalle: "Mientras no se autorizan no se facturan, y el cobro se recorre.",
      conteo: estPend.length,
      monto,
      urgencia: "media",
      icono: "estimacion",
      ruta: "/projects",
    })
  }

  type FacObra = {
    id: string
    obra_id: string | null
    invoice_number: string | null
    amount: number | null
    amount_paid: number | null
    date: string | null
    status: string
  }
  const facObra = (facturasObra.data as FacObra[] | null) || []
  const porCobrar = round2(facObra.reduce((s, f) => s + (Number(f.amount || 0) - Number(f.amount_paid || 0)), 0))
  // 30 días es el plazo que se maneja con los clientes: pasado eso, se persigue.
  // ── Estimaciones sin fecha de corte ─────────────────────────────────────────
  // Valen dinero y no aparecen en ningún periodo de Finanzas. Es un pendiente
  // que no se nota, porque no falla nada: el monto simplemente no está.
  type EstSinCorte = {
    id: string
    number: number | null
    amount: number | null
    obra_id: string | null
    status: string | null
    created_at: string | null
    obras: { name: string; empresa_id: string | null } | { name: string; empresa_id: string | null }[] | null
  }
  const estSinCorte = (estSinCorteRes.data as EstSinCorte[] | null) || []
  if (estSinCorte.length > 0) {
    const monto = round2(estSinCorte.reduce((s2, e) => s2 + Number(e.amount || 0), 0))
    pendientes.push({
      key: "estimaciones_sin_corte",
      titulo: `${estSinCorte.length} ${plural(estSinCorte.length, "estimación sin fecha de corte", "estimaciones sin fecha de corte")}`,
      detalle: "Sin esa fecha no entran en ningún periodo de Finanzas: el monto queda fuera de los reportes.",
      conteo: estSinCorte.length,
      monto,
      urgencia: "media",
      icono: "estimacion",
      ruta: "/projects",
      // Cada una lleva a su obra, que es donde se captura la fecha.
      detalles: estSinCorte
        .slice()
        .sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))
        .map((e) => {
          const o = Array.isArray(e.obras) ? e.obras[0] : e.obras
          const partes = [
            e.number ? `Estimación ${e.number}` : "Sin número",
            e.status === "completed" ? "completada" : "pendiente",
            e.created_at ? `creada ${fechaConAnio(e.created_at)}` : null,
          ].filter(Boolean)
          return {
            id: e.id,
            titulo: o?.name ?? "Obra sin asignar",
            subtitulo: partes.join(" · "),
            monto: round2(Number(e.amount || 0)),
            ruta: o && o.empresa_id && e.obra_id ? `/projects/${o.empresa_id}/${e.obra_id}` : "/projects",
          }
        }),
    })
  }

  const cobranzaVencida = facObra.filter((f) => f.date && diasDesde(f.date) > 30)
  if (cobranzaVencida.length > 0) {
    const monto = round2(cobranzaVencida.reduce((s, f) => s + (Number(f.amount || 0) - Number(f.amount_paid || 0)), 0))
    const masVieja = Math.max(...cobranzaVencida.map((f) => diasDesde(f.date as string)))
    pendientes.push({
      key: "cobranza",
      titulo: `${cobranzaVencida.length} ${plural(cobranzaVencida.length, "factura a cliente pasa", "facturas a cliente pasan")} de 30 días`,
      detalle: `La más antigua lleva ${masVieja} días sin cobrarse.`,
      conteo: cobranzaVencida.length,
      monto,
      urgencia: "alta",
      icono: "cobranza",
      ruta: "/projects",
      // Al desplegar, cada factura lleva directo a su obra: desde ahí se
      // registra el cobro, que es lo que cierra el pendiente.
      detalles: cobranzaVencida
        .slice()
        .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
        .map((f) => {
          const obra = f.obra_id ? obraPorId.get(f.obra_id) : undefined
          const dias = f.date ? diasDesde(f.date) : 0
          return {
            id: f.id,
            titulo: obra?.name ?? "Obra sin asignar",
            subtitulo: `${f.invoice_number ?? "Sin folio"} · ${f.date ? fechaConAnio(f.date) : "sin fecha"} · ${dias} días`,
            monto: round2(Number(f.amount || 0) - Number(f.amount_paid || 0)),
            ruta: obra && obra.empresa_id ? `/projects/${obra.empresa_id}/${obra.id}` : "/projects",
          }
        }),
    })
  }

  // Cobranza por obra: contratado (cotización + aditivas) contra lo cobrado
  type BillRow = { obra_id: string; amount: number | null }
  type CobroRow = { obra_id: string; amount: number | null; concept: string }

  const contratadoPorObra = new Map<string, number>()
  for (const b of (billingRes.data as BillRow[] | null) || []) {
    contratadoPorObra.set(b.obra_id, (contratadoPorObra.get(b.obra_id) || 0) + Number(b.amount || 0))
  }
  const cobradoPorObra = new Map<string, number>()
  for (const c of (cobrosRes.data as CobroRow[] | null) || []) {
    const signo = c.concept === "return" ? -1 : 1
    cobradoPorObra.set(c.obra_id, (cobradoPorObra.get(c.obra_id) || 0) + signo * Number(c.amount || 0))
  }

  const cobranza: ObraCobranza[] = obras
    .filter((o) => o.status !== "closed")
    .map((o) => {
      const contratado = round2(contratadoPorObra.get(o.id) || 0)
      const cobrado = round2(cobradoPorObra.get(o.id) || 0)
      const emp = Array.isArray(o.empresas) ? o.empresas[0] : o.empresas
      return {
        id: o.id,
        nombre: o.name,
        empresa: emp?.name ?? null,
        contratado,
        cobrado,
        saldo: round2(contratado - cobrado),
        avance: contratado > 0 ? Math.min(100, Math.round((cobrado / contratado) * 100)) : 0,
      }
    })
    .filter((o) => o.contratado > 0)
    .sort((a, b) => b.saldo - a.saldo)
    .slice(0, 6)

  const obrasActivas = verObras ? obras.filter((o) => o.status === "in_progress").length : null
  const obrasPlaneadas = verObras ? obras.filter((o) => o.status === "planned").length : 0

  // ── Empleados: expedientes y bajadas ────────────────────────────────────────
  const DOCS_EXPEDIENTE = [
    "curp",
    "ine",
    "tax_certificate",
    "birth_certificate",
    "address_proof",
    "imss",
    "imss_alta",
  ]
  type EmpRow = { id: string; status: string; is_foraneo: boolean | null }
  const empleados = (empleadosRes.data as EmpRow[] | null) || []
  const docsPorEmpleado = new Map<string, Set<string>>()
  for (const d of ((docsEmpleadoRes.data as { employee_id: string; doc_type: string }[] | null) || [])) {
    if (!docsPorEmpleado.has(d.employee_id)) docsPorEmpleado.set(d.employee_id, new Set())
    docsPorEmpleado.get(d.employee_id)!.add(d.doc_type)
  }
  let incompletos = 0
  let docsFaltantes = 0
  for (const e of empleados) {
    const tiene = docsPorEmpleado.get(e.id) ?? new Set<string>()
    const faltan = DOCS_EXPEDIENTE.filter((d) => !tiene.has(d)).length
    if (faltan > 0) {
      incompletos += 1
      docsFaltantes += faltan
    }
  }
  if (incompletos > 0) {
    pendientes.push({
      key: "expedientes",
      titulo: `${incompletos} ${plural(incompletos, "expediente incompleto", "expedientes incompletos")}`,
      detalle: `Faltan ${docsFaltantes} ${plural(docsFaltantes, "documento", "documentos")} del personal activo (CURP, INE, IMSS y demás).`,
      conteo: incompletos,
      monto: null,
      urgencia: "baja",
      icono: "expediente",
      ruta: "/employees",
    })
  }

  const bajadas: Bajada[] = (
    (bajadasRes.data as { id: string; full_name: string; next_bajada_date: string | null; next_reingreso_date: string | null }[] | null) || []
  )
    .filter((b) => !!b.next_bajada_date)
    .map((b) => ({
      id: b.id,
      nombre: b.full_name,
      fecha: b.next_bajada_date as string,
      reingreso: b.next_reingreso_date,
    }))

  type BajadaNotifRow = {
    id: string
    bajada_date: string
    reingreso_date: string | null
    obra_id: string | null
    employees: { full_name: string } | { full_name: string }[] | null
    obras: { name: string; empresa_id: string | null } | { name: string; empresa_id: string | null }[] | null
  }
  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const vistas = new Set<string>()
  const bajadasSinResolver: BajadaSinResolver[] = ((bajadasPendRes.data as BajadaNotifRow[] | null) || [])
    .map((n) => {
      const emp = uno(n.employees)
      const obra = uno(n.obras)
      return {
        id: n.id,
        empleado: emp?.full_name ?? "Sin nombre",
        obra: obra?.name ?? null,
        obraId: n.obra_id,
        empresaId: obra?.empresa_id ?? null,
        fecha: n.bajada_date,
        reingreso: n.reingreso_date,
        dias: diasDesde(n.bajada_date),
      }
    })
    // Dos notificaciones del mismo viaje son la misma decisión pendiente:
    // listarlas dos veces se lee como un error de la pantalla.
    .filter((b) => {
      const clave = `${b.empleado}|${b.fecha}`
      if (vistas.has(clave)) return false
      vistas.add(clave)
      return true
    })

  if (bajadasSinResolver.length > 0) {
    const atrasadas = bajadasSinResolver.filter((b) => b.dias > 7).length
    const masVieja = Math.max(...bajadasSinResolver.map((b) => b.dias))
    pendientes.push({
      key: "bajadas",
      titulo: `${bajadasSinResolver.length} ${plural(bajadasSinResolver.length, "bajada sin resolver", "bajadas sin resolver")}`,
      detalle:
        masVieja > 0
          ? `Nadie confirmó ni descartó el viaje; la más antigua lleva ${masVieja} días. La asistencia y el saldo de tickets quedan desfasados.`
          : "Nadie ha confirmado ni descartado el viaje.",
      conteo: bajadasSinResolver.length,
      monto: null,
      urgencia: atrasadas > 0 ? "alta" : "media",
      icono: "bajada",
      ruta: "/projects",
    })
  }

  // ── Nómina ──────────────────────────────────────────────────────────────────
  const ultimaNomina = ((nominaRes.data as { week_start: string }[] | null) || [])[0]?.week_start ?? null
  // El aguinaldo se paga antes del 20 de diciembre: sólo molesta en temporada.
  const mes = new Date().getMonth()
  if (verNomina && (mes === 10 || mes === 11) && (aguinaldoRes.count ?? 0) > 0) {
    const n = aguinaldoRes.count ?? 0
    pendientes.push({
      key: "aguinaldo",
      titulo: `${n} ${plural(n, "empleado sin aguinaldo", "empleados sin aguinaldo")} en su expediente`,
      detalle: "La ley lo exige antes del 20 de diciembre; el cálculo ya está en Nómina.",
      conteo: n,
      monto: null,
      urgencia: "media",
      icono: "nomina",
      ruta: "/nomina",
    })
  }

  return {
    pendientes: ordenarPendientes(pendientes),
    cifras: {
      porCobrar: verObras ? porCobrar : null,
      facturasPorCobrar: facObra.length,
      porPagar: verProveedores ? saldoProveedores : null,
      facturasPorPagar: facProv.length,
      egresosMes,
      ordenesMes: ordenesDelMes.length,
      obrasActivas,
      obrasPlaneadas,
      empleadosActivos: verEmpleados ? empleados.length : null,
      foraneos: empleados.filter((e) => e.is_foraneo).length,
    },
    cobranza,
    bajadas,
    bajadasSinResolver,
    actividad: (actividadRes.data as ActividadRow[] | null) || [],
    ultimaNomina,
    generado: new Date(),
  }
}
