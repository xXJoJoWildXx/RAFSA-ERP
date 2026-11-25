import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_WORK_DOCS = "employee-documents"

type FolderType = "dc3" | "medical_reports"

type WorkDocumentRow = {
  id: string
  employee_id: string
  folder_type: FolderType
  storage_bucket: string
  storage_path: string
  file_name: string | null
  mime_type: string | null
  file_size: number | null
  /** Fecha de caducidad. NULL = no caduca. */
  expires_on: string | null
  created_at?: string
  updated_at?: string
}

function isValidFolderType(value: string): value is FolderType {
  return value === "dc3" || value === "medical_reports"
}

async function createSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(BUCKET_WORK_DOCS)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

async function removeStorageObject(path: string) {
  const { error } = await supabase.storage
    .from(BUCKET_WORK_DOCS)
    .remove([path])

  if (error) throw error
}

export async function GET(req: NextRequest) {
  try {
    const employeeId = req.nextUrl.searchParams.get("employeeId")
    const folderTypeRaw = req.nextUrl.searchParams.get("folderType")

    if (!employeeId || !folderTypeRaw) {
      return NextResponse.json(
        { error: "Faltan employeeId y/o folderType." },
        { status: 400 },
      )
    }

    if (!isValidFolderType(folderTypeRaw)) {
      return NextResponse.json(
        { error: "folderType inválido." },
        { status: 400 },
      )
    }

    const folderType = folderTypeRaw as FolderType

    const { data, error } = await supabase
      .from("employee_work_documents")
      .select(
        `
        id,
        employee_id,
        folder_type,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        expires_on,
        created_at,
        updated_at
      `,
      )
      .eq("employee_id", employeeId)
      .eq("folder_type", folderType)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("GET employee_work_documents error:", error)
      return NextResponse.json(
        {
          error: "No se pudieron cargar los documentos.",
          details: error.message,
        },
        { status: 500 },
      )
    }

    const documents = (data || []) as WorkDocumentRow[]
    const signed_urls: Record<string, string> = {}

    await Promise.all(
      documents.map(async (doc) => {
        try {
          signed_urls[doc.id] = await createSignedUrl(doc.storage_path, 60 * 30)
        } catch (e) {
          console.error("Signed URL error for work doc:", doc.id, e)
        }
      }),
    )

    return NextResponse.json({
      ok: true,
      documents,
      signed_urls,
    })
  } catch (err: any) {
    console.error("GET /api/employee-work-documents unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado en GET.",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const employeeId = body?.employeeId as string | undefined
    const folderTypeRaw = body?.folderType as string | undefined
    const storagePath = body?.storagePath as string | undefined
    const fileName = body?.fileName as string | undefined
    const mimeType = body?.mimeType as string | undefined
    const fileSize = body?.fileSize as number | undefined
    const expiresOnRaw = body?.expiresOn as string | undefined

    if (!employeeId || !folderTypeRaw || !storagePath || !fileName) {
      return NextResponse.json(
        {
          error: "Faltan employeeId, folderType, storagePath y/o fileName.",
        },
        { status: 400 },
      )
    }

    if (!isValidFolderType(folderTypeRaw)) {
      return NextResponse.json(
        { error: "folderType inválido." },
        { status: 400 },
      )
    }

    const folderType = folderTypeRaw as FolderType

    // La vigencia es opcional y la decide el usuario: el cliente sólo le
    // sugiere una fecha. Se rechaza cualquier cosa que no sea YYYY-MM-DD para
    // no dejar basura en una columna date.
    if (expiresOnRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOnRaw)) {
      return NextResponse.json(
        { error: "expiresOn debe venir como YYYY-MM-DD." },
        { status: 400 },
      )
    }

    const payload = {
      employee_id: employeeId,
      folder_type: folderType,
      storage_bucket: BUCKET_WORK_DOCS,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType || null,
      file_size: fileSize ?? null,
      expires_on: expiresOnRaw || null,
    }

    const { data, error } = await supabase
      .from("employee_work_documents")
      .insert(payload)
      .select(
        `
        id,
        employee_id,
        folder_type,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        expires_on,
        created_at,
        updated_at
      `,
      )
      .single()

    if (error) {
      console.error("POST employee_work_documents insert error:", error)
      return NextResponse.json(
        {
          error: "No se pudo guardar la metadata del documento.",
          details: error.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      document: data,
    })
  } catch (err: any) {
    console.error("POST /api/employee-work-documents unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado guardando metadata.",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}

/**
 * Cambia la vigencia de un documento ya subido.
 *
 * Es lo único editable de un documento de obra: el archivo no se modifica,
 * se reemplaza. Sirve para capturar una fecha que no se puso al subir, para
 * corregirla, y para renovar un documento vencido.
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json()
    const documentId = body?.documentId as string | undefined
    const expiresOnRaw = body?.expiresOn as string | null | undefined

    if (!documentId) {
      return NextResponse.json(
        { error: "Falta documentId." },
        { status: 400 },
      )
    }

    // null y "" borran la vigencia; cualquier otra cosa debe ser una fecha.
    if (expiresOnRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOnRaw)) {
      return NextResponse.json(
        { error: "expiresOn debe venir como YYYY-MM-DD o null." },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from("employee_work_documents")
      .update({ expires_on: expiresOnRaw || null })
      .eq("id", documentId)
      .select(
        `
        id,
        employee_id,
        folder_type,
        storage_bucket,
        storage_path,
        file_name,
        mime_type,
        file_size,
        expires_on,
        created_at,
        updated_at
      `,
      )
      .single()

    if (error) {
      console.error("PATCH employee_work_documents error:", error)
      return NextResponse.json(
        {
          error: "Error actualizando la vigencia del documento",
          details: error.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ ok: true, document: data })
  } catch (err: any) {
    console.error("PATCH /api/employee-work-documents unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado en PATCH",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const documentId = body?.documentId as string | undefined

    if (!documentId) {
      return NextResponse.json(
        { error: "Falta documentId." },
        { status: 400 },
      )
    }

    const { data: existing, error: findError } = await supabase
      .from("employee_work_documents")
      .select("id, storage_path")
      .eq("id", documentId)
      .single()

    if (findError || !existing) {
      return NextResponse.json(
        {
          error: "No se encontró el documento a eliminar.",
          details: findError?.message,
        },
        { status: 404 },
      )
    }

    try {
      await removeStorageObject(existing.storage_path)
    } catch (storageErr) {
      console.error("Work document storage delete error:", storageErr)
    }

    const { error: deleteError } = await supabase
      .from("employee_work_documents")
      .delete()
      .eq("id", documentId)

    if (deleteError) {
      console.error("Work document DB delete error:", deleteError)
      return NextResponse.json(
        {
          error: "No se pudo eliminar el registro del documento.",
          details: deleteError.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
    })
  } catch (err: any) {
    console.error("DELETE /api/employee-work-documents unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado eliminando documento.",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}