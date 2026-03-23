import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

// Este endpoint maneja la carpeta DC3 de cada empleado, listando documentos, generando URLs firmadas para descarga y eliminando documentos.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_DC3 = "employee-documents"

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
    const body = await req.json()

    const employeeId = body?.employeeId as string | undefined
    const storagePath = body?.storagePath as string | undefined
    const fileName = body?.fileName as string | undefined
    const mimeType = body?.mimeType as string | undefined
    const fileSize = body?.fileSize as number | undefined

    if (!employeeId || !storagePath || !fileName) {
      return NextResponse.json(
        {
          error: "Faltan employeeId, storagePath y/o fileName.",
        },
        { status: 400 },
      )
    }

    const payload = {
      employee_id: employeeId,
      storage_bucket: BUCKET_DC3,
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType || null,
      file_size: fileSize ?? null,
    }

    const { data, error } = await supabase
      .from("employee_dc3_documents")
      .insert(payload)
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

    if (error) {
      console.error("POST employee_dc3_documents insert error:", error)
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
    console.error("POST /api/employee-dc3-folder unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado guardando metadata DC3",
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