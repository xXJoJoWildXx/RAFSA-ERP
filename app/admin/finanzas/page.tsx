"use client"

// Ruta del panel de administradores. Finanzas no se comparte con los otros
// paneles a propósito: el resultado de la empresa es sólo para admin, y por eso
// esta pantalla no tiene gemela en /user.
import { FinanzasScreen } from "@/components/screens/finanzas"

export default function Page() {
  return <FinanzasScreen allowed={["admin"]} />
}
