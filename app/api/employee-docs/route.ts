import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

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

const VALID_DOC_TYPES: EmployeeDocType[] = [
  "tax_certificate",
  "birth_certificate",
  "imss",
  "curp",
  "ine",
  "address_proof",
  "profile_photo",
]

function isValidDocType(value: string): value is EmployeeDocType {
  return VALID_DOC_TYPES.includes(value as EmployeeDocType)
}

async function createSignedUrl(path: string, expiresInSeconds = 60 * 30) {
  const { data, error } = await supabase.storage
    .from(BUCKET_EMPLOYEE_DOCS)
    .createSignedUrl(path, expiresInSeconds)

  if (error) throw error
  return data.signedUrl
}

async function deleteFromStorage(path: string) {
  const { error } = await supabase.storage
    .from(BUCKET_EMPLOYEE_DOCS)
    .remove([path])

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
      .from("employee_documents")
      .select(
        `
        id,
        employee_id,
        doc_type,
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

    if (error) {
      console.error("GET employee_documents error:", error)
      return NextResponse.json(
        {
          error: "Error consultando employee_documents",
          details: error.message,
        },
        { status: 500 },
      )
    }

    const documents = (data || []) as EmployeeDocumentRow[]
    const signed_urls: Partial<Record<EmployeeDocType, string>> = {}

    await Promise.all(
      documents.map(async (doc) => {
        try {
          signed_urls[doc.doc_type] = await createSignedUrl(doc.storage_path, 60 * 30)
        } catch (e) {
          console.error("Signed URL error for:", doc.doc_type, e)
        }
      }),
    )

    const profilePhotoRow = documents.find((d) => d.doc_type === "profile_photo")
    const profile_photo_url = profilePhotoRow
      ? signed_urls.profile_photo ?? null
      : null

    return NextResponse.json({
      documents,
      signed_urls,
      profile_photo_url,
    })
  } catch (err: any) {
    console.error("GET /api/employee-docs unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado en GET",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  try {
    const body = await req.json()
    const employeeId = body?.employeeId as string | undefined
    const docTypeRaw = body?.docType as string | undefined

    if (!employeeId || !docTypeRaw) {
      return NextResponse.json(
        { error: "Faltan employeeId y/o docType." },
        { status: 400 },
      )
    }

    if (!isValidDocType(docTypeRaw)) {
      return NextResponse.json(
        { error: "docType inválido." },
        { status: 400 },
      )
    }

    const docType = docTypeRaw as EmployeeDocType

    const { data: existing, error: findErr } = await supabase
      .from("employee_documents")
      .select("id, storage_path")
      .eq("employee_id", employeeId)
      .eq("doc_type", docType)
      .maybeSingle()

    if (findErr) {
      console.error("DELETE find employee_document error:", findErr)
      return NextResponse.json(
        {
          error: "Error buscando documento",
          details: findErr.message,
        },
        { status: 500 },
      )
    }

    if (!existing) {
      if (docType === "profile_photo") {
        await supabase
          .from("employees")
          .update({ photo_url: null })
          .eq("id", employeeId)
      }

      return NextResponse.json({
        ok: true,
        deleted: false,
        message: "No existía documento para eliminar.",
      })
    }

    if (existing.storage_path) {
      try {
        await deleteFromStorage(existing.storage_path)
      } catch (e: any) {
        console.error("DELETE storage remove error:", e)
      }
    }

    const { error: delErr } = await supabase
      .from("employee_documents")
      .delete()
      .eq("id", existing.id)

    if (delErr) {
      console.error("DELETE employee_documents row error:", delErr)
      return NextResponse.json(
        {
          error: "Error eliminando registro en employee_documents",
          details: delErr.message,
        },
        { status: 500 },
      )
    }

    if (docType === "profile_photo") {
      const { error: photoErr } = await supabase
        .from("employees")
        .update({ photo_url: null })
        .eq("id", employeeId)

      if (photoErr) {
        console.error("DELETE employees.photo_url reset error:", photoErr)
      }
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
    })
  } catch (err: any) {
    console.error("DELETE /api/employee-docs unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado en DELETE",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}