// ═══════════════════════════════════════════════════════════════════════
// Edge Function: extract-contract-terms
// ─────────────────────────────────────────────────────────────────────────
// Descarga el PDF de un CONTRATO o de una COTIZACIÓN (obra_documents,
// doc_type 'contract' o 'quote'), lo manda a OpenAI con un JSON schema
// estricto y devuelve los términos financieros. Persiste el resultado en
// obra_documents.ai_extracted_json.
//
// Los dos tipos comparten esquema pero NO prompt: un contrato escribe cada
// cantidad en dígitos y letras y hay que cruzarlas; una cotización trae una
// tabla con SUB-TOTAL / IVA / TOTAL, donde el cruce es aritmético y mucho
// más confiable.
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
        iva_incluido: {
          type: ["boolean", "null"],
          description:
            "¿El monto del anticipo YA incluye IVA? true si el contrato lo dice expresamente junto a ESA cantidad (ej. 'ya con 16% incluido', 'IVA incluido'); false si dice '+ IVA' o 'más el IVA' junto a ESA cantidad; null si no lo aclara para este concepto en particular. NO copies aquí el iva_incluido general: respóndelo sólo con lo que diga el texto de este concepto.",
        },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras", "iva_incluido"],
    },
    saldo: {
      type: "object",
      additionalProperties: false,
      properties: {
        porcentaje: { type: "number", description: "Porcentaje del saldo restante. 0 si no aplica." },
        monto_digitos: { type: ["number", "null"], description: "Monto del saldo en DÍGITOS. 0 si no aplica; null si no se lee." },
        monto_letras: { type: ["number", "null"], description: "Monto del saldo CON LETRA, convertido a número. 0 si no aplica; null si no aparece en letra." },
        iva_incluido: {
          type: ["boolean", "null"],
          description:
            "¿El monto del saldo YA incluye IVA? true si el contrato lo dice expresamente junto a ESA cantidad (ej. 'ya con 16% incluido', 'IVA incluido'); false si dice '+ IVA' o 'más el IVA' junto a ESA cantidad; null si no lo aclara para este concepto en particular. NO copies aquí el iva_incluido general: respóndelo sólo con lo que diga el texto de este concepto.",
        },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras", "iva_incluido"],
    },
    garantia: {
      type: "object",
      additionalProperties: false,
      properties: {
        porcentaje: { type: "number", description: "Porcentaje del fondo/retención de garantía. 0 si no aplica." },
        monto_digitos: { type: ["number", "null"], description: "Monto de la garantía en DÍGITOS. 0 si no aplica; null si no se lee." },
        monto_letras: { type: ["number", "null"], description: "Monto de la garantía CON LETRA, convertido a número. 0 si no aplica; null si no aparece en letra." },
        iva_incluido: {
          type: ["boolean", "null"],
          description:
            "¿El monto de la garantía YA incluye IVA? true si el contrato lo dice expresamente junto a ESA cantidad (ej. 'ya con 16% incluido', 'IVA incluido'); false si dice '+ IVA' o 'más el IVA' junto a ESA cantidad; null si no lo aclara para este concepto en particular. NO copies aquí el iva_incluido general: respóndelo sólo con lo que diga el texto de este concepto.",
        },
      },
      required: ["porcentaje", "monto_digitos", "monto_letras", "iva_incluido"],
    },
    fecha_inicio: {
      type: ["string", "null"],
      description: "Fecha de inicio en formato YYYY-MM-DD, o null.",
    },
    fecha_termino: {
      type: ["string", "null"],
      description: "Fecha de término/entrega en formato YYYY-MM-DD, o null.",
    },
    subtotal: {
      type: ["number", "null"],
      description:
        "SOLO cotizaciones: el SUB-TOTAL (suma de partidas, sin IVA) tal como aparece. null en contratos o si no viene.",
    },
    iva_monto: {
      type: ["number", "null"],
      description:
        "SOLO cotizaciones: el importe del IVA tal como aparece en el renglón 'IVA'. null si no viene.",
    },
    total_con_iva: {
      type: ["number", "null"],
      description:
        "SOLO cotizaciones: el TOTAL del documento (subtotal + IVA). null si no viene.",
    },
    vigencia: {
      type: ["string", "null"],
      description:
        "SOLO cotizaciones: fecha de vigencia / validez de la cotización en formato YYYY-MM-DD. null si no aparece.",
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
    "subtotal",
    "iva_monto",
    "total_con_iva",
    "vigencia",
    "confianza",
  ],
}

