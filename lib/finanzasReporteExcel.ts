/**
 * Reporte financiero del periodo en Excel (.xlsx)
 *
 * El PDF es para leer y repartir; este archivo es para trabajar. Mismas
 * cifras y mismas reglas (lib/finanzasReporte.ts), en cinco hojas:
 *
 *   • Resumen      → el periodo completo y el comparativo
 *   • Obras        → una fila por obra, con filtros
 *   • Inventario   → una fila por orden entregada
 *   • Proveedores  → una fila por egreso de proveedor
 *   • Nómina       → una fila por trabajador, con el desglose del pago,
 *                    el sueldo fiscal de las corridas guardadas y la diferencia
 *
 * ExcelJS se importa dinámicamente para no pesar en el bundle principal.
 */

import { variacion } from "@/lib/finanzasData"
import { nombreArchivo, type ReporteFinanzas } from "@/lib/finanzasReporte"

const MONEY = '"$"#,##0.00'
const NUM = "#,##0.##"
const FECHA = "dd/mm/yyyy"
const PCT = '+0%;-0%;0%'

const C = {
  blue: "FF1F71B5",
  blueDk: "FF144A8A",
  navy: "FF041527",
  grayHdr: "FFDBDEE2",
  graySub: "FFE8EBEE",
  rowAlt: "FFF6F8FA",
  white: "FFFFFFFF",
  ink: "FF212529",
  muted: "FF6E7B88",
  green: "FF15803D",
  red: "FFB91C1C",
  orange: "FFB45309",
  box: "FFF4F6F8",
}

type Cell = any

function fill(cell: Cell, argb: string) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb } }
}
function borde(cell: Cell, argb = "FFC8CDD3") {
  cell.border = {
    top: { style: "thin", color: { argb } },
    bottom: { style: "thin", color: { argb } },
    left: { style: "thin", color: { argb } },
    right: { style: "thin", color: { argb } },
  }
}

function encabezado(ws: any, r: number, titulos: string[], alineaciones: string[]) {
  titulos.forEach((t, i) => {
    const cell = ws.getCell(r, i + 1)
    cell.value = t
    cell.font = { bold: true, size: 9, color: { argb: C.white } }
    fill(cell, C.navy)
    cell.alignment = { horizontal: alineaciones[i] ?? "left", vertical: "middle", wrapText: true }
    borde(cell, C.navy)
  })
  ws.getRow(r).height = 22
}

function titulo(ws: any, rep: ReporteFinanzas, texto: string, lastCol: number): number {
  let r = 1
  ws.mergeCells(r, 1, r, lastCol)
  let c = ws.getCell(r, 1)
  c.value = texto
  c.font = { bold: true, size: 16, color: { argb: C.blueDk } }
  c.alignment = { horizontal: "center" }
  ws.getRow(r).height = 22
  r++
  ws.mergeCells(r, 1, r, lastCol)
  c = ws.getCell(r, 1)
  c.value = rep.resumen.periodo.etiqueta
  c.font = { bold: true, size: 11, color: { argb: C.blue } }
  c.alignment = { horizontal: "center" }
  r++
  ws.mergeCells(r, 1, r, lastCol)
  c = ws.getCell(r, 1)
  c.value = `Generado el ${rep.generado.toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })} por ${rep.generadoPor}`
  c.font = { size: 9, color: { argb: C.muted } }
  c.alignment = { horizontal: "center" }
  r += 2
  return r
}

export async function generateFinanzasReporteExcel(rep: ReporteFinanzas): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  wb.creator = "RAFSA ERP"
  wb.created = rep.generado

  hojaResumen(wb, rep)
  hojaObras(wb, rep)
  hojaInventario(wb, rep)
  hojaProveedores(wb, rep)
  hojaNomina(wb, rep)

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${nombreArchivo(rep.resumen.periodo)}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─── Resumen ─── */

