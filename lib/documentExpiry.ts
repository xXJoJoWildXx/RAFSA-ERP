/**
 * Vigencia de los documentos del trabajador.
 *
 * Tres documentos caducan y hay que reponerlos. La duración de cada uno es
 * sólo una SUGERENCIA: llena el campo de un clic, pero el usuario puede
 * escribir la fecha que quiera antes de guardar, o dejarlo vacío.
 */

/** Claves con vigencia. Coinciden con folder_type (obra) y doc_type (expediente). */
export type DocumentoConVigencia = "dc3" | "medical_reports" | "tax_certificate"

export const VIGENCIAS: Record<
  DocumentoConVigencia,
  { meses: number; etiqueta: string }
> = {
  dc3:             { meses: 12, etiqueta: "1 año" },
  medical_reports: { meses: 3,  etiqueta: "3 meses" },
  tax_certificate: { meses: 12, etiqueta: "1 año" },
}

export function tieneVigencia(clave: string): clave is DocumentoConVigencia {
  return clave in VIGENCIAS
}

function hoyLocal(): Date {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0)
}

function aISO(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, "0")
  const dia = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mes}-${dia}`
}

function parseISO(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const partes = String(iso).split("T")[0]?.split("-")
  if (!partes || partes.length !== 3) return null
  const [y, m, d] = partes.map(Number)
  if (!y || !m || !d) return null
  const fecha = new Date(y, m - 1, d, 12, 0, 0, 0)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/**
 * Fecha sugerida de vencimiento: hoy + los meses del documento.
 *
 * setMonth() desborda solo (31 de enero + 1 mes = 3 de marzo), así que el día
 * se recorta al último del mes destino: 30 de noviembre + 3 meses es el 28 de
 * febrero, no el 2 de marzo.
 */
export function vencimientoSugerido(
  clave: DocumentoConVigencia,
  desde: Date = hoyLocal(),
): string {
  const meses = VIGENCIAS[clave].meses
  const destino = new Date(desde.getFullYear(), desde.getMonth() + meses, 1, 12, 0, 0, 0)
  const ultimoDiaDelMes = new Date(
    destino.getFullYear(),
    destino.getMonth() + 1,
    0,
  ).getDate()
  destino.setDate(Math.min(desde.getDate(), ultimoDiaDelMes))
  return aISO(destino)
}

export type EstadoVigencia = {
  estado: "sin_fecha" | "vigente" | "por_vencer" | "vencido"
  /** Días que faltan; negativo si ya venció. null si no hay fecha. */
  dias: number | null
  etiqueta: string
  /** Clases de la pill, en la paleta de la app. */
  clase: string
}

/** Un documento entra en "por vencer" 30 días antes, que es margen suficiente
 *  para tramitar la reposición sin que el trabajador quede descubierto. */
const DIAS_AVISO = 30

export function estadoVigencia(expiresOn: string | null | undefined): EstadoVigencia {
  const vence = parseISO(expiresOn)
  if (!vence) {
    return {
      estado: "sin_fecha",
      dias: null,
      etiqueta: "Sin vigencia",
      clase: "bg-slate-500/15 text-slate-400 border border-slate-500/25",
    }
  }

  const dias = Math.round((vence.getTime() - hoyLocal().getTime()) / 86_400_000)

  if (dias < 0) {
    const atraso = Math.abs(dias)
    return {
      estado: "vencido",
      dias,
      etiqueta: `Vencido hace ${atraso} ${atraso === 1 ? "día" : "días"}`,
      clase: "bg-red-500/15 text-red-400 border border-red-500/25",
    }
  }

  if (dias === 0) {
    return {
      estado: "por_vencer",
      dias,
      etiqueta: "Vence hoy",
      clase: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
    }
  }

  if (dias <= DIAS_AVISO) {
    return {
      estado: "por_vencer",
      dias,
      etiqueta: `Vence en ${dias} ${dias === 1 ? "día" : "días"}`,
      clase: "bg-amber-500/15 text-amber-400 border border-amber-500/25",
    }
  }

  return {
    estado: "vigente",
    dias,
    etiqueta: `Vigente hasta ${formatVencimiento(expiresOn)}`,
    clase: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25",
  }
}

/** "24 nov 2027" */
export function formatVencimiento(expiresOn: string | null | undefined): string {
  const d = parseISO(expiresOn)
  if (!d) return "—"
  return d.toLocaleDateString("es-MX", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  })
}

/** Fecha de hoy en ISO, para el `min` de los inputs de fecha. */
export function hoyISO(): string {
  return aISO(hoyLocal())
}