const SYSTEM_PROMPT = `Eres un asistente experto en contratos de obra a precio alzado en México.
Extrae ÚNICAMENTE los términos financieros del contrato adjunto y devuélvelos en el esquema JSON solicitado.

Reglas GENERALES:
- Los datos pueden estar dispersos entre cláusulas o declaraciones, no necesariamente en una tabla resumen. El formato varía mucho entre empresas.
- El contrato puede venir ESCANEADO (fotos de las hojas) y con las páginas desordenadas. Revísalas todas y no supongas que la cláusula del monto está antes que la del anticipo.
- Puede haber texto en MAYÚSCULAS, subrayado o en negritas; eso no cambia su significado.
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

IVA — LÉELO POR SEPARADO EN CADA CANTIDAD (error frecuente):
- Un mismo contrato PUEDE mezclar regímenes: el monto total sin IVA y el anticipo ya con IVA. NO asumas que todas las cantidades van igual.
- iva_incluido (el general) describe ÚNICAMENTE el monto total: false cuando la cláusula del monto diga "más el IVA" / "+ IVA" / "MÁS EL IMPUESTO AL VALOR AGREGADO"; true cuando diga "IVA incluido" / "incluido el Impuesto al Valor Agregado".
- anticipo.iva_incluido, saldo.iva_incluido y garantia.iva_incluido describen CADA UNO su propia cantidad. Respóndelos SÓLO con lo que diga el texto pegado a esa cantidad:
  · true  → "ya con 16% incluido", "IVA incluido", "con IVA".
  · false → "más IVA", "+ IVA", "más el impuesto al valor agregado".
  · null  → el contrato no lo aclara para ese concepto. NO adivines y NO copies el valor general.
- Ejemplo real: la cláusula del monto dice "...dando un monto de 1,637,600.00 ... MÁS EL IMPUESTO AL VALOR AGREGADO" (iva_incluido = false) y más adelante el anticipo dice "LA CANTIDAD DE $1,000,000.00 ... CORRESPONDIENTES AL 52.64%, YA CON 16% INCLUIDO" (anticipo.iva_incluido = true). Son distintos y así hay que reportarlos.
- El PORCENTAJE no cambia con el IVA: 52.64% del total es 52.64% lo midas sobre la base o sobre el total con IVA. No "corrijas" el porcentaje por el IVA.

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

const QUOTE_PROMPT = `Eres un asistente experto en cotizaciones de obra de RAFSA (Recubrimientos Técnicos RAF S.A. de C.V.).
Extrae ÚNICAMENTE los datos financieros de la cotización adjunta y devuélvelos en el esquema JSON solicitado.

QUIÉN ES QUIÉN (no los inviertas):
- RAFSA / "Recubrimientos Técnicos RAF" es QUIEN COTIZA. NUNCA es el cliente.
- cliente = la razón social que aparece después de "CLIENTE:" (por ejemplo "JAMAR ESTRUCTURAS S.A. DE C.V." o "CUSHMAN & WAKEFIELD").
- Ignora el renglón "SOLICITA:" (es la persona de contacto) y el de "ELABORÓ:" (es de RAFSA).

