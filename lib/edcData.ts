/**
 * RAFSA – Recolección de datos financieros para el Estado de Cuenta (EDC).
 *
 * Un solo punto que reúne, para un conjunto de obras, TODA la información
 * financiera que maneja el ERP: contrato, anticipo, fondo de garantía,
 * cotización + aditivas, estimaciones (con su neto a facturar), facturas y
 * cobros. Devuelve objetos EDCObra listos para el generador PDF.
 *
 * Se usa desde los dos botones "Generar EDC":
 *   - app/admin/projects/page.tsx            (por empresa)
 *   - app/admin/projects/[empresaId]/page.tsx (por obra)
 */

import { supabase } from "@/lib/supabaseClient"
import type { EDCObra, EDCEstimacion, EDCAditiva, EDCPago } from "@/lib/edcPdf"

type Concept = "deposit" | "advance" | "retention" | "return"

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Reúne los datos financieros de las obras indicadas.
 * @returns mapa obra_id → EDCObra (solo las obras encontradas).
 */
export async function fetchEDCObras(obraIds: string[]): Promise<Record<string, EDCObra>> {
  const out: Record<string, EDCObra> = {}
  if (!obraIds || obraIds.length === 0) return out

  const [obrasRes, billingRes, estRes, facRes, accRes] = await Promise.all([
    supabase
      .from("obras")
      .select(
        "id, code, name, client_name, location_text, status, contract_total_amount, anticipo_pct, anticipo_amount, anticipo_amount_paid, garantia_pct, garantia_amount, saldo_amount",
      )
      .in("id", obraIds),
    supabase
      .from("obra_billing_items")
      .select("id, obra_id, type, description, amount, date")
      .in("obra_id", obraIds)
      .order("date", { ascending: true }),
    supabase
      .from("obra_estimaciones")
      .select("id, obra_id, number, description, amount, status, is_anticipo")
      .in("obra_id", obraIds)
      .order("number", { ascending: true }),
    supabase
      .from("obra_facturas")
      .select("obra_id, estimacion_id, aditivo_id, invoice_number, amount, amount_paid, status")
      .in("obra_id", obraIds),
    supabase
      .from("obra_state_accounts")
      .select("obra_id, amount, concept, date")
      .in("obra_id", obraIds)
      .order("date", { ascending: true }),
  ])

  // ── Facturas por estimación / por aditiva + total facturado por obra ──
  type FacRow = {
    obra_id: string
    estimacion_id: string | null
    aditivo_id: string | null
    invoice_number: string | null
    amount: number | null
    amount_paid: number | null
    status: string | null
  }
  const facByEst: Record<string, FacRow> = {}
  const facByAditivo: Record<string, FacRow> = {}
  const facturadoMap: Record<string, number> = {}
  ;((facRes.data as FacRow[] | null) || []).forEach((f) => {
    facturadoMap[f.obra_id] = (facturadoMap[f.obra_id] || 0) + Number(f.amount || 0)
    if (f.estimacion_id) facByEst[f.estimacion_id] = f
    if (f.aditivo_id) facByAditivo[f.aditivo_id] = f
  })

  // ── Cotización vs Aditivas (por tipo de billing item) ──
  type BillRow = { id: string; obra_id: string; type: string | null; description: string | null; amount: number | null }
  const cotMap: Record<string, number> = {}
  const aditMap: Record<string, number> = {}
  const aditivasByObra: Record<string, EDCAditiva[]> = {}
  ;((billingRes.data as BillRow[] | null) || []).forEach((it) => {
    const amt = Number(it.amount || 0)
    if ((it.type || "").toLowerCase() === "aditivo") {
      aditMap[it.obra_id] = (aditMap[it.obra_id] || 0) + amt
      const fac = facByAditivo[it.id]
      if (!aditivasByObra[it.obra_id]) aditivasByObra[it.obra_id] = []
      aditivasByObra[it.obra_id].push({
        description: it.description || "Aditiva",
        amount: amt,
        facturaNumber: fac?.invoice_number ?? null,
        facturaAmount: fac ? Number(fac.amount || 0) : null,
        facturaPaid: fac ? Number(fac.amount_paid || 0) : 0,
        facturaStatus: fac?.status ?? null,
      })
    } else {
      cotMap[it.obra_id] = (cotMap[it.obra_id] || 0) + amt
    }
  })

  // ── Cobros (state accounts): neto + lista de movimientos ──
  type AccRow = { obra_id: string; amount: number | null; concept: Concept; date: string | null }
  const spentMap: Record<string, number> = {}
  const pagosMap: Record<string, EDCPago[]> = {}
  ;((accRes.data as AccRow[] | null) || []).forEach((a) => {
    const sign = a.concept === "return" ? -1 : 1
    spentMap[a.obra_id] = (spentMap[a.obra_id] || 0) + sign * Number(a.amount || 0)
    if (!pagosMap[a.obra_id]) pagosMap[a.obra_id] = []
    pagosMap[a.obra_id].push({ concept: a.concept, date: a.date, amount: Number(a.amount || 0) })
  })

  // ── Obras (meta + contrato) ──
  type ObraRow = {
    id: string
    code: string | null
    name: string
    client_name: string | null
    location_text: string | null
    status: string
    contract_total_amount: number | null
    anticipo_pct: number | null
    anticipo_amount: number | null
    anticipo_amount_paid: number | null
    garantia_pct: number | null
    garantia_amount: number | null
    saldo_amount: number | null
  }
  const obraById: Record<string, ObraRow> = {}
  ;((obrasRes.data as ObraRow[] | null) || []).forEach((o) => { obraById[o.id] = o })

  // ── Estimaciones por obra (con neto a facturar) ──
  type EstRow = {
    id: string
    obra_id: string
    number: number
    description: string | null
    amount: number | null
    status: string | null
    is_anticipo: boolean | null
  }
  const estByObra: Record<string, EDCEstimacion[]> = {}
  ;((estRes.data as EstRow[] | null) || []).forEach((e) => {
    const obra = obraById[e.obra_id]
    const garantiaPct = Number(obra?.garantia_pct ?? 0)
    const anticipoPct = Number(obra?.anticipo_pct ?? 0)
    const base = Number(e.amount || 0)
    const isAnticipo = !!e.is_anticipo

    const retencion = isAnticipo ? 0 : round2((base * garantiaPct) / 100)
    const amortizacion = isAnticipo ? 0 : round2((base * anticipoPct) / 100)
    const neto = isAnticipo ? base : round2(base - retencion - amortizacion)

    const fac = facByEst[e.id]
    const est: EDCEstimacion = {
      number: e.number,
      label: isAnticipo ? "Anticipo" : `#${e.number}`,
      description: e.description || (isAnticipo ? "Anticipo del contrato" : `Estimación ${e.number}`),
      isAnticipo,
      status: e.status || "pending",
      amount: base,
      retencion,
      amortizacion,
      neto,
      facturaNumber: fac?.invoice_number ?? null,
      facturaAmount: fac ? Number(fac.amount || 0) : null,
      facturaPaid: fac ? Number(fac.amount_paid || 0) : 0,
      facturaStatus: fac?.status ?? null,
    }
    if (!estByObra[e.obra_id]) estByObra[e.obra_id] = []
    estByObra[e.obra_id].push(est)
  })

  // ── Ensamblar EDCObra ──
  for (const id of obraIds) {
    const o = obraById[id]
    if (!o) continue
    const cotizacion = round2(cotMap[id] || 0)
    const aditivasTotal = round2(aditMap[id] || 0)
    const budget = round2(cotizacion + aditivasTotal)

    out[id] = {
      id: o.id,
      code: o.code,
      name: o.name,
      clientName: o.client_name,
      location: o.location_text || "Sin ubicación",
      status: o.status,

      contractTotal: Number(o.contract_total_amount || 0),
      cotizacion,
      aditivasTotal,
      budget,

      anticipoPct: Number(o.anticipo_pct || 0),
      anticipoAmount: Number(o.anticipo_amount || 0),
      anticipoPaid: Number(o.anticipo_amount_paid || 0),
      garantiaPct: Number(o.garantia_pct || 0),
      garantiaAmount: Number(o.garantia_amount || 0),
      saldoContrato: Number(o.saldo_amount || 0),

      estimaciones: estByObra[id] || [],
      aditivas: aditivasByObra[id] || [],
      facturadoTotal: round2(facturadoMap[id] || 0),

      spent: round2(spentMap[id] || 0),
      pagos: pagosMap[id] || [],
    }
  }

  return out
}