function hojaResumen(wb: any, rep: ReporteFinanzas) {
  const ws = wb.addWorksheet("Resumen", { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 48 }, { width: 18 }, { width: 18 }, { width: 14 }, { width: 18 }]
  const LAST = 5
  const r0 = rep.resumen
  let r = titulo(ws, rep, "REPORTE FINANCIERO", LAST)

  const fila = (etiqueta: string, valor: any, fmt?: string, opts?: { bold?: boolean; color?: string; bg?: string; indent?: number }) => {
    const a = ws.getCell(r, 1)
    a.value = etiqueta
    a.font = { bold: opts?.bold, size: 10, color: { argb: opts?.color ?? C.ink } }
    a.alignment = { indent: opts?.indent ?? 0 }
    const b = ws.getCell(r, 2)
    b.value = valor
    if (fmt) b.numFmt = fmt
    b.font = { bold: opts?.bold, size: 10, color: { argb: opts?.color ?? C.ink } }
    b.alignment = { horizontal: "right" }
    if (opts?.bg) { fill(a, opts.bg); fill(b, opts.bg) }
    borde(a); borde(b)
    r++
  }

  fila("INGRESOS COBRADOS", r0.ingresos.cobrado, MONEY, { bold: true, color: C.green, bg: C.box })
  fila("EGRESOS DEL PERIODO", r0.egresos.total, MONEY, { bold: true, color: C.orange, bg: C.box })
  fila("RESULTADO", r0.resultado, MONEY, { bold: true, color: r0.resultado >= 0 ? C.green : C.red, bg: C.graySub })
  fila("Margen sobre lo cobrado", r0.margen != null ? r0.margen / 100 : "—", r0.margen != null ? "0%" : undefined, { color: C.muted })
  r++

  // Comparativo
  encabezado(ws, r, ["COMPARATIVO", rep.resumen.periodo.etiqueta, rep.resumen.comparado.etiqueta, "VARIACIÓN", ""], ["left", "right", "right", "right", "left"])
  r++
  const comp = (etiqueta: string, a: number, b: number, mejorArriba = true) => {
    const v = variacion(a, b)
    const celdas: [any, string | undefined][] = [[etiqueta, undefined], [a, MONEY], [b, MONEY], [v != null ? v / 100 : "—", v != null ? PCT : undefined]]
    celdas.forEach(([valor, fmt], i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = valor
      if (fmt) cell.numFmt = fmt
      const mejora = mejorArriba ? a >= b : a <= b
      cell.font = { size: 10, bold: i === 0, color: { argb: i === 3 ? (mejora ? C.green : C.red) : C.ink } }
      cell.alignment = { horizontal: i === 0 ? "left" : "right" }
      borde(cell)
    })
    r++
  }
  comp("Ingresos cobrados", r0.ingresos.cobrado, rep.resumen.anterior.cobrado)
  comp("Facturado al cliente", r0.ingresos.facturado, rep.resumen.anterior.facturado)
  comp("Egresos", r0.egresos.total, rep.resumen.anterior.egresos, false)
  comp("Resultado", r0.resultado, rep.resumen.anterior.resultado)
  r++

  // Desglose
  encabezado(ws, r, ["DESGLOSE", "IMPORTE", "REGISTROS", "", ""], ["left", "right", "center", "left", "left"])
  r++
  const det = (etiqueta: string, monto: number, registros?: number, opts?: { bold?: boolean; color?: string; indent?: number }) => {
    const a = ws.getCell(r, 1); a.value = etiqueta; a.font = { bold: opts?.bold, size: 10, color: { argb: opts?.color ?? C.ink } }; a.alignment = { indent: opts?.indent ?? 0 }; borde(a)
    const b = ws.getCell(r, 2); b.value = monto; b.numFmt = MONEY; b.font = { bold: opts?.bold, size: 10, color: { argb: opts?.color ?? C.ink } }; b.alignment = { horizontal: "right" }; borde(b)
    const c = ws.getCell(r, 3); c.value = registros ?? ""; c.numFmt = NUM; c.font = { size: 10, color: { argb: C.muted } }; c.alignment = { horizontal: "center" }; borde(c)
    r++
  }
  det("Cobrado (dinero que entró)", r0.ingresos.cobrado, r0.ingresos.cobros, { bold: true, color: C.green })
  det("Facturado al cliente", r0.ingresos.facturado, r0.ingresos.facturas)
  det("Estimaciones con corte en el periodo", r0.ingresos.estimado, r0.ingresos.estimaciones)
  // Trabajo ya medido que todavía no se le pasa al cliente.
  det("      Estimado sin facturar", r0.ingresos.estimadoSinFacturar, r0.ingresos.estimacionesSinFacturar)
  det("Nómina de obra", r0.egresos.nomina, r0.egresos.nominaSemanas, { bold: true, color: C.orange })
  det("Sueldos", r0.egresos.nominaSalarios, undefined, { indent: 1, color: C.muted })
  det("Bonificaciones", r0.egresos.nominaBonos, undefined, { indent: 1, color: C.muted })
  det("Viáticos", r0.egresos.nominaViaticos, undefined, { indent: 1, color: C.muted })
  det("Horas extra", r0.egresos.nominaOvertime, undefined, { indent: 1, color: C.muted })
  det("Material de almacén entregado", r0.egresos.material, r0.egresos.materialOrdenes, { bold: true, color: C.orange })
  det("Proveedores", r0.egresos.proveedores, r0.egresos.proveedoresFacturas, { bold: true, color: C.orange })
  r++

  // Avisos
  if (r0.avisos.length > 0) {
    ws.mergeCells(r, 1, r, LAST)
    const t = ws.getCell(r, 1)
    t.value = "QUÉ TAN COMPLETO ESTÁ ESTE REPORTE"
    t.font = { bold: true, size: 10, color: { argb: C.blueDk } }
    fill(t, C.graySub)
    borde(t)
    r++
    for (const a of r0.avisos) {
      ws.mergeCells(r, 1, r, LAST)
      const cell = ws.getCell(r, 1)
      cell.value = a.texto
      cell.font = { size: 9, color: { argb: a.nivel === "alto" ? C.red : C.orange } }
      cell.alignment = { wrapText: true, vertical: "top" }
      ws.getRow(r).height = 28
      borde(cell)
      r++
    }
    r++
  }

  ws.mergeCells(r, 1, r, LAST)
  const nota = ws.getCell(r, 1)
  nota.value =
    `Plantilla activa: ${rep.plantillaActivos} empleados, ${rep.plantillaSemanal.toLocaleString("es-MX", { style: "currency", currency: "MXN" })} por semana. ` +
    `El periodo abarca ${rep.semanas} ${rep.semanas === 1 ? "semana" : "semanas"}.`
  nota.font = { size: 9, color: { argb: C.muted } }
}

