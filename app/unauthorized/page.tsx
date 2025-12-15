export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="bg-white shadow rounded-lg px-8 py-6 text-center space-y-3">
        <h1 className="text-xl font-semibold text-slate-900">Acceso no autorizado</h1>
        <p className="text-sm text-slate-600">
          No tienes permisos para ver esta sección de la aplicación.
        </p>
      </div>
    </div>
  )
}
