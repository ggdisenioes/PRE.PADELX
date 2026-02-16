'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TenantWithPlan, SubscriptionPlan, Addon } from '@/lib/types/saas';
import toast from 'react-hot-toast';

export default function TenantDetailPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<TenantWithPlan | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [newPlanId, setNewPlanId] = useState('');
  const [newStatus, setNewStatus] = useState('');

  useEffect(() => {
    fetchData();
  }, [tenantId]);

  const fetchData = async () => {
    try {
      const [tenantRes, plansRes, addonsRes] = await Promise.all([
        fetch(`/api/super-admin/tenants/${tenantId}`),
        fetch('/api/super-admin/plans'),
        fetch('/api/super-admin/addons'),
      ]);

      const tenantData = await tenantRes.json();
      const plansData = await plansRes.json();
      const addonsData = await addonsRes.json();

      setTenant(tenantData.data);
      setPlans(plansData.data);
      setAddons(addonsData.data);
      setNewPlanId(tenantData.data.subscription_plan_id);
      setNewStatus(tenantData.data.status);
    } catch (error) {
      toast.error('Error cargando datos');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (newPlanId === tenant?.subscription_plan_id) {
      toast.error('Selecciona un plan diferente');
      return;
    }

    setIsChangingPlan(true);
    try {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription_plan_id: newPlanId }),
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error);
        return;
      }

      setTenant(json.data);
      toast.success('✅ Plan actualizado');
    } catch (error) {
      toast.error('Error actualizando plan');
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleChangeStatus = async () => {
    if (newStatus === tenant?.status) {
      toast.error('Selecciona un estado diferente');
      return;
    }

    try {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error);
        return;
      }

      setTenant(json.data);
      toast.success('✅ Estado actualizado');
    } catch (error) {
      toast.error('Error actualizando estado');
    }
  };

  const handleToggleAddon = async (addonId: string, isAdding: boolean) => {
    try {
      const response = await fetch(`/api/super-admin/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: isAdding ? 'add_addons' : 'remove_addon',
          addon_ids: isAdding ? [addonId] : undefined,
          addon_id: !isAdding ? addonId : undefined,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        toast.error(json.error);
        return;
      }

      setTenant(json.data);
      toast.success(isAdding ? '✅ Add-on agregado' : '✅ Add-on removido');
    } catch (error) {
      toast.error('Error actualizando add-ons');
    }
  };

  if (isLoading) return <div>Cargando...</div>;
  if (!tenant) return <div>Cliente no encontrado</div>;

  const currentPlan = plans.find((p) => p.id === tenant.subscription_plan_id);
  const tenantAddonIds = tenant.addons?.map((a) => a.addon_id) || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">{tenant.name}</h1>
        <p className="text-gray-600 mt-2">{tenant.admin_email}</p>
      </div>

      {/* Información Básica */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Información General</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-gray-600 text-sm">Teléfono</p>
            <p className="font-semibold">{tenant.phone || 'No especificado'}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">País</p>
            <p className="font-semibold">{tenant.country || 'No especificado'}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Desde</p>
            <p className="font-semibold">
              {new Date(tenant.created_at).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Estado</p>
            <p className="font-semibold">
              <StatusBadge status={tenant.status} />
            </p>
          </div>
        </div>
      </div>

      {/* Plan Actual */}
      {currentPlan && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">Plan Actual</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600 text-sm">Plan</p>
              <p className="text-2xl font-bold text-blue-600">
                {currentPlan.name}
              </p>
              <p className="text-lg text-gray-900 mt-2">
                €{currentPlan.price_eur}/mes
              </p>
            </div>
            <div>
              <p className="text-gray-600 text-sm mb-3">Límites</p>
              <ul className="space-y-1 text-sm">
                <li>👥 {currentPlan.max_players} jugadores</li>
                <li>🏆 {currentPlan.max_concurrent_tournaments} torneos</li>
                <li>🏟️ {currentPlan.max_courts} pistas</li>
              </ul>
            </div>
            <div>
              <p className="text-gray-600 text-sm mb-3">Características</p>
              <ul className="space-y-1 text-sm">
                <li>
                  {currentPlan.has_advanced_rankings ? '✅' : '❌'} Rankings
                  avanzados
                </li>
                <li>
                  {currentPlan.has_mobile_app ? '✅' : '❌'} App móvil
                </li>
                <li>
                  {currentPlan.has_api_access ? '✅' : '❌'} Acceso API
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Cambiar Plan */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Cambiar Plan</h2>
        <div className="flex gap-4">
          <select
            value={newPlanId}
            onChange={(e) => setNewPlanId(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} (€{plan.price_eur}/mes)
              </option>
            ))}
          </select>
          <button
            onClick={handleChangePlan}
            disabled={isChangingPlan}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isChangingPlan ? 'Actualizando...' : 'Actualizar Plan'}
          </button>
        </div>
      </div>

      {/* Cambiar Estado */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Cambiar Estado</h2>
        <div className="flex gap-4">
          <select
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            className="px-4 py-2 border rounded-lg"
          >
            <option value="trial">En Trial</option>
            <option value="active">Activo</option>
            <option value="suspended">Suspendido</option>
            <option value="cancelled">Cancelado</option>
          </select>
          <button
            onClick={handleChangeStatus}
            className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            Cambiar Estado
          </button>
        </div>
      </div>

      {/* Add-ons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">Add-ons Contratados</h2>
        <div className="space-y-3">
          {addons.map((addon) => {
            const isActive = tenantAddonIds.includes(addon.id);
            return (
              <div
                key={addon.id}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div>
                  <h4 className="font-semibold">{addon.name}</h4>
                  <p className="text-sm text-gray-600">{addon.description}</p>
                  <p className="text-sm font-bold text-blue-600 mt-1">
                    €{addon.price_eur}/{addon.billing_type === 'monthly' ? 'mes' : 'único'}
                  </p>
                </div>
                <button
                  onClick={() => handleToggleAddon(addon.id, !isActive)}
                  className={`px-4 py-2 rounded-lg transition ${
                    isActive
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {isActive ? '✅ Remover' : '➕ Agregar'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    trial: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  const labels: Record<string, string> = {
    trial: 'En Trial',
    active: 'Activo',
    suspended: 'Suspendido',
    cancelled: 'Cancelado',
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        colors[status] || colors.active
      }`}
    >
      {labels[status] || status}
    </span>
  );
}
