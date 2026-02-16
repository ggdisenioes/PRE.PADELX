'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { TenantWithPlan, SubscriptionPlan, Addon } from '@/lib/types/saas';
import toast from 'react-hot-toast';
import { useTranslation } from '../../../../i18n';

export default function TenantDetailPage() {
  const { t } = useTranslation();
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
      toast.error(t('superAdmin.tenantDetail.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePlan = async () => {
    if (newPlanId === tenant?.subscription_plan_id) {
      toast.error(t('superAdmin.tenantDetail.selectDifferentPlan'));
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
      toast.success(t('superAdmin.tenantDetail.planUpdated'));
    } catch (error) {
      toast.error(t('superAdmin.tenantDetail.errorUpdatingPlan'));
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleChangeStatus = async () => {
    if (newStatus === tenant?.status) {
      toast.error(t('superAdmin.tenantDetail.selectDifferentStatus'));
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
      toast.success(t('superAdmin.tenantDetail.statusUpdated'));
    } catch (error) {
      toast.error(t('superAdmin.tenantDetail.errorUpdatingStatus'));
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
      toast.success(isAdding ? t('superAdmin.tenantDetail.addonAdded') : t('superAdmin.tenantDetail.addonRemoved'));
    } catch (error) {
      toast.error(t('superAdmin.tenantDetail.errorUpdatingAddons'));
    }
  };

  if (isLoading) return <div>{t('superAdmin.tenantDetail.loading')}</div>;
  if (!tenant) return <div>{t('superAdmin.tenantDetail.notFound')}</div>;

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
        <h2 className="text-xl font-bold mb-4">{t('superAdmin.tenantDetail.generalInfo')}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-gray-600 text-sm">{t('superAdmin.tenantDetail.phone')}</p>
            <p className="font-semibold">{tenant.phone || t('superAdmin.tenantDetail.notSpecified')}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">{t('superAdmin.tenantDetail.country')}</p>
            <p className="font-semibold">{tenant.country || t('superAdmin.tenantDetail.notSpecified')}</p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">{t('superAdmin.tenantDetail.from')}</p>
            <p className="font-semibold">
              {new Date(tenant.created_at).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">{t('superAdmin.tenantDetail.status')}</p>
            <p className="font-semibold">
              <StatusBadge status={tenant.status} />
            </p>
          </div>
        </div>
      </div>

      {/* Plan Actual */}
      {currentPlan && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-bold mb-4">{t('superAdmin.tenantDetail.currentPlan')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-gray-600 text-sm">{t('superAdmin.tenantDetail.plan')}</p>
              <p className="text-2xl font-bold text-blue-600">
                {currentPlan.name}
              </p>
              <p className="text-lg text-gray-900 mt-2">
                €{currentPlan.price_eur}/mes
              </p>
            </div>
            <div>
              <p className="text-gray-600 text-sm mb-3">{t('superAdmin.tenantDetail.limitsTitle')}</p>
              <ul className="space-y-1 text-sm">
                <li>👥 {currentPlan.max_players} jugadores</li>
                <li>🏆 {currentPlan.max_concurrent_tournaments} torneos</li>
                <li>🏟️ {currentPlan.max_courts} pistas</li>
              </ul>
            </div>
            <div>
              <p className="text-gray-600 text-sm mb-3">{t('superAdmin.tenantDetail.featuresTitle')}</p>
              <ul className="space-y-1 text-sm">
                <li>
                  {currentPlan.has_advanced_rankings ? '✅' : '❌'} {t('superAdmin.tenantDetail.advancedRankings')}
                </li>
                <li>
                  {currentPlan.has_mobile_app ? '✅' : '❌'} {t('superAdmin.tenantDetail.mobileApp')}
                </li>
                <li>
                  {currentPlan.has_api_access ? '✅' : '❌'} {t('superAdmin.tenantDetail.apiAccess')}
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Cambiar Plan */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">{t('superAdmin.tenantDetail.changePlan')}</h2>
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
            {isChangingPlan ? t('superAdmin.tenantDetail.updating') : t('superAdmin.tenantDetail.updatePlan')}
          </button>
        </div>
      </div>

      {/* Cambiar Estado */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">{t('superAdmin.tenantDetail.changeStatus')}</h2>
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
            {t('superAdmin.tenantDetail.changeStatusButton')}
          </button>
        </div>
      </div>

      {/* Add-ons */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold mb-4">{t('superAdmin.tenantDetail.addonsTitle')}</h2>
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
                  {isActive ? `✅ ${t('superAdmin.tenantDetail.removeAddon')}` : `➕ ${t('superAdmin.tenantDetail.addAddon')}`}
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
  const { t } = useTranslation();
  const colors: Record<string, string> = {
    trial: 'bg-yellow-100 text-yellow-800',
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-800',
  };

  const labelKeys: Record<string, string> = {
    trial: 'superAdmin.tenants.statusTrial',
    active: 'superAdmin.tenants.statusActive',
    suspended: 'superAdmin.tenants.statusSuspended',
    cancelled: 'superAdmin.tenants.statusCancelled',
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold ${
        colors[status] || colors.active
      }`}
    >
      {labelKeys[status] ? t(labelKeys[status] as any) : status}
    </span>
  );
}
