/**
 * RAFSA – Borrado exhaustivo de obras (server-side, service role).
 *
 * Elimina TODO lo asociado a una o varias obras:
 *   • Archivos en storage: obra-facturas (facturas, estimaciones, garantía),
 *     state-account-evidence (evidencias de pagos), obra-docs (documentos),
 *     obra-nominas (PDFs de nómina), contracts y quotes.
 *   • Filas en todas las tablas hijas, en orden de dependencia.
 *   • Registros de almacén (inventory_orders / inventory_stock_movements) se
 *     DESLIGAN (obra_id = null) para conservar el historial de inventario.
 *
 * Requiere un cliente Supabase con SERVICE ROLE (omite RLS y políticas de storage).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

async function removeFiles(admin: any, bucket: string, paths: string[]) {
  const clean = Array.from(new Set(paths.filter(Boolean)))
  for (let i = 0; i < clean.length; i += 100) {
    const batch = clean.slice(i, i + 100)
    try {
      await admin.storage.from(bucket).remove(batch)
    } catch (e) {
      console.error(`[obraDeletion] remove storage ${bucket}:`, e)
    }
  }
}

/** Lista recursivamente todos los archivos bajo un prefijo (Supabase list no es recursivo). */
async function listAllFiles(admin: any, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = []
  const stack: string[] = [prefix]
  let guard = 0
  while (stack.length && guard < 5000) {
    guard++
    const p = stack.pop() as string
    let data: any[] | null = null
    try {
      const res = await admin.storage.from(bucket).list(p, { limit: 1000, sortBy: { column: "name", order: "asc" } })
      data = res.data
    } catch (e) {
      console.error(`[obraDeletion] list ${bucket}/${p}:`, e)
      continue
    }
    for (const item of data || []) {
      // En Supabase Storage, las "carpetas" vienen con id === null
      if (item && item.id === null) {
        stack.push(`${p}/${item.name}`)
      } else if (item && item.name) {
        out.push(`${p}/${item.name}`)
      }
    }
  }
  return out
}

/** Extrae el object path de un file_url (URL pública/firmada) para un bucket dado. */
function parseStoragePath(fileUrl: string | null, bucket: string): string | null {
  if (!fileUrl) return null
  const m = fileUrl.match(new RegExp(`/object/(?:public|sign)/${bucket}/([^?]+)`))
  if (m) return decodeURIComponent(m[1])
  // Si no es URL http, se asume que ya es el object path
  return fileUrl.startsWith("http") ? null : fileUrl
}

const ids = (rows: any[] | null | undefined, key = "id"): string[] =>
  (rows || []).map((r) => r?.[key]).filter(Boolean)

/**
 * Borra por completo el conjunto de obras indicado.
 * @throws si el DELETE final de obras falla.
 */
