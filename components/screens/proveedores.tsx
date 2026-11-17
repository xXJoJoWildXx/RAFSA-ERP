"use client"

import { useState } from "react"
import type { AppRole as UserRoleScreen } from "@/lib/permissions"
import { AdminLayout } from "@/components/admin-layout"
import { RoleGuard } from "@/lib/role-guard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { BarChart2, BookOpen, FileText, Package, Send, Truck, Wrench } from "lucide-react"

import { ProveedorFacturasTab } from "@/components/proveedorFacturasTab"
import { ProveedorDirectorioTab } from "@/components/proveedorDirectorioTab"
import { ProveedorCatalogoTab } from "@/components/proveedorCatalogoTab"
import { ProveedorRentasTab } from "@/components/proveedorRentasTab"
import { ProveedorEnviosTab } from "@/components/proveedorEnviosTab"
import { ProveedorFinanzasTab } from "@/components/proveedorFinanzasTab"

const PESTANAS = [
  { valor: "facturas",   titulo: "Facturas",   icono: FileText,  Panel: ProveedorFacturasTab },
  { valor: "directorio", titulo: "Directorio", icono: BookOpen,  Panel: ProveedorDirectorioTab },
  { valor: "catalogo",   titulo: "Catálogo",   icono: Package,   Panel: ProveedorCatalogoTab },
  { valor: "envios",     titulo: "Envíos",     icono: Send,      Panel: ProveedorEnviosTab },
  { valor: "rentas",     titulo: "Rentas",     icono: Wrench,    Panel: ProveedorRentasTab },
  { valor: "finanzas",   titulo: "Finanzas",   icono: BarChart2, Panel: ProveedorFinanzasTab },
] as const

const triggerCls = [
  "rounded-lg font-medium text-sm transition-all duration-200 flex items-center gap-1.5 cursor-pointer",
  "text-slate-500 hover:text-slate-300",
  "data-[state=active]:bg-[#1e293b] data-[state=active]:shadow-md data-[state=active]:text-slate-100",
  "data-[state=active]:border data-[state=active]:border-slate-600/50",
].join(" ")

export function ProveedoresScreen({ allowed }: { allowed: UserRoleScreen[] }) {
  const [activa, setActiva] = useState<string>("facturas")

  return (
    <RoleGuard allowed={allowed}>
      <AdminLayout>
        <div className="space-y-6">
          {/* ── Encabezado ── */}
          <div
            className="rounded-2xl p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            style={{
              background: "linear-gradient(135deg, #0f2a4a 0%, #0a1929 50%, #0d1f35 100%)",
              border: "1px solid rgba(1,116,189,0.2)",
              boxShadow: "0 0 40px rgba(1,116,189,0.08)",
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="p-3 rounded-xl"
                style={{ background: "rgba(1,116,189,0.15)", border: "1px solid rgba(1,116,189,0.25)" }}
              >
                <Truck className="w-6 h-6 text-[#4da8e8]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Proveedores</h1>
                <p className="text-slate-400 text-sm mt-0.5">
                  Facturas, catálogo, rentas y cuentas por pagar
                </p>
              </div>
            </div>
          </div>

          {/* ── Pestañas ── */}
          <Tabs value={activa} onValueChange={setActiva} className="space-y-6">
            <TabsList
              className="p-1 rounded-xl gap-1 w-full"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(148,163,184,0.08)",
              }}
            >
              {PESTANAS.map(({ valor, titulo, icono: Icono }) => (
                <TabsTrigger key={valor} value={valor} className={triggerCls}>
                  <Icono className="w-3.5 h-3.5" />
                  {titulo}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Cada panel consulta al montarse, así que solo se monta el activo:
                entrar a Proveedores no dispara las consultas de las cinco. */}
            {PESTANAS.map(({ valor, Panel }) => (
              <TabsContent key={valor} value={valor} className="space-y-4">
                {activa === valor && <Panel />}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </AdminLayout>
    </RoleGuard>
  )
}
