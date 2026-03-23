import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_DC3 = "employee-documents"
const DC3_FOLDER_PREFIX = "dc3"

type Dc3DocumentRow = {
  id: string
  employee_id: string
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

function buildDc3Path(employeeId: string, fileName: string) {
  const ts = Date.now()
  const ext = safeFileExt(fileName)
  const base = sanitizeFileBaseName(fileName)
  return `employees/${employeeId}/${DC3_FOLDER_PREFIX}/${ts}-${base}${ext}`
}

async function createSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(BUCKET_DC3)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

async function removeStorageObject(path: string) {
  const { error } = await supabase.storage.from(BUCKET_DC3).remove([path])
  if (error) throw error
}

export async function GET(req: NextRequest) {
  try {
    const employeeId = req.nextUrl.searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json(
        { error: "Falta employeeId." },
        { status: 400 },
      )
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
      return NextResponse.json(
        {
          error: "Error consultando la carpeta DC3",
          details: error.message,
        },
        { status: 500 },
      )
    }

    const documents = (data || []) as Dc3DocumentRow[]
    const signed_urls: Record<string, string> = {}

    await Promise.all(
      documents.map(async (doc) => {
        try {
          signed_urls[doc.id] = await createSignedUrl(doc.storage_path, 60 * 30)
        } catch (e) {
          console.error("Signed URL error for DC3 doc:", doc.id, e)
        }
      }),
    )

    return NextResponse.json({
      documents,
      signed_urls,
    })
  } catch (err: any) {
    console.error("GET /api/employee-dc3-folder unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado en GET de carpeta DC3",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData()

    const employeeId = formData.get("employeeId") as string | null
    const file = formData.get("file") as File | null

    if (!employeeId || !file) {
      return NextResponse.json(
        { error: "Faltan datos requeridos (employeeId, file)." },
        { status: 400 },
      )
    }

    const maxMb = 25
    if ((file.size ?? 0) > maxMb * 1024 * 1024) {
      return NextResponse.json(
        { error: `El archivo excede el límite de ${maxMb} MB.` },
        { status: 413 },
      )
    }

    const path = buildDc3Path(employeeId, file.name)
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_DC3)
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      })

    if (uploadError) {
      console.error("DC3 storage upload error:", uploadError)
      return NextResponse.json(
        {
          error: "Error subiendo archivo a Storage",
          details: uploadError.message,
        },
        { status: 500 },
      )
    }

    const insertPayload = {
      employee_id: employeeId,
      storage_bucket: BUCKET_DC3,
      storage_path: path,
      file_name: file.name || null,
      mime_type: file.type || null,
      file_size: file.size ?? null,
    }

    const { data: inserted, error: insertError } = await supabase
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
      console.error("DC3 DB insert error:", insertError)

      try {
        await removeStorageObject(path)
      } catch (rollbackErr) {
        console.error("DC3 rollback storage remove error:", rollbackErr)
      }

      return NextResponse.json(
        {
          error: "Error guardando metadata del archivo",
          details: insertError.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      document: inserted,
    })
  } catch (err: any) {
    console.error("POST /api/employee-dc3-folder unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado subiendo archivo a carpeta DC3",
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
      .from("employee_dc3_documents")
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
      console.error("DC3 storage delete error:", storageErr)
    }

    const { error: deleteError } = await supabase
      .from("employee_dc3_documents")
      .delete()
      .eq("id", documentId)

    if (deleteError) {
      console.error("DC3 DB delete error:", deleteError)
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
    console.error("DELETE /api/employee-dc3-folder unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado eliminando documento DC3",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}