/* ─── Obras ─── */

function hojaObras(wb: any, rep: ReporteFinanzas) {
  const ws = wb.addWorksheet("Obras", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 38 }, { width: 24 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 },
  ]
  const LAST = 11
  let r = titulo(ws, rep, "RESULTADO POR OBRA", LAST)

  encabezado(
    ws, r,
    ["OBRA", "EMPRESA", "COBRADO", "FACTURADO", "FALTANTE POR COBRAR", "CONTRATADO", "NÓMINA CAPT.", "NÓMINA SUP.", "MATERIAL", "PROVEEDORES", "RESULTADO"],
    ["left", "left", "right", "right", "right", "right", "right", "right", "right", "right", "right"],
  )
  const filaHeader = r
  r++

  rep.obras.forEach((o, i) => {
    const valores: [any, string | undefined][] = [
      [o.nombre, undefined], [o.empresa ?? "", undefined],
      [o.cobrado, MONEY], [o.facturado, MONEY], [o.faltantePorCobrar, MONEY], [o.contratado, MONEY],
      [o.nominaCapturada, MONEY], [o.nominaSupuesta, MONEY], [o.materialTotal, MONEY],
      [o.proveedoresTotal, MONEY], [o.margen, MONEY],
    ]
    valores.forEach(([valor, fmt], j) => {
      const cell = ws.getCell(r, j + 1)
      cell.value = valor
      if (fmt) cell.numFmt = fmt
      cell.font = {
        size: 10,
        bold: j === 0 || j === 10,
        color: { argb: j === 10 ? (o.margen >= 0 ? C.green : C.red) : C.ink },
      }
      cell.alignment = { horizontal: j <= 1 ? "left" : "right" }
      if (i % 2 === 1) fill(cell, C.rowAlt)
      borde(cell)
    })
    r++
  })

  const sum = (f: (o: typeof rep.obras[number]) => number) => rep.obras.reduce((s, o) => s + f(o), 0)
  const totales: [any, string | undefined][] = [
    ["TOTALES", undefined], ["", undefined],
    [sum((o) => o.cobrado), MONEY], [sum((o) => o.facturado), MONEY], [sum((o) => o.faltantePorCobrar), MONEY],
    [sum((o) => o.contratado), MONEY], [sum((o) => o.nominaCapturada), MONEY], [sum((o) => o.nominaSupuesta), MONEY],
    [sum((o) => o.materialTotal), MONEY], [sum((o) => o.proveedoresTotal), MONEY], [sum((o) => o.margen), MONEY],
  ]
  totales.forEach(([valor, fmt], j) => {
    const cell = ws.getCell(r, j + 1)
    cell.value = valor
    if (fmt) cell.numFmt = fmt
    cell.font = { bold: true, size: 10, color: { argb: C.white } }
    fill(cell, C.navy)
    cell.alignment = { horizontal: j <= 1 ? "left" : "right" }
    borde(cell, C.navy)
  })

  if (rep.obras.length > 0) {
    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
  }
}

