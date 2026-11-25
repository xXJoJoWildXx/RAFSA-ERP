// lib/aguinaldoReporte.ts
// Reporte descargable de una corrida de cálculo de aguinaldo.
//
// Es la foto de lo que se calculó ANTES de aplicarlo al expediente: sirve
// para revisarlo con quien autoriza, y para dejar constancia de con qué
// números se pagó ese año.
//
// Fórmula, para que el documento se explique solo:
//   (días trabajados en el año ÷ 365) × 15 × salario diario
//   salario diario = sueldo semanal ÷ 7

export type FilaAguinaldo = {
  employee_id: string
  full_name: string
  payroll_code: string | null
  hire_date: string | null
  inicio_conteo: string | null
  dias_en_el_anio: number | null
  salario_semanal: number
  salario_diario: number
  aguinaldo_calculado: number
  aguinaldo_capturado: number
  diferencia: number
  revisar: string | null
}

export type ResumenAguinaldo = {
  total: number
  empleados: number
  completo: number
  proporcional: number
  revisar: number
  porAplicar: number
}

export type CorridaAguinaldo = {
  anio: number
  corte: string
  filas: FilaAguinaldo[]
  resumen: ResumenAguinaldo
  generadoPor: string
}

export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—"
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function fechaCorta(s: string | null | undefined): string {
  if (!s) return "—"
  const d = new Date(`${String(s).split("T")[0]}T12:00:00`)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" })
}

/** Nombre del archivo, con el año y la fecha de corte. */
export function nombreArchivo(c: CorridaAguinaldo, ext: "pdf" | "xlsx"): string {
  return `Aguinaldo_${c.anio}_corte_${c.corte}.${ext}`
}

/** Los que se van a aplicar primero, luego los que ya coinciden, y al final
 *  los marcados para revisar: es el orden en que se revisa la corrida. */
export function ordenarFilas(filas: FilaAguinaldo[]): FilaAguinaldo[] {
  const rango = (f: FilaAguinaldo) => {
    if (f.revisar) return 2
    if (Math.abs(Number(f.diferencia ?? 0)) > 0.005) return 0
    return 1
  }
  return [...filas].sort(
    (a, b) => rango(a) - rango(b) || a.full_name.localeCompare(b.full_name, "es"),
  )
}

/** Etiqueta del estado de cada renglón. */
export function estadoDe(f: FilaAguinaldo): { texto: string; tono: "revisar" | "cambia" | "igual" } {
  if (f.revisar) return { texto: f.revisar, tono: "revisar" }
  if (Math.abs(Number(f.diferencia ?? 0)) > 0.005) {
    return { texto: "Cambia al aplicar", tono: "cambia" }
  }
  return { texto: "Ya coincide", tono: "igual" }
}

/** Proporcional o año completo, que es lo que explica un monto bajo. */
export function proporcionDe(f: FilaAguinaldo): string {
  const d = f.dias_en_el_anio
  if (d == null) return "—"
  return d >= 365 ? "Año completo" : `${d} de 365 días`
}
