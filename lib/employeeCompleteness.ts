/**
 * Modelo de completitud del expediente de un empleado.
 *
 * El reporte general sirve para dos cosas:
 *   1. Saber qué falta por capturar de cada empleado.
 *   2. Ver lo ya capturado para comprobar que esté correcto y actualizado.
 *
 * Por eso cada punto de revisión guarda tanto si está capturado (`ok`) como el
 * valor que tiene (`value`): el reporte muestra ambos.
 *
 * Los empleados inactivos NO se evalúan: ya no se les va a capturar nada.
 */

export type EmployeeAuditSource = {
  id: string
  full_name: string
  status: string

  photo_url: string | null
  birth_date: string | null
  rfc: string | null
  imss_number: string | null

  hire_date: string | null
  payroll_code: string | null
  real_salary: number | string | null
  overtime_hour_cost: number | string | null
  bonus_amount: number | string | null
  viatics_amount: number | string | null

  bank_name: string | null
  account_number: string | null
  interbank_clabe: string | null

  is_foraneo: boolean
  residence_location: string | null
  phone: string | null

  roleNames: string[]
  /** doc_type presentes en employee_documents */
  docTypes: Set<string>
  /** folder_type presentes en employee_work_documents */
  workDocTypes: Set<string>
}

export type CheckItem = {
  key: string
  /** Etiqueta corta para la matriz */
  short: string
  label: string
  ok: boolean
  /** Lo capturado, para poder verificarlo de un vistazo */
  value: string
}

export type CheckGroup = {
  key: string
  label: string
  items: CheckItem[]
  okCount: number
  total: number
}

export type EmployeeAudit = {
  id: string
  full_name: string
  status: string
  isActive: boolean
  groups: CheckGroup[]
  /** Sólo tiene sentido en activos */
  okCount: number
  total: number
  missingCount: number
  percent: number
  isComplete: boolean
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EMPTY = "Sin capturar"

function text(v: string | null | undefined): { ok: boolean; value: string } {
  const s = (v ?? "").toString().trim()
  return { ok: s.length > 0, value: s || EMPTY }
}

function money(v: number | string | null | undefined): { ok: boolean; value: string } {
  const n = typeof v === "number" ? v : Number(v ?? 0)
  const valid = Number.isFinite(n) && n > 0
  return {
    ok: valid,
    value: valid
      ? new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN",
          minimumFractionDigits: 2,
        }).format(n)
      : EMPTY,
  }
}

function date(v: string | null | undefined): { ok: boolean; value: string } {
  if (!v) return { ok: false, value: EMPTY }
  try {
    return {
      ok: true,
      value: new Date(v + "T12:00:00").toLocaleDateString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    }
  } catch {
    return { ok: true, value: v }
  }
}

function doc(present: boolean): { ok: boolean; value: string } {
  return { ok: present, value: present ? "Cargado" : EMPTY }
}

// ── Catálogo de documentos del expediente ──────────────────────────────────
// profile_photo se omite a propósito: la foto ya se revisa en Identidad
// mediante employees.photo_url, y contarla dos veces falsearía el porcentaje.

export const EXPEDIENTE_DOCS: { key: string; short: string; label: string }[] = [
  { key: "curp", short: "CURP", label: "CURP" },
  { key: "ine", short: "INE", label: "INE" },
  { key: "tax_certificate", short: "Fisc", label: "Constancia de situación fiscal" },
  { key: "birth_certificate", short: "Acta", label: "Acta de nacimiento" },
  { key: "address_proof", short: "Dom", label: "Comprobante de domicilio" },
  { key: "imss", short: "IMSS", label: "Documento IMSS" },
  { key: "imss_alta", short: "Alta", label: "Alta ante el IMSS" },
]

// ── Construcción de la auditoría ───────────────────────────────────────────