CAMPOS DE CABECERA:
- nombre_obra = lo que dice "PROYECTO:" (ej. "PLATAFORMA PARK NAVE 4 - GDL - RAFSA 020").
- folio_contrato = lo que dice "FOLIO:" o el código arriba a la derecha (ej. "NO.CLIENT/2026/000020"). Cópialo tal cual.
- ubicacion = la ubicación DE LA OBRA si se menciona. OJO: la dirección del pie de página (Av. Sebastián Bach 4978, Zapopan) es el domicilio de RAFSA, NO la obra. Si no se indica dónde se ejecuta, devuelve null.
- fecha_inicio / fecha_termino: una cotización normalmente NO las trae ("7 días hábiles una vez recibido el anticipo" no es una fecha). Devuelve null salvo que haya fechas concretas.
- vigencia = la fecha que aparece como "VIGENCIA:" en formato YYYY-MM-DD, o null.

MONTOS — la cotización trae una tabla de totales al final:
- subtotal      = el renglón "SUB-TOTAL" (suma de partidas, SIN IVA).
- iva_monto     = el renglón "IVA" o "IVA (16%)".
- total_con_iva = el renglón "TOTAL".
- Transcribe los tres tal como están impresos, sin recalcular ni redondear. Si alguno no aparece, null.
- monto_total_digitos = el TOTAL (el que ya incluye IVA), porque es el importe real del trabajo contratado.
- monto_total_letras = null. Las cotizaciones NO escriben las cantidades con letra; no intentes deducirlas.
- iva_incluido = true. El TOTAL que reportas ya trae el IVA.
  (La leyenda "SE INCLUIRÁ EL IVA AL FACTURAR" se refiere a que los precios unitarios de la tabla van sin IVA; el renglón TOTAL sí lo incluye.)

ANTICIPO:
- En "CONDICIONES GENERALES" suele venir "ANTICIPO: SE SOLICITA EL 30% DEL TOTAL DE LOS TRABAJOS".
- anticipo.porcentaje = ese número (30). anticipo.monto_digitos y monto_letras = null: la cotización da el porcentaje, no el importe; el sistema lo calcula.
- Si no se menciona anticipo: { "porcentaje": 0, "monto_digitos": 0, "monto_letras": 0 }.

SALDO Y GARANTÍA:
- Las cotizaciones casi nunca los traen. Si no aparecen, devuelve 0 en los tres campos de cada uno. NO los inventes ni los deduzcas del anticipo.

