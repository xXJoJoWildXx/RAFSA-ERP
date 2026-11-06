"use client"

// Ruta del panel de administradores. La pantalla es la MISMA que usa el otro panel:
// aquí sólo se declara quién puede entrar. Lo que cada rol puede hacer
// dentro lo decide lib/permissions.ts.
import { NominaScreen } from "@/components/screens/nomina"

export default function Page() {
  return <NominaScreen allowed={["admin"]} />
}
