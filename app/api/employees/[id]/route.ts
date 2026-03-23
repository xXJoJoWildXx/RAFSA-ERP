import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

//Endpoint: DELETE /api/employees/[id] (eliminar un empleado y todos sus documentos relacionados, incluyendo foto de perfil)

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type RouteContext = {
  params: Promise<{ id: string }>
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: "ID de empleado inválido." },
        { status: 400 },
      )
    }

    // 1) Obtener empleado
    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, photo_url")
      .eq("id", id)
      .single()

    if (employeeError || !employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado." },
        { status: 404 },
      )
    }

    // 2) Obtener documentos base
    const { data: employeeDocs, error: employeeDocsError } = await supabase
      .from("employee_documents")
      .select("storage_path")
      .eq("employee_id", id)

    if (employeeDocsError) {
      console.error("Error fetching employee_documents:", employeeDocsError)
      return NextResponse.json(
        { error: "No se pudieron consultar los documentos del empleado." },
        { status: 500 },
      )
    }

    // 3) Obtener documentos DC3
    const { data: dc3Docs, error: dc3DocsError } = await supabase
      .from("employee_dc3_documents")
      .select("id, storage_path")
      .eq("employee_id", id)

    if (dc3DocsError) {
      console.error("Error fetching employee_dc3_documents:", dc3DocsError)
      return NextResponse.json(
        { error: "No se pudieron consultar los documentos DC3 del empleado." },
        { status: 500 },
      )
    }

    // 4) Reunir paths de storage
    const storagePaths = new Set<string>()

    for (const doc of employeeDocs || []) {
      if (doc?.storage_path) storagePaths.add(doc.storage_path)
    }

    for (const doc of dc3Docs || []) {
      if (doc?.storage_path) storagePaths.add(doc.storage_path)
    }

    if (employee.photo_url) {
      storagePaths.add(employee.photo_url)
    }

    // 5) Borrar archivos de storage
    if (storagePaths.size > 0) {
      const { error: storageError } = await supabase.storage
        .from("employee-documents")
        .remove(Array.from(storagePaths))

      if (storageError) {
        console.error("Error removing storage files:", storageError)
        return NextResponse.json(
          {
            error: "No se pudieron eliminar los archivos del empleado en Storage.",
          },
          { status: 500 },
        )
      }
    }

    // 6) Limpiar relaciones/tablas hijas que puedan no tener cascade
    const cleanupSteps = [
      supabase.from("employee_salary_history").delete().eq("employee_id", id),
      supabase.from("employee_roles").delete().eq("employee_id", id),
      supabase.from("employee_documents").delete().eq("employee_id", id),
      supabase.from("employee_dc3_documents").delete().eq("employee_id", id),
      supabase.from("obra_assignments").delete().eq("employee_id", id),
    ]

    const cleanupResults = await Promise.all(cleanupSteps)

    for (const result of cleanupResults) {
      if (result.error) {
        console.error("Error cleaning related records:", result.error)
        return NextResponse.json(
          { error: "No se pudieron eliminar los registros relacionados del empleado." },
          { status: 500 },
        )
      }
    }

    // 7) Eliminar empleado
    const { error: deleteEmployeeError } = await supabase
      .from("employees")
      .delete()
      .eq("id", id)

    if (deleteEmployeeError) {
      console.error("Error deleting employee:", deleteEmployeeError)
      return NextResponse.json(
        { error: "No se pudo eliminar el empleado." },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      deleted: true,
    })
  } catch (err: any) {
    console.error("DELETE employee unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado al eliminar el empleado.",
        details: err?.message,
      },
      { status: 500 },
    )
  }
}