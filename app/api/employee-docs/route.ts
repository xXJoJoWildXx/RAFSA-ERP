import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs" // necesario para Buffer/Storage en Next

// ⚠️ SERVICE ROLE KEY SOLO EN SERVER
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_EMPLOYEE_DOCS = "employee-documents"

type EmployeeDocType =
  | "tax_certificate"
  | "birth_certificate"
  | "imss"
  | "curp"
  | "ine"
  | "address_proof"
  | "profile_photo"

type EmployeeDocumentRow = {
  id?: string
  employee_id: string
  doc_type: EmployeeDocType
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  created_at?: string
  updated_at?: string
}

function safeFileExt(fileName: string) {
  const parts = fileName.split(".")
  if (parts.length <= 1) return ""
  const ext = parts[parts.length - 1].toLowerCase().replace(/[^a-z0-9]/g, "")
  return ext ? `.${ext}` : ""
}

function sanitizeFileBaseName(fileName: string) {
  const base = fileName.replace(/\.[^/.]+$/, "")
  return (
    base
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-_]/g, "")
      .slice(0, 60) || "archivo"
  )
}

function isValidDocType(docType: string): docType is EmployeeDocType {
  return [
    "tax_certificate",
    "birth_certificate",
    "imss",
    "curp",
    "ine",
    "address_proof",
    "profile_photo",
  ].includes(docType)
}

async function createSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(BUCKET_EMPLOYEE_DOCS)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

