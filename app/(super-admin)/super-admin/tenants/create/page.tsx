'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { SubscriptionPlan, Addon } from '@/lib/types/saas';

type FormData = {
  name: string;
  admin_email: string;
  phone?: string;
  country?: string;
  subscription_plan_id: string;
  addon_ids: string[];
};

export default function CreateTenantPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);

  const [formData, setFormData] = useState<FormData>({
    name: '',
    admin_email: '',
    phone: '',
    country: '',
    subscription_plan_id: '',
    addon_ids: [],
  });

  useEffect(() => {
    fetchPlansAndAddons();
  }, []);

  const fetchPlansAndAddons = async () => {
    try {
      const [plansRes, addonsRes] = await Promise.all([
        fetch('/api/super-admin/plans'),
        fetch('/api/super-admin/addons'),
      ]);

      const plansData = await plansRes.json();
      const addonsData = await addonsRes.json();

      setPlans(plansData.data);
      setAddons(addonsData.data);
    } catch (error) {
      toast.error('Error cargando planes y add-ons');
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/super-admin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error || 'Error al crear cliente');
        return;
      }

      toast.success('✅ Cliente creado exitosamente');
      router.push(`/super-admin/tenants/${json.data.id}`);
    } catch (error) {
      toast.error('Error al crear cliente');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Crear Nuevo Cliente</h1>
        <p className="text-gray-600 mt-2">Paso {step} de 3</p>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mt-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 3) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-8">
        {/* PASO 1: Datos básicos */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold mb-6">Información del Cliente</h2>

            <div>
              <label className="block text-sm font-medium mb-1">
                Nombre del Club *
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Ej: Club Pádel Madrid"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Email de Contacto *
              </label>
              <input
                type="email"
                value={formData.admin_email}
                onChange={(e) =>
                  setFormData({ ...formData, admin_email: e.target.value })
                }
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="admin@club.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="+34 91 234 56 78"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  País (ISO)
                </label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) =>
                    setFormData({ ...formData, country: e.target.value.toUpperCase() })
                  }
                  className="w-full px-4 py-2 border rounded-lg"
                  placeholder="ES"
                  maxLength={2}
                />
              </div>
            </div>
          </div>
        )}

        {/* PASO 2: Seleccionar Plan */}
        {step === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-6">Selecciona un Plan</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  onClick={() =>
                    setFormData({
                      ...formData,
                      subscription_plan_id: plan.id,
                    })
                  }
                  className={`p-6 rounded-lg border-2 cursor-pointer transition ${
                    formData.subscription_plan_id === plan.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <p className="text-3xl font-bold text-blue-600 mt-2">
                    €{plan.price_eur}
                  </p>
                  <ul className="mt-4 space-y-2 text-sm">
                    <li>👥 {plan.max_players} jugadores</li>
                    <li>🏆 {plan.max_concurrent_tournaments} torneos</li>
                    <li>
                      📊{' '}
                      {plan.has_advanced_rankings
                        ? '✅ Rankings avanzados'
                        : '❌ Rankings básicos'}
                    </li>
                    <li>
                      📱{' '}
                      {plan.has_mobile_app
                        ? '✅ App móvil'
                        : '❌ Sin app móvil'}
                    </li>
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PASO 3: Seleccionar Add-ons */}
        {step === 3 && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold mb-6">Add-ons Opcionales</h2>

            <div className="space-y-3">
              {addons.map((addon) => (
                <label
                  key={addon.id}
                  className="flex items-start gap-4 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formData.addon_ids.includes(addon.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({
                          ...formData,
                          addon_ids: [...formData.addon_ids, addon.id],
                        });
                      } else {
                        setFormData({
                          ...formData,
                          addon_ids: formData.addon_ids.filter(
                            (id) => id !== addon.id
                          ),
                        });
                      }
                    }}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <h4 className="font-semibold">{addon.name}</h4>
                    <p className="text-sm text-gray-600">
                      {addon.description}
                    </p>
                    <p className="text-sm font-bold text-blue-600 mt-1">
                      €{addon.price_eur}/{addon.billing_type === 'monthly' ? 'mes' : 'único'}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {/* Resumen */}
            <div className="bg-gray-50 p-4 rounded-lg mt-6">
              <h4 className="font-bold mb-3">Resumen de Costos</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Plan Base:</span>
                  <span>
                    €
                    {plans
                      .find((p) => p.id === formData.subscription_plan_id)
                      ?.price_eur.toFixed(2) || '0.00'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Add-ons (mensuales):</span>
                  <span>
                    €
                    {addons
                      .filter(
                        (a) =>
                          formData.addon_ids.includes(a.id) &&
                          a.billing_type === 'monthly'
                      )
                      .reduce((sum, a) => sum + a.price_eur, 0)
                      .toFixed(2)}
                  </span>
                </div>
                <hr />
                <div className="flex justify-between font-bold">
                  <span>Total Mensual:</span>
                  <span>
                    €
                    {(
                      (plans.find((p) => p.id === formData.subscription_plan_id)
                        ?.price_eur || 0) +
                      addons
                        .filter(
                          (a) =>
                            formData.addon_ids.includes(a.id) &&
                            a.billing_type === 'monthly'
                        )
                        .reduce((sum, a) => sum + a.price_eur, 0)
                    ).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Botones de navegación */}
      <div className="flex justify-between">
        <button
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
          className="px-6 py-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Atrás
        </button>

        {step < 3 ? (
          <button
            onClick={() => setStep(step + 1)}
            disabled={
              (step === 1 && (!formData.name || !formData.admin_email)) ||
              (step === 2 && !formData.subscription_plan_id)
            }
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={isLoading || !formData.subscription_plan_id}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creando...' : '✅ Crear Cliente'}
          </button>
        )}
      </div>
    </div>
  );
}