OTROS:
- Las partidas o conceptos de la tabla NO se extraen; sólo interesan los totales.
- confianza refleja qué tan seguro estás (0 a 1). Si subtotal + iva no da exactamente el total impreso, baja la confianza.`

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

  // 1) Validar sesión + rol de oficina
  // Cada llamada consume créditos de OpenAI, así que no se deja abierta:
  // sólo admin y el personal de administración ('user'), que es quien
  // mantiene al día la información de la plataforma.
  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) {
    return json({ error: "No autenticado." }, 401)
  }
  const { data: appUser } = await userClient
    .from("app_users")
    .select("role, is_active")
    .eq("id", userData.user.id)
    .single()
  const rol = String(appUser?.role ?? "").toLowerCase()
  if (appUser?.is_active === false || (rol !== "admin" && rol !== "user")) {
    return json({ error: "Tu rol no puede extraer datos de documentos." }, 403)
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
  const esCotizacion = doc.doc_type === "quote"
  if (doc.doc_type !== "contract" && !esCotizacion) {
    return json({ error: "El documento no es un contrato ni una cotización." }, 400)
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
          { role: "system", content: esCotizacion ? QUOTE_PROMPT : SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: esCotizacion
                  ? "Extrae los datos financieros de esta cotización."
                  : "Extrae los términos financieros de este contrato.",
              },
              {
                type: "input_file",
                filename: doc.file_name || (esCotizacion ? "cotizacion.pdf" : "contrato.pdf"),
                file_data: `data:application/pdf;base64,${base64}`,
              },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: esCotizacion ? "quote_terms" : "contract_terms",
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
    extracted = esCotizacion ? consolidateCotizacion(extracted) : consolidateMontos(extracted)
    extracted.doc_kind = esCotizacion ? "quote" : "contract"

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

const IVA_RATE = 0.16
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

    // El cálculo (total × %) sale en el régimen de IVA DEL TOTAL. Si este
    // concepto viene en el otro régimen, hay que convertirlo antes de
    // compararlo: si no, el cálculo nunca coincide con lo leído y todo
    // queda marcado "sin consenso" por una diferencia del 16%.
    const nodoIva = typeof node.iva_incluido === "boolean" ? node.iva_incluido : null
    let calc = total !== null && total > 0 && pct > 0 ? round2((total * pct) / 100) : null
    if (calc !== null && nodoIva !== null && nodoIva !== data.iva_incluido) {
      calc = nodoIva ? round2(calc * (1 + IVA_RATE)) : round2(calc / (1 + IVA_RATE))
    }

    // Prioridad: letras → dígitos → cálculo
    const vote = voteAmount([let_, dig, calc])
    node.monto = vote.value ?? 0
    node.monto_calc = calc
    // Se conserva el régimen efectivo del concepto para que el frontend
    // sepa si ese monto ya trae IVA o no. null = el mismo que el total.
    node.iva_incluido_efectivo = nodoIva === null ? !!data.iva_incluido : nodoIva
    node.monto_source = vote.agreed ? "consenso" : "sin_consenso"
  }
  return data
}

/**
 * Consolidación de una COTIZACIÓN.
 *
 * Aquí no hay dígitos-contra-letras que cruzar, pero hay algo mejor: la
 * tabla de totales se verifica sola. subtotal + IVA tiene que dar el total,
 * y el IVA tiene que ser el 16% del subtotal. Si las dos cuentas cuadran,
 * la lectura es correcta; si no, se marca para que el admin la revise.
 */
function consolidateCotizacion(data: any): any {
  if (!data || typeof data !== "object") return data

  const subtotal = toNum(data.subtotal)
  const iva = toNum(data.iva_monto)
  const totalDoc = toNum(data.total_con_iva)
  const totalLeido = toNum(data.monto_total_digitos)

  // El importe que se captura es el TOTAL: el ERP maneja todo con IVA.
  const total = totalDoc ?? totalLeido ?? null
  data.monto_total = total ?? 0
  data.iva_incluido = true // el total ya lo trae

  // ── Las dos comprobaciones ──
  const cuadraSuma =
    subtotal !== null && iva !== null && total !== null
      ? Math.abs(round2(subtotal + iva) - total) < 0.02
      : null
  const cuadraTasa =
    subtotal !== null && total !== null
      ? Math.abs(round2(subtotal * 1.16) - total) < 0.02
      : null

  data.checks = { subtotal, iva, total, cuadra_suma: cuadraSuma, cuadra_tasa: cuadraTasa }
  data.monto_total_source =
    cuadraSuma === true && cuadraTasa === true ? "consenso" : "sin_consenso"

  // ── Anticipo: la cotización da el porcentaje, el monto se calcula ──
  for (const key of ["anticipo", "saldo", "garantia"]) {
    const node = data[key]
    if (!node || typeof node !== "object") continue
    const pct = toNum(node.porcentaje) ?? 0
    const dig = toNum(node.monto_digitos)

    if (pct <= 0 && !dig) {
      node.porcentaje = 0
      node.monto = 0
      node.monto_source = "n/a"
      continue
    }
    const calc = total !== null && total > 0 && pct > 0 ? round2((total * pct) / 100) : null
    // Si el documento trae importe, manda ese; si no, el calculado
    const vote = voteAmount([dig, calc])
    node.monto = vote.value ?? 0
    node.monto_calc = calc
    node.monto_source = dig === null && calc !== null ? "calculado" : vote.agreed ? "consenso" : "sin_consenso"
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