/* ─── Inventario ─── */

function hojaInventario(wb: any, rep: ReporteFinanzas) {
  const ws = wb.addWorksheet("Inventario", { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 38 }, { width: 24 }, { width: 18 }, { width: 13 }, { width: 16 }, { width: 12 }, { width: 12 }, { width: 18 }]
  const LAST = 8
  let r = titulo(ws, rep, "ÓRDENES DE INVENTARIO ENTREGADAS", LAST)

  encabezado(ws, r, ["OBRA", "EMPRESA", "FOLIO", "FECHA", "ESTADO", "RENGLONES", "PIEZAS", "IMPORTE C/IVA"],
    ["left", "left", "left", "center", "left", "center", "center", "right"])
  const filaHeader = r
  r++

  const ESTADO: Record<string, string> = { delivered: "Entregada", completed: "Completada" }
  let total = 0
  let alt = false
  for (const o of rep.obras) {
    for (const x of o.ordenes) {
      const valores: [any, string | undefined][] = [
        [o.nombre, undefined], [o.empresa ?? "", undefined], [x.folio, undefined],
        [new Date(x.fecha), FECHA], [ESTADO[x.estado] ?? x.estado, undefined],
        [x.renglones, NUM], [x.piezas, NUM], [x.importe, MONEY],
      ]
      valores.forEach(([valor, fmt], j) => {
        const cell = ws.getCell(r, j + 1)
        cell.value = valor
        if (fmt) cell.numFmt = fmt
        cell.font = { size: 10, bold: j === 7, color: { argb: C.ink } }
        cell.alignment = { horizontal: j === 3 || j === 5 || j === 6 ? "center" : j === 7 ? "right" : "left" }
        if (alt) fill(cell, C.rowAlt)
        borde(cell)
      })
      total += x.importe
      alt = !alt
      r++
    }
  }

  if (r > filaHeader + 1) {
    const etiqueta = ws.getCell(r, 7)
    etiqueta.value = "TOTAL"
    etiqueta.font = { bold: true, size: 10, color: { argb: C.white } }
    fill(etiqueta, C.navy)
    etiqueta.alignment = { horizontal: "right" }
    const tot = ws.getCell(r, 8)
    tot.value = Math.round(total * 100) / 100
    tot.numFmt = MONEY
    tot.font = { bold: true, size: 11, color: { argb: C.white } }
    fill(tot, C.navy)
    tot.alignment = { horizontal: "right" }
    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
  } else {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = "Sin órdenes entregadas en el periodo."
    cell.font = { italic: true, size: 10, color: { argb: C.muted } }
  }
}

