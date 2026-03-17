import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_EMPLOYEE_DOCS = "employee-documents"
const DC3_FOLDER_NAME = "dc3"

function safeFileExt(fileName: string) {
  const parts = fileName.split(".")
  if (parts.length <= 1) return ""
  const ext = parts[parts.length - 1]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
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
      .slice(0, 80) || "archivo"
  )
}

function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      error: message,
      ...(extra || {}),
    },
    { status },
  )
}

// GET /api/employee-dc3-folder?employeeId=...
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")

    if (!employeeId) {
      return jsonError("Falta employeeId.", 400)
    }

    const { data, error } = await supabase
      .from("employee_dc3_documents")
      .select(
        `
        id,
        employee_id,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        created_at,
        updated_at
      `,
      )
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("GET employee_dc3_documents error:", error)
      return jsonError("No se pudieron cargar los documentos DC3.", 500, {
        details: error.message,
      })
    }

    const documents = data || []

    const signed_urls: Record<string, string> = {}

    for (const doc of documents) {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(doc.storage_bucket || BUCKET_EMPLOYEE_DOCS)
        .createSignedUrl(doc.storage_path, 60 * 60)

      if (!signedError && signedData?.signedUrl) {
        signed_urls[doc.id] = signedData.signedUrl
      } else if (signedError) {
        console.error(`GET signed URL error for doc ${doc.id}:`, signedError)
      }
    }

    return NextResponse.json({
      documents,
      signed_urls,
    })
  } catch (err: any) {
    console.error("GET /api/employee-dc3-folder unexpected error:", err)
    return jsonError("Error inesperado cargando la carpeta DC3.", 500, {
      message: err?.message,
    })
  }
}

// POST /api/employee-dc3-folder
// body: FormData { employeeId, file }
export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const employeeId = formData.get("employeeId") as string | null
    const file = formData.get("file") as File | null

    if (!employeeId || !file) {
      return jsonError("Faltan datos requeridos (employeeId, file).", 400)
    }

    const ts = Date.now()
    const ext = safeFileExt(file.name)
    const base = sanitizeFileBaseName(file.name)

    const path = `employees/${employeeId}/${DC3_FOLDER_NAME}/${ts}-${base}${ext}`

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_EMPLOYEE_DOCS)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("POST storage upload error:", uploadError)
      return jsonError("Error subiendo archivo a Storage.", 500, {
        details: uploadError.message,
      })
    }

    const insertPayload = {
      employee_id: employeeId,
      storage_bucket: BUCKET_EMPLOYEE_DOCS,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      file_size: file.size ?? null,
    }

    const { data: insertedDoc, error: insertError } = await supabase
      .from("employee_dc3_documents")
      .insert(insertPayload)
      .select(
        `
        id,
        employee_id,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        created_at,
        updated_at
      `,
      )
      .single()

    if (insertError) {
      console.error("POST insert employee_dc3_documents error:", insertError)

      // rollback del archivo en storage
      const { error: rollbackError } = await supabase.storage
        .from(BUCKET_EMPLOYEE_DOCS)
        .remove([path])

      if (rollbackError) {
        console.error("POST rollback storage remove error:", rollbackError)
      }

      return jsonError("El archivo se subió, pero no se pudo registrar en la base de datos.", 500, {
        details: insertError.message,
      })
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET_EMPLOYEE_DOCS)
      .createSignedUrl(path, 60 * 60)

    return NextResponse.json({
      document: insertedDoc,
      signedUrl: signedError ? null : signedData?.signedUrl ?? null,
    })
  } catch (err: any) {
    console.error("POST /api/employee-dc3-folder unexpected error:", err)
    return jsonError("Error inesperado subiendo documento DC3.", 500, {
      message: err?.message,
    })
  }
}

// DELETE /api/employee-dc3-folder
// body: { documentId }
export async function DELETE(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    const documentId = body?.documentId as string | undefined

    if (!documentId) {
      return jsonError("Falta documentId.", 400)
    }

    const { data: existingDoc, error: findError } = await supabase
      .from("employee_dc3_documents")
      .select(
        `
        id,
        employee_id,
        storage_bucket,
        storage_path,
        file_name
      `,
      )
      .eq("id", documentId)
      .single()

    if (findError || !existingDoc) {
      console.error("DELETE find employee_dc3_documents error:", findError)
      return jsonError("No se encontró el documento DC3.", 404)
    }

    const bucket = existingDoc.storage_bucket || BUCKET_EMPLOYEE_DOCS
    const path = existingDoc.storage_path

    const { error: storageDeleteError } = await supabase.storage
      .from(bucket)
      .remove([path])

    if (storageDeleteError) {
      console.error("DELETE storage remove error:", storageDeleteError)
      return jsonError("No se pudo eliminar el archivo del Storage.", 500, {
        details: storageDeleteError.message,
      })
    }

    const { error: dbDeleteError } = await supabase
      .from("employee_dc3_documents")
      .delete()
      .eq("id", documentId)

    if (dbDeleteError) {
      console.error("DELETE employee_dc3_documents error:", dbDeleteError)
      return jsonError("El archivo se eliminó del Storage, pero no de la base de datos.", 500, {
        details: dbDeleteError.message,
      })
    }

    return NextResponse.json({
      ok: true,
      deletedId: documentId,
    })
  } catch (err: any) {
    console.error("DELETE /api/employee-dc3-folder unexpected error:", err)
    return jsonError("Error inesperado eliminando documento DC3.", 500, {
      message: err?.message,
    })
  }
}