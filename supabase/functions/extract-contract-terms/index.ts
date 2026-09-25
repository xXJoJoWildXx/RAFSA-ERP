// ═══════════════════════════════════════════════════════════════════════
// Edge Function: extract-contract-terms
// ─────────────────────────────────────────────────────────────────────────
// Descarga el PDF de un contrato (obra_documents, doc_type = 'contract'),
// lo manda a OpenAI con un JSON schema estricto y devuelve los términos
// financieros. Persiste el resultado en obra_documents.ai_extracted_json.
//
// Requiere el secret:  OPENAI_API_KEY
//   supabase secrets set OPENAI_API_KEY=sk-...
//
// Deploy:
//   supabase functions deploy extract-contract-terms
//
// Invocación desde el front:
//   supabase.functions.invoke("extract-contract-terms", { body: { document_id } })
// ═══════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? ""
const OPENAI_MODEL = Deno.env.get("OPENAI_CONTRACT_MODEL") ?? "gpt-4o"
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? ""
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

// ─── JSON schema que la IA DEBE devolver (idéntico en front) ───
const CONTRACT_TERMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    cliente: {
      type: ["string", "null"],
      description:
        "Nombre del cliente / CONTRATANTE (la parte que encarga y paga la obra). Razón social tal cual aparece.",
    },
    ubicacion: {
      type: ["string", "null"],
      description:
        "Ubicación / domicilio donde se ejecutará la obra (el Inmueble), lo más completa posible.",
    },
    folio_contrato: {
      type: ["string", "null"],
      description:
        "Folio o número de identificación del contrato (ej. 'NPPIB-CO025-001-148'), usualmente en el encabezado de las páginas.",
    },
    nombre_obra: {
      type: ["string", "null"],
      description:
        "Nombre u objeto de la obra: descripción breve de los trabajos (ej. 'Resanes, pintura y sellado de muros tilt up en nave 06').",
    },
    monto_total_digitos: {
      type: ["number", "null"],
      description:
        "Monto total del contrato / precio alzado, BASE SIN IVA, tal como aparece en DÍGITOS (ej. 6024114.00). null si no lo lees.",
    },
    monto_total_letras: {
      type: ["number", "null"],
      description:
        "El MISMO monto total pero leyendo la cantidad escrita CON LETRA y convirtiéndola a número (ej. 'seis millones veinticuatro mil ciento catorce pesos 00/100' → 6024114.00). null si no aparece en letra.",
    },
    moneda: { type: "string", enum: ["MXN", "USD", "EUR"] },
    iva_incluido: {
      type: "boolean",
      description:
        "true si el monto total YA incluye el IVA; false si el contrato dice '+ IVA' o 'más el IVA correspondiente'.",
    },
    anticipo: {
      type: "object",
      additionalProperties: false,
      properties: {
        porcentaje: { type: "number", description: "Porcentaje del anticipo. 0 si el contrato no contempla anticipo." },
        monto_digitos: { type: ["number", "null"], description: "Monto del anticipo en DÍGITOS. 0 si no hay anticipo; null si no se lee." },
        monto_letras: { type: ["number", "null"], description: "Monto del anticipo escrito CON LETRA, convertido a número. 0 si no hay anticipo; null si no aparece en letra." },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras"],
    },
    saldo: {
      type: "object",
      additionalProperties: false,
      properties: {
        porcentaje: { type: "number", description: "Porcentaje del saldo restante. 0 si no aplica." },
        monto_digitos: { type: ["number", "null"], description: "Monto del saldo en DÍGITOS. 0 si no aplica; null si no se lee." },
        monto_letras: { type: ["number", "null"], description: "Monto del saldo CON LETRA, convertido a número. 0 si no aplica; null si no aparece en letra." },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras"],
    },
    garantia: {
      type: "object",
      additionalProperties: false,
      properties: {
        porcentaje: { type: "number", description: "Porcentaje del fondo/retención de garantía. 0 si no aplica." },
        monto_digitos: { type: ["number", "null"], description: "Monto de la garantía en DÍGITOS. 0 si no aplica; null si no se lee." },
        monto_letras: { type: ["number", "null"], description: "Monto de la garantía CON LETRA, convertido a número. 0 si no aplica; null si no aparece en letra." },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras"],
    },
    fecha_inicio: {
      type: ["string", "null"],
      description: "Fecha de inicio en formato YYYY-MM-DD, o null.",
    },
    fecha_termino: {
      type: ["string", "null"],
      description: "Fecha de término/entrega en formato YYYY-MM-DD, o null.",
    },
    confianza: {
      type: "number",
      description: "Confianza global de la extracción, de 0 a 1.",
    },
  },
  required: [
    "cliente",
    "ubicacion",
    "folio_contrato",
    "nombre_obra",
    "monto_total_digitos",
    "monto_total_letras",
    "moneda",
    "iva_incluido",
    "anticipo",
    "saldo",
    "garantia",
    "fecha_inicio",
    "fecha_termino",
    "confianza",
  ],
}

const SYSTEM_PROMPT = `Eres un asistente experto en contratos de obra a precio alzado en México.
Extrae ÚNICAMENTE los términos financieros del contrato adjunto y devuélvelos en el esquema JSON solicitado.

Reglas GENERALES:
- Los datos pueden estar dispersos entre cláusulas o declaraciones, no necesariamente en una tabla resumen. El formato varía mucho entre empresas.
- El contrato puede llamar a las partes "LA/EL CONTRATANTE" y "LA/EL CONTRATISTA", con o sin artículo.

CLIENTE (obligatorio identificar bien):
- cliente = la razón social de la parte CONTRATANTE (quien encarga y paga la obra), NO el CONTRATISTA (quien ejecuta; suele ser "RECUBRIMIENTOS TÉCNICOS RAF S.A. DE C.V." — esa NUNCA es el cliente).
- Búscalo en el primer párrafo/declaraciones ("...celebran por una parte LA SOCIEDAD ... a quien se denominará LA CONTRATANTE...") y confírmalo en la sección de firmas.

UBICACIÓN (cuidado, es fácil confundirla):
- ubicacion = domicilio o lugar del INMUEBLE / OBRA donde se ejecutan físicamente los trabajos (calle, número, colonia, municipio, estado). Suele venir en la declaración del "Inmueble" o del objeto (ej. "el Inmueble tiene su ingreso o acceso por la calle...").
- NO uses el domicilio fiscal ni las oficinas de la CONTRATANTE, NI la dirección donde se pagan las estimaciones (ej. "los pagos se cubrirán en las oficinas de la CONTRATANTE ubicadas en..."). Esa NO es la ubicación de la obra.
- Si hay varias direcciones, elige la del lugar físico donde se realiza la obra.

FOLIO:
- folio_contrato = el número/folio identificador del contrato. Revisa el ENCABEZADO y PIE de TODAS las páginas y el título. Formatos muy variados, por ejemplo: "NPPIB-CO025-001-148", "NPPIBCO026001184", "CONTRATO NÚMERO/1218547/2026", "2429/TENSA-HINES PIT 5". Cópialo tal cual.

NOMBRE:
- nombre_obra = objeto o descripción breve de los trabajos (ej. "Resanes, pintura y sellado de muros tilt up nave 06").

MONTOS — LEE DÍGITOS Y LETRAS POR SEPARADO (muy importante):
- Números sin símbolos ni comas (ej. "$6'024,114.00 pesos" → 6024114.00).
- Los contratos casi siempre escriben cada cantidad DOS veces: en dígitos y en letra (ej. "$1,807,234.83 (un millón ochocientos siete mil doscientos treinta y cuatro pesos 83/100 M.N.)").
- Para el monto total y para el monto de anticipo/saldo/garantía, reporta AMBAS lecturas por separado:
  · *_digitos = la cantidad tal como está escrita en NÚMERO.
  · *_letras  = la MISMA cantidad pero leyendo el texto CON LETRA y convirtiéndolo a número (incluye los centavos: "83/100" → .83).
- Léelas de forma independiente; NO copies una en la otra. Si una de las dos no aparece o no se alcanza a leer, pon null en ESA (no inventes).
- NO redondees ni recalcules: transcribe lo que dice el documento. El cruce lo hace el sistema.
- "Precio alzado", "importe total", "contraprestación" o "monto del contrato" → monto total.
- iva_incluido = false cuando el contrato diga "más el IVA" / "+ IVA"; = true cuando diga "IVA incluido" / "incluido el Impuesto al Valor Agregado".

ANTICIPO / SALDO / GARANTÍA (pueden NO existir):
- El anticipo suele ser un % del precio alzado (ej. 30%). El saldo restante es el % complementario pagado contra estimaciones (ej. 70%). El fondo/retención de garantía suele ser un % (ej. 5%) que se retiene.
- IMPORTANTE: si el contrato NO contempla anticipo (ej. pago en una sola exhibición, o pago solo por estimaciones), devuelve anticipo = { "porcentaje": 0, "monto_digitos": 0, "monto_letras": 0 }.
- Si NO contempla fondo/retención de garantía: garantia = { "porcentaje": 0, "monto_digitos": 0, "monto_letras": 0 }.
- Si NO hay esquema de saldo restante: saldo = { "porcentaje": 0, "monto_digitos": 0, "monto_letras": 0 }.
- NO inventes montos: si el concepto no existe en el contrato, es 0.

OTROS:
- Para cliente, ubicacion, folio_contrato, nombre_obra, fechas: si de plano no aparecen en el contrato, devuelve null (no inventes).
- Fechas en formato YYYY-MM-DD.
- confianza refleja qué tan seguro estás de la extracción completa (0 a 1).`

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }
  if (!OPENAI_API_KEY) {
    return json({ error: "Falta configurar OPENAI_API_KEY en la función." }, 500)
  }

  // Cliente con el JWT del usuario (para validar admin bajo RLS)
  const authHeader = req.headers.get("Authorization") ?? ""
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
    global: { headers: { Authorization: authHeader } },
  })
  // Cliente service-role (para Storage privado y escritura garantizada)
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let documentId: string | null = null
  try {
    const body = await req.json()
    documentId = body?.document_id ?? null
  } catch {
    return json({ error: "Body inválido. Se espera { document_id }." }, 400)
  }
  if (!documentId) {
    return json({ error: "Falta document_id." }, 400)
  }

  // 1) Validar sesión + rol admin
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: "No autenticado." }, 401)
  }
  const { data: appUser } = await userClient
    .from("app_users")
    .select("role")
    .eq("id", userData.user.id)
    .single()
  if (String(appUser?.role ?? "").toLowerCase() !== "admin") {
    return json({ error: "Solo un admin puede extraer datos del contrato." }, 403)
  }

  // 2) Cargar el documento
  const { data: doc, error: docErr } = await admin
    .from("obra_documents")
    .select("id, obra_id, doc_type, bucket, object_path, file_name")
    .eq("id", documentId)
    .single()
  if (docErr || !doc) {
    return json({ error: "Documento no encontrado." }, 404)
  }
  if (doc.doc_type !== "contract") {
    return json({ error: "El documento no es un contrato." }, 400)
  }

  // Marcar como procesando
  await admin
    .from("obra_documents")
    .update({ ai_status: "processing", ai_error: null })
    .eq("id", doc.id)

  try {
    // 3) Descargar el PDF de Storage
    const { data: fileBlob, error: dlErr } = await admin.storage
      .from(doc.bucket)
      .download(doc.object_path)
    if (dlErr || !fileBlob) {
      throw new Error("No se pudo descargar el PDF del Storage.")
    }
    const buf = new Uint8Array(await fileBlob.arrayBuffer())
    const base64 = base64FromBytes(buf)

    // 4) Llamar a OpenAI (Responses API con input_file PDF + JSON schema estricto)
    const openaiRes = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        input: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "Extrae los términos financieros de este contrato.",
              },
              {
                type: "input_file",
                filename: doc.file_name || "contrato.pdf",
                file_data: `data:application/pdf;base64,${base64}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "contract_terms",
            strict: true,
            schema: CONTRACT_TERMS_SCHEMA,
          },
        },
      }),
    })

    if (!openaiRes.ok) {
      const errText = await openaiRes.text()
      throw new Error(`OpenAI error ${openaiRes.status}: ${errText.slice(0, 500)}`)
    }

    const payload = await openaiRes.json()
    const rawText = extractOutputText(payload)
    if (!rawText) throw new Error("OpenAI no devolvió contenido.")

    let extracted: any
    try {
      extracted = JSON.parse(rawText)
    } catch {
      throw new Error("La respuesta de OpenAI no es JSON válido.")
    }

    // 4.5) Consolidar montos por VOTACIÓN de 3 fuentes: dígitos, letras y
    // cálculo (total × %). Gana el valor en que coincidan 2 o más; si no hay
    // consenso, prioriza letras → dígitos → cálculo, y marca "sin consenso"
    // para que el admin lo revise. Esto evita tanto errores de OCR en un
    // dígito como discrepancias por redondeo del cálculo.
    extracted = consolidateMontos(extracted)

    // 5) Persistir resultado
    await admin
      .from("obra_documents")
      .update({
        ai_status: "done",
        ai_model: OPENAI_MODEL,
        ai_extracted_json: extracted,
        ai_error: null,
      })
      .eq("id", doc.id)

    return json({ ok: true, document_id: doc.id, data: extracted })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error desconocido."
    await admin
      .from("obra_documents")
      .update({ ai_status: "error", ai_error: message })
      .eq("id", doc.id)
    return json({ error: message }, 500)
  }
})

// ─── Helpers ───

const round2 = (n: number) => Math.round(n * 100) / 100

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? round2(n) : null
}

/**
 * Vota entre candidatos ordenados por prioridad (el primero es el más autoritativo).
 * - Si dos o más coinciden (±0.005) → gana ese valor, agreed=true.
 * - Si ninguno coincide → gana el primer candidato disponible (por prioridad), agreed=false.
 * - Si no hay candidatos → value=null.
 */
function voteAmount(cands: (number | null)[]): { value: number | null; agreed: boolean } {
  const vals = cands.filter((v): v is number => v !== null)
  for (let i = 0; i < vals.length; i++) {
    for (let j = i + 1; j < vals.length; j++) {
      if (Math.abs(vals[i] - vals[j]) < 0.005) return { value: vals[i], agreed: true }
    }
  }
  return { value: vals.length ? vals[0] : null, agreed: false }
}

/**
 * Consolida montos: monto_total (dígitos vs letras) y anticipo/saldo/garantía
 * (letras vs dígitos vs cálculo total×%). Deja los campos finales que consume
 * el frontend (monto_total, anticipo.monto, ...) y un flag *_source.
 */
function consolidateMontos(data: any): any {
  if (!data || typeof data !== "object") return data

  // Monto total: prioridad letras → dígitos (sin cálculo posible)
  const totalVote = voteAmount([toNum(data.monto_total_letras), toNum(data.monto_total_digitos)])
  const total = totalVote.value
  data.monto_total = total ?? 0
  data.monto_total_source = totalVote.agreed ? "consenso" : "sin_consenso"

  for (const key of ["anticipo", "saldo", "garantia"]) {
    const node = data[key]
    if (!node || typeof node !== "object") continue
    const pct = toNum(node.porcentaje) ?? 0
    const dig = toNum(node.monto_digitos)
    const let_ = toNum(node.monto_letras)

    // Concepto ausente
    if (pct <= 0 && !dig && !let_) {
      node.porcentaje = 0
      node.monto = 0
      node.monto_source = "n/a"
      continue
    }

    const calc = total !== null && total > 0 && pct > 0 ? round2((total * pct) / 100) : null
    // Prioridad: letras → dígitos → cálculo
    const vote = voteAmount([let_, dig, calc])
    node.monto = vote.value ?? 0
    node.monto_calc = calc
    node.monto_source = vote.agreed ? "consenso" : "sin_consenso"
  }
  return data
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

// La Responses API expone el texto en output[].content[].text.
// Este helper lo recolecta de forma tolerante.
function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text
  }
  const parts: string[] = []
  for (const item of payload?.output ?? []) {
    for (const c of item?.content ?? []) {
      if (typeof c?.text === "string") parts.push(c.text)
    }
  }
  return parts.join("").trim()
}
