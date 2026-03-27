import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET_WORK_DOCS = "employee-documents"

type FolderType = "dc3" | "medical_reports"

function isValidFolderType(value: string): value is FolderType {
  return value === "dc3" || value === "medical_reports"
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

function mapFolderTypeToStorageFolder(folderType: FolderType) {
  switch (folderType) {
    case "dc3":
      return "dc3"
    case "medical_reports":
      return "medical-reports"
    default:
      return "general"
  }
}

function buildWorkDocumentPath(
  employeeId: string,
  folderType: FolderType,
  fileName: string,
) {
  const ts = Date.now()
  const ext = safeFileExt(fileName)
  const base = sanitizeFileBaseName(fileName)
  const folder = mapFolderTypeToStorageFolder(folderType)

  return `employees/${employeeId}/${folder}/${ts}-${base}${ext}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const employeeId = body?.employeeId as string | undefined
    const fileName = body?.fileName as string | undefined
    const folderTypeRaw = body?.folderType as string | undefined

    if (!employeeId || !fileName || !folderTypeRaw) {
      return NextResponse.json(
        { error: "Faltan employeeId, fileName y/o folderType." },
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
    const path = buildWorkDocumentPath(employeeId, folderType, fileName)

    const { data, error } = await supabase.storage
      .from(BUCKET_WORK_DOCS)
      .createSignedUploadUrl(path)

    if (error || !data) {
      console.error("createSignedUploadUrl error:", error)
      return NextResponse.json(
        {
          error: "No se pudo generar la URL de subida.",
          details: error?.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      bucket: BUCKET_WORK_DOCS,
      path,
      token: data.token,
      signedUrl: data.signedUrl ?? null,
      folderType,
    })
  } catch (err: any) {
    console.error(
      "POST /api/employee-work-documents-upload-url unexpected error:",
      err,
    )
    return NextResponse.json(
      {
        error: "Error inesperado generando URL de subida.",
        message: err?.message,
      },
      { status: 500 },
    )
  }
}