/* ─── Proveedores ─── */

function hojaProveedores(wb: any, rep: ReporteFinanzas) {
  const ws = wb.addWorksheet("Proveedores", { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 38 }, { width: 13 }, { width: 18 }, { width: 30 }, { width: 44 }, { width: 12 }, { width: 18 }]
  const LAST = 7
  let r = titulo(ws, rep, "EGRESOS DE PROVEEDORES POR OBRA", LAST)

  encabezado(ws, r, ["OBRA", "FECHA", "TIPO", "PROVEEDOR", "DESCRIPCIÓN", "CANTIDAD", "IMPORTE"],
    ["left", "center", "left", "left", "left", "center", "right"])
  const filaHeader = r
  r++

  let total = 0
  let alt = false
  for (const o of rep.obras) {
    for (const x of o.proveedores) {
      const valores: [any, string | undefined][] = [
        [o.nombre, undefined], [x.fecha ? new Date(`${x.fecha}T00:00:00`) : "", x.fecha ? FECHA : undefined],
        [x.tipo, undefined], [x.proveedor, undefined], [x.descripcion, undefined],
        [x.cantidad ?? "", x.cantidad != null ? NUM : undefined], [x.importe, MONEY],
      ]
      valores.forEach(([valor, fmt], j) => {
        const cell = ws.getCell(r, j + 1)
        cell.value = valor
        if (fmt) cell.numFmt = fmt
        cell.font = { size: 10, bold: j === 6, color: { argb: C.ink } }
        cell.alignment = { horizontal: j === 1 || j === 5 ? "center" : j === 6 ? "right" : "left" }
        if (alt) fill(cell, C.rowAlt)
        borde(cell)
      })
      total += x.importe
      alt = !alt
      r++
    }
  }

  if (r > filaHeader + 1) {
    const etiqueta = ws.getCell(r, 6)
    etiqueta.value = "TOTAL"
    etiqueta.font = { bold: true, size: 10, color: { argb: C.white } }
    fill(etiqueta, C.navy)
    etiqueta.alignment = { horizontal: "right" }
    const tot = ws.getCell(r, 7)
    tot.value = Math.round(total * 100) / 100
    tot.numFmt = MONEY
    tot.font = { bold: true, size: 11, color: { argb: C.white } }
    fill(tot, C.navy)
    tot.alignment = { horizontal: "right" }
    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
  } else {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = "Sin egresos de proveedor cargados a obra en el periodo."
    cell.font = { italic: true, size: 10, color: { argb: C.muted } }
  }
}

/** Monto como texto, para las notas al pie donde no cabe una celda con formato. */
function moneyTxt(n: number): string {
  return (Number(n) || 0).toLocaleString("es-MX", {
    style: "currency", currency: "MXN", minimumFractionDigits: 2, maximumFractionDigits: 2,
  })
}

/* ─── Nómina ─── */

