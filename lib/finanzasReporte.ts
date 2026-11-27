/**
 * Detalle del reporte financiero por obra.
 *
 * La pantalla de Finanzas resume; esto es lo que va impreso. Por cada obra del
 * periodo baja el renglón por renglón: las órdenes de almacén, los egresos de
 * proveedores y la nómina del equipo, empleado por empleado.
 *
 * Dos cosas que este módulo hace y el resumen no:
 *
 *   · LOS PAGOS DE LA OBRA NO SE DESGLOSAN. De ingresos van cuatro cifras
 *     —cobrado, facturado, faltante por cobrar y contrato— y nada más. El
 *     detalle movimiento por movimiento ya vive en el Estado de Cuenta.
 *
 *   · LA NÓMINA SE COMPARA CONTRA LO SUPUESTO. Por cada trabajador del equipo
 *     se imprime lo que se le capturó y lo que debió costar en el periodo
 *     (su sueldo semanal por las semanas que abarca). La diferencia es lo que
 *     falta por capturar, y es la única forma de saber si el costo de mano de
 *     obra del reporte se puede usar para decidir.
 */

import { supabase } from "@/lib/supabaseClient"
import { fetchRoleOptions, buildRoleLabelMap, roleLabelFrom } from "@/lib/roleCatalog"
import type { Periodo, ResumenFinanzas } from "@/lib/finanzasData"

const IVA = 1.16
const round2 = (n: number) => Math.round(n * 100) / 100

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
function isoInicio(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).toISOString()
}
function isoFin(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).toISOString()
}

