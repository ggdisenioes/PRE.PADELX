'use client';

export default function LogsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📝 Auditoría de Acciones</h1>
        <p className="text-gray-600 mt-2">Registro completo de todas las acciones del super admin</p>
      </div>

      <div className="bg-white rounded-lg shadow p-8">
        <div className="text-center py-12">
          <p className="text-gray-600 text-lg">🔨 Esta página está en desarrollo</p>
          <p className="text-gray-500 text-sm mt-2">
            Se mostrará aquí el historial completo de auditoría
          </p>
        </div>
      </div>

      <div className="bg-yellow-50 border-l-4 border-yellow-600 rounded-lg p-6">
        <p className="text-yellow-900">
          📌 Los logs se registran automáticamente en la tabla super_admin_action_logs
        </p>
      </div>
    </div>
  );
}
