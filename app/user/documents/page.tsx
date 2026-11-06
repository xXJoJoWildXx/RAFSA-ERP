"use client"

// Ruta del panel de administración. La pantalla es la MISMA que usa el otro panel:
// aquí sólo se declara quién puede entrar. Lo que cada rol puede hacer
// dentro lo decide lib/permissions.ts.
import { DocumentsScreen } from "@/components/screens/documents"

export default function Page() {
  return <DocumentsScreen allowed={["user"]} />
}
