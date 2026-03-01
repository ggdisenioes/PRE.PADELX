'use client';

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">⚙️ Configuración Global</h1>
        <p className="text-gray-600 mt-2">Configuraciones del SaaS</p>
      </div>

      <div className="bg-white rounded-lg shadow p-8">
        <h2 className="text-xl font-bold mb-6">Configuración de Trial</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Duración del Trial (días)</label>
            <input
              type="number"
              defaultValue={14}
              disabled
              className="w-full px-4 py-2 border rounded-lg bg-gray-50 opacity-50"
            />
            <p className="text-xs text-gray-500 mt-1">Por ahora fijo en 14 días</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-6">
        <p className="text-blue-900">
          ℹ️ Más opciones de configuración estarán disponibles próximamente
        </p>
      </div>
    </div>
  );
}