export function buildEmployeeAudit(src: EmployeeAuditSource): EmployeeAudit {
  const isActive = (src.status || "").toLowerCase() === "active"

  const identidad: CheckItem[] = [
    { key: "photo", short: "Foto", label: "Fotografía", ...text(src.photo_url) },
    { key: "birth_date", short: "Nac", label: "Fecha de nacimiento", ...date(src.birth_date) },
    { key: "rfc", short: "RFC", label: "RFC", ...text(src.rfc) },
    { key: "imss_number", short: "NSS", label: "Número de IMSS", ...text(src.imss_number) },
  ].map((i) => ({ ...i, value: i.key === "photo" && i.ok ? "Cargada" : i.value }))

  const roles = {
    ok: src.roleNames.length > 0,
    value: src.roleNames.length > 0 ? src.roleNames.join(", ") : EMPTY,
  }

  const laboral: CheckItem[] = [
    { key: "hire_date", short: "Ing", label: "Fecha de ingreso", ...date(src.hire_date) },
    { key: "roles", short: "Rol", label: "Roles asignados", ...roles },
    { key: "payroll_code", short: "Cód", label: "Código de nómina", ...text(src.payroll_code) },
    { key: "real_salary", short: "Sdo", label: "Sueldo real", ...money(src.real_salary) },
    { key: "overtime", short: "H.Ex", label: "Costo de hora extra", ...money(src.overtime_hour_cost) },
  ]

  // La residencia sólo se exige a los foráneos
  if (src.is_foraneo) {
    laboral.push({
      key: "residence",
      short: "Res",
      label: "Lugar de residencia (foráneo)",
      ...text(src.residence_location),
    })
  }

  const bancario: CheckItem[] = [
    { key: "bank_name", short: "Bco", label: "Banco", ...text(src.bank_name) },
    { key: "account_number", short: "Cta", label: "Número de cuenta", ...text(src.account_number) },
    { key: "clabe", short: "CLABE", label: "CLABE interbancaria", ...text(src.interbank_clabe) },
  ]

  const expediente: CheckItem[] = EXPEDIENTE_DOCS.map((d) => ({
    key: d.key,
    short: d.short,
    label: d.label,
    ...doc(src.docTypes.has(d.key)),
  }))

  expediente.push({
    key: "dc3",
    short: "DC-3",
    label: "Constancia DC-3",
    ...doc(src.workDocTypes.has("dc3")),
  })

  const groups: CheckGroup[] = [
    { key: "identidad", label: "Identidad y legal", items: identidad, okCount: 0, total: 0 },
    { key: "laboral", label: "Nómina y laboral", items: laboral, okCount: 0, total: 0 },
    { key: "bancario", label: "Datos bancarios", items: bancario, okCount: 0, total: 0 },
    { key: "expediente", label: "Expediente de documentos", items: expediente, okCount: 0, total: 0 },
  ].map((g) => ({
    ...g,
    okCount: g.items.filter((i) => i.ok).length,
    total: g.items.length,
  }))

  const okCount = groups.reduce((s, g) => s + g.okCount, 0)
  const total = groups.reduce((s, g) => s + g.total, 0)

  return {
    id: src.id,
    full_name: src.full_name,
    status: src.status,
    isActive,
    groups,
    okCount,
    total,
    missingCount: total - okCount,
    percent: total > 0 ? Math.round((okCount / total) * 100) : 0,
    isComplete: okCount === total,
  }
}

/**
 * Orden del reporte, tal como se pidió:
 *   1. Activos incompletos (los que más faltan, primero)
 *   2. Activos completos
 *   3. Inactivos al final, sin evaluar
 */
export function sortAudits(audits: EmployeeAudit[]): EmployeeAudit[] {
  return [...audits].sort((a, b) => {
    const rank = (x: EmployeeAudit) => (!x.isActive ? 2 : x.isComplete ? 1 : 0)
    const ra = rank(a)
    const rb = rank(b)
    if (ra !== rb) return ra - rb
    if (ra === 0 && a.missingCount !== b.missingCount) {
      return b.missingCount - a.missingCount // los más incompletos arriba
    }
    return a.full_name.localeCompare(b.full_name, "es")
  })
}

/** Ranking de los pendientes más frecuentes entre los empleados activos. */
export function missingRanking(
  audits: EmployeeAudit[],
): { label: string; group: string; count: number }[] {
  const activos = audits.filter((a) => a.isActive)
  const acc = new Map<string, { label: string; group: string; count: number }>()

  for (const a of activos) {
    for (const g of a.groups) {
      for (const i of g.items) {
        if (i.ok) continue
        const k = `${g.key}:${i.key}`
        const prev = acc.get(k)
        if (prev) prev.count += 1
        else acc.set(k, { label: i.label, group: g.label, count: 1 })
      }
    }
  }

  return [...acc.values()].sort((x, y) => y.count - x.count)
}
