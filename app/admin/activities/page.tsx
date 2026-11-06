"use client"

// Ruta del panel de administradores. La pantalla es la MISMA que usa el otro panel:
// aquí sólo se declara quién puede entrar. Lo que cada rol puede hacer
// dentro lo decide lib/permissions.ts.
import { ActivitiesScreen } from "@/components/screens/activities"

export default function Page() {
  return <ActivitiesScreen allowed={["admin"]} />
}