async function deleteFromStorage(path: string) {
  const { error } = await supabase.storage.from(BUCKET_EMPLOYEE_DOCS).remove([path])
  if (error) throw error
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json(
        { error: "Falta employeeId en query params." },
        { status: 400 },
      )
    }

    // 1) Traer documentos de DB
    const { data, error } = await supabase
      .from("employee_documents")
      .select("id, employee_id, doc_type, storage_bucket, storage_path, file_name, mime_type, file_size, created_at, updated_at")
      .eq("employee_id", employeeId)

    if (error) {
      console.error("GET employee_documents DB error:", error)
      return NextResponse.json(
        { error: "Error consultando employee_documents", details: error.message },
        { status: 500 },
      )
    }

    const documents = (data || []) as EmployeeDocumentRow[]

    // 2) Crear signed urls por doc_type
    const signed_urls: Partial<Record<EmployeeDocType, string>> = {}

    // hacemos signed urls solo para los docs existentes
    await Promise.all(
      documents.map(async (d) => {
        try {
          const url = await createSignedUrl(d.storage_path, 60 * 30) // 30 min
          signed_urls[d.doc_type] = url
        } catch (e) {
          console.error("Signed URL error for:", d.doc_type, e)
        }
      }),
    )

    // 3) Foto de perfil (si existe el doc_type profile_photo, usamos su signed url)
    const profilePhotoRow = documents.find((d) => d.doc_type === "profile_photo")
    const profile_photo_url = profilePhotoRow ? signed_urls.profile_photo ?? null : null

    return NextResponse.json({
      documents,
      signed_urls,
      profile_photo_url,
    })
  } catch (err: any) {
    console.error("GET /employee-documents unexpected error:", err)
    return NextResponse.json(
      { error: "Error inesperado en GET", message: err?.message },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const employeeId = formData.get("employeeId") as string | null
    const docTypeRaw = formData.get("docType") as string | null
    const file = formData.get("file") as File | null

    if (!employeeId || !docTypeRaw || !file) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (employeeId, docType, file)." },
        { status: 400 },
      )
    }

    if (!isValidDocType(docTypeRaw)) {
      return NextResponse.json(
        { error: "docType inválido." },
        { status: 400 },
      )
    }

    const docType: EmployeeDocType = docTypeRaw

    // 1) Si ya existe un doc para este employee+docType, borramos el anterior (Storage) para permitir "reemplazo"
    const { data: existing, error: existingErr } = await supabase
      .from("employee_documents")
      .select("id, storage_path")
      .eq("employee_id", employeeId)
      .eq("doc_type", docType)
      .maybeSingle()

    if (existingErr) {
      console.error("POST check existing doc error:", existingErr)
      return NextResponse.json(
        { error: "Error validando documento existente", details: existingErr.message },
        { status: 500 },
      )
    }

    if (existing?.storage_path) {
      try {
        await deleteFromStorage(existing.storage_path)
      } catch (e) {
        // si falla el delete, no detenemos por completo (pero lo registramos)
        console.error("Warning: could not delete old storage file:", e)
      }
    }

    // 2) Subir nuevo archivo a Storage
    const ts = Date.now()
    const ext = safeFileExt(file.name)
    const base = sanitizeFileBaseName(file.name)
    const path = `employees/${employeeId}/${docType}/${ts}-${base}${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_EMPLOYEE_DOCS)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("Storage upload error:", uploadError)
      return NextResponse.json(
        { error: "Error subiendo archivo a Storage", details: uploadError.message },
        { status: 500 },
      )
    }

    // 3) Upsert en employee_documents
    //    Recomendado: tener UNIQUE(employee_id, doc_type) en la tabla
    const payload: EmployeeDocumentRow = {
      employee_id: employeeId,
      doc_type: docType,
      storage_bucket: BUCKET_EMPLOYEE_DOCS,
      storage_path: path,
      file_name: file.name || null,
      mime_type: file.type || null,
      file_size: file.size ?? null,
    }

    const { data: upserted, error: upsertErr } = await supabase
      .from("employee_documents")
      .upsert(payload, { onConflict: "employee_id,doc_type" })
      .select("id, employee_id, doc_type, storage_bucket, storage_path, file_name, mime_type, file_size, created_at, updated_at")
      .single()

    if (upsertErr) {
      console.error("employee_documents upsert error:", upsertErr)
      return NextResponse.json(
        { error: "Error guardando en employee_documents", details: upsertErr.message },
        { status: 500 },
      )
    }

    // 4) Si es foto de perfil, actualizamos employees.photo_url con el storage_path
    if (docType === "profile_photo") {
      const { error: photoErr } = await supabase
        .from("employees")
        .update({ photo_url: path })
        .eq("id", employeeId)

      if (photoErr) {
        console.error("employees.photo_url update error:", photoErr)
        // no detenemos: el doc se guardó correctamente, solo avisamos
      }
    }

    // 5) Signed URL (para que el frontend pueda previsualizar inmediatamente si quieres)
    let signedUrl: string | null = null
    try {
      signedUrl = await createSignedUrl(path, 60 * 30)
    } catch (e) {
      console.error("Signed URL create error:", e)
    }

    return NextResponse.json({
      document: upserted,
      signed_url: signedUrl,
      bucket: BUCKET_EMPLOYEE_DOCS,
      path,
      fileName: file.name,
      mimeType: file.type || null,
      fileSize: file.size ?? null,
    })
  } catch (err: any) {
    console.error("POST /employee-documents unexpected error:", err)
    return NextResponse.json(
      { error: "Error inesperado subiendo documento", message: err?.message },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null)

    const employeeId = body?.employeeId as string | undefined
    const docTypeRaw = body?.docType as string | undefined

    if (!employeeId || !docTypeRaw) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (employeeId, docType)." },
        { status: 400 },
      )
    }

    if (!isValidDocType(docTypeRaw)) {
      return NextResponse.json({ error: "docType inválido." }, { status: 400 })
    }

    const docType: EmployeeDocType = docTypeRaw

    // 1) Obtener documento actual
    const { data: existing, error: existingErr } = await supabase
      .from("employee_documents")
      .select("id, storage_path")
      .eq("employee_id", employeeId)
      .eq("doc_type", docType)
      .maybeSingle()

    if (existingErr) {
      console.error("DELETE check existing doc error:", existingErr)
      return NextResponse.json(
        { error: "Error consultando documento", details: existingErr.message },
        { status: 500 },
      )
    }

    if (!existing?.storage_path) {
      return NextResponse.json({ ok: true, message: "Documento no existía." })
    }

    // 2) Borrar en Storage
    try {
      await deleteFromStorage(existing.storage_path)
    } catch (e: any) {
      console.error("DELETE storage remove error:", e)
      return NextResponse.json(
        { error: "Error eliminando archivo de Storage", message: e?.message },
        { status: 500 },
      )
    }

    // 3) Borrar de DB
    const { error: delErr } = await supabase
      .from("employee_documents")
      .delete()
      .eq("employee_id", employeeId)
      .eq("doc_type", docType)

    if (delErr) {
      console.error("DELETE employee_documents DB error:", delErr)
      return NextResponse.json(
        { error: "Error eliminando registro en DB", details: delErr.message },
        { status: 500 },
      )
    }

    // 4) Si es foto, limpiar employees.photo_url
    if (docType === "profile_photo") {
      const { error: photoErr } = await supabase
        .from("employees")
        .update({ photo_url: null })
        .eq("id", employeeId)

      if (photoErr) console.error("DELETE employees.photo_url cleanup error:", photoErr)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("DELETE /employee-documents unexpected error:", err)
    return NextResponse.json(
      { error: "Error inesperado en DELETE", message: err?.message },
      { status: 500 },
    )
  }
}