function hojaNomina(wb: any, rep: ReporteFinanzas) {
  const ws = wb.addWorksheet("Nómina", { views: [{ showGridLines: false }] })
  ws.columns = [
    { width: 32 }, // Obra
    { width: 32 }, // Trabajador
    { width: 20 }, // Puesto
    { width: 9 },  // Semanas
    { width: 8 },  // Días
    { width: 14 }, // Sueldo real
    { width: 12 }, // Viáticos
    { width: 12 }, // Hora extra
    { width: 14 }, // Bonificaciones
    { width: 14 }, // Total pagado
    { width: 14 }, // Sueldo fiscal
    { width: 16 }, // Diferencia de sueldos
    { width: 14 }, // Supuesto
  ]
  const LAST = 13
  let r = titulo(ws, rep, "NÓMINA POR OBRA: DESGLOSE, FISCAL Y EFECTIVO", LAST)

  ws.mergeCells(r, 1, r, LAST)
  const nota = ws.getCell(r, 1)
  nota.value =
    '"Sueldo fiscal" es el depósito que reporta el documento de la contadora en las corridas guardadas del periodo. ' +
    '"Diferencia de sueldos" es lo pagado menos ese depósito: lo que se entregó en efectivo. ' +
    `"Supuesto" es el sueldo semanal por las ${rep.semanas} ${rep.semanas === 1 ? "semana" : "semanas"} del periodo.`
  nota.font = { size: 9, color: { argb: C.muted } }
  r++

  // Las semanas sin corrida guardada se avisan aquí: sin esto el total
  // fiscal parecería completo cuando sólo cubre parte del periodo.
  if (rep.fiscal.semanasSinRegistro.length > 0) {
    ws.mergeCells(r, 1, r, LAST)
    const av = ws.getCell(r, 1)
    const n = rep.fiscal.semanasSinRegistro.length
    av.value =
      `Atención: ${n} ${n === 1 ? "semana del periodo no tiene" : "semanas del periodo no tienen"} ` +
      `corrida de nómina guardada, así que de ${n === 1 ? "esa semana" : "esas semanas"} no hay sueldo fiscal registrado. ` +
      `Semanas sin registro: ${rep.fiscal.semanasSinRegistro.join(", ")}.`
    av.font = { size: 9, bold: true, color: { argb: C.orange } }
    av.alignment = { wrapText: true, vertical: "middle" }
    ws.getRow(r).height = 28
    r++
  }
  r++

  encabezado(
    ws, r,
    ["OBRA", "TRABAJADOR", "PUESTO EN OBRA", "SEMANAS", "DÍAS",
     "SUELDO REAL", "VIÁTICOS", "HORA EXTRA", "BONIFICACIONES",
     "TOTAL PAGADO", "SUELDO FISCAL", "DIFERENCIA DE SUELDOS", "SUPUESTO"],
    ["left", "left", "left", "center", "center",
     "right", "right", "right", "right", "right", "right", "right", "right"],
  )
  const filaHeader = r
  r++

  let tSueldo = 0, tViat = 0, tExtra = 0, tBonos = 0
  let capt = 0, tFiscal = 0, tDif = 0, sup = 0
  /* Lo capturado a gente cuya semana no tiene corrida guardada. Sin este
     dato, el total de "diferencia" parece mal sumado: no cuadra contra
     pagado menos fiscal porque esas filas no aportan diferencia. */
  let captSinDato = 0
  let alt = false

  for (const o of rep.obras) {
    for (const n of o.nomina) {
      // Sin corrida guardada que lo cubra no se pone 0: un cero diría que
      // no cobró nada fiscal, y lo cierto es que no se sabe.
      const sinDato = n.fiscal == null
      const valores: [any, string | undefined][] = [
        [o.nombre, undefined], [n.nombre, undefined], [n.rol ?? "", undefined],
        [n.semanas, NUM], [n.diasTrabajados, NUM],
        [n.sueldo, MONEY], [n.viaticos, MONEY], [n.horaExtra, MONEY], [n.bonificaciones, MONEY],
        [n.capturado, MONEY],
        [sinDato ? "sin registro" : n.fiscal, sinDato ? undefined : MONEY],
        [sinDato ? "sin registro" : n.efectivo, sinDato ? undefined : MONEY],
        [n.supuesto, MONEY],
      ]
      valores.forEach(([valor, fmt], j) => {
        const cell = ws.getCell(r, j + 1)
        cell.value = valor
        if (fmt) cell.numFmt = fmt
        const esFiscal = j === 10 || j === 11
        cell.font = {
          size: 10,
          bold: j === 1 || j === 9,
          italic: sinDato && esFiscal,
          color: {
            argb: sinDato && esFiscal ? C.muted
              : j === 11 ? C.green
              : j === 3 && n.semanas === 0 ? C.red
              : C.ink,
          },
        }
        cell.alignment = { horizontal: j <= 2 ? "left" : j <= 4 ? "center" : "right" }
        if (alt) fill(cell, C.rowAlt)
        borde(cell)
      })
      tSueldo += n.sueldo
      tViat += n.viaticos
      tExtra += n.horaExtra
      tBonos += n.bonificaciones
      capt += n.capturado
      tFiscal += n.fiscal ?? 0
      tDif += n.efectivo ?? 0
      if (sinDato) captSinDato += n.capturado
      sup += n.supuesto
      alt = !alt
      r++
    }
  }

  if (r > filaHeader + 1) {
    const red2 = (v: number) => Math.round(v * 100) / 100
    const totales: [number, any, string | undefined][] = [
      [1, "TOTALES", undefined],
      [6, red2(tSueldo), MONEY],
      [7, red2(tViat), MONEY],
      [8, red2(tExtra), MONEY],
      [9, red2(tBonos), MONEY],
      [10, red2(capt), MONEY],
      [11, red2(tFiscal), MONEY],
      [12, red2(tDif), MONEY],
      [13, red2(sup), MONEY],
    ]
    for (let col = 1; col <= LAST; col++) {
      const cell = ws.getCell(r, col)
      const t = totales.find(([c]) => c === col)
      cell.value = t ? t[1] : ""
      if (t && t[2]) cell.numFmt = t[2]
      cell.font = { bold: true, size: 10, color: { argb: C.white } }
      fill(cell, C.navy)
      cell.alignment = { horizontal: col === 1 ? "left" : "right" }
      borde(cell, C.navy)
    }
    ws.autoFilter = { from: { row: filaHeader, column: 1 }, to: { row: r - 1, column: LAST } }
    ws.views = [{ showGridLines: false, state: "frozen", ySplit: filaHeader }]
    r += 2

    if (captSinDato > 0.5) {
      ws.mergeCells(r, 1, r, LAST)
      const c = ws.getCell(r, 1)
      c.value =
        `Nota sobre los totales: ${moneyTxt(captSinDato)} de lo pagado corresponde a trabajadores cuyas semanas ` +
        "no tienen corrida guardada, así que no aportan a la columna de diferencia. Por eso el total de " +
        `diferencia (${moneyTxt(tDif)}) no es el total pagado menos el fiscal; es la suma sólo de los ` +
        "trabajadores con depósito registrado."
      c.font = { size: 9, italic: true, color: { argb: C.orange } }
      c.alignment = { wrapText: true, vertical: "middle" }
      ws.getRow(r).height = 26
      r += 2
    }

    // El fiscal de oficina no cuelga de ninguna obra, así que no aparece en
    // la tabla; se dice aparte para que el total cuadre con las corridas.
    if (Math.abs(rep.fiscal.sinObra) > 0.5) {
      ws.mergeCells(r, 1, r, LAST)
      const c = ws.getCell(r, 1)
      c.value =
        `Además, ${moneyTxt(rep.fiscal.sinObra)} de depósito fiscal corresponde a personal que no estuvo ` +
        "asignado a ninguna obra en esas semanas (oficina). El total fiscal de las corridas del periodo es " +
        `${moneyTxt(rep.fiscal.total)}.`
      c.font = { size: 9, italic: true, color: { argb: C.muted } }
      c.alignment = { wrapText: true, vertical: "middle" }
      ws.getRow(r).height = 26
    }
  } else {
    ws.mergeCells(r, 1, r, LAST)
    const cell = ws.getCell(r, 1)
    cell.value = "Sin nómina capturada ni equipo asignado en el periodo."
    cell.font = { italic: true, size: 10, color: { argb: C.muted } }
  }
}
