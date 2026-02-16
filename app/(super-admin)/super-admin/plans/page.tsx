'use client';

import { useEffect, useState } from 'react';
import { SubscriptionPlan } from '@/lib/types/saas';
import toast from 'react-hot-toast';
import { useTranslation } from '../../../i18n';

export default function PlansPage() {
  const { t } = useTranslation();
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
      toast.error(t('superAdmin.plans.errorLoading'));
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>{t('superAdmin.plans.loading')}</div>;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">📋 {t('superAdmin.plans.title')}</h1>
        <p className="text-gray-600 mt-2">{t('superAdmin.plans.subtitle')}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => (
          <div key={plan.id} className="bg-white rounded-lg shadow p-6 border-t-4 border-blue-600">
            <h3 className="text-lg font-bold">{plan.name}</h3>
            <p className="text-3xl font-bold text-blue-600 mt-3">
              €{plan.price_eur}
              <span className="text-sm text-gray-600">{t('superAdmin.plans.perMonth')}</span>
            </p>
            <p className="text-sm text-gray-600 mt-2">{plan.description}</p>

            <div className="mt-6 space-y-2 text-sm">
              <h4 className="font-semibold text-gray-900">{t('superAdmin.plans.limitsTitle')}</h4>
              <ul className="space-y-1">
                <li>👥 {plan.max_players} {t('superAdmin.plans.players')}</li>
                <li>🏆 {plan.max_concurrent_tournaments} {t('superAdmin.plans.tournaments')}</li>
                <li>🏟️ {plan.max_courts} {t('superAdmin.plans.courts')}</li>
              </ul>
            </div>

            <div className="mt-4 p-3 bg-gray-50 rounded text-xs">
              <p className="font-semibold">{t('superAdmin.plans.support', { level: plan.support_level })}</p>
              <p className="text-gray-600">{t('superAdmin.plans.supportHours', { hours: plan.support_response_hours })}</p>
            </div>

            <button
              className="mt-4 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
              disabled
            >
              ⚙️ {t('superAdmin.plans.comingSoon')}
            </button>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border-l-4 border-blue-600 rounded-lg p-6">
        <p className="text-blue-900">
          ℹ️ {t('superAdmin.plans.editNote')}
        </p>
      </div>
    </div>
  );
}
