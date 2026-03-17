import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type SalaryHistoryPostBody = {
  employeeId?: string
  real_salary?: number
  payroll_salary?: number
  bonus_amount?: number
  overtime_hour_cost?: number
  authUserId?: string | null
  change_reason?: string | null
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const employeeId = searchParams.get("employeeId")

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId es requerido." },
        { status: 400 },
      )
    }

    const { data, error } = await supabase
      .from("employee_salary_history")
      .select(
        `
        id,
        employee_id,
        real_salary,
        payroll_salary,
        bonus_amount,
        overtime_hour_cost,
        valid_from,
        valid_to,
        changed_by,
        change_reason,
        created_at,
        app_users (
          id,
          display_name,
          email
        )
      `,
      )
      .eq("employee_id", employeeId)
      .order("valid_from", { ascending: false })

    if (error) {
      console.error("Error fetching employee_salary_history:", error)
      return NextResponse.json(
        {
          error: "No se pudo cargar el historial salarial.",
          details: error.message,
        },
        { status: 500 },
      )
    }

    const history =
      (data || []).map((row: any) => ({
        id: row.id,
        employee_id: row.employee_id,
        real_salary: Number(row.real_salary || 0),
        payroll_salary: Number(row.payroll_salary || 0),
        bonus_amount: Number(row.bonus_amount || 0),
        overtime_hour_cost: Number(row.overtime_hour_cost || 0),
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        changed_by: row.changed_by,
        changed_by_name:
          row.app_users?.display_name ||
          row.app_users?.email ||
          "No registrado",
        change_reason: row.change_reason,
        created_at: row.created_at,
      })) ?? []

    return NextResponse.json({
      ok: true,
      history,
    })
  } catch (err: any) {
    console.error("GET employee-salary-history unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado al cargar historial salarial.",
        details: err?.message,
      },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SalaryHistoryPostBody

    const employeeId = body.employeeId
    const realSalary = Number(body.real_salary ?? 0)
    const payrollSalary = Number(body.payroll_salary ?? 0)
    const bonusAmount = Number(body.bonus_amount ?? 0)
    const overtimeHourCost = Number(body.overtime_hour_cost ?? 0)
    const changeReason = body.change_reason ?? null

    if (!employeeId) {
      return NextResponse.json(
        { error: "employeeId es requerido." },
        { status: 400 },
      )
    }

    // app_users.id = auth.users.id en tu esquema
    const changedByAppUserId = body.authUserId ?? null

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select(
        `
        id,
        full_name,
        email,
        phone,
        status,
        hire_date,
        photo_url,
        imss_number,
        rfc,
        birth_date,
        base_salary,
        real_salary,
        bonus_amount,
        overtime_hour_cost,
        emergency_contact,
        created_at
      `,
      )
      .eq("id", employeeId)
      .single()

    if (employeeError || !employee) {
      console.error("Error fetching employee:", employeeError)
      return NextResponse.json(
        { error: "Empleado no encontrado." },
        { status: 404 },
      )
    }

    const currentRealSalary = Number(employee.real_salary ?? 0)
    const currentPayrollSalary = Number(employee.base_salary ?? 0)
    const currentBonusAmount = Number(employee.bonus_amount ?? 0)
    const currentOvertimeHourCost = Number(employee.overtime_hour_cost ?? 0)

    const nothingChanged =
      currentRealSalary === realSalary &&
      currentPayrollSalary === payrollSalary &&
      currentBonusAmount === bonusAmount &&
      currentOvertimeHourCost === overtimeHourCost

    if (nothingChanged) {
      return NextResponse.json({
        ok: true,
        updated: false,
        message: "No hubo cambios en los salarios.",
        employee,
      })
    }

    const nowIso = new Date().toISOString()

    const { error: closeHistoryError } = await supabase
      .from("employee_salary_history")
      .update({ valid_to: nowIso })
      .eq("employee_id", employeeId)
      .is("valid_to", null)

    if (closeHistoryError) {
      console.error("Error cerrando historial previo:", closeHistoryError)
      return NextResponse.json(
        { error: "No se pudo cerrar el historial salarial anterior." },
        { status: 500 },
      )
    }

    const { error: insertHistoryError } = await supabase
      .from("employee_salary_history")
      .insert({
        employee_id: employeeId,
        real_salary: realSalary,
        payroll_salary: payrollSalary,
        bonus_amount: bonusAmount,
        overtime_hour_cost: overtimeHourCost,
        valid_from: nowIso,
        valid_to: null,
        changed_by: changedByAppUserId,
        change_reason: changeReason,
      })

    if (insertHistoryError) {
      console.error("Error insertando historial salarial:", insertHistoryError)
      return NextResponse.json(
        {
          error: "No se pudo guardar el historial salarial.",
          details: insertHistoryError.message,
        },
        { status: 500 },
      )
    }

    const { data: updatedEmployee, error: updateEmployeeError } = await supabase
      .from("employees")
      .update({
        real_salary: realSalary,
        base_salary: payrollSalary,
        bonus_amount: bonusAmount,
        overtime_hour_cost: overtimeHourCost,
      })
      .eq("id", employeeId)
      .select(
        `
        id,
        full_name,
        email,
        phone,
        status,
        hire_date,
        photo_url,
        imss_number,
        rfc,
        birth_date,
        base_salary,
        real_salary,
        bonus_amount,
        overtime_hour_cost,
        emergency_contact,
        created_at
      `,
      )
      .single()

    if (updateEmployeeError) {
      console.error("Error actualizando employees:", updateEmployeeError)
      return NextResponse.json(
        {
          error: "Se guardó el historial pero no se pudo actualizar el empleado.",
          details: updateEmployeeError.message,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({
      ok: true,
      updated: true,
      employee: updatedEmployee,
    })
  } catch (err: any) {
    console.error("POST employee-salary-history unexpected error:", err)
    return NextResponse.json(
      {
        error: "Error inesperado al actualizar el salario.",
        details: err?.message,
      },
      { status: 500 },
    )
  }
}