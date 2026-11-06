/**
 * Permisos de la plataforma.
 *
 * Única fuente de verdad de QUIÉN PUEDE QUÉ. Las pantallas no preguntan
 * "¿soy admin?" sino "¿puedo editar el inventario?". La diferencia importa:
 * si preguntaran por el rol, cada permiso nuevo obligaría a tocar las 18
 * pantallas, y al entrar un cuarto rol habría que revisarlas todas otra vez.
 * Así, la regla vive aquí y nada más.
 *
 * Los roles:
 *   admin   → control total
 *   user    → personal de administración: captura y mantiene al día la
 *             información, pero con permisos recortados
 *   almacen → almacén: surte órdenes y sube facturas
 *   worker  → director de obra: asistencia y su obra
 */

export type AppRole = "admin" | "user" | "almacen" | "worker"

/** Capacidades. El nombre dice la acción, no la pantalla. */
export type Capability =
  // ── Inventario ──
  | "inventory.view"
  | "inventory.products.create"
  | "inventory.products.edit"
  | "inventory.products.delete"
  | "inventory.products.import"
  | "inventory.orders.view"
  | "inventory.orders.create"
  | "inventory.orders.delete"
  // ── Estado de cuenta ──
  /** Borrar pagos y movimientos registrados en meses anteriores.
   *  Sin esta capacidad, sólo se puede tocar lo registrado este mes. */
  | "payments.delete.anyMonth"
  // ── Secciones del panel ──
  | "projects.view"
  | "employees.view"
  | "nomina.view"
  | "suppliers.view"
  | "activities.view"
  | "documents.view"

/**
 * Lo que NO puede cada rol. Se declara por excepción y no por lista blanca
 * a propósito: al agregar una capacidad nueva, nadie se queda sin ella por
 * olvido; el permiso se quita cuando de verdad se quiere quitar.
 */
const DENEGADAS: Record<AppRole, Capability[]> = {
  admin: [],

  // Administración: ve el inventario pero no lo toca. El catálogo de
  // artículos lo mantiene almacén.
  user: [
    "inventory.products.create",
    "inventory.products.edit",
    "inventory.products.delete",
    "inventory.products.import",
    // Cierre de mes: lo registrado en meses pasados ya no se toca
    "payments.delete.anyMonth",
  ],

  almacen: [
    "payments.delete.anyMonth",
    "projects.view",
    "employees.view",
    "nomina.view",
    "suppliers.view",
    "activities.view",
    "documents.view",
  ],

  worker: [
    "payments.delete.anyMonth",
    "inventory.view",
    "inventory.products.create",
    "inventory.products.edit",
    "inventory.products.delete",
    "inventory.products.import",
    "inventory.orders.view",
    "inventory.orders.create",
    "inventory.orders.delete",
    "projects.view",
    "employees.view",
    "nomina.view",
    "suppliers.view",
    "activities.view",
    "documents.view",
  ],
}

/** ¿Este rol puede hacer esto? Sin rol (sesión cargando) → no. */
export function can(role: string | null | undefined, cap: Capability): boolean {
  const r = String(role ?? "").toLowerCase() as AppRole
  if (!r) return false
  const denegadas = DENEGADAS[r]
  if (!denegadas) return false // rol desconocido: nada, por seguridad
  return !denegadas.includes(cap)
}

/** Varias capacidades a la vez: todas deben cumplirse. */
export function canAll(role: string | null | undefined, caps: Capability[]): boolean {
  return caps.every((c) => can(role, c))
}

/** Panel al que pertenece cada rol. */
export function homePathFor(role: string | null | undefined): string {
  switch (String(role ?? "").toLowerCase()) {
    case "admin":
      return "/admin"
    case "user":
      return "/user"
    case "almacen":
      return "/almacen"
    case "worker":
      return "/worker"
    default:
      return "/login"
  }
}
