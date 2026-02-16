'use client';

import { useEffect, useState } from 'react';
import { SubscriptionPlan } from '@/lib/types/saas';
import toast from 'react-hot-toast';

export default function PlansPage() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  const fetchPlans = async () => {
    try {
      const response = await fetch('/api/super-admin/plans');
      const json = await response.json();
      setPlans(json.data);
    } catch (error) {
      toast.error('Error cargando planes');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>Cargando planes...</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📋 Planes de Suscripción</h1>
        <p className="text-gray-600 mt-2">Gestiona los planes ofrecidos a tus clientes</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-600">
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <p className="text-3xl font-bold text-blue-600 mt-3">
              €{plan.price_eur}
              <span className="text-sm text-gray-600">/mes</span>
            </p>
            <p className="text-sm text-gray-600 mt-2">{plan.description}</p>

            <div className="mt-6 space-y-2 text-sm">
              <h4 className="font-semibold text-gray-900">Límites:</h4>
              <ul className="space-y-1">
                <li>👥 {plan.max_players} jugadores</li>
                <li>🏆 {plan.max_concurrent_tournaments} torneos</li>
                <li>🏟️ {plan.max_courts} pistas</li>
              </ul>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
              <p className="font-semibold">Soporte: {plan.support_level}</p>
              <p className="text-gray-600">{plan.support_response_hours}h respuesta</p>
            </div>

            <button
              className="mt-4 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              disabled
            >
              ⚙️ Editar (próximamente)
            </button>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-6">
        <p className="text-blue-900">
          ℹ️ La edición de planes estará disponible próximamente. Por ahora, los planes se pueden modificar directamente en la base de datos.
        </p>
      </div>
    </div>
  );
}