export async function deleteObrasCascade(admin: any, obraIds: string[]): Promise<void> {
  if (!obraIds || obraIds.length === 0) return

  // ── 1) Reunir ids de entidades hijas ──
  const [facturasRes, estRes, accRes, srRes, nomRes, docsRes, contractsRes, quotesRes] = await Promise.all([
    admin.from("obra_facturas").select("id").in("obra_id", obraIds),
    admin.from("obra_estimaciones").select("id").in("obra_id", obraIds),
    admin.from("obra_state_accounts").select("id").in("obra_id", obraIds),
    admin.from("site_reports").select("id").in("obra_id", obraIds),
    admin.from("obra_nominas").select("id, pdf_bucket, pdf_object_path").in("obra_id", obraIds),
    admin.from("obra_documents").select("bucket, object_path").in("obra_id", obraIds),
    admin.from("contracts").select("file_url").in("obra_id", obraIds),
    admin.from("quotes").select("file_url").in("obra_id", obraIds),
  ])

  const facturaIds = ids(facturasRes.data)
  const estIds = ids(estRes.data)
  const accIds = ids(accRes.data)
  const srIds = ids(srRes.data)
  const nomIds = ids(nomRes.data)

  // ── 2) Storage ──
  // obra-facturas: {obraId}/..., estimaciones/{obraId}/..., garantia/{obraId}-*
  const facturaBucketPaths: string[] = []
  for (const oid of obraIds) {
    facturaBucketPaths.push(...(await listAllFiles(admin, "obra-facturas", `${oid}`)))
    facturaBucketPaths.push(...(await listAllFiles(admin, "obra-facturas", `estimaciones/${oid}`)))
  }
  try {
    const garRes = await admin.storage.from("obra-facturas").list("garantia", { limit: 1000 })
    for (const f of garRes.data || []) {
      if (f?.name && obraIds.some((oid) => f.name.startsWith(`${oid}-`))) facturaBucketPaths.push(`garantia/${f.name}`)
    }
  } catch (e) {
    console.error("[obraDeletion] list garantia:", e)
  }
  await removeFiles(admin, "obra-facturas", facturaBucketPaths)

  // state-account-evidence: {obraId}/{accountId}/archivo
  const evPaths: string[] = []
  for (const oid of obraIds) evPaths.push(...(await listAllFiles(admin, "state-account-evidence", `${oid}`)))
  await removeFiles(admin, "state-account-evidence", evPaths)

  // obra_documents (bucket por fila, default obra-docs)
  const docByBucket: Record<string, string[]> = {}
  ;(docsRes.data || []).forEach((d: any) => {
    if (!d?.object_path) return
    const b = d.bucket || "obra-docs"
    ;(docByBucket[b] ||= []).push(d.object_path)
  })
  for (const [b, paths] of Object.entries(docByBucket)) await removeFiles(admin, b, paths)

  // obra_nominas (pdf_bucket, default obra-nominas)
  const nomByBucket: Record<string, string[]> = {}
  ;(nomRes.data || []).forEach((n: any) => {
    if (!n?.pdf_object_path) return
    const b = n.pdf_bucket || "obra-nominas"
    ;(nomByBucket[b] ||= []).push(n.pdf_object_path)
  })
  for (const [b, paths] of Object.entries(nomByBucket)) await removeFiles(admin, b, paths)

  // contracts / quotes (best-effort, parseando file_url)
  await removeFiles(admin, "contracts", (contractsRes.data || []).map((c: any) => parseStoragePath(c.file_url, "contracts")).filter(Boolean) as string[])
  await removeFiles(admin, "quotes", (quotesRes.data || []).map((q: any) => parseStoragePath(q.file_url, "quotes")).filter(Boolean) as string[])

  // ── 3) Filas de tablas hijas (orden de dependencia) ──
  const attRefIds = Array.from(new Set([...obraIds, ...facturaIds, ...estIds, ...accIds]))

  const steps: Array<Promise<any>> = []
  // attachments (polimórfica, sin FK): por ref_id de la obra y sus entidades
  if (attRefIds.length) steps.push(admin.from("attachments").delete().in("ref_id", attRefIds))
  await Promise.all(steps)

  // state_accounts (referencia facturas) antes que facturas
  await admin.from("obra_state_accounts").delete().in("obra_id", obraIds)
  await admin.from("obra_facturas").delete().in("obra_id", obraIds)
  await admin.from("obra_estimaciones").delete().in("obra_id", obraIds)
  await admin.from("obra_billing_items").delete().in("obra_id", obraIds)

  if (srIds.length) await admin.from("site_report_photos").delete().in("site_report_id", srIds)
  await admin.from("site_reports").delete().in("obra_id", obraIds)

  if (nomIds.length) await admin.from("obra_nomina_details").delete().in("nomina_id", nomIds)
  await admin.from("obra_nominas").delete().in("obra_id", obraIds)

  await admin.from("bajada_notifications").delete().in("obra_id", obraIds)
  await admin.from("obra_attendance").delete().in("obra_id", obraIds)
  await admin.from("worker_transfers").delete().in("from_obra_id", obraIds)
  await admin.from("worker_transfers").delete().in("to_obra_id", obraIds)
  await admin.from("obra_assignments").delete().in("obra_id", obraIds)
  await admin.from("quote_contract_checks").delete().in("obra_id", obraIds)
  await admin.from("contracts").delete().in("obra_id", obraIds)
  await admin.from("quotes").delete().in("obra_id", obraIds)
  await admin.from("obra_documents").delete().in("obra_id", obraIds)
  await admin.from("alerts").delete().in("obra_id", obraIds)

  // Almacén: desligar (conservar historial de inventario)
  await admin.from("inventory_stock_movements").update({ obra_id: null }).in("obra_id", obraIds)
  await admin.from("inventory_orders").update({ obra_id: null }).in("obra_id", obraIds)

  // ── 4) Finalmente, las obras ──
  const { error } = await admin.from("obras").delete().in("id", obraIds)
  if (error) throw new Error(error.message || "No se pudieron eliminar las obras.")
}