/** Semanas que abarca el periodo, para estimar lo que debió costar la nómina. */
export function semanasDe(p: Periodo): number {
  return Math.max(1, Math.round((p.hasta.getTime() - p.desde.getTime()) / (7 * 86400000)))
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type OrdenDetalle = {
  folio: string
  fecha: string
  estado: string
  renglones: number
  piezas: number
  importe: number
}

export type EgresoProveedor = {
  fecha: string
  tipo: string
  proveedor: string
  descripcion: string
  cantidad: number | null
  importe: number
}

export type NominaEmpleado = {
  nombre: string
  rol: string | null
  /** Semanas en las que se le capturó nómina */
  semanas: number
  diasTrabajados: number
  // ── Desglose de lo capturado ──
  sueldo: number
  viaticos: number
  horaExtra: number
  bonificaciones: number
  /** Lo que se le pagó según lo capturado: la suma de los cuatro de arriba */
  capturado: number
  /** Depósito fiscal de las corridas guardadas que caen en el periodo.
   *  null = no hay corrida guardada que lo cubra. */
  fiscal: number | null
  /** Lo capturado menos el fiscal: lo que se entregó en efectivo. */
  efectivo: number | null
  /** Lo que debió costar: sueldo semanal por las semanas del periodo */
  supuesto: number
  diferencia: number
}

export type ObraReporte = {
  id: string
  nombre: string
  codigo: string | null
  empresa: string | null

  // Ingresos (sin desglosar pagos)
  cobrado: number
  facturado: number
  faltantePorCobrar: number
  contratado: number

  // Egresos
  ordenes: OrdenDetalle[]
  materialTotal: number
  proveedores: EgresoProveedor[]
  proveedoresTotal: number
  nomina: NominaEmpleado[]
  nominaCapturada: number
  nominaSupuesta: number
  /** Suma del depósito fiscal atribuido a esta obra en el periodo. */
  nominaFiscal: number
  /** Lo capturado menos el fiscal. */
  nominaEfectivo: number

  egresosTotal: number
  margen: number
  /** Margen usando la nómina supuesta en vez de la capturada */
  margenAjustado: number
}

/** Cómo quedó el reparto fiscal / efectivo de la nómina del periodo. */
export type FiscalPeriodo = {
  /** Suma del depósito fiscal de las corridas guardadas del periodo. */
  total: number
  /** Nómina capturada en obras menos el fiscal atribuido. */
  efectivo: number
  /** Fiscal de gente que no estaba en ninguna obra esa semana (oficina). */
  sinObra: number
  /** Lunes de las semanas del periodo que NO tienen corrida guardada. */
  semanasSinRegistro: string[]
  /** Lunes de las semanas del periodo que sí la tienen. */
  semanasConRegistro: string[]
}

export type ReporteFinanzas = {
  resumen: ResumenFinanzas
  obras: ObraReporte[]
  semanas: number
  fiscal: FiscalPeriodo
  /** Empleados activos y su costo semanal, para el encabezado de nómina */
  plantillaActivos: number
  plantillaSemanal: number
  generadoPor: string
  generado: Date
}

// ─── Carga ────────────────────────────────────────────────────────────────────

export async function cargarReporteFinanzas(
  resumen: ResumenFinanzas,
  generadoPor = "Sistema",
): Promise<ReporteFinanzas> {
  const periodo = resumen.periodo
  const d = iso(periodo.desde)
  const h = iso(periodo.hasta)
  const semanas = semanasDe(periodo)

  const [
    obrasRes, cobrosRes, facturasRes, abiertasRes, billingRes,
    ordenesRes, provRes, nominasRes, asignacionesRes, empleadosRes, corridasRes,
  ] = await Promise.all([
    supabase.from("obras").select("id, name, code, empresa_id, empresas(name)"),
    supabase.from("obra_state_accounts").select("obra_id, amount, concept").gte("date", d).lte("date", h),
    supabase.from("obra_facturas").select("obra_id, amount").gte("date", d).lte("date", h),
    // El faltante por cobrar es de la obra, no del periodo: una factura de
    // hace tres meses sigue sin cobrarse hoy.
    supabase.from("obra_facturas").select("obra_id, amount, amount_paid").neq("status", "paid"),
    supabase.from("obra_billing_items").select("obra_id, amount"),
    supabase
      .from("inventory_orders")
      .select("id, folio, obra_id, status, created_at, inventory_order_items(quantity, unit_price)")
      .gte("created_at", isoInicio(periodo.desde))
      .lte("created_at", isoFin(periodo.hasta))
      .in("status", ["delivered", "completed"]),
    supabase
      .from("proveedores_egresos_por_obra")
      .select("obra_id, concepto_tipo, proveedor, fecha, descripcion, cantidad, importe")
      .gte("fecha", d)
      .lte("fecha", h),
    supabase.from("obra_nominas").select("id, obra_id, week_start").gte("week_start", d).lte("week_start", h),
    // Equipo asignado: la asignación cuenta si se traslapa con el periodo
    supabase.from("obra_assignments").select("obra_id, employee_id, role_on_site, assigned_from, assigned_to"),
    supabase.from("employees").select("id, full_name, real_salary, status"),
    /* Corridas de nómina guardadas que caen en el periodo. De aquí sale el
       depósito fiscal: es lo único que lo registra, porque viene del
       documento de la contadora y no de la captura en obra. El aguinaldo se
       deja fuera: es otra corrida y no es sueldo de la semana. */
    supabase
      .from("payroll_runs")
      .select("id, week_start, week_end")
      .eq("kind", "nomina")
      .gte("week_start", d)
      .lte("week_start", h),
  ])

  // El puesto se guarda en código (ayudante_obra); en un documento que ve el
  // cliente tiene que decir "Ayudante de obra".
  const roles = await fetchRoleOptions().then(buildRoleLabelMap).catch(() => ({} as Record<string, string>))

  type ObraRow = { id: string; name: string; code: string | null; empresa_id: string | null; empresas: { name: string } | { name: string }[] | null }
  const obras = (obrasRes.data as ObraRow[] | null) ?? []
  const obraPorId = new Map(obras.map((o) => [o.id, o]))

  // Detalles de nómina: se piden aparte porque dependen de las nóminas del periodo
  const nominas = (nominasRes.data as { id: string; obra_id: string; week_start: string }[] | null) ?? []
  const detallesRes = nominas.length
    ? await supabase
        .from("obra_nomina_details")
        .select(
          "nomina_id, employee_id, full_name, role_on_site, days_worked, total_paid, " +
            "salary_paid, bonus_amount, viatics_amount, overtime_pay",
        )
        .in("nomina_id", nominas.map((n) => n.id))
    : { data: [] as any[] }

  const obraDeNomina = new Map(nominas.map((n) => [n.id, n.obra_id]))

  // ── Acumuladores por obra ──
  const cobrado = new Map<string, number>()
  for (const c of ((cobrosRes.data as { obra_id: string; amount: number | null; concept: string }[] | null) ?? [])) {
    const s = c.concept === "return" ? -1 : 1
    cobrado.set(c.obra_id, (cobrado.get(c.obra_id) ?? 0) + s * Number(c.amount || 0))
  }

  const facturado = new Map<string, number>()
  for (const f of ((facturasRes.data as { obra_id: string; amount: number | null }[] | null) ?? [])) {
    facturado.set(f.obra_id, (facturado.get(f.obra_id) ?? 0) + Number(f.amount || 0))
  }

  const faltante = new Map<string, number>()
  for (const f of ((abiertasRes.data as { obra_id: string; amount: number | null; amount_paid: number | null }[] | null) ?? [])) {
    faltante.set(f.obra_id, (faltante.get(f.obra_id) ?? 0) + (Number(f.amount || 0) - Number(f.amount_paid || 0)))
  }

  const contratado = new Map<string, number>()
  for (const b of ((billingRes.data as { obra_id: string; amount: number | null }[] | null) ?? [])) {
    contratado.set(b.obra_id, (contratado.get(b.obra_id) ?? 0) + Number(b.amount || 0))
  }

  type OrdenRow = {
    id: string
    folio: string
    obra_id: string | null
    status: string
    created_at: string
    inventory_order_items: { quantity: number; unit_price: number }[] | null
  }
  const ordenesPorObra = new Map<string, OrdenDetalle[]>()
  for (const o of ((ordenesRes.data as OrdenRow[] | null) ?? [])) {
    if (!o.obra_id) continue
    const items = o.inventory_order_items ?? []
    const detalle: OrdenDetalle = {
      folio: o.folio,
      fecha: o.created_at,
      estado: o.status,
      renglones: items.length,
      piezas: items.reduce((s, i) => s + Number(i.quantity || 0), 0),
      importe: round2(items.reduce((s, i) => s + round2(round2(Number(i.unit_price) * IVA) * Number(i.quantity)), 0)),
    }
    if (!ordenesPorObra.has(o.obra_id)) ordenesPorObra.set(o.obra_id, [])
    ordenesPorObra.get(o.obra_id)!.push(detalle)
  }

  type ProvRow = {
    obra_id: string | null
    concepto_tipo: string | null
    proveedor: string | null
    fecha: string | null
    descripcion: string | null
    cantidad: number | null
    importe: number | null
  }
  const provPorObra = new Map<string, EgresoProveedor[]>()
  for (const p of ((provRes.data as ProvRow[] | null) ?? [])) {
    if (!p.obra_id) continue
    const e: EgresoProveedor = {
      fecha: p.fecha ?? "",
      tipo: p.concepto_tipo ?? "Material",
      proveedor: p.proveedor ?? "Sin proveedor",
      descripcion: p.descripcion ?? "",
      cantidad: p.cantidad != null ? Number(p.cantidad) : null,
      importe: round2(Number(p.importe || 0)),
    }
    if (!provPorObra.has(p.obra_id)) provPorObra.set(p.obra_id, [])
    provPorObra.get(p.obra_id)!.push(e)
  }

  // ── Nómina: capturado contra supuesto ──
  type EmpRow = { id: string; full_name: string; real_salary: number | string | null; status: string }
  const empleados = (empleadosRes.data as EmpRow[] | null) ?? []
  const empPorId = new Map(empleados.map((e) => [e.id, e]))

  type DetRow = {
    nomina_id: string
    employee_id: string | null
    full_name: string | null
    role_on_site: string | null
    days_worked: number | null
    total_paid: number | null
    salary_paid: number | null
    bonus_amount: number | null
    viatics_amount: number | null
    overtime_pay: number | null
  }
  const detalles = (detallesRes.data as DetRow[] | null) ?? []

  /* ── Depósito fiscal por empleado y semana ──
     payroll_run_lines no guarda la obra (obra_id va en null), así que el
     fiscal se amarra por empleado + semana y se reparte a las obras donde esa
     semana tuvo nómina capturada. Si trabajó en dos obras, se reparte en
     proporción a lo que se le pagó en cada una; es lo más defendible sin
     inventar un dato que el documento de la contadora no trae. */
  const corridas = (corridasRes.data as { id: string; week_start: string }[] | null) ?? []
  const semanaDeCorrida = new Map(corridas.map((c) => [c.id, c.week_start]))

  const lineasRes = corridas.length
    ? await supabase
        .from("payroll_run_lines")
        .select("run_id, employee_id, fiscal_neto")
        .in("run_id", corridas.map((c) => c.id))
    : { data: [] as { run_id: string; employee_id: string | null; fiscal_neto: number | null }[] }

  /** "<employee_id>|<week_start>" → depósito fiscal de esa semana */
  const fiscalPorEmpSemana = new Map<string, number>()
  for (const l of ((lineasRes.data as { run_id: string; employee_id: string | null; fiscal_neto: number | null }[] | null) ?? [])) {
    if (!l.employee_id) continue
    const semana = semanaDeCorrida.get(l.run_id)
    if (!semana) continue
    const k = `${l.employee_id}|${semana}`
    fiscalPorEmpSemana.set(k, (fiscalPorEmpSemana.get(k) ?? 0) + Number(l.fiscal_neto || 0))
  }

  /* Cuánto se le capturó a cada empleado en cada semana, sumando todas sus
     obras. Es el denominador del reparto. */
  const semanaDeNomina = new Map(nominas.map((n) => [n.id, n.week_start]))
  const capturadoEmpSemana = new Map<string, number>()
  for (const det of detalles) {
    if (!det.employee_id) continue
    const semana = semanaDeNomina.get(det.nomina_id)
    if (!semana) continue
    const k = `${det.employee_id}|${semana}`
    capturadoEmpSemana.set(k, (capturadoEmpSemana.get(k) ?? 0) + Number(det.total_paid || 0))
  }

  type Acum = {
    nombre: string; rol: string | null; semanas: number; dias: number
    sueldo: number; viaticos: number; horaExtra: number; bonificaciones: number
    capturado: number; fiscal: number; tieneFiscal: boolean
    empleadoId: string | null
  }
  const nominaPorObra = new Map<string, Map<string, Acum>>()
  const clave = (obraId: string) => {
    if (!nominaPorObra.has(obraId)) nominaPorObra.set(obraId, new Map())
    return nominaPorObra.get(obraId)!
  }

  /** Fiscal ya repartido a alguna obra, para saber qué sobró (oficina). */
  const fiscalRepartido = new Map<string, number>()

  for (const det of detalles) {
    const obraId = obraDeNomina.get(det.nomina_id)
    if (!obraId) continue
    const k = det.employee_id ?? det.full_name ?? "sin-nombre"
    const pagado = Number(det.total_paid || 0)

    /* Parte del fiscal de esa semana que le toca a ESTA obra. Si la persona
       estuvo en una sola, se lleva todo; si estuvo en dos, en proporción a
       lo que cobró en cada una. */
    const semana = semanaDeNomina.get(det.nomina_id)
    const claveSem = det.employee_id && semana ? `${det.employee_id}|${semana}` : null
    const fiscalSemana = claveSem ? fiscalPorEmpSemana.get(claveSem) : undefined
    const totalSemana = claveSem ? capturadoEmpSemana.get(claveSem) ?? 0 : 0
    let fiscalTramo = 0
    if (fiscalSemana != null) {
      fiscalTramo = totalSemana > 0 ? (fiscalSemana * pagado) / totalSemana : fiscalSemana
      if (claveSem) {
        fiscalRepartido.set(claveSem, (fiscalRepartido.get(claveSem) ?? 0) + fiscalTramo)
      }
    }

    const mapa = clave(obraId)
    const prev = mapa.get(k)
    if (prev) {
      prev.semanas += 1
      prev.dias += Number(det.days_worked || 0)
      prev.sueldo += Number(det.salary_paid || 0)
      prev.viaticos += Number(det.viatics_amount || 0)
      prev.horaExtra += Number(det.overtime_pay || 0)
      prev.bonificaciones += Number(det.bonus_amount || 0)
      prev.capturado += pagado
      prev.fiscal += fiscalTramo
      prev.tieneFiscal = prev.tieneFiscal || fiscalSemana != null
    } else {
      mapa.set(k, {
        nombre: det.full_name ?? empPorId.get(det.employee_id ?? "")?.full_name ?? "Sin nombre",
        rol: det.role_on_site,
        semanas: 1,
        dias: Number(det.days_worked || 0),
        sueldo: Number(det.salary_paid || 0),
        viaticos: Number(det.viatics_amount || 0),
        horaExtra: Number(det.overtime_pay || 0),
        bonificaciones: Number(det.bonus_amount || 0),
        capturado: pagado,
        fiscal: fiscalTramo,
        tieneFiscal: fiscalSemana != null,
        empleadoId: det.employee_id,
      })
    }
  }

  // El equipo asignado entra aunque no tenga nómina capturada: si no, el
  // faltante desaparece del reporte, que es justo lo que se quiere ver.
  type AsigRow = { obra_id: string; employee_id: string; role_on_site: string | null; assigned_from: string | null; assigned_to: string | null }
  for (const a of ((asignacionesRes.data as AsigRow[] | null) ?? [])) {
    const traslapa = (a.assigned_from ?? "0000-01-01") <= h && (a.assigned_to ?? "9999-12-31") >= d
    if (!traslapa) continue
    const emp = empPorId.get(a.employee_id)
    if (!emp || emp.status !== "active") continue
    const mapa = clave(a.obra_id)
    if (!mapa.has(a.employee_id)) {
      mapa.set(a.employee_id, {
        nombre: emp.full_name,
        rol: a.role_on_site,
        semanas: 0,
        dias: 0,
        sueldo: 0,
        viaticos: 0,
        horaExtra: 0,
        bonificaciones: 0,
        capturado: 0,
        // Sin nómina capturada no hay con qué amarrar su fiscal a esta obra.
        fiscal: 0,
        tieneFiscal: false,
        empleadoId: a.employee_id,
      })
    }
  }

  // ── Armado final ──
  const ids = new Set<string>([
    ...cobrado.keys(), ...facturado.keys(), ...ordenesPorObra.keys(),
    ...provPorObra.keys(), ...nominaPorObra.keys(),
  ])

  const obrasReporte: ObraReporte[] = [...ids]
    .map((id) => {
      const o = obraPorId.get(id)
      const emp = Array.isArray(o?.empresas) ? o?.empresas[0] : o?.empresas
      const ordenes = (ordenesPorObra.get(id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha))
      const prov = (provPorObra.get(id) ?? []).sort((a, b) => a.fecha.localeCompare(b.fecha))

      const nomina: NominaEmpleado[] = [...(nominaPorObra.get(id) ?? new Map<string, Acum>()).values()]
        .map((a) => {
          const sueldo = Number(empPorId.get(a.empleadoId ?? "")?.real_salary ?? 0)
          const supuesto = round2(sueldo * semanas)
          const capturado = round2(a.capturado)
          const fiscal = a.tieneFiscal ? round2(a.fiscal) : null
          return {
            nombre: a.nombre,
            rol: a.rol ? roleLabelFrom(roles, a.rol, "—") : null,
            semanas: a.semanas,
            diasTrabajados: a.dias,
            sueldo: round2(a.sueldo),
            viaticos: round2(a.viaticos),
            horaExtra: round2(a.horaExtra),
            bonificaciones: round2(a.bonificaciones),
            capturado,
            fiscal,
            efectivo: fiscal == null ? null : round2(capturado - fiscal),
            supuesto,
            diferencia: round2(supuesto - capturado),
          }
        })
        .sort((a, b) => b.supuesto - a.supuesto || a.nombre.localeCompare(b.nombre))

      const materialTotal = round2(ordenes.reduce((s, x) => s + x.importe, 0))
      const proveedoresTotal = round2(prov.reduce((s, x) => s + x.importe, 0))
      const nominaCapturada = round2(nomina.reduce((s, x) => s + x.capturado, 0))
      const nominaSupuesta = round2(nomina.reduce((s, x) => s + x.supuesto, 0))
      const nominaFiscal = round2(nomina.reduce((s, x) => s + (x.fiscal ?? 0), 0))
      const egresosTotal = round2(materialTotal + proveedoresTotal + nominaCapturada)
      const cob = round2(cobrado.get(id) ?? 0)

      return {
        id,
        nombre: o?.name ?? "Obra no encontrada",
        codigo: o?.code ?? null,
        empresa: emp?.name ?? null,
        cobrado: cob,
        facturado: round2(facturado.get(id) ?? 0),
        faltantePorCobrar: round2(faltante.get(id) ?? 0),
        contratado: round2(contratado.get(id) ?? 0),
        ordenes,
        materialTotal,
        proveedores: prov,
        proveedoresTotal,
        nomina,
        nominaCapturada,
        nominaSupuesta,
        nominaFiscal,
        nominaEfectivo: round2(nominaCapturada - nominaFiscal),
        egresosTotal,
        margen: round2(cob - egresosTotal),
        margenAjustado: round2(cob - materialTotal - proveedoresTotal - nominaSupuesta),
      }
    })
    .sort((a, b) => b.cobrado - a.cobrado || b.egresosTotal - a.egresosTotal)

  const activos = empleados.filter((e) => e.status === "active")

  /* ── Semanas del periodo con y sin corrida guardada ──
     Una semana sin corrida no es que no se haya pagado: es que nadie subió
     el documento de la contadora, así que de esa semana no se sabe cuánto
     fue fiscal. El reporte tiene que decirlo en vez de dar un total que
     parece completo. */
  const semanasDelPeriodo: string[] = []
  {
    const inicio = new Date(`${d}T12:00:00`)
    const dow = inicio.getDay()
    inicio.setDate(inicio.getDate() - (dow === 0 ? 6 : dow - 1)) // lunes
    const fin = new Date(`${h}T12:00:00`)
    const cursor = new Date(inicio)
    let guarda = 0
    while (cursor <= fin && guarda < 400) {
      const y = cursor.getFullYear()
      const m = String(cursor.getMonth() + 1).padStart(2, "0")
      const dd = String(cursor.getDate()).padStart(2, "0")
      semanasDelPeriodo.push(`${y}-${m}-${dd}`)
      cursor.setDate(cursor.getDate() + 7)
      guarda++
    }
  }
  const conCorrida = new Set(corridas.map((c) => c.week_start))
  const semanasConRegistro = semanasDelPeriodo.filter((w) => conCorrida.has(w))
  const semanasSinRegistro = semanasDelPeriodo.filter((w) => !conCorrida.has(w))

  const fiscalTotal = round2(
    [...fiscalPorEmpSemana.values()].reduce((acc, v) => acc + v, 0),
  )
  const fiscalEnObras = round2(obrasReporte.reduce((acc, o) => acc + o.nominaFiscal, 0))
  const nominaEnObras = round2(obrasReporte.reduce((acc, o) => acc + o.nominaCapturada, 0))

  return {
    resumen,
    obras: obrasReporte,
    semanas,
    fiscal: {
      total: fiscalTotal,
      efectivo: round2(nominaEnObras - fiscalEnObras),
      // Lo que quedó fuera de toda obra: personal de oficina, que cobra
      // fiscal pero no se captura en la nómina de ninguna obra.
      sinObra: round2(fiscalTotal - fiscalEnObras),
      semanasSinRegistro,
      semanasConRegistro,
    },
    plantillaActivos: activos.length,
    plantillaSemanal: round2(activos.reduce((s, e) => s + Number(e.real_salary || 0), 0)),
    generadoPor,
    generado: new Date(),
  }
}

/** RAFSA_Finanzas_Noviembre_2026 */
export function nombreArchivo(p: Periodo): string {
  return `RAFSA_Finanzas_${p.etiqueta.replace(/\s+/g, "_")}`
}
